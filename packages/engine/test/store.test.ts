import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  auctionDone,
  createGame,
  MULE,
  mulesWanted,
  runUpkeep,
  startAuction,
  stepAuction,
  storeBuyLine,
  storeQuotes,
  storeSellLine,
  storeWants,
  WALK,
  type GameState,
  type Good,
} from '../src/index.js';
import { foodMonth, post } from './fixtures/food-month.js';

const SEATS = ['brix', 'ossa', 'lena', 'tam'];

/** Month 1's auction phase, with the store's Food shelf at `food` units and every player holding 40, so the colony as a whole isn't short. */
function auctionWithFood(food: number): GameState {
  const state = createGame({ seed: 11, players: SEATS.map((id) => ({ id, name: id, isAi: false })) });
  while (state.phase !== 'auction') advancePhase(state);
  state.store.stock.food = food;
  for (const p of state.players) p.stock.food = 40;
  return state;
}

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
  it('T-AC-13: with the colony short of Food the store bids up, and still sells dearer than it buys', () => {
    const comesUp = (holds: number, farmsMaking: number[]) => {
      const state = foodMonth(holds, farmsMaking);
      post(state);
      expect(state.auction!.good, 'the premise: Food is up').toBe('food');
      return state;
    };
    const short = comesUp(10, [5, 3]);
    expect(short.auction!.storeBuy, 'the shortage band bids 54 where a colony with enough bids 25').toBe(54);
    // The store never buys above its own selling price for the same good (WS3's review of #66): no buy-back loop.
    expect(short.auction!.storeSell).toBeGreaterThan(short.auction!.storeBuy);
    // The round trip: sell a unit to the store, keep what the sales tax leaves, buy it back. Both lines are fixed
    // for the whole good, so once the store's buying lifts its stock past its reserve this is all a player could do.
    const { storeBuy, storeSell } = short.auction!;
    const kept = storeBuy - Math.round(storeBuy * short.treasury.salesTax);
    expect(kept - storeSell).toBeLessThan(0);
    // Negative case: a colony holding two months of Food gets the store's usual bid.
    expect(comesUp(30, [5, 5]).auction!.storeBuy).toBe(25);
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
    let banded = 0;
    for (let seed = 401; seed <= 420; seed++)
      eachComeUp(seed, (state, good) => {
        if ((state.store.band?.[good] ?? 'normal') !== 'normal') banded++;
        expect(storeQuotes(state, good), `seed ${seed}, month ${state.month}, ${good}`).toEqual({ buy: storeBuyLine(state), sell: storeSellLine(state) });
      });
    // Without a good posted outside the normal band its own spread never runs, and the two could differ unseen.
    expect(banded, 'a good came up in a band other than normal').toBeGreaterThan(0);
  });
});
