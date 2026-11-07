import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_HANDS, BRAIN, WALK, type Good } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import type { SeatInfo } from '@tabletop/core';
import { claudeSeatAt, type SeatKind } from '../src/claude-seat/seats.js';
import { MuleGame } from '../src/mule-game.js';
import type { SdkModuleFake } from './brain-fakes.js';
import { fakeContext } from './fake-context.js';

/** The SDK module's constructor: records every client built, so a keyless game that builds one fails. */
const sdkModule = vi.hoisted((): SdkModuleFake => ({ built: [], create: null }));
vi.mock('@anthropic-ai/sdk', async (original) => (await import('./brain-fakes.js')).fakeSdkModule(original, sdkModule));

/** The host, one Claude seat and two built-in ones. */
const TABLE: (SeatInfo & { kind?: SeatKind })[] = [
  { id: 's1', name: 'Heiko', isAi: false, color: 0 },
  { id: 's2', name: 'Claudia', isAi: true, color: 1, kind: 'claude' },
  { id: 's3', name: 'The Accountant', isAi: true, color: 2 },
  { id: 's4', name: 'The Gambler', isAi: true, color: 3 },
];
const CLAUDE = 's2';
const WAIT_MS = BRAIN.claudeSeat.sidePickWaitMs;
/** How long after its plan is taken a seat's hand may take to press Done: its decision's wait, and a tick either side. */
const PRESS_MS = AI_HANDS.auction.decideWaitMs + 2 * WALK.tickMs;

beforeEach(() => {
  for (const level of ['log', 'info', 'warn'] as const) vi.spyOn(console, level).mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

function startedGame(table = TABLE, phaseScale = 1) {
  const fake = fakeContext({ table });
  const game = new MuleGame(fake.ctx, 10, { maxMonths: 1, phaseScale });
  game.start(table);
  return { game, fake };
}

const view = (game: MuleGame): MuleView => game.viewFor(null);
const doneAt = (v: MuleView, id: string) => v.auction?.walkers.find((w) => w.id === id)?.done ?? false;
const sidePick = (v: MuleView, good: Good | null = null) => v.phase === 'auction' && v.auction?.stage === 'status' && (good === null || v.auction.good === good);

/** Plays the clock to the first good's side pick, the host pressing Ready in planning and upkeep; returns that good. */
async function toFirstSidePick(game: MuleGame, fake: ReturnType<typeof fakeContext>): Promise<Good> {
  for (let t = 0; t < 30 * 60_000; t += WALK.tickMs) {
    const v = view(game);
    if (sidePick(v)) return v.auction!.good!;
    if (v.phase === 'planning' || v.phase === 'upkeep') game.handle('s1', { type: 'ready' });
    fake.advance(WALK.tickMs);
    await Promise.resolve();
  }
  throw new Error('the game never reached the auction');
}

interface SidePick {
  /** When the Claude seat was first Done, from the side pick's start: at the latest, when the side pick ended. */
  claudeDone: number;
  /** When the side pick ended, from its start. */
  ended: number;
}

/**
 * Runs `good`'s side pick to its end from now, the host pressing Ready at once; `at` runs once the side pick is that
 * old. Reads every tick, on the game's own clock.
 */
async function runSidePick(game: MuleGame, fake: ReturnType<typeof fakeContext>, good: Good, at: Record<number, () => unknown> = {}): Promise<SidePick> {
  const opened = fake.ctx.now();
  game.handle('s1', { type: 'ready' });
  let claudeDone: number | null = null;
  const due = Object.entries(at).map(([ms, fn]) => ({ ms: Number(ms), fn, ran: false }));
  for (let t = 0; t <= 2 * WAIT_MS; t += WALK.tickMs) {
    const v = view(game);
    const age = fake.ctx.now() - opened;
    // Without the host's Continue a side pick ends only once every seat is Done: a seat Done in its last tick was Done then.
    if (!sidePick(v, good)) return { claudeDone: claudeDone ?? age, ended: age };
    if (claudeDone === null && doneAt(v, CLAUDE)) claudeDone = age;
    for (const d of due) {
      if (!d.ran && age >= d.ms) {
        d.ran = true;
        await d.fn();
      }
    }
    fake.advance(WALK.tickMs);
    await Promise.resolve();
  }
  throw new Error(`${good}'s side pick never ended`);
}

const writerOf = (game: MuleGame) => claudeSeatAt(game, CLAUDE)!.writer;

describe('C7: the first good’s side pick waits for a Claude seat’s auction plan, up to BRAIN.claudeSeat.sidePickWaitMs', () => {
  it('B-AC-5: with no plan from the chat, the Claude seat is Done on its built-in plan at 45 s, not before, and the side pick ends then', async () => {
    const { game, fake } = startedGame();
    const good = await toFirstSidePick(game, fake);
    expect(writerOf(game).openAsk()?.phase, 'the premise: the seat’s auction plan is still asked as its side pick opens').toBe('auction');

    const pick = await runSidePick(game, fake, good);

    expect(pick.claudeDone, 'not Done before the wait is up').toBeGreaterThanOrEqual(WAIT_MS);
    expect(pick.claudeDone).toBeLessThanOrEqual(WAIT_MS + PRESS_MS);
    expect(pick.ended).toBeLessThanOrEqual(WAIT_MS + PRESS_MS);
    expect(writerOf(game).openAsk(), 'its ask was aborted at the wait’s end').toBeNull();
  });

  it('B-AC-5: at a faster table (phaseScale 0.5) the wait is still 45 real seconds: a chat thinks in real time', async () => {
    const { game, fake } = startedGame(TABLE, 0.5);
    const good = await toFirstSidePick(game, fake);

    const pick = await runSidePick(game, fake, good);

    expect(pick.claudeDone).toBeGreaterThanOrEqual(WAIT_MS);
    expect(pick.claudeDone).toBeLessThanOrEqual(WAIT_MS + PRESS_MS);
  });

  it('B-AC-5: a plan from the chat at 20 s makes the Claude seat Done at 20 s, and the side pick ends when the others are Done, as today', async () => {
    const { game, fake } = startedGame();
    const good = await toFirstSidePick(game, fake);
    const answer = async () => {
      const writer = writerOf(game);
      expect(await writer.submit(writer.openAsk()!.id, { edits: [], line: 'Ready to trade.' })).toMatchObject({ kind: 'accepted' });
    };

    const pick = await runSidePick(game, fake, good, { 20_000: answer });

    expect(pick.claudeDone).toBeGreaterThanOrEqual(20_000);
    expect(pick.claudeDone).toBeLessThanOrEqual(20_000 + PRESS_MS);
    expect(pick.ended).toBeLessThanOrEqual(20_000 + PRESS_MS);
  });

  it('B-AC-5: the later goods’ side picks don’t wait for the Claude seat', async () => {
    const { game, fake } = startedGame();
    const first = await toFirstSidePick(game, fake);
    await runSidePick(game, fake, first);
    let next: Good | null = null;
    for (let t = 0; t < 10 * 60_000 && next === null && view(game).phase === 'auction'; t += WALK.tickMs) {
      const v = view(game);
      if (sidePick(v) && v.auction!.good !== first) next = v.auction!.good;
      else {
        fake.advance(WALK.tickMs);
        await Promise.resolve();
      }
    }
    expect(next, 'the premise: a second good comes up').not.toBeNull();

    const pick = await runSidePick(game, fake, next!);

    expect(pick.ended).toBeLessThan(WAIT_MS);
    expect(pick.claudeDone).toBeLessThanOrEqual(PRESS_MS);
  });

  it('B-AC-5 (RULE-6): the host’s Continue still ends the side pick at once; the seat’s ask is aborted and a later answer is too late', async () => {
    const { game, fake } = startedGame();
    const good = await toFirstSidePick(game, fake);
    const asked = writerOf(game).openAsk()!;

    const pick = await runSidePick(game, fake, good, { 5_000: () => game.handle('s1', { type: 'continue' }) });

    expect(pick.ended).toBeLessThanOrEqual(5_000 + 2 * WALK.tickMs);
    expect(await writerOf(game).submit(asked.id, { edits: [], line: 'Late.' })).toEqual({ kind: 'too_late' });
  });

  it('B-AC-5 (HC-3): the room closing mid-wait leaves no Claude ask open; a later answer is too late', async () => {
    const { game, fake } = startedGame();
    await toFirstSidePick(game, fake);
    const writer = writerOf(game);
    const asked = writer.openAsk()!;
    fake.advance(10_000);

    game.dispose();

    expect(writer.openAsk()).toBeNull();
    expect(await writer.submit(asked.id, { edits: [], line: 'Late.' })).toEqual({ kind: 'too_late' });
  });

  it('C7 pin: with no Claude seat, the first good’s side pick ends as soon as everyone is Done, as today', async () => {
    const table = TABLE.map(({ kind: _kind, ...seat }) => seat);
    const { game, fake } = startedGame(table);
    const good = await toFirstSidePick(game, fake);

    const pick = await runSidePick(game, fake, good);

    expect(pick.ended).toBeLessThanOrEqual(PRESS_MS);
  });
});
