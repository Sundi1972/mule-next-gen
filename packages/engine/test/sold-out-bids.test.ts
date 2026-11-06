import { afterEach, describe, expect, it } from 'vitest';
import { auctionDone, createGame, declareRole, setWalk, shownSellLine, startAuction, stepAuction, stepWalk, tradeInterval, WALK, type GameState, type Good, type Trade } from '../src/index.js';

/**
 * RULE-7 (docs/specs/2026-11-05-ws3-auction-auto-trade.md §10): with the store sold out, buyers may bid above its old
 * selling line S, up to one step under the board's top, but walking or tapping up never reaches a seller resting above
 * S: the buyer stops one step below the lowest such ask. The walkers' prices and the trades are what every screen and
 * receipt show.
 */
const TICK = WALK.tickMs;
/** Any ask, for a dry run that only reads the board's lines. */
const PROBE_ASK = 200;
/** How far past the top edge a generated ask may lie. */
const EDGE_REACH = 10;
const saved = WALK.soldOutBidding;
afterEach(() => {
  WALK.soldOutBidding = saved;
});

/** A small seeded generator, so the cases are the same on every run. */
function seeded(seed: number) {
  let s = seed;
  return (n: number) => {
    s = (s * 1_103_515_245 + 12_345) % 2_147_483_648;
    return s % n;
  };
}

const a = (state: GameState) => state.auction!;
const walker = (state: GameState, id: string) => a(state).walkers.find((w) => w.id === id)!;

/**
 * Water up with the store's shelf empty (lines at 90 and 110, no ship). p1 runs a Medicine factory, so it needs Water,
 * and bids with plenty of money; each of `asks` is a seller (p0, p2, p3) resting at that price with Water to spare.
 */
function soldOutWalk(asks: number[]): GameState {
  const state = createGame({ seed: 42, players: ['zipwing', 'bramblet', 'gearling', 'mollox'].map((s, i) => ({ id: `p${i}`, name: `P${i}`, isAi: false, species: s as 'zipwing' })) });
  for (const p of state.players) {
    p.money = 10_000;
    for (const g of Object.keys(p.stock) as Good[]) p.stock[g] = 0;
  }
  for (const g of Object.keys(state.store.posted) as Good[]) state.store.posted[g] = 100;
  state.store.stock.water = 0;
  state.ship.arrives = state.month + 1;
  const plot = state.tiles.find((t) => !t.owner)!;
  plot.owner = 'p1';
  plot.outfit = 'medicine';
  state.phase = 'auction';
  const sellers = ['p0', 'p2', 'p3'].slice(0, asks.length);
  for (const id of sellers) state.players.find((p) => p.id === id)!.stock.water = 20;
  startAuction(state, ['water']);
  for (const id of sellers) declareRole(state, id, 'seller');
  for (const p of state.players) auctionDone(state, p.id);
  stepAuction(state, TICK);
  expect(a(state).stage).toBe('walk');
  a(state).clockMs = 600_000;
  sellers.forEach((id, i) => (walker(state, id).price = asks[i]!));
  return state;
}

describe('RULE-7 rows 1 and 2: a buyer bidding past a sold-out store', () => {
  it('T-AC-E2: over generated tick lengths and resting asks above S, a buyer walking or tapping up stops one step below the lowest resting ask, or one under the top edge, and never trades', () => {
    const rnd = seeded(7);
    for (let n = 0; n < 120; n++) {
      // The lines come from the posted price alone, so every case's board is the same; read S and hi from a dry run.
      const { storeSell: S, hi } = a(soldOutWalk([PROBE_ASK]));
      // Asks above S, some past the top edge: a seller placed there stands for nobody in reach, so the edge stops the buyer.
      const asks = Array.from({ length: 1 + rnd(3) }, () => S + 1 + rnd(hi - S + EDGE_REACH));
      const dt = 20 + rnd(600);
      const taps = rnd(2) === 0;
      const state = soldOutWalk(asks);
      const stop = Math.min(...asks, hi) - 1;
      const what = `case ${n}: asks ${asks.join(', ')}, ${taps ? 'taps' : `${dt} ms ticks`}`;

      const trades: Trade[] = [];
      let highest = -Infinity;
      if (taps) {
        for (let i = 0; i < hi + 5; i++) {
          stepWalk(state, 'p1', 1);
          trades.push(...stepAuction(state, TICK));
          highest = Math.max(highest, Math.round(walker(state, 'p1').price));
        }
      } else {
        setWalk(state, 'p1', 1);
        for (let t = 0; t < 20_000; t += dt) {
          trades.push(...stepAuction(state, dt));
          highest = Math.max(highest, Math.round(walker(state, 'p1').price));
        }
      }

      expect(trades, what).toEqual([]);
      expect(highest, what).toBe(stop);
      expect(Math.round(walker(state, 'p1').price), what).toBe(stop);
    }
  });

  it('T-AC-E2: on the trading floor, at S or under it, a buyer walking up still meets the seller and they trade at the ask (RULE-7 note)', () => {
    const { storeSell: S, storeBuy: B } = a(soldOutWalk([PROBE_ASK]));
    for (const ask of [S, S - 3, B + 1]) {
      const state = soldOutWalk([ask]);
      setWalk(state, 'p1', 1);
      const trades: Trade[] = [];
      for (let t = 0; t < 20_000; t += TICK) trades.push(...stepAuction(state, TICK));
      expect(trades.length, `ask ${ask}`).toBeGreaterThan(0);
      expect(trades.every((t) => t.buyer === 'p1' && t.seller === 'p0' && t.price === ask), `ask ${ask}`).toBe(true);
    }
  });

  it('T-AC-E2: with soldOutBidding off, a buyer walks as before: into the resting seller, and they trade', () => {
    WALK.soldOutBidding = false;
    const ask = a(soldOutWalk([PROBE_ASK])).storeSell + 6;
    const state = soldOutWalk([ask]);
    setWalk(state, 'p1', 1);
    const trades: Trade[] = [];
    for (let t = 0; t < 20_000; t += TICK) trades.push(...stepAuction(state, TICK));
    expect(trades.length).toBeGreaterThan(0);
    expect(trades.every((t) => t.buyer === 'p1' && t.seller === 'p0' && t.price === ask)).toBe(true);
  });
});

describe('RULE-7 rows 3 and 4: the line shows the top bid, and a seller walks down onto it', () => {
  it('B-AC-E1: sold out of Water, Lena bids past the old line and every screen\'s line shows her bid; Brix, resting above, does not trade until he walks down to it, then they trade at it one unit at a time', () => {
    const probe = a(soldOutWalk([PROBE_ASK]));
    const S = probe.storeSell;
    const brixAsk = S + 10;
    const state = soldOutWalk([brixAsk]); // p0 is Brix, resting; p1 is Lena
    // p2 bids far above S with no money to pay it: not an active bid, so the line never shows it.
    walker(state, 'p2').price = brixAsk - 2;
    state.players[2]!.money = 0;
    expect(shownSellLine(state), 'no bid above S yet: the line stays at S').toEqual({ price: S, bid: false });

    setWalk(state, 'p1', 1);
    const trades: Trade[] = [];
    for (let t = 0; t < 15_000; t += TICK) trades.push(...stepAuction(state, TICK));
    const lenaBid = brixAsk - 1;
    expect(Math.round(walker(state, 'p1').price)).toBe(lenaBid);
    expect(shownSellLine(state)).toEqual({ price: lenaBid, bid: true });
    expect(trades, 'Lena walking up never trades with Brix standing still, and the store sells nothing').toEqual([]);
    expect(state.store.stock.water).toBe(0);

    // Brix walks down onto her bid: they trade at it, the first unit after tradeStartMs, the next on RULE-3's curve.
    setWalk(state, 'p0', -1);
    const met: Trade[] = [];
    let first = -1;
    for (let t = 0; t < 10_000; t += TICK) {
      const step = stepAuction(state, TICK);
      expect(step.length, 'one unit at a time').toBeLessThanOrEqual(1);
      if (step.length > 0 && first < 0) first = t;
      met.push(...step);
    }
    expect(met.length).toBeGreaterThan(1);
    expect(met.every((s) => s.buyer === 'p1' && s.seller === 'p0' && s.price === lenaBid)).toBe(true);
    expect(first, 'the first unit waits tradeStartMs from when they meet').toBeGreaterThanOrEqual(tradeInterval(0) - TICK);
  });

  it('B-AC-E1: a bid exactly at the old line S is no bid past it: the line reads the store sold out at S, unflagged', () => {
    const state = soldOutWalk([PROBE_ASK]);
    const S = a(state).storeSell;
    walker(state, 'p1').price = S;
    expect(shownSellLine(state)).toEqual({ price: S, bid: false });
    walker(state, 'p1').price = S + 1;
    expect(shownSellLine(state)).toEqual({ price: S + 1, bid: true });
  });

  it('RULE-7 × RULE-4: a seller stopped at his need above S rests; the buyer stops one under him, the line stays her bid, and his one-second hold sells at it', () => {
    const S = a(soldOutWalk([PROBE_ASK])).storeSell;
    const brixAsk = S + 10;
    const state = soldOutWalk([brixAsk]); // p0 is Brix, resting; p1 is Lena
    const spare = 2;
    a(state).status.find((r) => r.id === 'p0')!.need = state.players[0]!.stock.water - spare;
    setWalk(state, 'p1', 1);
    for (let t = 0; t < 15_000; t += TICK) stepAuction(state, TICK);
    const lenaBid = brixAsk - 1;
    expect(Math.round(walker(state, 'p1').price)).toBe(lenaBid);

    // Brix walks down onto her bid and sells his spare; the need-stop holds him a step above it.
    setWalk(state, 'p0', -1);
    const sold: Trade[] = [];
    for (let t = 0; t < 10_000; t += TICK) sold.push(...stepAuction(state, TICK));
    expect(sold.map((t) => t.price)).toEqual(Array(spare).fill(lenaBid));
    expect(walker(state, 'p0').held).toBe(true);
    expect(Math.round(walker(state, 'p0').price)).toBe(lenaBid + 1);

    // Lena, still holding up, stays one under him: no seller is left between S and the line.
    for (let t = 0; t < 10_000; t += TICK) stepAuction(state, TICK);
    expect(Math.round(walker(state, 'p1').price), 'Lena does not walk past the held seller').toBe(lenaBid);
    expect(shownSellLine(state)).toEqual({ price: lenaBid, bid: true });

    // His one-second hold of down sells on at her bid, not at an ask under it.
    setWalk(state, 'p0', -1);
    const short: Trade[] = [];
    for (let t = 0; t < 10_000; t += TICK) short.push(...stepAuction(state, TICK));
    expect(short.length).toBeGreaterThan(0);
    expect(short.every((t) => t.buyer === 'p1' && t.seller === 'p0' && t.price === lenaBid)).toBe(true);
  });

  it('B-AC-E1: while the store sells, the line is its selling price, not a bid; with soldOutBidding off a sold-out store shows no line', () => {
    const selling = soldOutWalk([PROBE_ASK]);
    selling.store.stock.water = 200;
    expect(shownSellLine(selling)).toEqual({ price: a(selling).storeSell, bid: false });
    WALK.soldOutBidding = false;
    const state = soldOutWalk([PROBE_ASK]);
    expect(shownSellLine(state)).toBeNull();
  });
});
