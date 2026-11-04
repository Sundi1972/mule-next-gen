import { describe, expect, it } from 'vitest';
import { advancePhase, colonyGauges, colonyWealth, createGame, lastGauges, scoreParts, type GameState } from '../src/index.js';

const SEATS = ['lena', 'brix', 'ossa', 'kai'];
const newGame = (): GameState => createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })) });

function toUpkeep(state: GameState): void {
  do advancePhase(state);
  while (state.phase !== 'upkeep');
}

describe("the colony's gauges and last month's", () => {
  it("AM-4 (lastGauges): month 1 has no last month; from month 2 the screens read the month end before this month's, through this month's own upkeep", () => {
    const state = newGame();
    expect(lastGauges(state)).toBeNull();
    toUpkeep(state);
    const month1 = colonyGauges(state);
    expect(lastGauges(state)).toBeNull();

    advancePhase(state);
    expect(state.month).toBe(2);
    expect(lastGauges(state)).toEqual(month1);
    toUpkeep(state);
    expect(lastGauges(state), "after month 2's upkeep it is still month 1's end").toEqual(month1);
    expect(state.colony!.monthEnds.map((g) => g.month)).toEqual([1, 2]);
  });

  it("the colony's wealth is the fund and every player's money, goods, land and MULEs, before the office line", () => {
    const state = newGame();
    state.treasury.money = 300;
    const players = SEATS.reduce((sum, id) => {
      const p = scoreParts(state, id);
      return sum + p.money + p.goods + p.land + p.muleValue;
    }, 0);
    expect(colonyWealth(state)).toBe(300 + players);
    expect(colonyGauges(state)).toMatchObject({ month: 1, wealth: 300 + players, prestige: 0, happiness: null });
  });
});
