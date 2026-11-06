import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  auctionDone,
  createGame,
  expectedOffWorld,
  GOODS,
  nextPostedPrice,
  observe,
  PRICE,
  stepAuction,
  storeBuyAt,
  storeForSale,
  storeQuotes,
  storeWants,
  WALK,
  type GameState,
  type Good,
} from '@mule/engine';
import { simSeats } from '../src/lineup.js';
import { outlook } from '../src/outlook.js';
import { playGame } from '../src/play.js';
import { expectedPrices } from '../src/strategist.js';

/**
 * The AI price contract (pricing spec §3, HC-3, HC-5): the AI seats read prices only through nextPostedPrice,
 * storeQuotes, storeWants and expectedOffWorld. Sampled at upkeep, when every good's walk this month is done.
 */

const SEEDS = Array.from({ length: 20 }, (_, i) => 301 + i);
// literal-ok: a short game reaches enough upkeeps to sample; the contract does not depend on the game's length
const MONTHS = 4;

/** Every upkeep of a short AI game that the game goes on from, as the real state at that moment. */
function atEachUpkeep(seed: number, look: (state: GameState) => void): number {
  let seen = 0;
  playGame(seed, simSeats(4, 'trader', seed), {
    maxMonths: MONTHS,
    // Walking time changes how the seats develop, not how the store prices: off, the games run faster.
    walking: false,
    onPhase: (state) => {
      if (state.phase !== 'upkeep') return;
      seen++;
      look(state);
    },
  });
  return seen;
}

describe("pricing §3: the AI's prices are the store's own rule", () => {
  it.each(SEEDS)("price T-AC-2: at upkeep, outlook's next-month price is the store's own rule on its stage (seed %i)", (seed) => {
    let checkedPurity = false;
    let walked = 0;
    const seen = atEachUpkeep(seed, (state) => {
      const me = state.players[0]!.id;
      const o = outlook(observe(state, me), me, { lookAhead: true });
      // The report the store's next postPrices reads as last month's: this month's, which upkeep just filled in.
      const lastShortages = state.history.at(-1)!.shortages;
      if (Object.keys(state.store.lastWalk ?? {}).length > 0) walked++;
      expect(o.stage.store.lastWalk, 'the stage carries the real lastWalk').toEqual(state.store.lastWalk);
      for (const good of GOODS) {
        expect(o.price(good), `${good}, month ${state.month}`).toBe(nextPostedPrice(o.stage, good, undefined, lastShortages));
        // §3's null semantics: a line is null exactly when the store won't trade, never for a price reason.
        const q = storeQuotes(state, good);
        expect(q.sell === null, `${good}: sell is null exactly when nothing is for sale`).toBe(storeForSale(state, good) === 0);
        expect(q.buy === null, `${good}: buy is null exactly when the store wants none`).toBe(storeWants(state, good) === 0);
        // Until PR-4 the off-world price is expected to stay where it is.
        for (const months of [0, 1, 3]) expect(expectedOffWorld(state, good, months), `${good} in ${months} months`).toBe(state.store.offWorld[good]);
      }
      if (checkedPurity) return;
      // Pure and never draws: the state, its rng included, is as it was.
      const before = structuredClone(state);
      for (const good of GOODS) expectedOffWorld(state, good, 3);
      expect(state).toEqual(before);
      checkedPurity = true;
    });
    expect(seen, 'the game reached upkeeps to sample').toBeGreaterThan(0);
    // Without a walk's lesson at some upkeep, the stage check above compares nothing with nothing.
    expect(walked, 'some upkeep held a walk lesson').toBeGreaterThan(0);
  }, 60_000);
});

describe("pricing T-AC-2: off the auction, the AI expects the store's buy line (no wage cap since needs C2)", () => {
  /** Month 1's auction: the colony holds `food` and `water` (all in p0's depot, none on the store's shelf), so the store posts from that. */
  function auctionHolding(food: number, water: number): GameState {
    const state = createGame({ seed: 11, players: [0, 1, 2, 3].map((i) => ({ id: `p${i}`, name: `P${i}`, isAi: false })) });
    while (state.phase !== 'production') advancePhase(state);
    state.store.stock.food = 0;
    state.store.stock.water = 0;
    state.players.forEach((p, i) => Object.assign(p.stock, { food: i === 0 ? food : 0, water: i === 0 ? water : 0 }));
    advancePhase(state);
    expect(state.phase, 'the premise: the store has posted').toBe('auction');
    return state;
  }

  /** Everyone Done until `good` is the good on the status screen. */
  function untilUp(state: GameState, good: Good): void {
    for (let step = 0; state.auction!.good !== good; step++) {
      expect(step, `${good} comes up`).toBeLessThan(1_000);
      for (const p of state.players) auctionDone(state, p.id);
      stepAuction(state, WALK.tickMs);
    }
  }

  /** The severe band's buy line around the posted price: the posted price less the band's margin, rounded down. */
  const severeLine = (state: GameState, good: Good) => Math.floor(state.store.posted[good] * (1 - PRICE.bandSpread.severe.under));

  it.each([
    { good: 'food' as const, other: 'water' as const },
    { good: 'water' as const, other: 'food' as const },
  ])("price T-AC-2: in a severe $good month the AI expects, while $other is up, what it gets when $good comes up (the band's buy line)", ({ good, other }) => {
    const state = auctionHolding(4, 4);
    expect(state.store.band?.[good], 'the premise: severe').toBe('severe');
    const line = severeLine(state, good);
    // The off-auction view first when Water is the good, since Food comes up before it.
    const offFirst = good === 'water';
    let off = 0;
    if (offFirst) {
      untilUp(state, other);
      off = expectedPrices(observe(state, 'p0'), good).sell;
    }
    untilUp(state, good);
    expect(state.auction!.storeBuy, "the premise: the band sets the store's line").toBe(line);
    const on = expectedPrices(observe(state, 'p0'), good).sell;
    if (!offFirst) {
      untilUp(state, other);
      off = expectedPrices(observe(state, 'p0'), good).sell;
    }
    expect(off).toBe(on);
  });

  it("needs T-AC-7 (AI): in a severe Food month the AI's forecast of the store's Food buy is the band's line (108), not 0", () => {
    const state = auctionHolding(4, 4);
    expect(state.store.posted.food, 'the premise: Food posted severe, 4 × 30').toBe(120);
    const obs = observe(state, 'p0');
    // The exact line value.ts's carry reads, and the rounded one the strategist expects: both the band's 120 less 10%.
    expect(storeBuyAt(obs, 'food', obs.store.posted.food, { exact: true }), "the exact forecast: the band's line, not a cap of 0").toBeCloseTo(108, 9);
    expect(expectedPrices(obs, 'food').sell, "the strategist's forecast: the band's line, not 1").toBe(108);
  });
});
