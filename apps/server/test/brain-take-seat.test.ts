/**
 * C7's seam in Playbooks: the auction's start takes every seat but the Claude seats kept for the first good's side
 * pick; each kept seat is taken on its own later (takeSeat), and answered() says whether its plan has come.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advancePhase, createGame, type GameState } from '@mule/engine';
import { AiSeat, playbookSource } from '@mule/ai';
import { createBrain } from '../src/brain/index.js';
import { Playbooks } from '../src/brain/playbooks.js';
import type { SeatKind } from '../src/claude-seat/seats.js';
import { ClaudeSeatWriter } from '../src/claude-seat/writer.js';
import type { PlaybookNote } from '../src/mule-game.js';
import type { SdkModuleFake } from './brain-fakes.js';

/** The SDK module's constructor: records every client built, so a keyless brain that builds one fails. */
const sdkModule = vi.hoisted((): SdkModuleFake => ({ built: [], create: null }));
vi.mock('@anthropic-ai/sdk', async (original) => (await import('./brain-fakes.js')).fakeSdkModule(original, sdkModule));

const PLAYERS = [
  { id: 'p0', name: 'Claudia', isAi: true },
  { id: 'p1', name: 'Heiko', isAi: false },
];

beforeEach(() => {
  for (const level of ['log', 'info', 'warn'] as const) vi.spyOn(console, level).mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const advanceTo = (state: GameState, phase: GameState['phase']) => {
  while (state.phase !== phase) advancePhase(state);
};

/** One Claude seat at month 1's auction, its auction plan asked in production's slack and not yet answered. */
function atAuction() {
  const state: GameState = createGame({ seed: 10, players: PLAYERS });
  const seat = new AiSeat({ id: 'p0', name: 'Claudia', persona: 'trader', level: 'trader', seed: 1 });
  const notes: PlaybookNote[] = [];
  const brain = createBrain({ gameId: 'g-take-seat' });
  const kinds = new Map<string, SeatKind>([['p0', 'claude']]);
  const playbooks = new Playbooks({ brain, source: playbookSource([seat]), seats: [seat], kinds, record: (n) => notes.push(n) });
  const writer = brain.writerFor({ id: 'p0', persona: 'trader', level: 'trader', kind: 'claude' }) as ClaudeSeatWriter;
  advanceTo(state, 'production');
  playbooks.askPhase(state, 'auction', []);
  advanceTo(state, 'auction');
  return { state, seat, notes, playbooks, writer };
}

/** Answers the seat's open auction ask with a real edit: hold none of the first good it offers. */
async function answer(writer: ClaudeSeatWriter) {
  const ask = writer.openAsk()!;
  const hold = ask.offers.find((o) => o.path.endsWith('/hold'))!;
  expect(await writer.submit(ask.id, { edits: [{ path: hold.path, to: 0, reason: 'None.' }], line: 'Selling it all.' })).toMatchObject({ kind: 'accepted' });
  // The writer's promise settles on the next microtask.
  await Promise.resolve();
}

describe('C7: Playbooks keeps a Claude seat’s auction ask open past the auction’s start, and takes it on its own', () => {
  it('C7: takePhase with the seat kept leaves its ask open and reports it kept; answered once it has come; takeSeat plays it by llm', async () => {
    const { state, notes, playbooks, writer } = atAuction();

    expect(playbooks.takePhase(state, 'auction', new Set(['p0']))).toEqual(['p0']);
    expect(writer.openAsk()?.phase, 'still asked').toBe('auction');
    expect(playbooks.answered(state, 'p0', 'auction')).toBe(false);
    expect(notes).toEqual([]);

    await answer(writer);
    expect(playbooks.answered(state, 'p0', 'auction')).toBe(true);
    playbooks.takeSeat(state, 'auction', 'p0');

    expect(notes.map((n) => [n.seat, n.month, n.phase, n.playbook.by])).toEqual([['p0', 1, 'auction', 'llm']]);
    expect(playbooks.answered(state, 'p0', 'auction'), 'taken, the ask is gone').toBe(false);
  });

  it('C7 (HC-3): a kept seat still unanswered at takeSeat is aborted and plays built-in; a later answer is too late', async () => {
    const { state, seat, notes, playbooks, writer } = atAuction();
    playbooks.takePhase(state, 'auction', new Set(['p0']));
    const asked = writer.openAsk()!;
    const before = seat.part(state, 'auction');

    playbooks.takeSeat(state, 'auction', 'p0');

    expect(writer.openAsk()).toBeNull();
    expect(notes).toEqual([]);
    expect(seat.part(state, 'auction')).toEqual(before);
    expect(await writer.submit(asked.id, { edits: [], line: 'Late.' })).toEqual({ kind: 'too_late' });
  });

  it('C7: with nothing kept, takePhase takes every seat as it always has and keeps none', async () => {
    const { state, notes, playbooks, writer } = atAuction();

    expect(playbooks.takePhase(state, 'auction', new Set())).toEqual([]);

    expect(writer.openAsk(), 'aborted at the auction’s start, as today').toBeNull();
    expect(notes).toEqual([]);
  });

  it('C7: one code path: an answered seat taken at the start, with keep empty or absent, or kept and then taken, adopts the very same playbook', async () => {
    const run = async (take: (t: ReturnType<typeof atAuction>) => void) => {
      const t = atAuction();
      await answer(t.writer);
      take(t);
      return t.notes;
    };

    const absent = await run(({ state, playbooks }) => playbooks.takePhase(state, 'auction'));
    const empty = await run(({ state, playbooks }) => playbooks.takePhase(state, 'auction', new Set()));
    const later = await run(({ state, playbooks }) => {
      playbooks.takePhase(state, 'auction', new Set(['p0']));
      playbooks.takeSeat(state, 'auction', 'p0');
    });

    expect(absent.map((n) => n.playbook.by)).toEqual(['llm']);
    expect(empty).toEqual(absent);
    expect(later).toEqual(absent);
  });

  it('C7: answered is false with no ask, and for an ask of another month; takeSeat with nothing open does nothing', () => {
    const { state, notes, playbooks } = atAuction();
    expect(playbooks.answered(state, 'p1', 'auction'), 'no ask for that seat').toBe(false);
    expect(playbooks.answered(state, 'p0', 'development'), 'no ask for that phase').toBe(false);
    playbooks.takePhase(state, 'auction', new Set(['p0']));

    advanceTo(state, 'upkeep');
    const later = { ...state, month: state.month + 1 };
    expect(playbooks.answered(later, 'p0', 'auction'), 'another month’s ask').toBe(false);

    playbooks.takeSeat(later, 'auction', 'p0');
    playbooks.takeSeat(state, 'development', 'p0');
    expect(notes).toEqual([]);
  });
});
