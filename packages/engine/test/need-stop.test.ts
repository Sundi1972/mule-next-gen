import { afterEach, describe, expect, it } from 'vitest';
import {
  auctionDone,
  auctionNeed,
  createGame,
  declareRole,
  lineOf,
  setWalk,
  startAuction,
  stepAuction,
  stepWalk,
  WALK,
  type AuctionRole,
  type GameState,
  type Good,
  type Trade,
} from '../src/index.js';

/**
 * RULE-4 (docs/specs/2026-11-05-ws3-auction-auto-trade.md §10, as corrected by §11 AM-2): a seller stops at the amount
 * they must hold (auctionNeed, fixed as the good comes up), one price step above the line they traded at, and sells
 * below it only after a deliberate one-second hold of ▼. The walk's state is what the player receives: the server
 * copies the walker and the stock into every view.
 */
const TICK = WALK.tickMs;
const savedStop = WALK.needStop;
afterEach(() => {
  WALK.needStop = savedStop;
});

/** Four seats with no money and nothing in stock; p0 runs a Medicine factory, so it must hold Water (auctionNeed). */
function newGame(): GameState {
  const state = createGame({ seed: 42, players: ['zipwing', 'bramblet', 'gearling', 'mollox'].map((s, i) => ({ id: `p${i}`, name: `P${i}`, isAi: false, species: s as 'zipwing' })) });
  for (const p of state.players) {
    p.money = 0;
    for (const g of Object.keys(p.stock) as Good[]) p.stock[g] = 0;
  }
  // Round prices: the store buys at 90 and sells at 110. No ship in port.
  for (const g of Object.keys(state.store.posted) as Good[]) state.store.posted[g] = 100;
  state.ship.arrives = state.month + 1;
  const plot = state.tiles.find((t) => !t.owner)!;
  plot.owner = 'p0';
  plot.outfit = 'medicine';
  state.phase = 'auction';
  return state;
}

const a = (state: GameState) => state.auction!;
const walker = (state: GameState, id: string) => a(state).walkers.find((w) => w.id === id)!;

/** Brings `good` up with the store taking `budget`, everyone Done on the status screen, `roles` switched first. */
function toWalk(state: GameState, good: Good, budget: number, roles: Record<string, AuctionRole> = {}) {
  startAuction(state, [good]);
  a(state).storeBudget = budget;
  for (const [id, role] of Object.entries(roles)) declareRole(state, id, role);
  for (const p of state.players) auctionDone(state, p.id);
  stepAuction(state, TICK);
  expect(a(state).stage).toBe('walk');
  a(state).clockMs = 600_000; // the clock is not what these tests are about
}

function run(state: GameState, ms: number, dt = TICK): Trade[] {
  const trades: Trade[] = [];
  for (let t = 0; t < ms && a(state).stage === 'walk'; t += dt) trades.push(...stepAuction(state, dt));
  return trades;
}

const soldBy = (trades: Trade[], id: string) => trades.filter((t) => t.seller === id);

/** p0 holds `units` Water, sells, and holds ▼ down to the store's buying line. */
function waterSellerToStore(units: number): { state: GameState; need: number } {
  const state = newGame();
  state.players[0]!.stock.water = units;
  const need = auctionNeed(state, 'p0').water;
  toWalk(state, 'water', 50, { p0: 'seller' });
  setWalk(state, 'p0', -1);
  return { state, need };
}

describe('RULE-4: a seller stops at the amount they must hold', () => {
  it('B-AC-B1: holding 12 Water and needing 4, walking to the store line sells 8, not the 9th; the seller stands one step above the line, held, and nothing more sells over 5 s', () => {
    const { state, need } = waterSellerToStore(12);
    expect(need, 'the factory makes p0 need Water: the arranged ground truth').toBe(4);

    const trades = run(state, 15_000);

    expect(soldBy(trades, 'p0').every((t) => t.buyer === 'store' && t.price === a(state).storeBuy)).toBe(true);
    expect(soldBy(trades, 'p0')).toHaveLength(12 - need);
    expect(state.players[0]!.stock.water).toBe(need);
    const w = walker(state, 'p0');
    expect(w).toMatchObject({ side: 'seller', dir: 0, held: true });
    expect(Math.round(w.price)).toBe(a(state).storeBuy + 1);
    expect(lineOf(state, 'p0')).toBeNull();
    expect(run(state, 5_000)).toEqual([]);
    expect(state.players[0]!.stock.water).toBe(need);

    // The sweep's control: with the stop off the same walk sells all 12, as before RULE-4.
    WALK.needStop = false;
    const off = waterSellerToStore(12).state;
    expect(soldBy(run(off, 20_000), 'p0')).toHaveLength(12);
  });

  it('B-AC-B1: a sale to another player stops the same way, one step above the bid it traded at', () => {
    const state = newGame();
    state.players[0]!.stock.water = 12;
    state.players[1]!.money = 5_000;
    const need = auctionNeed(state, 'p0').water;
    // The store buys nothing: the only one who buys is p1, bidding 95.
    toWalk(state, 'water', 0, { p0: 'seller' });
    walker(state, 'p1').price = 95;
    setWalk(state, 'p0', -1);

    const trades = run(state, 15_000);

    expect(soldBy(trades, 'p0').every((t) => t.buyer === 'p1' && t.price === 95)).toBe(true);
    expect(soldBy(trades, 'p0')).toHaveLength(12 - need);
    expect(walker(state, 'p0')).toMatchObject({ dir: 0, held: true });
    expect(Math.round(walker(state, 'p0').price)).toBe(96);
    expect(run(state, 5_000)).toEqual([]);
    expect(state.players[0]!.stock.water).toBe(need);
  });

  it('B-AC-B1: a seller who starts the walk at their need is stopped at the first unit', () => {
    const state = newGame();
    const need = auctionNeed(state, 'p0').water;
    state.players[0]!.stock.water = need;
    toWalk(state, 'water', 50, { p0: 'seller' });
    setWalk(state, 'p0', -1);

    expect(run(state, 15_000)).toEqual([]);

    expect(walker(state, 'p0')).toMatchObject({ side: 'seller', dir: 0, held: true });
    expect(Math.round(walker(state, 'p0').price)).toBe(a(state).storeBuy + 1);
    expect(state.players[0]!.stock.water).toBe(need);
  });

  it('B-AC-B3: holding 6 Smithore with no need for it, walking to the store line sells all 6 with no stop', () => {
    const state = newGame();
    state.players[0]!.stock.smithore = 6;
    expect(auctionNeed(state, 'p0').smithore, 'nobody consumes Smithore here').toBe(0);
    toWalk(state, 'smithore', 50, { p0: 'seller' });
    setWalk(state, 'p0', -1);

    const trades = run(state, 15_000);

    expect(soldBy(trades, 'p0').filter((t) => t.buyer === 'store')).toHaveLength(6);
    expect(state.players[0]!.stock.smithore).toBe(0);
    expect(walker(state, 'p0').held).toBeUndefined();
  });
});

/** p0 sold its 8 spare Water to the store and was stopped at its need: held, one step above the store's line. */
function heldAtNeed(): { state: GameState; need: number; line: number } {
  const { state, need } = waterSellerToStore(12);
  run(state, 15_000);
  expect(walker(state, 'p0').held, 'the stop happened').toBe(true);
  expect(state.players[0]!.stock.water).toBe(need);
  return { state, need, line: a(state).storeBuy };
}

describe('RULE-4 row 2: selling into shortage takes a conscious hold of ▼', () => {
  for (const dt of [TICK, 250]) {
    it(`B-AC-B2: held, a hold of ▼ for WALK.shortHoldMs sells on below the need, one unit at a time, the speed-up restarted (${dt} ms ticks)`, () => {
      const { state, need, line } = heldAtNeed();
      const at = walker(state, 'p0').price;
      setWalk(state, 'p0', -1);

      // One tick short of the hold, nothing has moved.
      expect(run(state, WALK.shortHoldMs - dt, dt)).toEqual([]);
      expect(walker(state, 'p0').price).toBe(at);
      // The tick that completes it: the seller walks down onto the line.
      run(state, dt, dt);
      expect(walker(state, 'p0').price).toBeLessThan(at);

      const first: Trade[] = [];
      for (let t = 0; t < 5_000 && first.length === 0; t += dt) first.push(...stepAuction(state, dt));
      expect(first).toEqual([{ good: 'water', buyer: 'store', seller: 'p0', price: line, quantity: 1 }]);
      expect(state.players[0]!.stock.water).toBe(need - 1);
      // A new deal: this is its first unit, not the ninth.
      expect(a(state).deals.find((d) => d.buyer === 'store')!.units).toBe(1);

      // It sells on, for the rest of this good, down to nothing.
      const rest = run(state, 15_000, dt);
      expect(soldBy(rest, 'p0').every((t) => t.quantity === 1 && t.buyer === 'store')).toBe(true);
      expect(state.players[0]!.stock.water).toBe(0);
    });

    it(`B-AC-B2: held, a tap of ▼ or a hold one tick shorter than WALK.shortHoldMs sells nothing and moves nothing (${dt} ms ticks)`, () => {
      const { state, need } = heldAtNeed();
      const at = walker(state, 'p0').price;

      stepWalk(state, 'p0', -1);
      expect(walker(state, 'p0').price).toBe(at);
      expect(run(state, 5_000, dt)).toEqual([]);

      // Two short holds in a row: they don't add up.
      for (let i = 0; i < 2; i++) {
        setWalk(state, 'p0', -1);
        expect(run(state, WALK.shortHoldMs - dt, dt)).toEqual([]);
        setWalk(state, 'p0', 0);
      }
      expect(run(state, 5_000, dt)).toEqual([]);
      expect(walker(state, 'p0').price).toBe(at);
      expect(walker(state, 'p0').held).toBe(true);
      expect(state.players[0]!.stock.water).toBe(need);
    });
  }

  it('B-AC-B2: held survives a switch to buyer and back, even after holding ▼ as a buyer; back as a seller, a short hold still sells nothing and a full one sells on', () => {
    const { state, need } = heldAtNeed();
    declareRole(state, 'p0', 'buyer');
    // As a buyer, ▼ walks the bid down (a tap and a hold alike); held longer than WALK.shortHoldMs, it is no seller's hold.
    const bid = walker(state, 'p0').price;
    stepWalk(state, 'p0', -1);
    const tapped = walker(state, 'p0').price;
    setWalk(state, 'p0', -1);
    run(state, WALK.shortHoldMs * 2);
    expect(walker(state, 'p0')).toMatchObject({ side: 'buyer', held: true });
    expect(walker(state, 'p0').sellsShort).toBeUndefined();
    expect(tapped).toBeLessThan(bid);
    expect(walker(state, 'p0').price).toBeLessThan(tapped);
    // Switched back still holding ▼: the buyer's hold does not carry over.
    declareRole(state, 'p0', 'seller');
    expect(walker(state, 'p0')).toMatchObject({ side: 'seller', held: true, dir: 0 });
    expect(walker(state, 'p0').downSince).toBeUndefined();
    expect(run(state, 5_000)).toEqual([]);
    expect(state.players[0]!.stock.water).toBe(need);
    const at = walker(state, 'p0').price;

    setWalk(state, 'p0', -1);
    expect(run(state, WALK.shortHoldMs - TICK)).toEqual([]);
    expect(walker(state, 'p0').price).toBe(at);
    setWalk(state, 'p0', 0);
    expect(run(state, 5_000)).toEqual([]);

    setWalk(state, 'p0', -1);
    const trades = run(state, 20_000);
    expect(soldBy(trades, 'p0').length).toBeGreaterThan(0);
    expect(state.players[0]!.stock.water).toBeLessThan(need);
  });
});
