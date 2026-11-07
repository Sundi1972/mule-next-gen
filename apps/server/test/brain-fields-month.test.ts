/** The land brief the upkeep sends for next month reads none of this month's adopted playbook fields (AM-34). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advancePhase, createGame, type GameState } from '@mule/engine';
import { AiSeat, playbookSource, type PlanEdit } from '@mule/ai';
import { createBrain } from '../src/brain/index.js';
import { Playbooks } from '../src/brain/playbooks.js';
import { fakeSdk, KEY, neverAnswers, promptOf } from './brain-fakes.js';

const PLAYERS = [
  { id: 'p0', name: 'Ada', isAi: true },
  { id: 'p1', name: 'Heiko', isAi: false },
];

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/**
 * The land brief's text the writer is sent for month 2, asked as month 1's upkeep opens, after the AI seat adopted its
 * month-1 planning draft with `edits`.
 */
async function month2Brief(edits: PlanEdit[]): Promise<string> {
  const state: GameState = createGame({ seed: 10, players: PLAYERS });
  const seat = new AiSeat({ id: 'p0', name: 'Ada', persona: 'trader', level: 'trader', seed: 1 });
  const { playbook, rejected } = seat.validator()(state, 'p0', seat.draft(state, 'planning'), edits);
  expect(rejected).toEqual([]);
  seat.adopt(playbook);
  while (state.phase !== 'upkeep') advancePhase(state);
  const sdk = fakeSdk((_n, _params, options) => neverAnswers(options));
  const brain = createBrain({ gameId: 'g-fields-month', env: KEY, logPath: '/dev/null', sdkFactory: () => sdk });
  new Playbooks({ brain, source: playbookSource([seat]), seats: [seat] }).ask(state, 2);
  await vi.advanceTimersByTimeAsync(10);
  expect(sdk.calls).toBe(1);
  return promptOf(sdk.requests[0]!.params).user;
}

describe('an adopted field holds for its own month only', () => {
  it("INV-fields-month: the upkeep's land brief for next month is the brief of a seat that adopted no field", async () => {
    const floored = await month2Brief([{ path: '/strategy/cashFloor', to: 1_777, reason: 'Keep cash.' }]);
    expect(floored).not.toContain('1,777');
    expect(floored).not.toContain('1777');
    // The same draft adopted with no edit: no field is adopted.
    expect(floored).toEqual(await month2Brief([]));
  });
});
