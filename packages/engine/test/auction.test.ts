import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  auctionDone,
  createGame,
  declareRole,
  endAuction,
  monthlyDemand,
  PRICE,
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

/** Picks the given sides on the status screen, then everyone presses Done. */
function endStatus(state: GameState, roles: Record<string, AuctionSide> = {}) {
  expect(a(state).stage).toBe('status');
  for (const [id, role] of Object.entries(roles)) declareRole(state, id, role);
  for (const p of state.players) auctionDone(state, p.id);
  stepAuction(state, TICK);
}

function toWalk(state: GameState, roles: Record<string, AuctionSide> = {}) {
  endStatus(state, roles);
  expect(a(state).stage).toBe('walk');
}

function walker(state: GameState, id: string) {
  return a(state).walkers.find((w) => w.id === id)!;
}

/** Steps through a good's close stage (A-5), to whatever comes up next. */
function throughClose(state: GameState) {
  expect(a(state).stage).toBe('close');
  for (let t = 0; t < WALK.closeMs; t += TICK) stepAuction(state, TICK);
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
    // The store never runs out of money: it buys nothing only when its shelf is full.
    state.store.stock.crystite = 999;
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

  it('T-AC-3: skips a good when everyone passes on its status screen', () => {
    const state = newGame();
    state.players[0]!.stock.food = 6;
    state.players[0]!.stock.water = 5;
    startAuction(state, ['food', 'water']);
    endStatus(state, Object.fromEntries(state.players.map((p) => [p.id, 'pass'])));
    expect(a(state).good).toBe('water');
    expect(a(state).skipped).toEqual([{ good: 'food', reason: 'nobody trading' }]);
  });

  it('T-AC-3: skips a good at the end of its status screen when the buyers have no possible seller', () => {
    const state = newGame();
    state.store.stock.energy = 0;
    state.players[0]!.stock.energy = 3;
    startAuction(state, ['energy']);
    endStatus(state, { p0: 'pass', p1: 'buyer' });
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

  it('T-AC-3: when a good\'s status opens, every walker already holds defaultSide: surplus sells from the top, short buys from the bottom, even passes', () => {
    const state = newGame();
    // Food: p0 has spare, p1 none, p2 exactly its need. Water opens after Food, inside stepAuction.
    state.players[0]!.stock.food = 6;
    state.players[2]!.stock.food = 2;
    state.players[3]!.stock.water = 9;
    state.players[1]!.stock.water = 1;
    startAuction(state, ['food', 'water']);
    stepAuction(state, TICK);
    expect(a(state)).toMatchObject({ good: 'food', stage: 'status' });
    expect(a(state).walkers.map((w) => w.id)).toEqual(['p0', 'p1', 'p2', 'p3']);
    expect(walker(state, 'p0')).toMatchObject({ side: 'seller', price: a(state).hi });
    expect(walker(state, 'p1')).toMatchObject({ side: 'buyer', price: a(state).lo });
    expect(walker(state, 'p2').side).toBe('pass');

    endStatus(state, Object.fromEntries(state.players.map((p) => [p.id, 'pass'])));
    expect(a(state)).toMatchObject({ good: 'water', stage: 'status' });
    expect(walker(state, 'p3')).toMatchObject({ side: 'seller', price: a(state).hi });
    expect(walker(state, 'p0')).toMatchObject({ side: 'buyer', price: a(state).lo });
    expect(walker(state, 'p1').side).toBe('pass');
  });

  it('T-AC-3: declareRole works during status: the side sent is taken at its start edge, and Sell needs units', () => {
    const state = newGame();
    state.players[0]!.stock.food = 6;
    state.players[2]!.stock.food = 2;
    startAuction(state, ['food']);
    stepAuction(state, TICK);
    expect(a(state).stage).toBe('status');
    auctionDone(state, 'p0');
    declareRole(state, 'p0', 'buyer');
    expect(walker(state, 'p0')).toMatchObject({ side: 'buyer', price: a(state).lo });
    declareRole(state, 'p2', 'seller');
    expect(walker(state, 'p2')).toMatchObject({ side: 'seller', price: a(state).hi });
    declareRole(state, 'p1', 'pass');
    expect(walker(state, 'p1').side).toBe('pass');
    expect(() => declareRole(state, 'p3', 'seller')).toThrow(new RuleError('You have none to sell'));
    expect(walker(state, 'p3').side).toBe('buyer');
    // Picking a side neither presses Done nor takes it back: p0 stays done, the others are not.
    expect(a(state).done).toEqual(['p0']);
    stepAuction(state, TICK);
    expect(a(state).stage).toBe('status');
    toWalk(state);
    expect(a(state).walkers.map((w) => [w.id, w.side])).toEqual([
      ['p0', 'buyer'],
      ['p1', 'pass'],
      ['p2', 'seller'],
      ['p3', 'buyer'],
    ]);
    expect(walker(state, 'p2').price).toBe(a(state).hi);
  });

  it('T-AC-3: the status clock\'s end goes straight to the walk, and no step is ever a declare stage', () => {
    const state = newGame();
    state.players[0]!.stock.food = 6;
    state.players[0]!.stock.water = 6;
    startAuction(state, ['food', 'water']);
    const stages = new Set<string>([a(state).stage]);
    let ticks = 0;
    while (a(state).stage === 'status' && ticks < 1_000) {
      stepAuction(state, TICK);
      stages.add(a(state).stage);
      ticks++;
    }
    expect(ticks).toBe(WALK.statusMs / TICK);
    expect(a(state)).toMatchObject({ good: 'food', stage: 'walk', clockMs: WALK.goodMs, done: [] });
    for (let i = 0; a(state).stage !== 'over' && i < 10_000; i++) {
      stepAuction(state, TICK);
      stages.add(a(state).stage);
    }
    expect([...stages].sort()).toEqual(['close', 'over', 'status', 'walk']);
  });

  it('T-AC-3: everyone pressing Done on the status screen goes straight to the walk', () => {
    const state = newGame();
    state.players[0]!.stock.food = 6;
    startAuction(state, ['food']);
    for (const p of state.players.slice(1)) auctionDone(state, p.id);
    stepAuction(state, TICK);
    expect(a(state).stage).toBe('status');
    auctionDone(state, 'p0');
    stepAuction(state, TICK);
    expect(a(state)).toMatchObject({ stage: 'walk', clockMs: WALK.goodMs, done: [] });
    expect(walker(state, 'p0')).toMatchObject({ side: 'seller', price: a(state).hi });
  });

  it('T-AC-3: declareRole before a good is up still throws', () => {
    const state = newGame();
    expect(() => declareRole(state, 'p0', 'buyer')).toThrow(RuleError);
    state.players[0]!.stock.food = 6;
    startAuction(state, ['food']);
    endAuction(state);
    expect(a(state).stage).toBe('over');
    expect(() => declareRole(state, 'p0', 'buyer')).toThrow(RuleError);
  });

  it('T-AC-3: the same seed and intents replay to the same trades', () => {
    /** One auction where two players change their side during status and everyone on the board walks toward the others. */
    function play() {
      const state = newGame();
      state.players[0]!.stock.food = 8;
      state.players[1]!.stock.water = 7;
      startAuction(state);
      const trades: Trade[] = [];
      const stages: string[] = [];
      for (let i = 0; a(state).stage !== 'over' && i < 20_000; i++) {
        const { stage, good } = a(state);
        if (stage === 'status' && good === 'food') declareRole(state, 'p2', 'pass');
        if (stage === 'status' && good === 'water') declareRole(state, 'p1', 'pass');
        if (stage === 'walk') for (const w of a(state).walkers) if (w.side !== 'pass') setWalk(state, w.id, w.side === 'seller' ? -1 : 1);
        trades.push(...stepAuction(state, TICK));
        stages.push(`${a(state).good}:${a(state).stage}`);
      }
      return { trades, stages, money: state.players.map((p) => p.money) };
    }
    const first = play();
    const food = first.trades.filter((t) => t.good === 'food');
    const water = first.trades.filter((t) => t.good === 'water');
    // p2 is short of Food and p1 has spare Water, but both passed on the status screen.
    expect(food.some((t) => t.buyer === 'p1' && t.seller === 'p0')).toBe(true);
    expect(food.some((t) => t.buyer === 'p2')).toBe(false);
    expect(water.length).toBeGreaterThan(0);
    expect(water.some((t) => t.seller === 'p1')).toBe(false);
    expect(play()).toEqual(first);
  });

  it('moves on to the next good when the clock runs out, and is over after the last', () => {
    const state = newGame();
    state.players[0]!.stock.food = 5;
    state.players[0]!.stock.water = 5;
    startAuction(state, ['food', 'water']);
    toWalk(state);
    for (let t = 0; t < WALK.goodMs; t += TICK) stepAuction(state, TICK);
    throughClose(state);
    expect(a(state)).toMatchObject({ good: 'water', stage: 'status' });
    toWalk(state);
    for (const p of state.players) auctionDone(state, p.id);
    stepAuction(state, TICK);
    throughClose(state);
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
    expect(a(state).stage).toBe('close');
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

  it('T-AC-3: lets a player switch sides mid-walk: the creature jumps to the new start edge, is no longer done, and never trades at once', () => {
    const state = waterPair();
    walker(state, 'p0').price = 95;
    walker(state, 'p1').price = 95;
    expect(run(state, WALK.tradeStartMs)).toHaveLength(1);
    // p1 sells instead: back to the top, above every bid, and on the walk again.
    auctionDone(state, 'p1');
    declareRole(state, 'p1', 'seller');
    expect(a(state).done).not.toContain('p1');
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
    expect(a(state).stage).toBe('close');
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
    expect(a(state)).toMatchObject({ good: 'energy', stage: 'close' });
    throughClose(state);
    expect(a(state).good).toBe('food');
  });

  it('ends a good at once when every buyer is out of money and nobody else buys', () => {
    const state = newGame();
    state.players[0]!.stock.food = 9;
    // The store never runs out of money: a full shelf is what keeps it from buying.
    state.store.stock.food = Math.ceil(monthlyDemand(state).food * PRICE.storeMaxCover);
    state.players[2]!.money = 0;
    state.players[3]!.money = 0;
    startAuction(state, ['food']);
    toWalk(state);
    state.players[1]!.money = 100;
    walker(state, 'p0').price = 50;
    walker(state, 'p1').price = 50;
    expect(run(state, 5_000)).toHaveLength(2);
    expect(a(state).stage).toBe('close');
  });
});

describe('A-5 the close stage: a receipt after each good (G-5)', () => {
  /** p0 sells Water to p1; Crystite, which nobody holds and the store has none of, is skipped; then Food comes up: p0 holds some. */
  function closedWater() {
    const state = newGame();
    state.players[0]!.stock.water = 10;
    state.players[1]!.stock.water = 3;
    state.players[0]!.stock.food = 5;
    state.store.stock.crystite = 0;
    startAuction(state, ['water', 'crystite', 'food']);
    a(state).storeBudget = 50;
    toWalk(state, { p1: 'buyer' });
    walker(state, 'p0').price = 95;
    walker(state, 'p1').price = 95;
    expect(run(state, WALK.tradeStartMs)).toHaveLength(1);
    for (const p of state.players) auctionDone(state, p.id);
    stepAuction(state, TICK);
    return state;
  }

  const snapshot = (state: GameState) =>
    JSON.stringify({ players: state.players.map((p) => [p.money, p.stock]), fund: state.treasury.money, capital: state.store.capital, store: state.store.stock });

  it('T-AC-A5-1: after a good closes, the auction sits in a close stage for WALK.closeMs, then the next good comes up', () => {
    const state = closedWater();
    expect(a(state)).toMatchObject({ stage: 'close', good: 'water', clockMs: WALK.closeMs, upNext: 'food' });
    expect(WALK.closeMs).toBe(2_500);
    for (let t = TICK; t < WALK.closeMs; t += TICK) {
      expect(stepAuction(state, TICK)).toEqual([]);
      expect(a(state)).toMatchObject({ stage: 'close', good: 'water' });
    }
    stepAuction(state, TICK);
    // upNext named the good that really came up: past Crystite, which nobody could trade.
    expect(a(state)).toMatchObject({ stage: 'status', good: 'food', skipped: [{ good: 'crystite', reason: 'nobody has any' }] });
  });

  it('T-AC-A5-2: no money, stock, fund or store capital moves during the close stage, and nobody can walk or switch sides', () => {
    const state = closedWater();
    const before = snapshot(state);
    // The pair still stood matched at the bell: the close stage drops the deal, so no bar is drawn and nothing trades.
    expect(a(state).deals).toEqual([]);
    walker(state, 'p0').price = 95;
    walker(state, 'p1').price = 95;
    expect(() => setWalk(state, 'p1', 1)).toThrow(RuleError);
    expect(() => declareRole(state, 'p2', 'buyer')).toThrow(RuleError);
    for (let t = TICK; t < WALK.closeMs; t += TICK) {
      stepAuction(state, TICK);
      // No deal forms in the close stage, so the server's view never calls its clock slowed (mule-game.ts auctionView).
      expect(a(state).deals).toEqual([]);
    }
    expect(a(state).stage).toBe('close');
    expect(snapshot(state)).toBe(before);
  });

  it("T-AC-A5-3: each seat's receipt for the closed good: units, prices, the tax on a sale, and who with; and the month's running total", () => {
    const state = closedWater();
    const tax = Math.round(95 * state.treasury.salesTax);
    expect(tax).toBeGreaterThan(0);
    expect(a(state).receipts.p1).toEqual({ bought: { units: 1, gross: 95, tax: 0, prices: [95], with: ['p0'] }, sold: { units: 0, gross: 0, tax: 0, prices: [], with: [] } });
    expect(a(state).receipts.p0).toEqual({ bought: { units: 0, gross: 0, tax: 0, prices: [], with: [] }, sold: { units: 1, gross: 95, tax, prices: [95], with: ['p1'] } });
    expect(a(state).receipts.p2).toBeUndefined();
    expect(a(state).tally).toEqual({ p1: -95, p0: 95 - tax });
    // The next good starts a new receipt; the month's total carries on.
    for (let t = 0; t < WALK.closeMs; t += TICK) stepAuction(state, TICK);
    expect(a(state).good).toBe('food');
    expect(a(state).receipts).toEqual({});
    expect(a(state).tally).toEqual({ p1: -95, p0: 95 - tax });
    // Next month's auction starts its total from nothing.
    endAuction(state);
    state.month++;
    startAuction(state, ['food']);
    expect(a(state).good).toBe('food');
    expect(a(state).tally).toEqual({});
  });

  it('T-AC-A5-4: the last good closes too, with nothing up next, and then the auction is over', () => {
    const state = newGame();
    state.players[0]!.stock.water = 10;
    startAuction(state, ['water']);
    toWalk(state, { p1: 'buyer' });
    for (const p of state.players) auctionDone(state, p.id);
    stepAuction(state, TICK);
    expect(a(state)).toMatchObject({ stage: 'close', good: 'water', upNext: null });
    for (let t = 0; t < WALK.closeMs; t += TICK) stepAuction(state, TICK);
    expect(a(state).stage).toBe('over');
  });

  it('T-AC-A5-5: a good skipped at the end of its status screen has no close stage', () => {
    const state = newGame();
    state.players[0]!.stock.food = 6;
    state.players[0]!.stock.water = 5;
    startAuction(state, ['food', 'water']);
    endStatus(state, Object.fromEntries(state.players.map((p) => [p.id, 'pass'])));
    expect(a(state)).toMatchObject({ stage: 'status', good: 'water' });
  });

  it('T-AC-A5-6: ending the auction early from a close stage drifts the closed good once', () => {
    const state = closedWater();
    const ref = state.store.refPrice.water;
    endAuction(state);
    expect(a(state).stage).toBe('over');
    expect(state.store.refPrice.water).toBe(ref);
  });
});
