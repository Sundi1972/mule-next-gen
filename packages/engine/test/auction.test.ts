import { describe, expect, it } from 'vitest';
import {
  needsOf,
  monthNeeds,
  GOODS,
  GOOD_CONFIG,
  UPKEEP,
  statusRows,
  auctionNeed,
  advancePhase,
  auctionDone,
  cloneForSim,
  createGame,
  declareRole,
  endAuction,
  lineOf,
  monthlyDemand,
  PRICE,
  RuleError,
  setWalk,
  shipPrice,
  startAuction,
  stepAuction,
  tradeInterval,
  WALK,
  type AuctionSide,
  type GameState,
  type Good,
  type Species,
  type Trade,
  type WalkLesson,
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
  // A shelf of 20 Water, so the store still has room to buy Water (storeWants); START's 100 fills that room (Heiko, 8 Nov).
  state.store.stock.water = 20;
  state.phase = 'auction';
  return state;
}

function a(state: GameState) {
  return state.auction!;
}

/** Picks the given sides on the status screen, then everyone presses Done. */
/**
 * Ends the status screen: everyone starts as a buyer (RULE-2), so a player holding more than this month's need switches
 * to seller here, as the walk tests below want them, unless `roles` says otherwise; then everyone presses Done.
 */
function endStatus(state: GameState, roles: Record<string, AuctionSide> = {}) {
  expect(a(state).stage).toBe('status');
  for (const r of a(state).status) if (!(r.id in roles) && r.now > r.need) declareRole(state, r.id, 'seller');
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

/**
 * Steps for `ms` while the same good is up, the given players walking toward the other side; one standing at a
 * house's line stands still there, where units trade by themselves (RULE-1), and walks on once it is off it (the ship
 * pays a little less after each unit).
 */
function walkToLines(state: GameState, ids: string[], ms: number): Trade[] {
  const good = a(state).good;
  const trades: Trade[] = [];
  for (let t = 0; t < ms && a(state).good === good && a(state).stage === 'walk'; t += TICK) {
    for (const id of ids) setWalk(state, id, lineOf(state, id) ? 0 : walker(state, id).side === 'seller' ? -1 : 1);
    trades.push(...stepAuction(state, TICK));
  }
  return trades;
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

  it('T-AC-3: skips a good at the end of its status screen when nobody can trade: everyone stays a buyer and none can pay', () => {
    const state = newGame();
    state.players[0]!.stock.food = 6;
    state.players[0]!.stock.water = 5;
    startAuction(state, ['food', 'water']);
    for (const p of state.players) p.money = 0;
    endStatus(state, Object.fromEntries(state.players.map((p) => [p.id, 'buyer' as const])));
    expect(a(state).good).toBe('water');
    expect(a(state).skipped).toEqual([{ good: 'food', reason: 'nobody trading' }]);
  });

  it('T-AC-3: skips a good at the end of its status screen when the buyers have no possible seller', () => {
    const state = newGame();
    state.store.stock.energy = 0;
    state.players[0]!.stock.energy = 3;
    startAuction(state, ['energy']);
    // p0 holds Energy but stays a buyer: there is no seller.
    endStatus(state, { p0: 'buyer' });
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
    // The need to hold: the 2 upkeep eats; no factory, so nothing is carried past spoilage (auctionNeed, PM ruling (a)).
    expect(row).toMatchObject({ had: 4, made: 3, now: 7, used: 0, need: 2 });
    // Upkeep eats 2 first; a quarter of the other 5 spoils: 3.75 kept, rounded down, so 2 are lost.
    expect(row.spoils).toBe(2);
    expect(a(state).status.find((r) => r.id === 'p1')).toMatchObject({ had: 4, made: 0, now: 0, used: 4 });
  });

  it('T-AC-3 (RULE-2): when a good\'s status opens, every walker is a buyer at the bottom edge, whatever it holds or needs', () => {
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
    for (const w of a(state).walkers) expect(w, w.id).toMatchObject({ side: 'buyer', price: a(state).lo });

    for (const p of state.players) p.money = 0;
    endStatus(state, Object.fromEntries(state.players.map((p) => [p.id, 'buyer' as const])));
    expect(a(state)).toMatchObject({ good: 'water', stage: 'status' });
    for (const w of a(state).walkers) expect(w, w.id).toMatchObject({ side: 'buyer', price: a(state).lo });
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
    expect(() => declareRole(state, 'p1', 'pass')).toThrow(new RuleError('Everyone takes part in the auction'));
    expect(walker(state, 'p1').side).toBe('buyer');
    expect(() => declareRole(state, 'p3', 'seller')).toThrow(new RuleError('You have none to sell'));
    expect(walker(state, 'p3').side).toBe('buyer');
    // Picking a side neither presses Done nor takes it back: p0 stays done, the others are not.
    expect(a(state).done).toEqual(['p0']);
    stepAuction(state, TICK);
    expect(a(state).stage).toBe('status');
    toWalk(state, { p0: 'buyer' });
    expect(a(state).walkers.map((w) => [w.id, w.side])).toEqual([
      ['p0', 'buyer'],
      ['p1', 'buyer'],
      ['p2', 'seller'],
      ['p3', 'buyer'],
    ]);
    expect(walker(state, 'p2').price).toBe(a(state).hi);
  });

  it('T-AC-3 (A-7): the status screen has no clock: it waits for every Done, then goes straight to the walk, and no step is ever a declare stage', () => {
    const state = newGame();
    state.players[0]!.stock.food = 6;
    state.players[0]!.stock.water = 6;
    startAuction(state, ['food', 'water']);
    const stages = new Set<string>([a(state).stage]);
    // A minute of game time, far past the 8 s the screen used to run: nobody pressed Done, so it still waits.
    for (let t = 0; t < 60_000; t += TICK) stepAuction(state, TICK);
    expect(WALK.statusMs).toBeNull();
    expect(a(state)).toMatchObject({ good: 'food', stage: 'status' });
    const done = () => state.players.forEach((p) => auctionDone(state, p.id));
    done();
    stepAuction(state, TICK);
    expect(a(state)).toMatchObject({ good: 'food', stage: 'walk', clockMs: WALK.goodMs, done: [] });
    for (let i = 0; a(state).stage !== 'over' && i < 10_000; i++) {
      if (a(state).stage === 'status') done();
      stepAuction(state, TICK);
      stages.add(a(state).stage);
    }
    expect([...stages].sort()).toEqual(['close', 'over', 'status', 'walk']);
  });

  it('T-AC-3 (A-7): a number in WALK.statusMs restores the status clock: with nobody Done the walk starts after exactly that time; with everyone Done it ends early', () => {
    const saved = WALK.statusMs;
    try {
      WALK.statusMs = 8_000;
      const timed = newGame();
      timed.players[0]!.stock.food = 6;
      startAuction(timed, ['food']);
      let ticks = 0;
      while (a(timed).stage === 'status' && ticks < 1_000) {
        stepAuction(timed, TICK);
        ticks++;
      }
      expect(ticks).toBe(8_000 / TICK);
      expect(a(timed)).toMatchObject({ good: 'food', stage: 'walk', clockMs: WALK.goodMs });

      const early = newGame();
      early.players[0]!.stock.food = 6;
      startAuction(early, ['food']);
      for (const p of early.players) auctionDone(early, p.id);
      stepAuction(early, TICK);
      expect(a(early)).toMatchObject({ good: 'food', stage: 'walk' });
    } finally {
      WALK.statusMs = saved;
    }
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
    // Nobody switched: p0, holding Food, starts the walk a buyer at the bottom edge like everyone else (RULE-2).
    expect(walker(state, 'p0')).toMatchObject({ side: 'buyer', price: a(state).lo });
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
    /** One auction where two players switch side during status and everyone walks toward the others, standing at a house's line. */
    function play() {
      const state = newGame();
      state.players[0]!.stock.food = 8;
      state.players[1]!.stock.water = 7;
      startAuction(state);
      const trades: Trade[] = [];
      const stages: string[] = [];
      for (let i = 0; a(state).stage !== 'over' && i < 20_000; i++) {
        const { stage, good } = a(state);
        if (stage === 'status' && good === 'food') declareRole(state, 'p0', 'seller');
        if (stage === 'status' && good === 'water') declareRole(state, 'p1', 'seller');
        // The status screen has no clock (A-7): everyone presses Done once the sides are picked.
        if (stage === 'status') for (const p of state.players) auctionDone(state, p.id);
        // At a house's line each stands still while units trade (RULE-1); elsewhere they walk on.
        if (stage === 'walk') for (const w of a(state).walkers) setWalk(state, w.id, lineOf(state, w.id) ? 0 : w.side === 'seller' ? -1 : 1);
        trades.push(...stepAuction(state, TICK));
        stages.push(`${a(state).good}:${a(state).stage}`);
      }
      return { trades, stages, money: state.players.map((p) => p.money) };
    }
    const first = play();
    const food = first.trades.filter((t) => t.good === 'food');
    const water = first.trades.filter((t) => t.good === 'water');
    // p0 sells its Food and p1 its Water; the buyers walk up to meet them, or to the store's line.
    expect(food.some((t) => t.seller === 'p0')).toBe(true);
    expect(water.some((t) => t.seller === 'p1')).toBe(true);
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

describe('the need to hold at the auction: what upkeep eats now, plus what must survive spoilage until it is used (PM ruling B, 6 Nov)', () => {
  /** Each player works `farms` Food farms (1 Energy each at production) and holds `energy` Energy; the store's Energy shelf is full, so it buys none. */
  function energyTable(farms: number, energy: number): GameState {
    const state = newGame();
    const free = state.tiles.filter((t) => t.terrain !== 'store' && !t.owner);
    state.players.forEach((p, i) => {
      for (const t of free.slice(i * farms, (i + 1) * farms)) Object.assign(t, { owner: p.id, outfit: 'food' });
      p.stock.energy = energy;
      p.stock.food = 3;
    });
    state.store.stock.energy = 999;
    return state;
  }

  it("FM-skip-spoilage (WS9's finding): every seat holds the 2 Energy its farms burn, which spoils to 1 by production, so Energy comes up and the status row asks for 3", () => {
    const state = energyTable(2, 2);
    expect(monthNeeds(state, 'p0').energy, 'production burns 2').toBe(2);
    startAuction(state, ['energy', 'food']);
    expect(a(state).skipped, 'not skipped as nobody buys').toEqual([]);
    expect(a(state).good).toBe('energy');
    // 3 x 0.75 = 2.25: 2 survive the month end's spoilage; 2 x 0.75 = 1.5 would leave 1.
    expect(a(state).status.map((r) => r.need)).toEqual([3, 3, 3, 3]);
    expect(a(state).status[0]!.spoils, 'what would spoil of what is held: 2 leaves 1').toBe(1);
  });

  it('FM-skip-spoilage: every seat holding what survives spoilage, and the store wanting none: Energy is skipped as nobody buys, as before', () => {
    const state = energyTable(2, 3);
    startAuction(state, ['energy', 'food']);
    expect(a(state).skipped).toEqual([{ good: 'energy', reason: 'nobody buys' }]);
  });

  it("FM-skip-spoilage: Food is what upkeep eats now, plus only a factory's Food carried past spoilage: no ration for next month (PM ruling (a), 8 Nov)", () => {
    // Development reads the household's last meal (needs C15) and the next auction comes before the next upkeep, so
    // next month's ration is bought then: a seat with no crew and no factory holds what this month end eats.
    const state = energyTable(0, 0);
    expect(needsOf(state, 'p0').food, 'the household alone').toBe(2);
    expect(auctionNeed(state, 'p0').food, '2 eaten at the month end, nothing carried').toBe(2);

    // A Medicine works takes 1 Food at next production: that 1 must survive a quarter's spoilage, so 2 are carried.
    const works = outfitTable(['medicine'], (eat) => eat);
    const eat = needsOf(works, 'p0').food;
    const factoryFood = monthNeeds(works, 'p0').food - eat;
    expect(factoryFood, "the premise: the works' recipe takes 1 Food").toBe(1);
    expect(Math.floor(2 * (1 - GOOD_CONFIG.food.spoilage)), '2 held survive to the 1 it takes').toBe(1);
    expect(auctionNeed(works, 'p0').food, "what upkeep eats now, plus the works' 1 past spoilage").toBe(eat + 2);
  });

  /** p0 works the given outfits; every seat holds `water` Water (or its own drink, if less), and the store wants no Water. */
  function outfitTable(outfits: string[], water: (eat: number) => number): GameState {
    const state = newGame();
    const free = state.tiles.filter((t) => t.terrain !== 'store' && !t.owner);
    outfits.forEach((outfit, i) => Object.assign(free[i]!, { owner: 'p0', outfit }));
    for (const p of state.players) p.stock.water = water(needsOf(state, p.id).water);
    state.store.stock.water = 999;
    return state;
  }

  it("FM-skip-spoilage: a Medicine factory's Water is carried too: its seat, with no farm, holding only what it drinks, keeps Water from being skipped and its row asks for the drink and the factory's 1 past spoilage", () => {
    const state = outfitTable(['medicine'], (eat) => eat);
    const eat = needsOf(state, 'p0').water;
    startAuction(state, ['water', 'food']);
    expect(a(state).skipped, 'Water comes up: the factory would run dry').toEqual([]);
    // Production keeps the drink back, then the factory uses 1 (AM-18 W2): eat + 1 must survive the month end's 5%.
    const held = Math.ceil((eat + 1) / (1 - GOOD_CONFIG.water.spoilage));
    expect(Math.floor(held * (1 - GOOD_CONFIG.water.spoilage)), 'held survives to cover it').toBe(eat + 1);
    expect(a(state).status.find((r) => r.id === 'p0')!.need).toBe(eat + held);
  });

  it('FM-skip-spoilage: Water is carried for a Food farm, and not for a seat with neither a farm nor a factory', () => {
    const farm = outfitTable(['food'], (eat) => eat);
    expect(auctionNeed(farm, 'p0').water, 'the farm is watered next month').toBeGreaterThan(needsOf(farm, 'p0').water);
    expect(auctionNeed(farm, 'p1').water, 'p1 has no plot: only what upkeep drinks now').toBe(needsOf(farm, 'p1').water);
  });

  it('FM-skip-spoilage: never below the old need (monthNeeds), with or without a farm, for seats running Medicine and Alloy factories', () => {
    for (const outfits of [['medicine', 'alloy'], ['medicine', 'alloy', 'food']]) {
      const state = outfitTable(outfits, (eat) => eat);
      const held = auctionNeed(state, 'p0');
      for (const g of GOODS) expect(held[g], `${g} with ${outfits.join(', ')}`).toBeGreaterThanOrEqual(Math.min(monthNeeds(state, 'p0')[g], UPKEEP.depotCapacity));
    }
  });

  it("AM-18: a seat with plots carries its drink plus every plot's Water, as production keeps the drink back first; a Smithore mine needs Water too", () => {
    // The least held so that floor(n x what survives the month end) still covers `want`.
    const survives = (want: number) => {
      let n = want;
      while (Math.floor(n * (1 - GOOD_CONFIG.water.spoilage)) < want) n++;
      return n;
    };
    for (const outfits of [['smithore'], ['food'], ['food', 'smithore', 'medicine']]) {
      const state = outfitTable(outfits, (eat) => eat);
      const eat = needsOf(state, 'p0').water;
      const next = Math.min(monthNeeds(state, 'p0').water, UPKEEP.depotCapacity);
      expect(monthNeeds(state, 'p0').water, outfits.join(', ')).toBeGreaterThan(eat);
      expect(auctionNeed(state, 'p0').water, outfits.join(', ')).toBe(eat + survives(next));
    }
  });

  it("FM-skip-spoilage: the row's spoils count the depot cap: 30 Water, after upkeep drinks, keeps at most the depot's 10", () => {
    const state = outfitTable([], () => 30);
    const rest = 30 - needsOf(state, 'p0').water;
    expect(statusRows(state, 'water').find((r) => r.id === 'p0')!.spoils).toBe(rest - UPKEEP.depotCapacity);
  });

  it('FM-skip-spoilage: a good that spoils entirely (a --set sweep to spoilage 1) carries nothing and still returns', () => {
    const was = GOOD_CONFIG.water.spoilage;
    GOOD_CONFIG.water.spoilage = 1;
    try {
      const state = outfitTable(['food'], (eat) => eat);
      expect(auctionNeed(state, 'p0').water).toBe(needsOf(state, 'p0').water);
    } finally {
      GOOD_CONFIG.water.spoilage = was;
    }
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
    // Six units on RULE-3's curve, each gap tradeSpeedUp times the one before, well under six at the starting pace.
    const six = Array.from({ length: 6 }, (_, i) => tradeInterval(i)).reduce((x, y) => x + y, 0);
    expect(six).toBeLessThan(6 * WALK.tradeStartMs);
    expect(run(state, Math.ceil(six / TICK) * TICK)).toHaveLength(6);
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
    // Two units over what the seller must hold: RULE-4 keeps the rest, so two are all it has to sell.
    other.players[0]!.stock.water = 2 + a(other).status.find((r) => r.id === 'p0')!.need;
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
    // p3 stays at the buyers' edge: everyone takes part, and standing there buys nothing.
    toWalk(state);
    const trades = walkToLines(state, ['p0', 'p1', 'p2'], 10_000);
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
    expect(walkToLines(state, ['p0', 'p1', 'p2', 'p3'], 10_000)).toHaveLength(2);
    expect(state.store.stock.food).toBe(reserve);
  });

  it('B-AC-D2: buys from sellers at its buy line within its budget; once the budget is spent the line still holds sellers up', () => {
    const state = newGame();
    state.players[0]!.stock.smithore = 10;
    startAuction(state, ['smithore']);
    a(state).storeBudget = 4;
    toWalk(state, { p0: 'seller' });
    // Long enough to walk to the line and sell well past the budget's 4, so the budget is what stops it.
    const trades = walkToLines(state, ['p0'], 20_000);
    const store = trades.filter((t) => t.buyer === 'store');
    expect(store).toHaveLength(4);
    expect(store.every((t) => t.price === a(state).storeBuy)).toBe(true);
    // Then the seller holds ▼ on, but the buying line it was fixed at still holds it, so the buyers resting in their
    // zone never trade.
    setWalk(state, 'p0', -1);
    trades.push(...run(state, 7_000));
    expect(trades).toHaveLength(4);
    expect(Math.round(walker(state, 'p0').price)).toBe(a(state).storeBuy);
  });

  it('B-AC-D2: once the store has spent its budget, the walk closes when no buyer can pay the buying line it was fixed at, and runs on while one can', () => {
    // [the other seats' money, measured from the buying line; whether the walk is still up after the store's units]
    const rows: [number, boolean][] = [
      [-1, false],
      [0, true],
    ];
    for (const [over, open] of rows) {
      const state = newGame();
      state.players[0]!.stock.smithore = 10;
      startAuction(state, ['smithore']);
      a(state).storeBudget = 2;
      for (const p of state.players.slice(1)) p.money = a(state).storeBuy + over;
      toWalk(state, { p0: 'seller' });
      const trades = walkToLines(state, ['p0'], 10_000);
      const at = `buyers hold the buying line ${over === 0 ? 'exactly' : `and ${over}`}`;
      expect(trades.filter((t) => t.buyer === 'store'), at).toHaveLength(2);
      expect(a(state).stage, at).toBe(open ? 'walk' : 'close');
    }
  });

  it('B-AC-D2: a ship in port paying under the buying line keeps no walk open, as no seller walks under that line to it; one paying the line does', () => {
    // [the ship's price, measured from the store's buying line; whether the walk opens]
    const rows: [number, boolean][] = [
      [-1, false],
      [0, true],
    ];
    for (const [under, opens] of rows) {
      const state = newGame();
      state.ship = { arrives: state.month, goods: ['crystite'], hold: { crystite: 3 }, bought: {} };
      state.players[0]!.stock.crystite = 5;
      // Only the ship buys: the store's shelf is full and no other seat has money.
      state.store.stock.crystite = 999;
      for (const p of state.players.slice(1)) p.money = 0;
      startAuction(state, ['crystite']);
      const target = a(state).storeBuy + under;
      for (state.store.offWorld.crystite = target; shipPrice(state, 'crystite')! > target; ) state.store.offWorld.crystite--;
      const at = `ship pays ${shipPrice(state, 'crystite')}, buying line ${a(state).storeBuy}`;
      expect(shipPrice(state, 'crystite'), `${at}: the premise`).toBe(target);
      expect(a(state).storeBudget, `${at}: the premise, the store buys none`).toBe(0);
      endStatus(state, { p0: 'seller' });
      if (opens) expect(a(state).stage, at).toBe('walk');
      else expect(a(state).skipped, at).toEqual([{ good: 'crystite', reason: 'nobody trading' }]);
    }
  });

  it('lets the export ship in port buy from sellers at or under its price, paying a little less per unit', () => {
    const state = newGame();
    state.ship = { arrives: state.month, goods: ['crystite'], hold: { crystite: 3 }, bought: {} };
    state.store.offWorld.crystite = state.store.posted.crystite * 2;
    state.players[0]!.stock.crystite = 5;
    startAuction(state, ['crystite']);
    toWalk(state, { p0: 'seller' });
    const trades = walkToLines(state, ['p0'], 15_000).filter((t) => t.buyer === 'ship');
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

  it('refuses a pass mid-walk: everyone stays on the board, and the good ends once every player is done', () => {
    const state = waterPair();
    expect(() => declareRole(state, 'p2', 'pass')).toThrow(new RuleError('Everyone takes part in the auction'));
    expect(walker(state, 'p2').side).toBe('buyer');
    for (const id of ['p0', 'p1', 'p3']) auctionDone(state, id);
    stepAuction(state, TICK);
    expect(a(state).stage, 'p2 is still on the board, not done').toBe('walk');
    auctionDone(state, 'p2');
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
    // Met at the buying line, the lowest a seller stands (rule D): two units' money there, and then none.
    const line = a(state).storeBuy;
    state.players[1]!.money = 2 * line;
    walker(state, 'p0').price = line;
    walker(state, 'p1').price = line;
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
    expect(a(state).receipts.p1).toEqual({ bought: { units: 1, gross: 95, tax: 0, exportTax: 0, prices: [95], with: ['p0'] }, sold: { units: 0, gross: 0, tax: 0, exportTax: 0, prices: [], with: [] } });
    expect(a(state).receipts.p0).toEqual({ bought: { units: 0, gross: 0, tax: 0, exportTax: 0, prices: [], with: [] }, sold: { units: 1, gross: 95, tax, exportTax: 0, prices: [95], with: ['p1'] } });
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
    for (const p of state.players) p.money = 0;
    endStatus(state, Object.fromEntries(state.players.map((p) => [p.id, 'buyer' as const])));
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

describe("price T-AC-3: when a good's walk finishes, the store keeps its sold-out high, its highest trade and whether its budget ran dry", () => {
  // A seller standing here meets no buyer and no house line.
  const APART = 10_000;

  /** Smithore comes up with p0 selling 10 and the store holding `shelf` to sell and wanting `budget`; then the walk, everyone apart. */
  function smithoreWalk(shelf: number, budget: number, lastMonth?: WalkLesson) {
    const state = newGame();
    state.players[0]!.stock.smithore = 10;
    state.store.stock.smithore = shelf;
    if (lastMonth) state.store.lastWalk = { smithore: lastMonth };
    startAuction(state, ['smithore']);
    a(state).storeBudget = budget;
    toWalk(state);
    walker(state, 'p0').price = APART;
    return state;
  }

  /** Brings p0 and p1 together for one unit at `price`, then apart again. */
  function tradeBetween(state: GameState, price: number) {
    walker(state, 'p0').price = price;
    walker(state, 'p1').price = price;
    expect(run(state, WALK.tradeStartMs)).toEqual([{ good: 'smithore', buyer: 'p1', seller: 'p0', quantity: 1, price }]);
    walker(state, 'p0').price = APART;
    walker(state, 'p1').price = a(state).lo;
    run(state, TICK);
  }

  /** p2 buys the store's last unit at its sell line, which then goes. */
  function emptyShelf(state: GameState) {
    walker(state, 'p2').price = a(state).storeSell;
    expect(run(state, WALK.tradeStartMs)).toMatchObject([{ buyer: 'p2', seller: 'store' }]);
    walker(state, 'p2').price = a(state).lo;
    run(state, TICK);
  }

  /** p0 sells `units` to the store at its buy line, then stands apart. */
  function sellToStore(state: GameState, units: number) {
    walker(state, 'p0').price = a(state).storeBuy;
    for (let sold = 0; sold < units; ) sold += run(state, TICK).filter((t) => t.buyer === 'store').length;
    walker(state, 'p0').price = APART;
    run(state, TICK);
  }

  function finish(state: GameState) {
    for (const p of state.players) auctionDone(state, p.id);
    stepAuction(state, TICK);
    expect(a(state).stage).toBe('close');
    return state.store.lastWalk?.smithore;
  }

  it('price T-AC-3: a unit traded before the shelf emptied never sets soldOutHigh', () => {
    const state = smithoreWalk(1, 0);
    tradeBetween(state, 100);
    emptyShelf(state);
    tradeBetween(state, 90);
    expect(finish(state)).toEqual({ soldOutHigh: 90, highTrade: 100, dryBudget: false });
  });

  it("price B-AC-1 (seam): the game keeps its walk lesson for next month while an AI's what-if copy (cloneForSim) plays the next walk", () => {
    const state = smithoreWalk(1, 0);
    tradeBetween(state, 100);
    emptyShelf(state);
    tradeBetween(state, 90);
    finish(state);
    endAuction(state);
    const sim = cloneForSim(state);
    startAuction(sim, ['smithore']);
    expect(a(sim).good).toBe('smithore');
    expect(state.store.lastWalk).toEqual({ smithore: { soldOutHigh: 90, highTrade: 100, dryBudget: false } });
  });

  it.each([
    { name: 'no unit traded between players', before: [], empties: true, after: [], soldOutHigh: null, highTrade: null },
    { name: 'the shelf never empties', before: [100, 95], empties: false, after: [], soldOutHigh: null, highTrade: 100 },
    { name: 'the highest unit came after the shelf emptied', before: [100], empties: true, after: [90, 130], soldOutHigh: 130, highTrade: 130 },
  ])('price T-AC-3: highTrade is the highest unit between players, shelf empty or not: $name', ({ before, empties, after, soldOutHigh, highTrade }) => {
    const state = smithoreWalk(1, 0);
    for (const price of before) tradeBetween(state, price);
    if (empties) emptyShelf(state);
    for (const price of after) tradeBetween(state, price);
    expect(finish(state)).toEqual({ soldOutHigh, highTrade, dryBudget: false });
  });

  it.each([
    { name: 'the store wanted 2 and bought 2', budget: 2, sold: 2, dryBudget: true },
    { name: 'the store wanted 2 and bought 1', budget: 2, sold: 1, dryBudget: false },
    { name: "the store wanted none as the good came up, whatever last month's walk kept", budget: 0, sold: 0, dryBudget: false },
  ])('price T-AC-3: dryBudget is true exactly when the store wanted some as the good came up and wants none at its finish: $name', ({ budget, sold, dryBudget }) => {
    const state = smithoreWalk(0, budget, { soldOutHigh: 500, highTrade: 500, dryBudget: true });
    sellToStore(state, sold);
    expect(finish(state)).toEqual({ soldOutHigh: null, highTrade: null, dryBudget });
  });
});
