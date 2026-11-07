import { describe, expect, it } from 'vitest';
import { advancePhase, createGame, observe, storeQuotes, STRATEGIST } from '@mule/engine';
import { expectedPrices } from '../src/strategist.js';

describe("the seat expects the store's own buy price (N4)", () => {
  it('FM-store-spread-float: outside the auction, a seat expects to sell to the store at what the store quotes, down to a posted price of 1', () => {
    // The store pays never under 1 credit; the seat's own estimate used to floor posted × 0.9 to 0 at a posted price of 1.
    const state = createGame({ seed: 3, players: [0, 1, 2, 3].map((i) => ({ id: `ai${i}`, name: `AI${i}`, isAi: true })) });
    while (state.phase !== 'development') advancePhase(state);
    state.store.stock.smithore = 0;
    const rows = [1, 2, 7, 10, 33, 90, 180];
    const seen = rows.map((posted) => {
      state.store.posted.smithore = posted;
      const buys = storeQuotes(state, 'smithore').buy;
      expect(buys, `the case: the store buys Smithore at ${posted}`).not.toBeNull();
      return [posted, expectedPrices(observe(state, 'ai0'), 'smithore').sell];
    });
    expect(seen).toEqual(rows.map((posted) => {
      state.store.posted.smithore = posted;
      return [posted, Math.max(storeQuotes(state, 'smithore').buy!, Math.floor(posted * STRATEGIST.trade.sellFloor))];
    }));
  });
});
