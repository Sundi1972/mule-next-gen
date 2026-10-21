import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  auctionDone,
  createGame,
  declareRole,
  RuleError,
  setWalk,
  startAuction,
  stepAuction,
  tradeInterval,
  WALK,
  type AuctionSide,
  type GameState,
  type Good,
  type Species,
  type Trade,
} from '../src/index.js';

const TICK = WALK.tickMs;

function newGame(species: Species[] = ['zipwing', 'bramblet', 'gearling', 'mollox']): GameState {
  const state = createGame({ seed: 42, players: species.map((s, i) => ({ id: `p${i}`, name: `P${i}`, isAi: false, species: s })) });
  for (const p of state.players) {
    p.money = 1_000;
    for (const g of Object.keys(p.stock) as Good[]) p.stock[g] = 0;
  }
  // Round prices, so the store buys at 90 and sells at 110.
  for (const g of Object.keys(state.store.posted) as Good[]) state.store.posted[g] = 100;
  state.phase = 'auction';
  return state;
}

function a(state: GameState) {
  return state.auction!;
}

/** Everyone presses Done through the status screen; the declare follows. */
function toDeclare(state: GameState) {
  expect(a(state).stage).toBe('status');
  for (const p of state.players) auctionDone(state, p.id);
  stepAuction(state, TICK);
  expect(a(state).stage).toBe('declare');
}

function toWalk(state: GameState, roles: Record<string, AuctionSide> = {}) {
  toDeclare(state);
  for (const [id, role] of Object.entries(roles)) declareRole(state, id, role);
  for (const p of state.players) auctionDone(state, p.id);
  stepAuction(state, TICK);
  expect(a(state).stage).toBe('walk');
}

function walker(state: GameState, id: string) {
  return a(state).walkers.find((w) => w.id === id)!;
}

/** Steps for `ms` while the same good is up, collecting the trades. */
function run(state: GameState, ms: number): Trade[] {
  const good = a(state).good;
  const trades: Trade[] = [];
  for (let t = 0; t < ms && a(state).good === good && a(state).stage === 'walk'; t += TICK) trades.push(...stepAuction(state, TICK));
  return trades;
}

describe('the live auction: goods one at a time', () => {
  it('skips a good nobody holds and the store has none of, and says so in one line', () => {
    const state = newGame();
    state.store.stock.crystite = 0;
    state.players[0]!.stock.food = 3;
    startAuction(state, ['crystite', 'food']);
    expect(a(state).good).toBe('food');
    expect(a(state).skipped).toEqual([{ good: 'crystite', reason: 'nobody has any' }]);
  });

  it('skips a good nobody could buy: no player needs it and neither the store nor the ship will take it', () => {
    const state = newGame();
    state.players[0]!.stock.crystite = 4;
    state.store.capital = 0;
    state.players[0]!.stock.food = 3;
    startAuction(state, ['crystite', 'food']);
    expect(a(state).skipped).toEqual([{ good: 'crystite', reason: 'nobody buys' }]);
  });

  it('brings up a good the store sells when a player needs it, even if no player holds any', () => {
    const state = newGame();
    state.store.stock.food = 30;
    startAuction(state, ['food']);
    expect(a(state).good).toBe('food');
  });

  it('skips a good after the declare when everyone passes', () => {
    const state = newGame();
    state.players[0]!.stock.food = 6;
    state.players[0]!.stock.water = 5;
    startAuction(state, ['food', 'water']);
    toDeclare(state);
    for (const p of state.players) declareRole(state, p.id, 'pass');
    for (const p of state.players) auctionDone(state, p.id);
    stepAuction(state, TICK);
    expect(a(state).good).toBe('water');
    expect(a(state).skipped).toEqual([{ good: 'food', reason: 'nobody trading' }]);
  });

  it('skips a good after the declare when the buyers have no possible seller', () => {
    const state = newGame();
    state.store.stock.energy = 0;
    state.players[0]!.stock.energy = 3;
    startAuction(state, ['energy']);
    toDeclare(state);
    declareRole(state, 'p0', 'pass');
    declareRole(state, 'p1', 'buyer');
    for (const p of state.players) auctionDone(state, p.id);
    stepAuction(state, TICK);
    expect(a(state).stage).toBe('over');
    expect(a(state).skipped).toEqual([{ good: 'energy', reason: 'nobody trading' }]);
  });

  it('opens each good with a status screen of what everyone had, used, made and needs', () => {
    const state = newGame();
    state.players[0]!.stock.food = 7;
    state.history.push({
      month: state.month,
      before: Object.fromEntries(state.players.map((p) => [p.id, { ...p.stock, food: 4 }])),
      produced: Object.fromEntries(state.players.map((p) => [p.id, { ...p.stock, food: p.id === 'p0' ? 3 : 0 }])),
      prices: { ...state.store.posted },
      shortages: [],
      storeMules: 0,
      pollutionBy: {},
      air: 0,
      mulePrice: 0,
      corralSoldOut: false,
      storeCapital: 0,
      colonyFund: 0,
      colonistsHungry: false,
    });
    startAuction(state, ['food']);
    const row = a(state).status.find((r) => r.id === 'p0')!;
    expect(row).toMatchObject({ had: 4, made: 3, now: 7, used: 0, need: 2 });
    // Half the Food over the need spoils at month end.
    expect(row.spoils).toBe(3);
    expect(a(state).status.find((r) => r.id === 'p1')).toMatchObject({ had: 4, made: 0, now: 0, used: 4 });
  });

  it('sets the default side from needs: spare sells from the top, short buys from the bottom, even passes', () => {
    const state = newGame();
    state.players[0]!.stock.food = 6;
    state.players[2]!.stock.food = 2;
    startAuction(state, ['food']);
    toDeclare(state);
    expect(walker(state, 'p0')).toMatchObject({ side: 'seller', price: a(state).hi });
    expect(walker(state, 'p1')).toMatchObject({ side: 'buyer', price: a(state).lo });
    expect(walker(state, 'p2').side).toBe('pass');
    expect(() => declareRole(state, 'p1', 'seller')).toThrow(RuleError);
    declareRole(state, 'p0', 'buyer');
    expect(walker(state, 'p0').price).toBe(a(state).lo);
  });

  it('moves on to the next good when the clock runs out, and is over after the last', () => {
    const state = newGame();
    state.players[0]!.stock.food = 5;
    state.players[0]!.stock.water = 5;
    startAuction(state, ['food', 'water']);
    toWalk(state);
    for (let t = 0; t < WALK.goodMs; t += TICK) stepAuction(state, TICK);
    expect(a(state)).toMatchObject({ good: 'water', stage: 'status' });
    toWalk(state);
    for (const p of state.players) auctionDone(state, p.id);
    stepAuction(state, TICK);
    expect(a(state).stage).toBe('over');
  });
});

describe('the walk', () => {
  /** p0 sells Water, p1 buys; p2 and p3 stand aside. */
  function waterPair() {
    const state = newGame();
    state.players[0]!.stock.water = 10;
    startAuction(state, ['water']);
    a(state).storeBudget = 50;
    toWalk(state);
    return state;
  }

  it('walks at a steady speed and keeps sellers above the store buy line and buyers under its sell line', () => {
    const state = waterPair();
    const { speed, storeBuy, storeSell } = a(state);
    const start = walker(state, 'p0').price;
    setWalk(state, 'p0', -1);
    stepAuction(state, 1_000);
    expect(walker(state, 'p0').price).toBeCloseTo(Math.max(storeBuy, start - speed));
    setWalk(state, 'p1', 1);
    for (let i = 0; i < 200; i++) stepAuction(state, TICK);
    expect(walker(state, 'p0').price).toBeGreaterThanOrEqual(storeBuy);
    expect(walker(state, 'p1').price).toBeLessThanOrEqual(storeSell);
  });

  it('trades a buyer and a seller who meet, one unit at a time at the seller\'s ask, with sales tax', () => {
    const state = waterPair();
    const ask = a(state).storeBuy + 1;
    walker(state, 'p0').price = ask;
    walker(state, 'p1').price = ask + 1;
    const money = state.players[0]!.money;
    const trades = run(state, WALK.tradeStartMs);
    expect(trades).toEqual([{ good: 'water', buyer: 'p1', seller: 'p0', quantity: 1, price: ask }]);
    expect(state.players[1]!.stock.water).toBe(1);
    expect(state.players[0]!.money).toBe(money + ask - Math.round(ask * state.treasury.salesTax));
    expect(a(state).deals).toMatchObject([{ buyer: 'p1', seller: 'p0', units: 1 }]);
  });

  it('stops walkers of the two sides at each other: they meet instead of passing', () => {
    const state = waterPair();
    walker(state, 'p0').price = 20;
    walker(state, 'p1').price = 10;
    a(state).storeSell = 100;
    setWalk(state, 'p1', 1);
    stepAuction(state, 5_000);
    expect(walker(state, 'p1').price).toBe(20);
  });

  it('speeds trades up with every unit while the pair stays matched, and starts slow again after they part', () => {
    expect(tradeInterval(0)).toBe(WALK.tradeStartMs);
    expect(tradeInterval(1)).toBeCloseTo(WALK.tradeStartMs * WALK.tradeSpeedUp);
    expect(tradeInterval(100)).toBe(WALK.tradeFloorMs);
    const state = waterPair();
    const ask = a(state).storeBuy + 2;
    walker(state, 'p0').price = ask;
    walker(state, 'p1').price = ask;
    // 400 + 320 + 256 + 204.8 + 163.84 + 131.07 = 1,475.7 ms for six units, where an even pace would take 2.4 s.
    expect(run(state, 1_500)).toHaveLength(6);
    // They part, then meet again: the first unit takes the full time again.
    walker(state, 'p1').price = ask - 5;
    run(state, TICK);
    expect(a(state).deals).toEqual([]);
    walker(state, 'p1').price = ask;
    expect(run(state, WALK.tradeStartMs - TICK)).toHaveLength(0);
    expect(run(state, TICK)).toHaveLength(1);
  });

  it('runs the clock slower while units change hands', () => {
    const state = waterPair();
    walker(state, 'p0').price = a(state).storeBuy + 2;
    walker(state, 'p1').price = a(state).storeBuy + 2;
    run(state, 1_000);
    expect(a(state).clockMs).toBeCloseTo(WALK.goodMs - 1_000 * WALK.tradeClockRate);
    walker(state, 'p1').price = a(state).lo;
    run(state, 1_000);
    expect(a(state).clockMs).toBeCloseTo(WALK.goodMs - 1_000 * WALK.tradeClockRate - 1_000);
  });

  it('ends the deal when the buyer runs out of money or the seller out of units', () => {
    const state = waterPair();
    const ask = a(state).storeBuy + 2;
    state.players[1]!.money = ask * 3 + 1;
    walker(state, 'p0').price = ask;
    walker(state, 'p1').price = ask;
    expect(run(state, 5_000)).toHaveLength(3);
    expect(state.players[1]!.money).toBe(1);

    const other = waterPair();
    other.players[0]!.stock.water = 2;
    walker(other, 'p0').price = a(other).storeBuy + 2;
    walker(other, 'p1').price = a(other).storeBuy + 2;
    expect(run(other, 5_000)).toHaveLength(2);
    expect(a(other).deals).toEqual([]);
  });

  it('ends the good early once every player is done', () => {
    const state = waterPair();
    for (const p of state.players) auctionDone(state, p.id);
    auctionDone(state, 'p3', false);
    stepAuction(state, TICK);
    expect(a(state).stage).toBe('walk');
    auctionDone(state, 'p3');
    stepAuction(state, TICK);
    expect(a(state).stage).toBe('over');
  });
});

describe('the store and the ship on the board', () => {
  it('sells to buyers at its sell line in turns, a Quibbit first', () => {
    const state = newGame(['zipwing', 'bramblet', 'quibbit', 'mollox']);
    const reserve = state.colonists / 20;
    state.store.stock.food = reserve + 3;
    startAuction(state, ['food']);
    toWalk(state, { p3: 'pass' });
    for (const id of ['p0', 'p1', 'p2']) setWalk(state, id, 1);
    const trades = run(state, 10_000);
    expect(trades.map((t) => t.buyer)).toEqual(['p2', 'p0', 'p1']);
    expect(trades.every((t) => t.seller === 'store' && t.price === a(state).storeSell)).toBe(true);
    expect(state.store.stock.food).toBe(reserve);
  });

  it('keeps back the Food its colonists will buy', () => {
    const state = newGame();
    const reserve = state.colonists / 20;
    state.store.stock.food = reserve + 2;
    startAuction(state, ['food']);
    toWalk(state);
    for (const p of state.players) setWalk(state, p.id, 1);
    expect(run(state, 10_000)).toHaveLength(2);
    expect(state.store.stock.food).toBe(reserve);
  });

  it('has no ceiling when it is sold out: buyers keep walking up and the board grows', () => {
    const state = newGame();
    state.store.stock.energy = 0;
    state.players[0]!.stock.energy = 5;
    startAuction(state, ['energy']);
    toWalk(state, { p1: 'buyer' });
    setWalk(state, 'p1', 1);
    // p0 the seller stands far above; p1 walks past where the store would sell.
    walker(state, 'p0').price = 10_000;
    stepAuction(state, 60_000 / 4);
    expect(walker(state, 'p1').price).toBeGreaterThan(a(state).storeSell);
    expect(walker(state, 'p1').price).toBeGreaterThan(a(state).hi);
  });

  it('buys from sellers at its buy line within its budget, and the line goes once the budget is spent', () => {
    const state = newGame();
    state.players[0]!.stock.smithore = 10;
    startAuction(state, ['smithore']);
    a(state).storeBudget = 4;
    toWalk(state, { p1: 'buyer', p2: 'buyer' });
    setWalk(state, 'p0', -1);
    const trades = run(state, 15_000);
    const store = trades.filter((t) => t.buyer === 'store');
    expect(store).toHaveLength(4);
    expect(store.every((t) => t.price === a(state).storeBuy)).toBe(true);
    // Then the seller walks on down to the buyers waiting at the bottom.
    expect(trades.slice(4).every((t) => t.seller === 'p0' && t.buyer !== 'store' && t.price < a(state).storeBuy)).toBe(true);
    expect(trades.length).toBeGreaterThan(4);
  });

  it('lets the export ship in port buy from sellers at or under its price, paying a little less per unit', () => {
    const state = newGame();
    state.ship = { arrives: state.month, goods: ['crystite'], hold: { crystite: 3 }, bought: {} };
    state.store.offWorld.crystite = state.store.posted.crystite * 2;
    state.players[0]!.stock.crystite = 5;
    startAuction(state, ['crystite']);
    toWalk(state);
    setWalk(state, 'p0', -1);
    const trades = run(state, 15_000).filter((t) => t.buyer === 'ship');
    expect(trades).toHaveLength(3);
    expect(trades[1]!.price).toBeLessThan(trades[0]!.price);
    expect(state.ship.hold.crystite).toBe(0);
  });
});

describe('changing sides and ending early', () => {
  function waterPair() {
    const state = newGame();
    state.players[0]!.stock.water = 10;
    state.players[1]!.stock.water = 3;
    startAuction(state, ['water']);
    a(state).storeBudget = 50;
    toWalk(state, { p1: 'buyer' });
    return state;
  }

  it('lets a player switch sides mid-walk: the creature jumps to the new start edge and never trades at once', () => {
    const state = waterPair();
    walker(state, 'p0').price = 95;
    walker(state, 'p1').price = 95;
    expect(run(state, WALK.tradeStartMs)).toHaveLength(1);
    // p1 sells instead: back to the top, above every bid.
    declareRole(state, 'p1', 'seller');
    expect(walker(state, 'p1')).toMatchObject({ side: 'seller', price: a(state).hi, dir: 0 });
    // p0 buys instead: back to the bottom, under every ask.
    declareRole(state, 'p0', 'buyer');
    expect(walker(state, 'p0').price).toBe(a(state).lo);
    expect(run(state, WALK.tradeStartMs * 2)).toEqual([]);
  });

  it('lets a player pass mid-walk: they leave the board and can no longer walk', () => {
    const state = waterPair();
    declareRole(state, 'p2', 'pass');
    expect(walker(state, 'p2').side).toBe('pass');
    expect(() => setWalk(state, 'p2', 1)).toThrow(RuleError);
    // Done counts only the players still on the board.
    for (const id of ['p0', 'p1', 'p3']) auctionDone(state, id);
    stepAuction(state, TICK);
    expect(a(state).stage).toBe('over');
  });

  it('ends a good at once when the sellers are sold out and the store has none', () => {
    const state = newGame();
    state.store.stock.energy = 0;
    state.players[0]!.stock.energy = 2;
    startAuction(state, ['energy', 'food']);
    state.players[0]!.stock.food = 5;
    toWalk(state, { p1: 'buyer' });
    walker(state, 'p0').price = 50;
    walker(state, 'p1').price = 50;
    const trades = run(state, 5_000);
    expect(trades).toHaveLength(2);
    expect(a(state).good).toBe('food');
  });

  it('ends a good at once when every buyer is out of money and nobody else buys', () => {
    const state = newGame();
    state.players[0]!.stock.food = 9;
    state.store.stock.food = state.colonists / 20;
    state.store.capital = 0;
    state.players[2]!.money = 0;
    state.players[3]!.money = 0;
    startAuction(state, ['food']);
    toWalk(state);
    state.players[1]!.money = 100;
    walker(state, 'p0').price = 50;
    walker(state, 'p1').price = 50;
    expect(run(state, 5_000)).toHaveLength(2);
    expect(a(state).stage).toBe('over');
  });
});
