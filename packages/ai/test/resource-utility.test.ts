import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  advancePhase,
  AI_VALUE,
  energyOffOrder,
  needsOf,
  UPKEEP,
  createGame,
  GOOD_CONFIG,
  GROWN_BASE,
  observe,
  PRICE,
  startAuction,
  stepAuction,
  STRATEGIST,
  WALK,
  type AiLevelId,
  type AiPersonaId,
  type GameState,
  type Good,
  type Outfit,
  type Tile,
  type Trade,
} from '@mule/engine';
import { outlook } from '../src/outlook.js';
import { applyAction, playMonthFrom } from '../src/play.js';
import { AiSeat } from '../src/seat.js';
import { cashReserve } from '../src/value.js';
import { goodPlan, sellWanted, wholeNextMonth } from '../src/strategist.js';

/**
 * The resource-utility model at the table: built states played on through the engine with every seat's own hands,
 * read where the player sees the result. Every row runs with the model switched on.
 */

const flatGround = { food: 0, water: 0, energy: 0, smithore: 0, crystite: 0, rareEarth: 0 };
const ME = 'ai0';

interface Plot {
  outfit: Outfit | null;
  /** Column on row 0: plots two apart don't touch, so no feeder saving, park or cluster bonus. */
  x: number;
  ground?: Partial<Tile['ground']>;
}

interface Seat {
  persona?: AiPersonaId;
  level?: AiLevelId;
  plots: Plot[];
  posted?: Partial<Record<Good, number>>;
  stock?: Partial<Record<Good, number>>;
  money: number;
  /** What the store holds of each good; plenty of the household's goods unless the row says. */
  store?: Partial<Record<Good, number>>;
}

/**
 * Month 1, at the auction's start: ai0 owns the row's plots, analysed, and holds `stock` and `money`. The other seats
 * own nothing, hold nothing and have no money, so only ai0 trades. No sales tax.
 */
function table(seat: Seat): GameState {
  const state = createGame({ seed: 1, players: ['ai0', 'ai1', 'ai2', 'ai3'].map((id) => ({ id, name: id, isAi: true })) });
  while (state.phase !== 'auction') advancePhase(state);
  for (const t of state.tiles) if (t.owner) Object.assign(t, { owner: null, outfit: null });
  const me = state.players.find((p) => p.id === ME)!;
  for (const plot of seat.plots) {
    const tile = state.tiles[plot.x]!;
    expect(tile.terrain).not.toBe('store');
    Object.assign(tile, { terrain: 'plains', traits: [], ground: { ...flatGround, ...plot.ground }, owner: ME, outfit: plot.outfit, pollution: 0, runMonths: 0 } satisfies Partial<Tile>);
    delete tile.special;
    me.analysed.push(plot.x);
  }
  state.treasury.salesTax = 0;
  Object.assign(state.store.posted, seat.posted ?? {});
  for (const good of ['food', 'water', 'energy'] as const) state.store.stock[good] = 200;
  Object.assign(state.store.stock, seat.store ?? {});
  for (const p of state.players) {
    for (const good of Object.keys(p.stock) as Good[]) p.stock[good] = p.id === ME ? (seat.stock?.[good] ?? 0) : 0;
    p.money = p.id === ME ? seat.money : 0;
  }
  return state;
}

const seatsOf = (state: GameState, seat: Seat) =>
  state.players.map((p, i) => new AiSeat({ id: p.id, name: p.name, persona: i === 0 ? (seat.persona ?? 'trader') : 'cautious', level: i === 0 ? (seat.level ?? 'trader') : 'trader', seed: 10 + i }));

/** Plays the auction of `goods` to its end with every seat's own hands; returns the trades. */
function playAuction(state: GameState, seat: Seat, goods: readonly Good[]): Trade[] {
  startAuction(state, goods);
  const seats = seatsOf(state, seat);
  const trades: Trade[] = [];
  for (let i = 0; i < 200_000 && state.auction && state.auction.stage !== 'over'; i++) {
    for (const s of seats) s.auctionTick(state, WALK.tickMs, (x) => applyAction(state, s.id, x));
    trades.push(...stepAuction(state, WALK.tickMs));
  }
  expect(state.auction?.stage ?? 'over', 'the auction ran to its end').toBe('over');
  return trades;
}

/** A copy of the table with the auction of `goods` started, its first good's status screen up. */
function atAuction(state: GameState, goods: readonly Good[]): GameState {
  const view = structuredClone(state);
  startAuction(view, goods);
  return view;
}

const bought = (trades: Trade[], good: Good) => trades.filter((t) => t.buyer === ME && t.good === good).reduce((n, t) => n + t.quantity, 0);
const me = (state: GameState) => state.players.find((p) => p.id === ME)!;

/**
 * The stopgap's rule beside the values (STRATEGIST.buyShortfall) is off in every row: the model alone must buy what the
 * seat needs, and a row that passes only by that rule proves nothing about it.
 */
const saved = { unit: AI_VALUE.unit, buyShortfall: STRATEGIST.buyShortfall, waterSpoilage: GOOD_CONFIG.water.spoilage };
beforeEach(() => {
  AI_VALUE.unit = true;
  STRATEGIST.buyShortfall = [];
});
afterEach(() => {
  AI_VALUE.unit = saved.unit;
  STRATEGIST.buyShortfall = saved.buyShortfall;
  GOOD_CONFIG.water.spoilage = saved.waterSpoilage;
});

/** Three Smithore mines (use 2 each, make 3 at 100): a unit of Energy short keeps 0.8 × 3 × 100 ÷ 2 = 120 on. */
const MINES: Plot[] = [0, 2, 4].map((x) => ({ outfit: 'smithore', x, ground: { smithore: 3 } }));
/** Energy at 30 (ask 33): each needed unit gains about 3.6 credits per credit; a Food unit at its ask about 1. */
const POSTED = { smithore: 100, energy: 30, food: 30 };

describe('RULE-5: one cash shadow price across the month’s auctions', () => {
  it('T-AC-2: with money for its Energy and not its Food too, Food’s budget is under one unit and the Energy auction buys every needed unit', () => {
    // Rookie: no look-ahead, so every belief is the posted price the row sets.
    const base: Seat = { level: 'rookie', plots: MINES, posted: POSTED, money: 0 };
    const probe = table(base);
    const energy = wholeNextMonth(observe(probe, ME), ME, 'energy');
    // The Energy it needs at the store's ask, and less than one Food unit more.
    const seat: Seat = { ...base, money: energy * 33 + 20 };
    const state = table(seat);
    const view = atAuction(state, ['food', 'water', 'energy']);
    const food = goodPlan(observe(view, ME), seatsOf(view, seat)[0]!.mind, 'food');
    expect(food.budget, 'Food’s budget is under one unit at its ask').toBeLessThan(view.auction!.storeSell);
    expect(food.reserve, 'the cash kept for Energy').toBeGreaterThanOrEqual(energy * 30);

    const trades = playAuction(state, seat, ['food', 'water', 'energy']);

    expect(bought(trades, 'food'), 'it bought no Food').toBe(0);
    expect(me(state).stock.energy, 'it holds every Energy unit it needs').toBe(energy);
    expect(me(state).money).toBeGreaterThanOrEqual(0);
  });

  it('T-AC-2 negative: with no needed unit anywhere, a good’s budget is today’s share of the money', () => {
    const seat: Seat = { plots: [], posted: POSTED, stock: { food: 40, water: 40 }, money: 1000 };
    const view = atAuction(table(seat), ['smithore']);

    const plan = goodPlan(observe(view, ME), seatsOf(view, seat)[0]!.mind, 'smithore');

    expect(plan.budget).toBe(1000 * STRATEGIST.budgetShare);
  });

  it("T-AC-4: WS1's reserve example: value about 411, ask 214, 1,355 cr and an old reserve over 1,141: it buys", () => {
    // A mine making 6 Smithore at 171: turned off it loses 0.8 × 6 × 171 = 821, 410 a unit of its use.
    const seat: Seat = {
      persona: 'cautious',
      level: 'rookie',
      plots: [{ outfit: 'smithore', x: 0, ground: { smithore: 6 } }, ...[2, 4, 6, 8, 10].map((x): Plot => ({ outfit: 'food', x, ground: { food: 1 - GROWN_BASE } }))],
      posted: { smithore: 171, energy: 194, food: 82, water: 70 },
      money: 1355,
    };
    const state = table(seat);
    const view = atAuction(state, ['energy']);
    expect(view.auction!.storeSell, 'the store asks 214').toBe(214);
    AI_VALUE.unit = false;
    const old = cashReserve(observe(view, ME), seatsOf(view, seat)[0]!.mind);
    AI_VALUE.unit = true;
    expect(old, 'the premise: the old reserve leaves under one unit of budget').toBeGreaterThan(1355 - 214);

    const trades = playAuction(state, seat, ['energy']);

    expect(bought(trades, 'energy'), 'it bought Energy').toBeGreaterThan(0);
    expect(me(state).money).toBeGreaterThanOrEqual(0);
  });
});

describe('C8: a power plant is worth what its output saves', () => {
  /** Three rich mines (use 2 each, make 6 Smithore at 100): a unit of Energy short keeps 0.8 × 6 × 100 ÷ 2 = 240 on. */
  const RICH: Plot[] = MINES.map((m) => ({ ...m, ground: { smithore: 6 } }));

  /**
   * Month 1's development: three rich mines (use 6 Energy), no plant, no Energy, 3,000 cr, and an idle plot rated for
   * Energy and for Food as the row says. The other seats have no money, so they buy no MULE.
   */
  function develop(idle: Partial<Tile['ground']>, store: { energy: number; posted: number }, more: { plots?: Plot[]; energy?: number } = {}): Outfit | null {
    const state = createGame({ seed: 1, players: ['ai0', 'ai1', 'ai2', 'ai3'].map((id) => ({ id, name: id, isAi: true })) });
    while (state.phase !== 'development') advancePhase(state);
    for (const t of state.tiles) if (t.owner) Object.assign(t, { owner: null, outfit: null });
    const plots = [...RICH, { outfit: null, x: 6, ground: idle }, ...(more.plots ?? [])];
    const seat: Seat = { plots, posted: { smithore: 100, energy: store.posted, food: 40 }, stock: { food: 20, water: 20, energy: more.energy ?? 0 }, money: 3000, store: { energy: store.energy } };
    const me = state.players.find((p) => p.id === ME)!;
    for (const plot of seat.plots) {
      const tile = state.tiles[plot.x]!;
      Object.assign(tile, { terrain: 'plains', traits: [], ground: { ...flatGround, ...plot.ground }, owner: ME, outfit: plot.outfit, pollution: 0, runMonths: 0 } satisfies Partial<Tile>);
      delete tile.special;
      me.analysed.push(plot.x);
    }
    state.treasury.salesTax = 0;
    Object.assign(state.store.posted, seat.posted);
    Object.assign(state.store.stock, seat.store);
    for (const p of state.players) {
      for (const good of Object.keys(p.stock) as Good[]) p.stock[good] = p.id === ME ? (seat.stock?.[good] ?? 0) : 0;
      p.money = p.id === ME ? seat.money : 0;
    }
    const seats = state.players.map((p, i) => ({ id: p.id, persona: 'trader' as const, level: 'trader' as const, seed: 10 + i }));

    const { state: after } = playMonthFrom(state, seats, 1);

    return after.tiles[6]!.outfit;
  }

  it('B-AC-5: an Energy-short seat with no plant and no Energy at the store installs a plant on its idle plot, though Food sells as well', () => {
    expect(develop({ energy: 2, food: 1 }, { energy: 0, posted: 30 })).toBe('energy');
  });

  it('B-AC-5: with Energy cheap and stocked at the store and a markedly better Food plot, it outfits Food instead', () => {
    expect(develop({ energy: 2, food: 3 }, { energy: 200, posted: 10 })).toBe('food');
  });

  it('B-AC-5: a seat whose own farm feeds it builds a plant though a farm sells better, for the plots the plant keeps on', () => {
    // Its farm (makes 6) covers its Food, so a second farm saves nothing; sold, the farm earns more than the plant. The
    // plant wins only by the Energy its own plots would otherwise go without, each unit at what that saves.
    const farm: Plot = { outfit: 'food', x: 8, ground: { food: 4 } };

    expect(develop({ energy: 2, food: 2 }, { energy: 0, posted: 20 }, { plots: [farm], energy: 10 })).toBe('energy');
  });

  it('B-AC-5 negative: with no idle plot there is nothing to install', () => {
    // The seat owns only its mines: no idle plot.
    const state = createGame({ seed: 1, players: ['ai0', 'ai1', 'ai2', 'ai3'].map((id) => ({ id, name: id, isAi: true })) });
    while (state.phase !== 'development') advancePhase(state);
    for (const t of state.tiles) if (t.owner) Object.assign(t, { owner: null, outfit: null });
    for (const plot of MINES) Object.assign(state.tiles[plot.x]!, { terrain: 'plains', traits: [], ground: { ...flatGround, ...plot.ground }, owner: ME, outfit: plot.outfit, pollution: 0, runMonths: 0 } satisfies Partial<Tile>);
    state.players.find((p) => p.id === ME)!.money = 3000;
    const seats = state.players.map((p, i) => ({ id: p.id, persona: 'trader' as const, level: 'trader' as const, seed: 10 + i }));

    const { state: after } = playMonthFrom(state, seats, 1);

    expect(after.tiles.filter((t) => t.owner === ME).map((t) => t.outfit)).toEqual(MINES.map(() => 'smithore'));
  });
});

/** Plays on from the auction's end through upkeep into next month, up to `until`'s start; with `through`, past it too. */
function playOn(state: GameState, until: 'development' | 'production', through = false): void {
  const month = state.month;
  for (let i = 0; i < 50 && !(state.month > month && state.phase === until); i++) advancePhase(state);
  expect(state.phase).toBe(until);
  if (through) advancePhase(state);
}

/** Nine Energy plants (crew 9, so it eats 5): they pay their own use, so no plot needs Energy and only Food is short. */
const PLANTS: Plot[] = Array.from({ length: 9 }, (_, i): Plot => ({ outfit: 'energy', x: 2 * i }));
/** The colonists' month the store keeps back from players, and `extra` more for sale. */
const shelf = (state: GameState, extra: number) => Math.ceil(state.colonists / UPKEEP.colonistsPerUnit) + extra;

describe('G-1: a seat keeps itself supplied', () => {
  /** Food posted at 65: the store sells at 72. */
  const FED: Seat = { plots: PLANTS, posted: { food: 65 }, stock: { water: 20, energy: 20 }, money: 1200 };

  function hungryNext(seat: Seat, forSale: number): { hungry: boolean; bought: number; money: number } {
    const state = table(seat);
    state.store.stock.food = shelf(state, forSale);
    expect(needsOf(state, ME).food, 'the premise: it eats 5').toBe(5);
    const trades = playAuction(state, seat, ['food']);
    const money = me(state).money;
    playOn(state, 'development');
    return { hungry: me(state).hungry, bought: bought(trades, 'food'), money };
  }

  it('B-AC-1: a seat with 0 Food, eating 5, 1,200 cr and the store selling Food at 72 is not hungry at the next development', () => {
    const state = atAuction(table(FED), ['food']);
    state.store.stock.food = shelf(state, 30);
    expect(state.auction!.storeSell, 'the premise: the store asks 72').toBe(72);

    const { hungry, bought: units, money } = hungryNext(FED, 30);

    expect(units, 'it bought Food').toBeGreaterThan(0);
    expect(money, 'its money never went negative').toBeGreaterThanOrEqual(0);
    expect(hungry, 'fed at the next development').toBe(false);
  });

  it('B-AC-1 negative: with no Food for sale at the store, there is no trade and it is hungry', () => {
    const { hungry, bought: units } = hungryNext(FED, 0);

    expect(units).toBe(0);
    expect(hungry).toBe(true);
  });

  /** Three mines (use 2 each): 6 Energy a month. Food and Water in plenty. */
  const POWERED = (money: number): Seat => ({ plots: MINES, posted: POSTED, stock: { food: 20, water: 20, energy: 1 }, money });

  /** Plays the Energy auction, then next month's production; returns the seat's plots turned off for want of Energy. */
  function offAtProduction(seat: Seat): { off: number[]; order: number[] } {
    const state = table(seat);
    playAuction(state, seat, ['energy']);
    playOn(state, 'production');
    const order = energyOffOrder(state, ME, 1).map((p) => state.tiles.indexOf(p.tile));
    advancePhase(state);
    const lines = state.history.at(-1)!.lines ?? [];
    const off = lines.filter((l) => state.tiles[l.tile]!.owner === ME && l.parts.some((p) => p.why === 'energyOff')).map((l) => l.tile);
    return { off, order };
  }

  it('B-AC-2: a seat whose plots need 6 Energy, holding 1, with cash enough and the store selling, has no plot turned off at production', () => {
    expect(offAtProduction(POWERED(1000)).off).toEqual([]);
  });

  it("B-AC-2 negative: with cash below one unit, its plots turn off in energyOffOrder's order", () => {
    const { off, order } = offAtProduction(POWERED(10));

    expect(off.length, 'some plot turned off').toBeGreaterThan(0);
    expect(order.slice(0, off.length).sort(), 'the first in the turn-off order').toEqual([...off].sort());
  });
});

describe('G-2: a surplus when cheap', () => {
  /**
   * The PLANTS seat with 1,200 cr and none of `good`, at a 5% sales tax, `good` posted at `posted`; the store holds the
   * colonists' month and 30 more, so next month's posted price climbs. Plays the auction of `good` alone.
   */
  function auctionOf(good: Good, posted: number) {
    const seat: Seat = { plots: PLANTS, posted: { [good]: posted }, stock: { water: 20, energy: 20, [good]: 0 }, money: 1200 };
    const state = table(seat);
    state.treasury.salesTax = 0.05;
    state.store.stock[good] = shelf(state, 30);
    const view = atAuction(state, [good]);
    const obs = observe(view, ME);
    const mind = seatsOf(view, seat)[0]!.mind;
    const before = {
      ask: view.auction!.storeSell,
      reference: state.store.refPrice[good],
      belief: outlook(obs, ME, { lookAhead: mind.level.lookAhead }).price(good),
      need: wholeNextMonth(obs, ME, good),
    };
    playAuction(state, seat, [good]);
    return { ...before, held: me(state).stock[good] };
  }
  /** What a unit held a month fetches from the store at the belief: after the spread, the 5% tax and its spoilage. */
  const carried = (good: Good, belief: number) => belief * (1 - PRICE.storeSpread) * 0.95 * (1 - GOOD_CONFIG[good].spoilage);

  it("B-AC-3: with Food's ask at or below its reference and a belief above it after spoilage and tax, the seat holds more than next month's need; at 2× reference, no more", () => {
    const cheap = auctionOf('food', 6);
    expect(cheap.ask, 'the premise: the ask is at or below the reference').toBeLessThanOrEqual(cheap.reference);
    expect(carried('food', cheap.belief), 'the premise: the belief beats the ask after spoilage and tax').toBeGreaterThan(cheap.ask);
    expect(cheap.held, 'it holds a surplus past what keeps it whole next month').toBeGreaterThan(cheap.need);

    const dear = auctionOf('food', 55);
    expect(dear.ask, 'the premise: the ask is 2× the reference or more').toBeGreaterThanOrEqual(2 * dear.reference);
    expect(dear.held, 'it holds what keeps it whole, no more').toBe(dear.need);
  });

  it('B-AC-3 negative: a good that spoils fully gets no surplus, though its belief beats the ask before spoilage', () => {
    // Water: a seat with no farm needs none, so every unit it would hold is surplus.
    GOOD_CONFIG.water.spoilage = 1;
    const water = auctionOf('water', 6);
    expect(water.need, 'the premise: it needs no Water').toBe(0);
    expect(water.belief * (1 - PRICE.storeSpread) * 0.95, 'the premise: unspoilt, a unit would beat the ask').toBeGreaterThan(water.ask);

    expect(water.held).toBe(0);
  });
});

describe('AM-5: a seat whose month of needs outruns its cash lists land to sell', () => {
  /** Month 1's planning: the three mines (6 Energy a month), no Energy, an idle plot, and `money`. */
  function listed(money: number): number {
    const state = createGame({ seed: 1, players: ['ai0', 'ai1', 'ai2', 'ai3'].map((id) => ({ id, name: id, isAi: true })) });
    while (state.phase !== 'planning') advancePhase(state);
    for (const t of state.tiles) if (t.owner) Object.assign(t, { owner: null, outfit: null });
    for (const plot of [...MINES, { outfit: null, x: 6 } satisfies Plot]) {
      Object.assign(state.tiles[plot.x]!, { terrain: 'plains', traits: [], ground: { ...flatGround, ...plot.ground }, owner: ME, outfit: plot.outfit, pollution: 0, runMonths: 0 } satisfies Partial<Tile>);
      delete state.tiles[plot.x]!.special;
    }
    Object.assign(state.store.posted, POSTED);
    const p = me(state);
    for (const good of Object.keys(p.stock) as Good[]) p.stock[good] = 0;
    p.money = money;
    return sellWanted(observe(state, ME), seatsOf(state, { plots: [], money })[0]!.mind).length;
  }

  it('FM-sell-trigger: a seat short of cash for its month of needs lists a lot with the model on', () => {
    expect(listed(20)).toBeGreaterThan(0);
  });

  it('FM-sell-trigger negative: a seat with cash for every needed unit lists nothing', () => {
    expect(listed(5000)).toBe(0);
  });
});
