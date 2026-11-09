import { describe, expect, it } from 'vitest';
import { advancePhase, cloneForSim, createGame, EVENTS, type GameState, type MonthEvent } from '../src/index.js';

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
  it("a new game opens month 1 with no events kept (EVENTS.firstMonth is 2)", () => {
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

  it("a what-if copy taken in the auction and played through the month end leaves the real report and list as they were", () => {
    const state = fourPlayers();
    toPhase(state, 'auction');
    state.monthEvents.unshift(filed('planning'));
    const report = state.history.at(-1)!;
    const events = structuredClone(report.events);
    const month = structuredClone(state.monthEvents);
    const list = state.monthEvents;
    const sim = cloneForSim(state);
    toPhase(sim, 'planning');
    expect(report.events).toEqual(events);
    expect(state.monthEvents).toBe(list);
    expect(state.monthEvents).toEqual(month);
  });

  it("a what-if copy keeps its own copy of the month's list, so nothing it fires reaches the real game's (WS3's review)", () => {
    const state = fourPlayers();
    toPhase(state, 'auction');
    state.monthEvents.unshift(filed('planning'));
    const sim = cloneForSim(state);
    expect(sim.monthEvents).toEqual(state.monthEvents);
    expect(sim.monthEvents).not.toBe(state.monthEvents);
    sim.monthEvents.push(filed('auction'));
    expect(state.monthEvents).toEqual([filed('planning')]);
  });

  it("month 1's planning rolls as a new game opens, as every later month's does in advancePhase (WS3's review)", () => {
    const row = EVENTS.colony.federationTax;
    // C26's blamed-for-the-unrest rolls for the richest seat even in a content colony (base 0, the richest raises it); its
    // cap holds its planning chance at 0 here, so only the tax fires.
    const blamed = EVENTS.player.blamedForUnrest;
    const before = { firstMonth: EVENTS.firstMonth, phases: row.phases, blamedCap: blamed.cap };
    try {
      (EVENTS as { firstMonth: number }).firstMonth = 1;
      (row as { phases: typeof row.phases }).phases = { planning: 1 };
      (blamed as { cap: number }).cap = 0;
      const state = fourPlayers();
      expect(state.monthEvents.map((e) => [e.key, e.phase])).toEqual([['federationTax', 'planning']]);
    } finally {
      (EVENTS as { firstMonth: number }).firstMonth = before.firstMonth;
      (row as { phases: typeof row.phases }).phases = before.phases;
      (blamed as { cap: number }).cap = before.blamedCap;
    }
  });
});
