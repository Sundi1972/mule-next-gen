/**
 * deep3 fixes 3 and 4, at the land brief Claude receives: what became of last month's route, and the strategy it set
 * itself, both asked through Playbooks as the game asks them.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advancePhase, AI_HANDS, createGame, DEV_STEER, MS_PER_SECOND, type GameState } from '@mule/engine';
import { AiSeat, applyAction, arrive, playbookSource, type DevClock } from '@mule/ai';
import { createBrain } from '../src/brain/index.js';
import { Playbooks } from '../src/brain/playbooks.js';
import type { PlaybookNote } from '../src/mule-game.js';
import { fakeSdk, KEY, promptOf, sdkMessage, type SdkParams } from './brain-fakes.js';

const PLAYERS = [
  { id: 'p0', name: 'Ada', isAi: true },
  { id: 'p1', name: 'Heiko', isAi: false },
];
const USED = { input: 900, output: 120 };

let dir: string;
let steer: boolean;
beforeEach(() => {
  vi.useFakeTimers();
  steer = DEV_STEER.on;
  DEV_STEER.on = false;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-deep3-brief-'));
});
afterEach(() => {
  vi.useRealTimers();
  DEV_STEER.on = steer;
  fs.rmSync(dir, { recursive: true, force: true });
});

const advanceTo = (state: GameState, phase: GameState['phase']) => {
  while (state.phase !== phase) advancePhase(state);
};

/** One Smart seat whose model answers each land write with the next of `replies` at once; its land briefs, as sent. */
function table(replies: readonly object[]) {
  const asked: SdkParams[] = [];
  const sdk = fakeSdk((n, params) => (asked.push(params), Promise.resolve(sdkMessage(JSON.stringify(replies[Math.min(n, replies.length) - 1] ?? { edits: [], line: '' }), USED))));
  const brain = createBrain({ gameId: 'g-deep3', env: KEY, logPath: path.join(dir, 'costs.jsonl'), sdkFactory: () => sdk });
  const state: GameState = createGame({ seed: 10, players: PLAYERS });
  const seat = new AiSeat({ id: 'p0', name: 'Ada', persona: 'trader', level: 'trader', seed: 1 });
  const notes: PlaybookNote[] = [];
  const playbooks = new Playbooks({ brain, source: playbookSource([seat]), seats: [seat], record: (n) => notes.push(n) });
  const landBriefs = () => asked.map((p) => promptOf(p).user).filter((u) => u.includes('Land plans for this month'));
  return { state, seat, notes, playbooks, landBriefs };
}

/** The seat's development turn on tap-to-walk, as play.ts's loop runs it. */
function developTurn(state: GameState, seat: AiSeat): void {
  const me = state.players.find((p) => p.id === seat.id)!;
  const clock: DevClock = { left: me.devSeconds, at: 'store' };
  while (clock.left > 0 && !me.doneDeveloping) {
    arrive(state, seat.id, clock);
    seat.developTick(state, AI_HANDS.devTickMs, clock.left, (a) => applyAction(state, seat.id, a, clock), { at: clock.at!, busy: !!clock.busy });
    clock.left -= AI_HANDS.devTickMs / MS_PER_SECOND;
  }
}

describe("deep3 fix 3: the land brief shows what became of last month's route", { timeout: 30_000 }, () => {
  it('deep3 fix 3: after a month whose route had an install refused in play, the next land brief names that plot and why', async () => {
    const createdState = createGame({ seed: 10, players: PLAYERS });
    const plot = createdState.tiles.findIndex((t) => t.terrain === 'plains' && t.owner === null);
    const route = [
      { act: 'buyMule', plot: null, outfit: null },
      { act: 'outfit', plot: null, outfit: 'food' },
      { act: 'install', plot, outfit: null },
    ];
    const { state, seat, notes, playbooks, landBriefs } = table([{ edits: [{ path: '/development/route', to: route, reason: 'Farm it.' }], line: '' }]);
    state.tiles[plot]!.owner = 'p0';

    playbooks.ask(state, 1);
    await vi.advanceTimersByTimeAsync(10);
    advanceTo(state, 'landGrant');
    playbooks.takeEffect(state);
    advanceTo(state, 'development');
    playbooks.takePhase(state, 'development');
    expect(notes.map((n) => [n.phase, n.playbook.by])).toContainEqual(['development', 'llm']);
    // Sold since the route was written: the hands refuse the install as stale.
    state.tiles[plot]!.owner = 'p1';
    developTurn(state, seat);
    advanceTo(state, 'upkeep');

    playbooks.ask(state, 2);
    await vi.advanceTimersByTimeAsync(10);
    const next = landBriefs().at(-1)!;
    expect(landBriefs()).toHaveLength(2);
    expect(next).toContain('What happened in your last phase (month 1, development):');
    expect(next).toMatch(new RegExp(`/development/route/2: planned \\{"act":"install","plot":${plot}\\}, got (skipped|replaced) \\(stale: plot ${plot}\\)`));
  });
});
