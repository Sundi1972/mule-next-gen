import { describe, expect, it } from 'vitest';
import { auctionDone, createGame, declareRole, setWalk, startAuction, stepAuction, stepWalk, WALK, type GameState, type Good, type Trade } from '../src/index.js';

/**
 * RULE-6 (docs/specs/2026-11-05-ws3-auction-auto-trade.md §10): the goods board has hard edges. A buyer never walks or
 * taps below the bottom edge, a seller never above the top edge, so a player standing still at either is never in a
 * trade by accident. The walker's price is what every screen draws, so it is the promise.
 */
const TICK = WALK.tickMs;

/** Four seats with money and nothing in stock, the store's lines at 90 and 110, no ship. */
function newGame(): GameState {
  const state = createGame({ seed: 42, players: ['zipwing', 'bramblet', 'gearling', 'mollox'].map((s, i) => ({ id: `p${i}`, name: `P${i}`, isAi: false, species: s as 'zipwing' })) });
  for (const p of state.players) {
    p.money = 1_000;
    for (const g of Object.keys(p.stock) as Good[]) p.stock[g] = 0;
  }
  for (const g of Object.keys(state.store.posted) as Good[]) state.store.posted[g] = 100;
  state.ship.arrives = state.month + 1;
  state.phase = 'auction';
  return state;
}

const a = (state: GameState) => state.auction!;
const walker = (state: GameState, id: string) => a(state).walkers.find((w) => w.id === id)!;

/** Smithore up, p0 selling 5 of it, everyone Done, the clock long enough for any hold. */
function smithoreWalk(): GameState {
  const state = newGame();
  state.players[0]!.stock.smithore = 5;
  startAuction(state, ['smithore']);
  declareRole(state, 'p0', 'seller');
  for (const p of state.players) auctionDone(state, p.id);
  stepAuction(state, TICK);
  expect(a(state).stage).toBe('walk');
  a(state).clockMs = 600_000;
  return state;
}

/** Steps `ms` of board time in `dt` ticks: the trades, and the lowest and highest rounded price `id` reached. */
function hold(state: GameState, id: string, ms: number, dt: number) {
  const trades: Trade[] = [];
  let low = Infinity;
  let high = -Infinity;
  for (let t = 0; t < ms; t += dt) {
    trades.push(...stepAuction(state, dt));
    const p = Math.round(walker(state, id).price);
    low = Math.min(low, p);
    high = Math.max(high, p);
  }
  return { trades, low, high };
}

describe('RULE-6 rows 1 and 2: the hard edges', () => {
  for (const dt of [TICK, 450]) {
    it(`B-AC-D1: a buyer holding ▼ stops at the bottom edge, a seller holding ▲ at the top edge, and neither trades (${dt} ms ticks)`, () => {
      const state = smithoreWalk();
      const { lo, hi } = a(state);
      // p1 starts a little up the board, so the hold has somewhere to go.
      walker(state, 'p1').price = lo + 8;
      setWalk(state, 'p1', -1);
      setWalk(state, 'p0', 1);

      const buyer = hold(state, 'p1', 30_000, dt);

      expect(buyer.low).toBe(lo);
      expect(Math.round(walker(state, 'p0').price)).toBe(hi);
      expect(buyer.trades).toEqual([]);
      // A tap past either edge moves nothing.
      setWalk(state, 'p0', 0);
      setWalk(state, 'p1', 0);
      stepWalk(state, 'p1', -1);
      stepWalk(state, 'p0', 1);
      expect(Math.round(walker(state, 'p1').price)).toBe(lo);
      expect(Math.round(walker(state, 'p0').price)).toBe(hi);
      expect(hold(state, 'p1', 5_000, dt).trades).toEqual([]);
    });
  }
});
