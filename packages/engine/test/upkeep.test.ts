import { describe, expect, it } from 'vitest';
import { colonistMeal, createGame, runUpkeep, shipInPort, UPKEEP, type GameState } from '../src/index.js';

/** A fresh 4-seat game whose colony needs exactly `need` Food and `need` Water this month, at upkeep. */
function colonyNeeding(need: number): GameState {
  const state = createGame({ seed: 11, players: ['brix', 'ossa', 'lena', 'tam'].map((id) => ({ id, name: id, isAi: false })) });
  state.colonists = need * UPKEEP.colonistsPerUnit;
  expect(shipInPort(state), 'the premise: no export ship pays into store capital this upkeep').toBe(false);
  expect(state.monthEvents.some((e) => e.key === 'festival'), 'the premise: no festival adds to their Food').toBe(false);
  return state;
}

/** Every credit in the game: the players', the store's and the colony fund's. */
const credits = (state: GameState) => ({
  players: state.players.map((p) => p.money),
  store: state.store.capital,
  fund: state.treasury.money,
});

describe('needs C1: the colonists eat free from the store (RULE-1)', () => {
  it('needs T-AC-6: RULE-1\'s cases (need 0 → s 0; stock 0 → s 1; no credits move)', () => {
    expect(colonistMeal(0, 12), 'need 0: nobody to go short').toEqual({ took: 0, short: 0 });
    expect(colonistMeal(0, 0)).toEqual({ took: 0, short: 0 });
    expect(colonistMeal(20, 0), 'stock 0: they go wholly short').toEqual({ took: 0, short: 1 });
    expect(colonistMeal(20, 19), 'took = min(need, stock)').toEqual({ took: 19, short: 0.05 });
    expect(colonistMeal(20, 35), 'a full shelf: they take their need and no more').toEqual({ took: 20, short: 0 });

    // No credits move, whatever the price: the shelf short of Food, Water posted dear.
    const state = colonyNeeding(20);
    state.store.stock.food = 7;
    state.store.stock.water = 20;
    state.store.posted.water = 5_000;
    const before = credits(state);
    runUpkeep(state);
    expect(credits(state)).toEqual(before);
  });

  it('needs B-AC-4: Food posted at 300 and the shelf holding their need, they are fed in full and store.capital is unchanged by their meal', () => {
    const state = colonyNeeding(20);
    state.store.posted.food = 300;
    state.store.stock.food = 20;
    state.store.stock.water = 20;
    const capital = state.store.capital;

    const { shortages, hungry } = runUpkeep(state);

    expect(hungry, 'fed in full, though 300 is twice what their old Food wage paid').toBe(false);
    expect(shortages).toEqual([]);
    expect(state.store.stock.food, 'they took all 20 Food from the shelf').toBe(0);
    expect(state.store.stock.water).toBe(0);
    expect(state.colonists, 'a fed colony grows').toBe(Math.round(400 * UPKEEP.colonistGrowth.fed));
    expect(state.store.capital, 'their meal paid the store nothing').toBe(capital);
  });
});
