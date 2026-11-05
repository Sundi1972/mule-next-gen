/**
 * RULE-A2 rows 3-4 (C4): the development and auction edits, asked in the slack before each phase and taken at its
 * start, on a manual clock. T-AC-A1 and T-AC-A3 for the development and auction deadlines.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advancePhase, createGame, type GameState } from '@mule/engine';
import { AiSeat, playbookSource } from '@mule/ai';
import { createBrain, type MeteredBrain } from '../src/brain/index.js';
import { Playbooks } from '../src/brain/playbooks.js';
import type { PlaybookNote } from '../src/mule-game.js';
import { fakeSdk, KEY, neverAnswers, promptOf, readLedger, sdkMessage, type FakeSdk, type SdkParams } from './brain-fakes.js';

const PLAYERS = [
  { id: 'p0', name: 'Ada', isAi: true },
  { id: 'p1', name: 'Heiko', isAi: false },
];
const USED = { input: 900, output: 120 };
const DEV_EDIT = JSON.stringify({ edits: [{ path: '/development/timeBudgetMs', to: 1_000, reason: 'Quick.' }], line: '' });

let dir: string;
beforeEach(() => {
  vi.useFakeTimers();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-phase-asks-'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

const ledgerPath = () => path.join(dir, 'costs.jsonl');
const callLines = () => (fs.existsSync(ledgerPath()) ? readLedger(ledgerPath()).filter((l) => l.type === undefined) : []);
const advanceTo = (state: GameState, phase: GameState['phase']) => {
  while (state.phase !== phase) advancePhase(state);
};
const smartOn = (sdk: FakeSdk): MeteredBrain => createBrain({ gameId: 'g-phases', env: KEY, logPath: ledgerPath(), sdkFactory: () => sdk });

/** A fake model that answers `text` `atMs` after it is asked; an aborted call rejects at once, as the SDK's does. */
const answersAt = (atMs: number, text: string) =>
  fakeSdk(
    (_n, _params, options) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(sdkMessage(text, USED)), atMs);
        options.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(options.signal?.reason);
        });
      }),
  );

/** One Smart seat at a game, its playbooks heard, at month 1's land grant: as it ends, the slack before development. */
function table(brain: MeteredBrain) {
  const state: GameState = createGame({ seed: 10, players: PLAYERS });
  const seat = new AiSeat({ id: 'p0', name: 'Ada', persona: 'trader', level: 'trader', seed: 1 });
  const notes: PlaybookNote[] = [];
  const playbooks = new Playbooks({ brain, source: playbookSource([seat]), seats: [seat], record: (n) => notes.push(n) });
  advanceTo(state, 'landGrant');
  return { state, seat, notes, playbooks };
}

describe('RULE-A2 rows 3-4: the next phase is edited in the slack before it', { timeout: 30_000 }, () => {
  it("T-AC-A1 (development): a reply in the slack takes effect at development's start, adopted and recorded by llm; the brief is the development brief", async () => {
    const asked: SdkParams[] = [];
    const spy = fakeSdk((_n, params) => (asked.push(params), new Promise((resolve) => setTimeout(() => resolve(sdkMessage(DEV_EDIT, USED)), 500))));
    const { state, seat, notes, playbooks } = table(smartOn(spy));

    playbooks.askPhase(state, 'development', []);
    await vi.advanceTimersByTimeAsync(1_000);
    advanceTo(state, 'development');
    playbooks.takePhase(state, 'development');

    expect(promptOf(asked[0]!).user).toContain('Your draft development:');
    expect(notes.map((n) => [n.seat, n.month, n.phase, n.playbook.by])).toEqual([['p0', 1, 'development', 'llm']]);
    expect(notes[0]!.playbook.development?.timeBudgetMs).toBe(1_000);
    expect(seat.part(state, 'development')?.part.timeBudgetMs).toBe(1_000);
    expect(callLines().map((l) => [l.kind, l.outcome])).toEqual([['playbook', 'llm']]);
  });

  it('T-AC-A1 (development): a reply landing after development starts is late: dropped, nothing adopted or recorded, and the seat plays its own way', async () => {
    const sdk = answersAt(3_000, DEV_EDIT);
    const { state, seat, notes, playbooks } = table(smartOn(sdk));

    playbooks.askPhase(state, 'development', []);
    await vi.advanceTimersByTimeAsync(1_000);
    advanceTo(state, 'development');
    const before = seat.part(state, 'development');
    playbooks.takePhase(state, 'development');
    await vi.advanceTimersByTimeAsync(5_000);

    expect(sdk.calls).toBe(1);
    expect(notes).toEqual([]);
    expect(seat.part(state, 'development')).toEqual(before);
  });

  it('T-AC-A3 (auction): the auction opens on time with a model that never answers: the call is cancelled at its start and nothing is adopted', async () => {
    const sdk = fakeSdk((_n, _params, options) => neverAnswers(options));
    const { state, seat, notes, playbooks } = table(smartOn(sdk));
    advanceTo(state, 'production');

    playbooks.askPhase(state, 'auction', []);
    await vi.advanceTimersByTimeAsync(1_000);
    advanceTo(state, 'auction');
    const before = seat.part(state, 'auction');
    // Returns at once: nothing here waits on the model.
    playbooks.takePhase(state, 'auction');
    await vi.advanceTimersByTimeAsync(0);

    expect(sdk.calls).toBe(1);
    expect(notes).toEqual([]);
    expect(seat.part(state, 'auction')).toEqual(before);
    // The seat is free again at once: its next write is asked, not refused as busy.
    advanceTo(state, 'upkeep');
    playbooks.ask(state, 2);
    await vi.advanceTimersByTimeAsync(0);
    expect(sdk.calls).toBe(2);
  });

  it("C4: the ask in production's slack sends the auction brief, and the development's start takes nothing it never asked for", async () => {
    const asked: SdkParams[] = [];
    const spy = fakeSdk((_n, params, options) => (asked.push(params), neverAnswers(options)));
    const { state, playbooks, notes } = table(smartOn(spy));
    advanceTo(state, 'production');
    playbooks.askPhase(state, 'auction', []);
    await vi.advanceTimersByTimeAsync(0);
    expect(promptOf(asked[0]!).user).toContain('Your draft auction:');
    // A takePhase for the development (a phase not asked this month) takes nothing.
    playbooks.takePhase(state, 'development');
    expect(notes).toEqual([]);
  });

  it("C4: the auction playbook adopted at the auction's start carries every drafted good, the ones past the brief's cap too", async () => {
    let edited: string | null = null;
    const sdk = fakeSdk((_n, params) => {
      const offered = (params.output_config?.format?.schema as { properties: { edits: { items: { anyOf: { properties: { path: { enum: string[] } } }[] } } } }).properties.edits.items.anyOf.flatMap((v) => v.properties.path.enum);
      edited = offered.find((p) => p.endsWith('/hold'))!;
      return sdkMessage(JSON.stringify({ edits: [{ path: edited, to: 0, reason: 'None.' }], line: '' }), USED);
    });
    const { state, seat, notes, playbooks } = table(smartOn(sdk));
    advanceTo(state, 'production');
    const drafted = Object.keys(seat.draft(state, 'auction').auction ?? {}).sort();
    playbooks.askPhase(state, 'auction', []);
    await vi.advanceTimersByTimeAsync(1_000);
    advanceTo(state, 'auction');
    playbooks.takePhase(state, 'auction');
    expect(edited).not.toBeNull();
    expect(notes.map((n) => [n.phase, n.playbook.by])).toEqual([['auction', 'llm']]);
    expect(Object.keys(notes[0]!.playbook.auction ?? {}).sort()).toEqual(drafted);
  });
});

