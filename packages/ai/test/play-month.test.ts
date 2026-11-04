import { describe, expect, it } from 'vitest';
import { RuleError, scoreParts, type GameState, type Playbook } from '@mule/engine';
import { simSeats } from '../src/lineup.js';
import { playGame, playMonthFrom, type MonthSeat } from '../src/play.js';

const SEED = 4;

/** Month 1's upkeep and month 2's planning of a played sim game, as states to play on from. */
function startStates(): { upkeep: GameState; planning: GameState } {
  const at: Partial<Record<'upkeep' | 'planning', GameState>> = {};
  playGame(SEED, simSeats(3, 'trader', SEED), {
    maxMonths: 3,
    onPhase: (state) => {
      if (state.month === 1 && state.phase === 'upkeep') at.upkeep ??= structuredClone(state);
    },
  });
  // Planning is played first in a month, so onPhase sees it after it is played: start from the state the upkeep left.
  playGame(SEED, simSeats(3, 'trader', SEED), {
    maxMonths: 3,
    onPhase: (state) => {
      if (state.month === 2 && state.phase === 'planning') at.planning ??= structuredClone(state);
    },
  });
  return { upkeep: at.upkeep!, planning: at.planning! };
}

const seatsOf = (state: GameState): MonthSeat[] =>
  state.players.map((p, i) => ({ id: p.id, persona: 'trader', level: 'trader', seed: 1_000 + i }));

/** A playbook stamped for `month`, with nothing in it but its strategy. */
const playbookFor = (seat: string, month: number): Playbook => ({
  v: 1,
  seat,
  month,
  phase: 'planning',
  strategy: { kind: 'builder', moneyMaker: null, monopolyTarget: null, cashFloor: 0, landTarget: { plots: 3, byMonth: 3 }, stances: {}, reason: 'test' },
  by: 'engine',
});

describe('playMonthFrom: one month of keyless play from a state', () => {
  it('from an upkeep it plays the whole next month and stops after that month ends; the start state is untouched', () => {
    const { upkeep } = startStates();
    const before = structuredClone(upkeep);
    const played = playMonthFrom(upkeep, seatsOf(upkeep), 9);
    expect(played.month).toBe(2);
    expect(played.state.month === 3 || played.state.phase === 'gameOver').toBe(true);
    expect(played.state.phase === 'planning' || played.state.phase === 'gameOver').toBe(true);
    expect(played.state.history.map((h) => h.month)).toContain(2);
    expect(upkeep).toEqual(before);
  });

  it('from a planning it plays that month', () => {
    const { planning } = startStates();
    const played = playMonthFrom(planning, seatsOf(planning), 9);
    expect(played.month).toBe(2);
    expect(played.state.month === 3 || played.state.phase === 'gameOver').toBe(true);
  });

  it('is the same month, byte for byte, for the same start, seats and seed', () => {
    const { upkeep } = startStates();
    const a = playMonthFrom(upkeep, seatsOf(upkeep), 9);
    const b = playMonthFrom(upkeep, seatsOf(upkeep), 9);
    expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
    for (const p of upkeep.players) expect(scoreParts(b.state, p.id)).toEqual(scoreParts(a.state, p.id));
  });

  it("a seat's playbook must be stamped for the month it plays; a missing player is refused", () => {
    const { upkeep } = startStates();
    const seats = seatsOf(upkeep);
    const me = seats[0]!.id;
    expect(() => playMonthFrom(upkeep, [{ ...seats[0]!, playbook: playbookFor(me, 1) }, ...seats.slice(1)], 9)).toThrow(RuleError);
    expect(() => playMonthFrom(upkeep, [{ ...seats[0]!, playbook: playbookFor(me, 2) }, ...seats.slice(1)], 9)).not.toThrow();
    expect(() => playMonthFrom(upkeep, seats.slice(1), 9)).toThrow(RuleError);
  });
});
