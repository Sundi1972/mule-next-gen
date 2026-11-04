import { describe, expect, it } from 'vitest';
import { advancePhase, createGame, type GameState, type MonthEvent } from '../src/index.js';

const fourPlayers = () => createGame({ seed: 3, players: [0, 1, 2, 3].map((i) => ({ id: `p${i}`, name: `P${i}`, isAi: false })) });

/** A stand-in event of `phase`; its shape doesn't matter to where the month keeps it. */
const filed = (phase: MonthEvent['phase']): MonthEvent => ({
  key: 'drought',
  kind: 'drought',
  title: 'Drought',
  line: 'A stand-in.',
  scope: 'colony',
  origin: { x: 0, y: 0 },
  plots: [],
  sign: 'bad',
  phase,
});

/** Advances to the next time the game enters `phase`. */
function toPhase(state: GameState, phase: GameState['phase']) {
  do advancePhase(state);
  while (state.phase !== phase && state.phase !== 'gameOver');
}

describe('C1: the month keeps every event it fires', () => {
  it('a new game opens month 1 with no events kept', () => {
    expect(fourPlayers().monthEvents).toEqual([]);
  });

  it("production's events are the month's production events, and the report files the same ones", () => {
    const state = fourPlayers();
    for (let month = 1; month <= 6; month++) {
      toPhase(state, 'production');
      const report = state.history.at(-1)!;
      expect(state.monthEvents.filter((e) => e.phase === 'production')).toEqual(report.events);
      expect(report.events!.every((e) => e.phase === 'production')).toBe(true);
    }
  });

  it("at the month end the report's events become the whole month's, and the next planning starts a new, empty list", () => {
    const state = fourPlayers();
    toPhase(state, 'auction');
    const kept = state.monthEvents;
    kept.unshift(filed('planning'));
    toPhase(state, 'upkeep');
    expect(state.history.at(-1)!.events).toEqual(state.monthEvents);
    expect(state.history.at(-1)!.events![0]).toEqual(filed('planning'));
    toPhase(state, 'planning');
    expect(state.month).toBe(2);
    expect(state.monthEvents).toEqual([]);
    // A new array, not the old one emptied: a what-if copy may still share last month's.
    expect(state.monthEvents).not.toBe(kept);
    expect(kept[0]).toEqual(filed('planning'));
  });
});
