import { describe, expect, it } from 'vitest';
import {
  auctionDone,
  createGame,
  declareRole,
  lineOf,
  RuleError,
  setWalk,
  startAuction,
  stepAuction,
  stepWalk,
  tradeInterval,
  WALK,
  type AuctionRole,
  type GameState,
  type Good,
  type Trade,
} from '../src/index.js';

/**
 * The auto-trade amendment (docs/specs/2026-11-05-ws3-auction-auto-trade.md) in the engine: a player standing at a
 * house's line (the store's or the ship's) trades with it by themselves, one unit at a time on RULE-3's curve, until
 * they step off, run out or the clock ends; nothing is chosen or confirmed (RULE-1). A tap moves the walker one price
 * step (G-2). The server's tests (apps/server/test/auction-self-trade.test.ts) hold the same promises as a phone sees
 * them; these hold the pure step's invariants, over tick sizes the server never uses.
 */
const TICK = WALK.tickMs;

function newGame(): GameState {
  const state = createGame({ seed: 42, players: ['zipwing', 'bramblet', 'gearling', 'mollox'].map((s, i) => ({ id: `p${i}`, name: `P${i}`, isAi: false, species: s as 'zipwing' })) });
  for (const p of state.players) {
    p.money = 1_000;
    for (const g of Object.keys(p.stock) as Good[]) p.stock[g] = 0;
  }
  // Round prices: the store buys at 90 and sells at 110.
  for (const g of Object.keys(state.store.posted) as Good[]) state.store.posted[g] = 100;
  state.phase = 'auction';
  return state;
}

const a = (state: GameState) => state.auction!;
const walker = (state: GameState, id: string) => a(state).walkers.find((w) => w.id === id)!;

/** Everyone presses Done on the status screen; `roles` switches a few to seller (everyone starts as a buyer). */
function toWalk(state: GameState, roles: Record<string, AuctionRole> = {}) {
  for (const [id, role] of Object.entries(roles)) declareRole(state, id, role);
  for (const p of state.players) auctionDone(state, p.id);
  stepAuction(state, TICK);
  expect(a(state).stage).toBe('walk');
}

function run(state: GameState, ms: number, dt = TICK): Trade[] {
  const good = a(state).good;
  const trades: Trade[] = [];
  for (let t = 0; t < ms && a(state).good === good && a(state).stage === 'walk'; t += dt) trades.push(...stepAuction(state, dt));
  return trades;
}

/** p1 buys Food from the store, which has plenty; the others stand at the buyers' edge with no money. */
function buyerAtStore(): GameState {
  const state = newGame();
  state.store.stock.food = 200;
  for (const id of ['p0', 'p2', 'p3']) state.players.find((p) => p.id === id)!.money = 0;
  startAuction(state, ['food']);
  toWalk(state);
  setWalk(state, 'p1', 1);
  for (let i = 0; i < 400 && Math.round(walker(state, 'p1').price) < a(state).storeSell; i++) stepAuction(state, TICK);
  setWalk(state, 'p1', 0);
  a(state).clockMs = 600_000; // room for every case below; the clock is not what these tests are about
  return state;
}

/** p0 sells Smithore to the store, which will take 50; the others are buyers with no money. p0 walks down to its line. */
function sellerAtStore(units = 10): GameState {
  const state = newGame();
  state.players[0]!.stock.smithore = units;
  for (const id of ['p1', 'p2', 'p3']) state.players.find((p) => p.id === id)!.money = 0;
  startAuction(state, ['smithore']);
  a(state).storeBudget = 50;
  toWalk(state, { p0: 'seller' });
  setWalk(state, 'p0', -1);
  for (let i = 0; i < 400 && Math.round(walker(state, 'p0').price) > a(state).storeBuy; i++) stepAuction(state, TICK);
  setWalk(state, 'p0', 0);
  a(state).clockMs = 600_000;
  return state;
}

/** A small seeded generator, so the cases are the same on every run (no Math.random in tests either). */
function seeded(seed: number) {
  let s = seed;
  return (n: number) => {
    s = (s * 1_103_515_245 + 12_345) % 2_147_483_648;
    return s % n;
  };
}

describe('RULE-1: at a house line units trade by themselves', () => {
  it('B-AC-2 (engine): a buyer standing at the store line buys one unit at a time with nothing chosen, at the store\'s price', () => {
    const state = buyerAtStore();
    state.players[1]!.money = 10_000;
    expect(lineOf(state, 'p1')).toEqual({ house: 'store', price: a(state).storeSell });
    const trades = run(state, 2_000);
    expect(trades.length).toBeGreaterThanOrEqual(10);
    expect(trades.every((t) => t.seller === 'store' && t.buyer === 'p1' && t.price === a(state).storeSell && t.quantity === 1)).toBe(true);
  });

  it('B-AC-1 (engine): a seller standing at the store line sells all it holds, past its need, with nothing asked', () => {
    const state = sellerAtStore(12);
    const trades = run(state, 10_000);
    expect(trades.filter((t) => t.buyer === 'store' && t.seller === 'p0')).toHaveLength(12);
    expect(state.players[0]!.stock.smithore).toBe(0);
  });

  it('RULE-1 row 4: stepping off the line stops it at once, the next unit unsold', () => {
    const buyer = buyerAtStore();
    expect(run(buyer, 500).length).toBeGreaterThan(0);
    stepWalk(buyer, 'p1', -1);
    expect(lineOf(buyer, 'p1')).toBeNull();
    expect(run(buyer, 5_000)).toEqual([]);
    const seller = sellerAtStore(12);
    expect(run(seller, 500).length).toBeGreaterThan(0);
    stepWalk(seller, 'p0', 1);
    expect(run(seller, 5_000)).toEqual([]);
  });

  it('RULE-1 row 4: switching side stops it: the walker jumps to the new side\'s edge, never trading at once', () => {
    const state = buyerAtStore();
    run(state, 500);
    declareRole(state, 'p1', 'seller');
    expect(lineOf(state, 'p1')).toBeNull();
    expect(run(state, 2_000).filter((t) => t.seller === 'store')).toEqual([]);
  });

  it('RULE-1 row 4: running out of money stops it; the house trades what it can and then nothing', () => {
    const state = buyerAtStore();
    const price = a(state).storeSell;
    state.players[1]!.money = 3 * price + 30;
    expect(run(state, 20_000)).toHaveLength(3);
    expect(state.players[1]!.money).toBe(30);
  });

  it('a store with only a few left sells those and then stops, the rest of its stock its reserve', () => {
    const state = buyerAtStore();
    const reserve = state.colonists / 20;
    state.store.stock.food = reserve + 2;
    expect(run(state, 20_000)).toHaveLength(2);
    expect(state.store.stock.food).toBe(reserve);
  });

  it('sells to the ship at its line, the ship paying less for each further unit', () => {
    const state = newGame();
    state.ship = { arrives: state.month, goods: ['crystite'], hold: { crystite: 5 }, bought: {} };
    state.store.offWorld.crystite = state.store.posted.crystite * 2;
    state.players[0]!.stock.crystite = 6;
    for (const id of ['p1', 'p2', 'p3']) state.players.find((p) => p.id === id)!.money = 0;
    startAuction(state, ['crystite']);
    toWalk(state, { p0: 'seller' });
    setWalk(state, 'p0', -1);
    // Held down, the seller walks to the ship's line and stays on it as its price falls, to the store's floor.
    const trades = run(state, 20_000);
    const ship = trades.filter((t) => t.buyer === 'ship');
    expect(ship.length).toBeGreaterThan(1);
    expect(ship.every((t, i) => i === 0 || t.price <= ship[i - 1]!.price)).toBe(true);
    expect(ship.at(-1)!.price).toBeLessThan(ship[0]!.price);
  });

  it('players still trade with each other where they meet', () => {
    const state = newGame();
    state.players[0]!.stock.water = 10;
    startAuction(state, ['water']);
    a(state).storeBudget = 50;
    toWalk(state, { p0: 'seller' });
    walker(state, 'p0').price = 95;
    walker(state, 'p1').price = 95;
    expect(run(state, 3_000).filter((t) => t.buyer === 'p1' && t.seller === 'p0').length).toBeGreaterThan(0);
  });
});

describe('RULE-3: slow at first, then faster and faster, to the floor', () => {
  it('the gaps between units at the line are tradeStartMs × tradeSpeedUp^n, never under tradeFloorMs', () => {
    const state = buyerAtStore();
    state.players[1]!.money = 10_000;
    const at: number[] = [];
    for (let t = 0; t < 4_000; t++) if (stepAuction(state, 1).length > 0) at.push(a(state).elapsed);
    const gaps = at.slice(1).map((x, i) => x - at[i]!);
    expect(gaps.length).toBeGreaterThan(12);
    // Stepped 1 ms at a time, a deal carries its leftover into the next unit, so each gap is within 1 ms of the curve.
    gaps.forEach((g, n) => expect(Math.abs(g - tradeInterval(n + 1)), `gap ${n + 1}: ${g} ms`).toBeLessThan(1));
    expect(Math.min(...gaps)).toBe(WALK.tradeFloorMs);
  });

  it('two buyers at the store line share one deal: the speed-up carries on across them, in turns', () => {
    const state = buyerAtStore();
    state.players[2]!.money = 1_000;
    const p2 = walker(state, 'p2');
    p2.price = walker(state, 'p1').price;
    const trades = run(state, 2_000);
    const by = (id: string) => trades.filter((t) => t.buyer === id).length;
    expect(by('p1')).toBeGreaterThan(0);
    expect(Math.abs(by('p1') - by('p2'))).toBeLessThanOrEqual(1);
    expect(a(state).deals.find((d) => d.seller === 'store')!.units).toBe(trades.length);
  });
});

describe('RULE-1 and RULE-3, property: whatever the tick sizes, a house line trades exactly what can be traded', () => {
  it('a buyer standing at the store line buys min(affordable, the store\'s spare stock), whatever the tick lengths', () => {
    const next = seeded(7);
    for (let c = 0; c < 60; c++) {
      const state = buyerAtStore();
      const price = a(state).storeSell;
      const money = price + next(1_200);
      state.players[1]!.money = money;
      const trades: Trade[] = [];
      for (let t = 0; t < 30_000 && a(state).stage === 'walk'; ) {
        const dt = 10 + next(400);
        trades.push(...stepAuction(state, dt));
        t += dt;
      }
      expect(trades.length, `case ${c}: ${money} cr`).toBe(Math.floor(money / price));
    }
  });

  it('a seller standing at the store line sells all it holds, up to what the store will take, whatever the tick lengths', () => {
    const next = seeded(11);
    for (let c = 0; c < 60; c++) {
      const held = 1 + next(15);
      const state = sellerAtStore(held);
      const budget = 1 + next(15);
      a(state).storeBudget = budget;
      const trades: Trade[] = [];
      for (let t = 0; t < 30_000 && a(state).stage === 'walk'; ) {
        const dt = 10 + next(400);
        trades.push(...stepAuction(state, dt));
        t += dt;
      }
      expect(trades.filter((x) => x.seller === 'p0' && x.buyer === 'store').length, `case ${c}: holding ${held}, the store takes ${budget}`).toBe(Math.min(held, budget));
    }
  });
});

describe('RULE-2 in the engine: everyone takes part', () => {
  it('every player starts the good as a buyer at the bottom edge', () => {
    const state = newGame();
    state.players[0]!.stock.food = 30;
    startAuction(state, ['food']);
    expect(a(state).walkers.map((w) => w.side)).toEqual(['buyer', 'buyer', 'buyer', 'buyer']);
  });

  it("'pass' is refused with the rules' words, on the status screen and in the walk", () => {
    const state = newGame();
    state.store.stock.food = 200;
    startAuction(state, ['food']);
    expect(() => declareRole(state, 'p1', 'pass')).toThrow(new RuleError('Everyone takes part in the auction'));
    toWalk(state);
    expect(() => declareRole(state, 'p1', 'pass')).toThrow(new RuleError('Everyone takes part in the auction'));
    expect(walker(state, 'p1').side).toBe('buyer');
  });
});

describe('G-2: a tap moves the walker one price step', () => {
  it('B-AC: a tap up raises a buyer\'s bid by exactly 1, a tap down lowers it by 1, and it stands still after', () => {
    const state = newGame();
    state.store.stock.food = 200;
    startAuction(state, ['food']);
    toWalk(state);
    walker(state, 'p1').price = 50;
    stepWalk(state, 'p1', 1);
    expect(walker(state, 'p1')).toMatchObject({ price: 51, dir: 0 });
    stepAuction(state, 1_000);
    expect(walker(state, 'p1').price).toBe(51);
    stepWalk(state, 'p1', -1);
    expect(walker(state, 'p1').price).toBe(50);
  });

  it('a step lands on the rounded price next to where you stand, so a walker between prices moves to a whole one', () => {
    const state = newGame();
    state.store.stock.food = 200;
    startAuction(state, ['food']);
    toWalk(state);
    walker(state, 'p1').price = 50.4;
    stepWalk(state, 'p1', 1);
    expect(walker(state, 'p1').price).toBe(51);
  });

  it("a tap never passes the store's sell line for a buyer, nor its buy line for a seller; stepping onto one starts trading", () => {
    const buyer = buyerAtStore();
    stepWalk(buyer, 'p1', -1);
    expect(run(buyer, 2_000)).toEqual([]);
    stepWalk(buyer, 'p1', 1);
    stepWalk(buyer, 'p1', 1);
    expect(Math.round(walker(buyer, 'p1').price)).toBe(a(buyer).storeSell);
    expect(run(buyer, 2_000).length).toBeGreaterThan(0);
    const seller = sellerAtStore();
    stepWalk(seller, 'p0', 1);
    expect(run(seller, 2_000)).toEqual([]);
    stepWalk(seller, 'p0', -1);
    stepWalk(seller, 'p0', -1);
    expect(Math.round(walker(seller, 'p0').price)).toBe(a(seller).storeBuy);
    expect(run(seller, 2_000).length).toBeGreaterThan(0);
  });

  it('refuses a tap before the walk', () => {
    const state = newGame();
    state.store.stock.food = 200;
    startAuction(state, ['food']);
    expect(() => stepWalk(state, 'p1', 1)).toThrow(RuleError);
  });
});
