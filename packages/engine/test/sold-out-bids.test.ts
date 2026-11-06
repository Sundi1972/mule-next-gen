import { afterEach, describe, expect, it } from 'vitest';
import { auctionDone, createGame, declareRole, setWalk, startAuction, stepAuction, stepWalk, WALK, type GameState, type Good, type Trade } from '../src/index.js';

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
