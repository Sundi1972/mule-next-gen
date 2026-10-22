import { describe, expect, it } from 'vitest';
import { advancePhase, createGame, nextPostedPrice, PRICE, startAuction, storeBuyLine, storeWants, UPKEEP, type GameState } from '../src/index.js';

const SEATS = ['brix', 'ossa', 'lena', 'tam'];

/** Month 1's auction phase, with the store's Food shelf at `food` units and every player holding 40, so the colony as a whole isn't short. */
function auctionWithFood(food: number): GameState {
  const state = createGame({ seed: 11, players: SEATS.map((id) => ({ id, name: id, isAi: false })) });
  while (state.phase !== 'auction') advancePhase(state);
  state.store.stock.food = food;
  for (const p of state.players) p.stock.food = 40;
  return state;
}

const monthOfNeed = (state: GameState) => state.colonists / UPKEEP.colonistsPerUnit;

describe('the store never runs out of money', () => {
  it('T-AC-11: with its capital below zero, the store still buys the Food it wants', () => {
    const state = auctionWithFood(0);
    state.store.capital = -1_000;
    startAuction(state, ['food']);
    const a = state.auction!;
    expect(a.good).toBe('food');
    const wants = storeWants(state, 'food');
    expect(wants).toBeGreaterThan(0);
    expect(a.storeBudget).toBe(wants);
    expect(storeBuyLine(state)).toBe(a.storeBuy);
  });
});

describe('pricing B', () => {
  it('T-AC-12: a Food shelf under a month of colonist need posts a higher price than the same state without the shelf rule', () => {
    const price = (food: number, cover: number) => {
      const saved = PRICE.shelfCover;
      PRICE.shelfCover = cover;
      try {
        return nextPostedPrice(auctionWithFood(food), 'food');
      } finally {
        PRICE.shelfCover = saved;
      }
    };
    const short = Math.floor(monthOfNeed(auctionWithFood(0))) - 1;
    expect(price(short, 1)).toBeGreaterThan(price(short, 0));
    // Negative case: a shelf holding more than a month of need posts the same price either way.
    const full = Math.ceil(monthOfNeed(auctionWithFood(0))) + 2;
    expect(price(full, 1)).toBe(price(full, 0));
  });

  it('T-AC-13: with the Food shelf short the store bids up to restockPremium x posted, capped under the colonists’ budget', () => {
    const bid = (food: number) => {
      const state = auctionWithFood(food);
      startAuction(state, ['food']);
      return { buy: state.auction!.storeBuy, posted: state.store.posted.food };
    };
    const short = bid(0);
    const ceiling = Math.floor((UPKEEP.colonistBudget.food ?? 0) / (1 + PRICE.storeSpread) ** 2);
    expect(short.buy).toBe(Math.max(Math.floor(short.posted * (1 - PRICE.storeSpread)), Math.min(ceiling, Math.ceil(short.posted * PRICE.restockPremium))));
    expect(short.buy).toBeGreaterThan(Math.floor(short.posted * (1 - PRICE.storeSpread)));
    // The store never buys above its own selling price for the same good (WS3's review of #66): no buy-back loop.
    const short2 = auctionWithFood(0);
    startAuction(short2, ['food']);
    expect(short2.auction!.storeSell).toBeGreaterThan(short2.auction!.storeBuy);
    // Negative case: with more than a month of need on the shelf the store bids its usual price.
    const full = bid(Math.ceil(monthOfNeed(auctionWithFood(0))) + 2);
    expect(full.buy).toBeGreaterThan(0);
    expect(full.buy).toBe(Math.max(1, Math.floor(full.posted * (1 - PRICE.storeSpread))));
  });
});
