import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { colonistMeal, createGame, PRICE, runUpkeep, shipInPort, UPKEEP, type GameState } from '../src/index.js';
import { foodMonth, post } from './fixtures/food-month.js';
import { healthOffInTest } from './health-switch.js';

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
    // Health off: the promise is the free meal; with health on the base sick share trims the growth by a colonist.
    healthOffInTest();
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

describe('needs C2: colonists have no wages, and the store bids with no wage ceiling', () => {
  it("needs T-AC-7: colonistBudget exists nowhere in packages/engine/src, and the store's lines read no colonist wage", () => {
    const src = fileURLToPath(new URL('../src', import.meta.url));
    const files = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts'));
    const read = (f: string) => readFileSync(join(src, f), 'utf8');
    // The scan reads the engine: it finds the colonists' other numbers where they live.
    expect(files.filter((f) => /\bcolonistsPerUnit\b/.test(read(f))), 'the scan sees config.ts').toContain('config.ts');
    expect(files.filter((f) => /\bcolonistBudget\b/.test(read(f))), 'no wage budget left in the engine').toEqual([]);
  });

  it("needs T-AC-7 (store): a short Food shelf's buy line is the band's (108), not a wage cap (96) and not 1", () => {
    // A short Food shelf: the colony holds 4 against a need of 14, so Food is posted severe at 4 × 30 = 120.
    const state = foodMonth(4, [5, 1]);
    expect(post(state), 'the premise: severe').toBe(120);
    const a = state.auction!;
    expect(a.good, 'the premise: Food is up').toBe('food');
    const band = PRICE.bandSpread.severe;
    // The band's own lines, 120 less 10% and 120 plus 25%: no wage ceiling under the buy line.
    expect(a.storeBuy, 'the band\'s buy line, not a wage cap (96) and not a cap reading a deleted budget (1)').toBe(Math.floor(120 * (1 - band.under)));
    expect(a.storeBuy).toBe(108);
    expect(a.storeSell).toBe(150);
  });
});
