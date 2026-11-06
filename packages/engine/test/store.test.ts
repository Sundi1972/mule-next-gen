import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  auctionDone,
  createGame,
  MULE,
  mulesWanted,
  nextPostedPrice,
  PRICE,
  runUpkeep,
  shelfShort,
  startAuction,
  stepAuction,
  storeBuyLine,
  storeQuotes,
  storeSellLine,
  storeWants,
  UPKEEP,
  WALK,
  type GameState,
  type Good,
} from '../src/index.js';

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
    // The round trip: sell a unit to the store, keep what the sales tax leaves, buy it back. Both lines are fixed
    // for the whole good, so once the store's buying lifts its stock past its reserve this is all a player could do.
    const { storeBuy, storeSell } = short2.auction!;
    const kept = storeBuy - Math.round(storeBuy * short2.treasury.salesTax);
    expect(kept - storeSell).toBeLessThan(0);
    // Negative case: with more than a month of need on the shelf the store bids its usual price.
    const full = bid(Math.ceil(monthOfNeed(auctionWithFood(0))) + 2);
    expect(full.buy).toBeGreaterThan(0);
    expect(full.buy).toBe(Math.max(1, Math.floor(full.posted * (1 - PRICE.storeSpread))));
  });
});

describe('the corral keeps its size when a grant gives one claim (Heiko, 5 Nov)', () => {
  /** Today's corral: two MULEs a seat, for the land a seat gains in a month by grant and auction, plus MULE.spareInCorral. */
  const corralFor = (seats: number) => seats * 2 + MULE.spareInCorral;
  const game = (seats: number) => createGame({ seed: 11, players: [...SEATS, 'ivo', 'noor'].slice(0, seats).map((id) => ({ id, name: id, isAi: false })) });

  it.each([2, 4, 6])('upkeep builds a %i-seat corral up to two MULEs a seat plus the spares', (seats) => {
    const state = game(seats);
    state.store.mules = 0;
    state.store.stock.smithore = 100;
    runUpkeep(state);
    expect(state.store.mules).toBe(corralFor(seats));
  });

  it.each([2, 4, 6])('a %i-seat colony with land still to grant wants two MULEs a seat of Smithore', (seats) => {
    const state = game(seats);
    expect(state.tiles.some((t) => t.terrain !== 'store' && !t.owner), 'free land is left').toBe(true);
    expect(mulesWanted(state)).toBe(seats * 2);
  });
});

describe('pricing C2: one selling price', () => {
  /**
   * Plays a game where nobody acts, calling `look` at the state each good comes up in. Every player is done at once,
   * so each good's status screen and walk end on the next step.
   */
  function eachComeUp(seed: number, look: (state: GameState, good: Good) => void): void {
    // literal-ok: long enough for the colonists to eat the store's Food and Water shelves short
    const state = createGame({ seed, players: SEATS.map((id) => ({ id, name: id, isAi: false })), maxMonths: 8 });
    while (state.phase !== 'gameOver') {
      advancePhase(state);
      if (state.phase !== 'auction') continue;
      let up: Good | null = null;
      for (let step = 0; state.auction!.stage !== 'over'; step++) {
        expect(step, 'the auction ends').toBeLessThan(10_000);
        const a = state.auction!;
        if (a.stage === 'status' && a.good !== up) look(state, a.good!);
        up = a.good;
        for (const p of state.players) auctionDone(state, p.id);
        stepAuction(state, WALK.tickMs);
      }
    }
  }

  it('price T-AC-6: one selling price: storeQuotes equals comeUp\'s lines, for every good over 20 seeded games', () => {
    let shortShelves = 0;
    for (let seed = 401; seed <= 420; seed++)
      eachComeUp(seed, (state, good) => {
        if (shelfShort(state, good, 1)) shortShelves++;
        expect(storeQuotes(state, good), `seed ${seed}, month ${state.month}, ${good}`).toEqual({ buy: storeBuyLine(state), sell: storeSellLine(state) });
      });
    // Without a short Food or Water shelf the restock rule never runs, and the two could differ unseen.
    expect(shortShelves, 'a short Food or Water shelf came up').toBeGreaterThan(0);
  });
});
