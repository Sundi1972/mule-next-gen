import { describe, expect, it } from 'vitest';
import { expectedOffWorld, GOODS, nextPostedPrice, observe, storeForSale, storeQuotes, storeWants, type GameState } from '@mule/engine';
import { simSeats } from '../src/lineup.js';
import { outlook } from '../src/outlook.js';
import { playGame } from '../src/play.js';

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
    const seen = atEachUpkeep(seed, (state) => {
      const me = state.players[0]!.id;
      const o = outlook(observe(state, me), me, { lookAhead: true });
      // The report the store's next postPrices reads as last month's: this month's, which upkeep just filled in.
      const lastShortages = state.history.at(-1)!.shortages;
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
  }, 60_000);
});
