import { describe, expect, it } from 'vitest';
import {
  auctionDone,
  createGame,
  declareRole,
  lineOf,
  lineTrade,
  RuleError,
  setWalk,
  startAuction,
  stepAuction,
  stepWalk,
  WALK,
  type AuctionSide,
  type GameState,
  type Good,
  type Trade,
} from '../src/index.js';

/**
 * A-6 (UX audit G-1 and G-2's one-tap step): at a house's line (the store's or the ship's) nothing trades until the
 * player says how many; it then trades exactly that many and stops, and touching ▲ or ▼ stops it at once. A tap moves
 * the walker one price step. Mock: design/mocks/ws6-ux/src/screens/audit/auction/parts.tsx (LineQuestion, StepHold).
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

function toWalk(state: GameState, roles: Record<string, AuctionSide> = {}) {
  for (const [id, role] of Object.entries(roles)) declareRole(state, id, role);
  for (const p of state.players) auctionDone(state, p.id);
  stepAuction(state, TICK);
  expect(a(state).stage).toBe('walk');
}

function run(state: GameState, ms: number): Trade[] {
  const good = a(state).good;
  const trades: Trade[] = [];
  for (let t = 0; t < ms && a(state).good === good && a(state).stage === 'walk'; t += TICK) trades.push(...stepAuction(state, TICK));
  return trades;
}

/** p1 buys Food from the store, which has plenty; everyone else passes. p1 is walked up to the store's line and lets go. */
function buyerAtStore(): GameState {
  const state = newGame();
  state.store.stock.food = 200;
  startAuction(state, ['food']);
  toWalk(state, { p0: 'pass', p1: 'buyer', p2: 'pass', p3: 'pass' });
  setWalk(state, 'p1', 1);
  for (let i = 0; i < 400 && Math.round(walker(state, 'p1').price) < a(state).storeSell; i++) stepAuction(state, TICK);
  setWalk(state, 'p1', 0);
  a(state).clockMs = 600_000; // room for every case below; the clock is not what these tests are about
  return state;
}

/** p0 sells Smithore to the store; everyone else passes. p0 is walked down to the store's line and lets go. */
function sellerAtStore(units = 10): GameState {
  const state = newGame();
  state.players[0]!.stock.smithore = units;
  startAuction(state, ['smithore']);
  a(state).storeBudget = 50;
  toWalk(state, { p0: 'seller', p1: 'pass', p2: 'pass', p3: 'pass' });
  setWalk(state, 'p0', -1);
  for (let i = 0; i < 400 && Math.round(walker(state, 'p0').price) > a(state).storeBuy; i++) stepAuction(state, TICK);
  setWalk(state, 'p0', 0);
  a(state).clockMs = 600_000;
  return state;
}

describe('A-6 G-1: at a house line you choose how many', () => {
  it('B-AC: letting go at the store line trades nothing: standing there buys no unit until you say how many', () => {
    const state = buyerAtStore();
    expect(lineOf(state, 'p1')).toEqual({ house: 'store', price: a(state).storeSell });
    expect(run(state, 10_000)).toEqual([]);
    expect(state.players[1]!.stock.food).toBe(0);
  });

  it('B-AC: buying 2 at the store line buys exactly 2, then stops, however long you stand there', () => {
    const state = buyerAtStore();
    lineTrade(state, 'p1', 2);
    const trades = run(state, 20_000);
    expect(trades).toHaveLength(2);
    expect(trades.every((t) => t.seller === 'store' && t.buyer === 'p1' && t.price === a(state).storeSell)).toBe(true);
    expect(state.players[1]!.stock.food).toBe(2);
    expect(walker(state, 'p1').order).toMatchObject({ house: 'store', units: 2, traded: 2, cr: 2 * a(state).storeSell });
  });

  it('B-AC: selling 3 to the store sells exactly 3 and keeps the rest', () => {
    const state = sellerAtStore(10);
    lineTrade(state, 'p0', 3);
    const trades = run(state, 20_000);
    expect(trades).toHaveLength(3);
    expect(trades.every((t) => t.buyer === 'store' && t.seller === 'p0')).toBe(true);
    expect(state.players[0]!.stock.smithore).toBe(7);
    // What the seller got, after the sales tax on each unit.
    const net = trades.reduce((n, t) => n + t.price - Math.round(t.price * state.treasury.salesTax), 0);
    expect(walker(state, 'p0').order).toMatchObject({ units: 3, traded: 3, cr: net });
    expect(net).toBeLessThan(trades.reduce((n, t) => n + t.price, 0));
  });

  it('B-AC: touching ▲ or ▼ while units move stops them at once', () => {
    for (const dir of [1, -1] as const) {
      const state = buyerAtStore();
      lineTrade(state, 'p1', 20);
      let trades: Trade[] = [];
      for (let i = 0; i < 400 && trades.length === 0; i++) trades = trades.concat(stepAuction(state, TICK));
      expect(trades).toHaveLength(1);
      setWalk(state, 'p1', dir);
      expect(run(state, 10_000).filter((t) => t.seller === 'store')).toEqual([]);
      expect(state.players[1]!.stock.food).toBe(1);
    }
  });

  it('a new choice at the line replaces the old one, and a finished one can be followed by another', () => {
    const state = buyerAtStore();
    lineTrade(state, 'p1', 1);
    expect(run(state, 10_000)).toHaveLength(1);
    lineTrade(state, 'p1', 2);
    expect(run(state, 10_000)).toHaveLength(2);
    expect(state.players[1]!.stock.food).toBe(3);
  });

  it('sells to the ship at its line the number chosen, the ship paying less for each further unit', () => {
    const state = newGame();
    state.ship = { arrives: state.month, goods: ['crystite'], hold: { crystite: 5 }, bought: {} };
    state.store.offWorld.crystite = state.store.posted.crystite * 2;
    state.players[0]!.stock.crystite = 6;
    startAuction(state, ['crystite']);
    toWalk(state, { p0: 'seller', p1: 'pass', p2: 'pass', p3: 'pass' });
    setWalk(state, 'p0', -1);
    for (let i = 0; i < 400 && lineOf(state, 'p0') === null; i++) stepAuction(state, TICK);
    setWalk(state, 'p0', 0);
    a(state).clockMs = 600_000;
    expect(lineOf(state, 'p0')?.house).toBe('ship');
    expect(run(state, 5_000)).toEqual([]);
    lineTrade(state, 'p0', 2);
    const trades = run(state, 20_000);
    expect(trades.map((t) => t.buyer)).toEqual(['ship', 'ship']);
    expect(trades[1]!.price).toBeLessThan(trades[0]!.price);
    expect(state.players[0]!.stock.crystite).toBe(4);
  });

  it('players still trade with each other where they meet: only a house waits to be told how many', () => {
    const state = newGame();
    state.players[0]!.stock.water = 10;
    startAuction(state, ['water']);
    a(state).storeBudget = 50;
    toWalk(state, { p0: 'seller', p1: 'buyer', p2: 'pass', p3: 'pass' });
    walker(state, 'p0').price = 95;
    walker(state, 'p1').price = 95;
    expect(run(state, 3_000).filter((t) => t.buyer === 'p1' && t.seller === 'p0').length).toBeGreaterThan(0);
  });

  it('every walker on the view-facing board starts a good with no choice made', () => {
    const state = buyerAtStore();
    expect(a(state).walkers.every((w) => w.order === undefined)).toBe(true);
  });
});

describe('A-6 G-1 negatives: refused with a RuleError, or clamped to what you can pay or hold', () => {
  it('a count above what you can pay is clamped to what you can pay for', () => {
    const state = buyerAtStore();
    const price = a(state).storeSell;
    state.players[1]!.money = 2 * price + 30; // two units
    lineTrade(state, 'p1', 9);
    expect(walker(state, 'p1').order?.units).toBe(2);
    expect(run(state, 20_000)).toHaveLength(2);
    expect(state.players[1]!.money).toBe(30);
  });

  it('a count above your stock is clamped to what you hold', () => {
    const state = sellerAtStore(4);
    lineTrade(state, 'p0', 9);
    expect(walker(state, 'p0').order?.units).toBe(4);
    expect(run(state, 20_000)).toHaveLength(4);
  });

  it('a count above the store\'s stock trades what it has and then stops', () => {
    const state = buyerAtStore();
    const reserve = state.colonists / 20;
    state.store.stock.food = reserve + 2;
    lineTrade(state, 'p1', 5);
    expect(run(state, 20_000)).toHaveLength(2);
    expect(state.players[1]!.stock.food).toBe(2);
    expect(state.store.stock.food).toBe(reserve);
  });

  it('when the store sells out mid-choice the choice ends there and still says what moved, until the walker walks on', () => {
    const state = newGame();
    const reserve = state.colonists / 20;
    state.store.stock.food = reserve + 2;
    // p0 sells Food too, far up the board, so the good goes on once the store is out.
    state.players[0]!.stock.food = 5;
    startAuction(state, ['food']);
    toWalk(state, { p0: 'seller', p1: 'buyer', p2: 'pass', p3: 'pass' });
    walker(state, 'p0').price = 10_000;
    setWalk(state, 'p1', 1);
    for (let i = 0; i < 400 && lineOf(state, 'p1') === null; i++) stepAuction(state, TICK);
    setWalk(state, 'p1', 0);
    a(state).clockMs = 600_000;
    lineTrade(state, 'p1', 5);
    expect(run(state, 10_000)).toHaveLength(2);
    expect(walker(state, 'p1').order).toMatchObject({ house: 'store', units: 2, traded: 2 });
    setWalk(state, 'p1', -1);
    stepAuction(state, TICK);
    expect(walker(state, 'p1').order).toBeUndefined();
  });

  it('refuses when you cannot pay for one, or hold none', () => {
    const state = buyerAtStore();
    state.players[1]!.money = a(state).storeSell - 1;
    expect(() => lineTrade(state, 'p1', 1)).toThrow(RuleError);
  });

  it('refuses a count that is not a whole number of at least 1', () => {
    for (const n of [0, -1, 1.5, Number.NaN]) expect(() => lineTrade(buyerAtStore(), 'p1', n)).toThrow(RuleError);
  });

  it('refuses away from a house line, on the status screen, and for a player who passed', () => {
    const state = newGame();
    state.store.stock.food = 200;
    startAuction(state, ['food']);
    expect(() => lineTrade(state, 'p1', 1)).toThrow(RuleError); // the status screen
    toWalk(state, { p0: 'pass', p1: 'buyer', p2: 'pass', p3: 'pass' });
    expect(lineOf(state, 'p1')).toBeNull();
    expect(() => lineTrade(state, 'p1', 1)).toThrow(RuleError); // at the bottom of the board
    expect(() => lineTrade(state, 'p0', 1)).toThrow(RuleError); // passed
  });

  it('walking away from the line drops the choice', () => {
    const state = buyerAtStore();
    lineTrade(state, 'p1', 3);
    setWalk(state, 'p1', -1);
    run(state, 2_000);
    expect(walker(state, 'p1').order).toBeUndefined();
    setWalk(state, 'p1', 1);
    expect(run(state, 10_000).filter((t) => t.seller === 'store')).toEqual([]);
  });

  it('switching sides drops the choice', () => {
    const state = buyerAtStore();
    state.players[1]!.stock.food = 3;
    lineTrade(state, 'p1', 3);
    declareRole(state, 'p1', 'seller');
    expect(walker(state, 'p1').order).toBeUndefined();
  });
});

describe('A-6 G-2: a tap moves the walker one price step', () => {
  it('B-AC: a tap up raises a buyer\'s bid by exactly 1, a tap down lowers it by 1, and it stands still after', () => {
    const state = newGame();
    state.store.stock.food = 200;
    startAuction(state, ['food']);
    toWalk(state, { p0: 'pass', p1: 'buyer', p2: 'pass', p3: 'pass' });
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
    toWalk(state, { p0: 'pass', p1: 'buyer', p2: 'pass', p3: 'pass' });
    walker(state, 'p1').price = 50.4;
    stepWalk(state, 'p1', 1);
    expect(walker(state, 'p1').price).toBe(51);
  });

  it('a tap never passes the store\'s sell line for a buyer, nor its buy line for a seller, and stepping onto one trades nothing', () => {
    const buyer = buyerAtStore();
    const line = a(buyer).storeSell;
    stepWalk(buyer, 'p1', 1);
    expect(Math.round(walker(buyer, 'p1').price)).toBe(line);
    expect(run(buyer, 5_000)).toEqual([]);
    const seller = sellerAtStore();
    stepWalk(seller, 'p0', -1);
    expect(Math.round(walker(seller, 'p0').price)).toBe(a(seller).storeBuy);
    expect(run(seller, 5_000)).toEqual([]);
  });

  it('a tap stops units moving at the line, like a press', () => {
    const state = buyerAtStore();
    lineTrade(state, 'p1', 20);
    let trades: Trade[] = [];
    for (let i = 0; i < 400 && trades.length === 0; i++) trades = trades.concat(stepAuction(state, TICK));
    stepWalk(state, 'p1', 1);
    expect(run(state, 10_000)).toEqual([]);
  });

  it('refuses a tap off the board or before the walk', () => {
    const state = newGame();
    state.store.stock.food = 200;
    startAuction(state, ['food']);
    expect(() => stepWalk(state, 'p1', 1)).toThrow(RuleError);
    toWalk(state, { p0: 'pass', p1: 'buyer', p2: 'pass', p3: 'pass' });
    expect(() => stepWalk(state, 'p0', 1)).toThrow(RuleError);
  });
});

describe('A-6 property: at a house line exactly min(chosen, affordable) units trade, whatever the tick sizes', () => {
  it('holds over many seeded counts, purses and tick lengths', () => {
    // A small seeded generator, so the cases are the same on every run (no Math.random in tests either).
    let s = 7;
    const next = (n: number) => {
      s = (s * 1_103_515_245 + 12_345) % 2_147_483_648;
      return s % n;
    };
    for (let c = 0; c < 60; c++) {
      const state = buyerAtStore();
      const price = a(state).storeSell;
      const money = price + next(1_200);
      state.players[1]!.money = money;
      const chosen = 1 + next(15);
      lineTrade(state, 'p1', chosen);
      const trades: Trade[] = [];
      for (let t = 0; t < 30_000 && a(state).stage === 'walk'; ) {
        const dt = 10 + next(400);
        trades.push(...stepAuction(state, dt));
        t += dt;
      }
      expect(trades.length, `case ${c}: chose ${chosen} with ${money} cr`).toBe(Math.min(chosen, Math.floor(money / price)));
    }
  });
});
