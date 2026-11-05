import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  createGame,
  GOOD_CONFIG,
  monthNeeds,
  needsOf,
  observe,
  startAuction,
  stepAuction,
  STORE_ID,
  UPKEEP,
  WALK,
  type AiLevelId,
  type AiPersonaId,
  type GameState,
  type Good,
  type LiveAuction,
  type Outfit,
  type Trade,
} from '@mule/engine';
import { applyAction } from '../src/play.js';
import { AiSeat } from '../src/seat.js';
import { goodPlan, tradeDecision } from '../src/strategist.js';

/**
 * Heiko's ruling of 5 Nov: an AI seat short of Food, Energy or Water for next month buys it at the store's price when it
 * can afford it. Each row plays month 1's auction of the good through the engine with every seat's own hands, then plays
 * the table on into next month and reads what the seat got: fed at development, and no plot of its halved for Energy or
 * Water at production.
 */

const SEATS: { persona: AiPersonaId; level: AiLevelId }[] = [
  { persona: 'trader', level: 'trader' },
  { persona: 'cautious', level: 'tycoon' },
  { persona: 'aggressive', level: 'rookie' },
  { persona: 'saboteur', level: 'tycoon' },
];
const SEED = 1;
const MONEY = 3_000;
const seatOf = (k: number) => new AiSeat({ id: `ai${k}`, name: `AI ${k + 1}`, ...SEATS[k]!, seed: SEED * 10 + k });

/** The colonists' month of Food or Water the store keeps back from players: the rest of its shelf is for sale. */
const reserve = (state: GameState, good: Good) => (good === 'food' || good === 'water' ? Math.ceil(state.colonists / UPKEEP.colonistsPerUnit) : 0);

/** Month 1's auction of `good`, the status screen up: the store sells `shelf` units (40 unless the row says). */
function auctionOf(good: Good, arrange: (state: GameState) => void, shelf = 40): GameState {
  const state = createGame({ seed: SEED, players: SEATS.map((_, i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
  while (state.phase !== 'auction') advancePhase(state);
  state.store.stock[good] = reserve(state, good) + shelf;
  // Nobody else is short: each other seat holds what keeps it whole, so only the arranged seats have a reason to trade.
  for (const p of state.players) p.stock[good] = Math.max(monthNeeds(state, p.id)[good], wholeOf(state, p.id, good));
  arrange(state);
  startAuction(state, [good]);
  expect(state.auction!.good).toBe(good);
  return state;
}

/**
 * The seat as the trace found it short, one arrangement per good. Food: three Energy plots, so a unit is worth only the
 * walking it keeps at pace. Energy: three farms and no Energy plot, holding 1. Water: three farms, which go half without
 * it. Its other goods are as much as keeps it whole, so only the good up is short. A seat with no land values Food past
 * any price already.
 */
const PLOTS: Partial<Record<Good, Outfit[]>> = {
  food: ['energy', 'energy', 'energy'],
  energy: ['food', 'food', 'food'],
  water: ['food', 'food', 'food'],
};
const HELD: Partial<Record<Good, number>> = { food: 0, energy: 1, water: 0 };

type Held = number | ((state: GameState) => number);

function shortOf(good: Good, id: string, money: number, held: Held = HELD[good]!, plots = PLOTS[good]!): (state: GameState) => void {
  return (state) => {
    const free = state.tiles.filter((x) => x.terrain === 'plains' && !x.owner);
    plots.forEach((outfit, i) => Object.assign(free[i]!, { owner: id, outfit }));
    const me = state.players.find((p) => p.id === id)!;
    for (const g of ['food', 'energy', 'water'] as const) me.stock[g] = g === good ? (typeof held === 'number' ? held : held(state)) : 2 * (monthNeeds(state, id)[g] + 2);
    me.money = money;
  };
}

/**
 * What keeps a seat whole next month, by the engine's order (upkeep.ts, game.ts startDevelopment, production.ts): upkeep
 * eats the household's Food, then half of what is left spoils, and next development is hungry under the household's
 * Food; Energy loses a quarter to spoilage before next production burns it.
 */
const wholeFood = (state: GameState, id: string) => needsOf(state, id).food + Math.ceil(needsOf(state, id).food / (1 - GOOD_CONFIG.food.spoilage));
const wholeEnergy = (state: GameState, id: string) => Math.ceil(monthNeeds(state, id).energy / (1 - GOOD_CONFIG.energy.spoilage));
/** Water the same as Food, for a seat with a farm to water; without one, going short costs it nothing. */
const wholeWater = (state: GameState, id: string) =>
  state.tiles.some((t) => t.owner === id && t.outfit === 'food') ? needsOf(state, id).water + Math.ceil(needsOf(state, id).water / (1 - GOOD_CONFIG.water.spoilage)) : 0;
const wholeOf = (state: GameState, id: string, good: Good) => (good === 'food' ? wholeFood(state, id) : good === 'energy' ? wholeEnergy(state, id) : good === 'water' ? wholeWater(state, id) : 0);

/** A rival seller the row drives by hand: it declares Sell and stands at `price` for the whole walk. */
interface Puppet {
  id: string;
  price: (a: LiveAuction) => number;
}

/** Plays the good that is up to its close with every seat's own hands but the puppet's; returns the trades. */
function play(state: GameState, puppet?: Puppet): Trade[] {
  const good = state.auction!.good;
  const seats = SEATS.map((_, k) => seatOf(k)).filter((s) => s.id !== puppet?.id);
  const trades: Trade[] = [];
  for (let tick = 0; tick < 20_000; tick++) {
    const a = state.auction!;
    if (a.good !== good || a.stage === 'close' || a.stage === 'over') break;
    for (const s of seats) s.auctionTick(state, WALK.tickMs, (x) => applyAction(state, s.id, x));
    if (puppet && a.stage === 'status') {
      applyAction(state, puppet.id, { type: 'declare', side: 'seller' });
      applyAction(state, puppet.id, { type: 'done', done: true });
    }
    if (puppet && a.stage === 'walk') Object.assign(a.walkers.find((w) => w.id === puppet.id)!, { side: 'seller', price: puppet.price(a), dir: 0 });
    trades.push(...stepAuction(state, WALK.tickMs));
  }
  return trades;
}

/** Plays on through upkeep into next month, up to `until`'s start; with `through`, past it too. */
function playOn(state: GameState, until: 'development' | 'production', through = false): void {
  const month = state.month;
  for (let i = 0; i < 50 && !(state.month > month && state.phase === until); i++) advancePhase(state);
  expect(state.phase).toBe(until);
  if (through) advancePhase(state);
}

/** The seat's plots halved at next month's production for want of the good: none means it was whole. */
function halvedFor(state: GameState, id: string, why: 'noEnergy' | 'noWater'): number {
  const report = state.history.at(-1)!;
  return (report.lines ?? []).filter((l) => state.tiles[l.tile]!.owner === id && l.parts.some((p) => p.why === why)).length;
}

const paid = (trades: Trade[], id: string) => trades.filter((t) => t.buyer === id).reduce((n, t) => n + t.price * t.quantity, 0);
const units = (trades: Trade[], id: string) => trades.filter((t) => t.buyer === id).reduce((n, t) => n + t.quantity, 0);
const sold = (trades: Trade[], id: string) => trades.filter((t) => t.seller === id);
const ROWS = SEATS.map((s, k) => [`ai${k}`, `${s.persona}/${s.level}`]);
const RIVAL = (id: string) => (id === 'ai0' ? 'ai1' : 'ai0');

/** The auction's half of the promise: it bought at or under the store's ask, from the store too, sold none, and paid it. */
function boughtFairly(state: GameState, trades: Trade[], id: string, ask: number, held: number, money: number): void {
  const me = state.players.find((p) => p.id === id)!;
  expect(units(trades, id), 'it bought').toBeGreaterThan(0);
  expect(sold(trades, id), 'it sold none of what it needs').toEqual([]);
  expect(units(trades, id)).toBe(me.stock[state.auction!.good!] - held);
  for (const t of trades.filter((x) => x.buyer === id)) expect(t.price, 'never above the store’s ask').toBeLessThanOrEqual(ask);
  expect(trades.some((t) => t.buyer === id && t.seller === STORE_ID), 'the store sold to it').toBe(true);
  expect(me.money, 'its money fell by what it paid').toBe(money - paid(trades, id));
}

/**
 * The negative row for `good`: a seat with money for two and a half units of a larger shortfall buys two and never goes
 * negative. With `rival`, the store sells one unit and a rival (ai3) asks a quarter over the store once the store is
 * out: the seat buys the store's unit and pays the rival nothing over the store's ask. Food only: there its own value
 * of a unit is the walking it keeps, under the ask, so a unit over the ask could only be the ruling's doing. A farm's
 * Energy or Water is worth more than the store's ask to it, and it may pay a rival that, as before the ruling.
 */
function buysWhatItCan(good: Good, rival = false): void {
  const id = 'ai0';
  // It comes to the good with money to spare, so the good comes up; its purse is cut once the store's ask is known.
  const state = auctionOf(
    good,
    (s) => {
      shortOf(good, id, MONEY, 0)(s);
      if (rival) s.players.find((p) => p.id === 'ai3')!.stock[good] = 20;
    },
    rival ? 1 : 40,
  );
  const ask = state.auction!.storeSell;
  const over = Math.min(state.auction!.hi, ask + Math.ceil(ask / 4));
  if (rival) expect(over, 'the premise: the rival asks over the store').toBeGreaterThan(ask);
  // Two units' price and half of a third.
  const money = 2 * ask + Math.floor(ask / 2);
  expect(monthNeeds(state, id)[good] + (good === 'energy' ? 0 : 1), 'the premise: it lacks 3 or more (Food and Water: the need upkeep takes, and one or more to keep)').toBeGreaterThan(2);
  state.players.find((p) => p.id === id)!.money = money;

  const trades = play(state, rival ? { id: 'ai3', price: () => over } : undefined);

  const me = state.players.find((p) => p.id === id)!;
  if (rival) expect(trades.filter((t) => t.buyer === id && t.seller === STORE_ID).length, 'the store’s one unit').toBe(1);
  else expect(units(trades, id), 'it bought the two units it could pay for').toBe(2);
  for (const t of trades.filter((x) => x.buyer === id)) expect(t.price, 'never above the store’s ask').toBeLessThanOrEqual(ask);
  expect(me.stock[good]).toBe(units(trades, id));
  expect(me.money).toBe(money - paid(trades, id));
  expect(me.money).toBeGreaterThanOrEqual(0);
}

/** A short seat with less money than one unit at the store's ask: it buys nothing, the good closes, its money stands. */
function cannotPay(good: Good): void {
  const id = 'ai0';
  const state = auctionOf(good, shortOf(good, id, MONEY, 0));
  const money = state.auction!.storeSell - 1;
  state.players.find((p) => p.id === id)!.money = money;

  const trades = play(state);

  expect(['close', 'over'], 'the good closed').toContain(state.auction!.stage);
  expect(units(trades, id)).toBe(0);
  expect(state.players.find((p) => p.id === id)!.money).toBe(money);
}

/** A seat holding exactly what keeps it whole, beside a short rival with money: it sells none, so it stays whole. */
function keepsWhole(good: 'food' | 'energy', id: string): GameState {
  const whole = good === 'food' ? wholeFood : wholeEnergy;
  const state = auctionOf(good, (s) => {
    shortOf(good, id, MONEY, (t) => whole(t, id))(s);
    shortOf(good, RIVAL(id), MONEY)(s);
  });
  const held = state.players.find((p) => p.id === id)!.stock[good];
  expect(held, 'the premise: it holds what keeps it whole, more than the screen’s need').toBeGreaterThan(monthNeeds(state, id)[good]);

  const trades = play(state);

  expect(sold(trades, id), 'it sold none of what keeps it whole').toEqual([]);
  return state;
}

describe('B-AC-food-short: a seat short of Food buys from the store when it can pay', () => {
  it.each(ROWS)('B-AC-food-short: %s (%s) with three plots, no Food and 3,000 cr buys at the store’s price and starts next month fed', (id) => {
    const state = auctionOf('food', shortOf('food', id!, MONEY));
    const ask = state.auction!.storeSell;

    const trades = play(state);
    boughtFairly(state, trades, id!, ask, 0, MONEY);
    playOn(state, 'development');

    expect(state.players.find((p) => p.id === id)!.hungry, `${id} starts next month's development fed`).toBe(false);
  });

  it.each(ROWS)('B-AC-food-short: %s (%s) holding exactly what keeps it whole sells none to a short rival and starts next month fed', (id) => {
    const state = keepsWhole('food', id!);
    playOn(state, 'development');

    expect(state.players.find((p) => p.id === id)!.hungry, `${id} starts next month's development fed`).toBe(false);
  });

  it('B-AC-food-short: a seat that can pay for part of its shortfall buys what it can and never goes negative', () => buysWhatItCan('food'));

  it('B-AC-food-short: with one unit in the store and a rival asking more, a short seat buys the store’s unit and pays no rival over the store’s ask', () => buysWhatItCan('food', true));

  it('B-AC-food-short: a short seat with less than one unit’s price passes, and its money stands', () => cannotPay('food'));

  it('B-AC-food-short: with no Food for sale at the store, a short seat pays a rival no more than its own value, as before the ruling', () => {
    // The store's shelf is down to the colonists' month; ai3 sells at a credit under the store's line.
    const id = 'ai0';
    const state = auctionOf(
      'food',
      (s) => {
        shortOf('food', id, MONEY)(s);
        s.players.find((p) => p.id === 'ai3')!.stock.food = 20;
      },
      0,
    );
    const under = state.auction!.storeSell - 1;

    const trades = play(state, { id: 'ai3', price: () => under });

    expect(units(trades, id), 'a Food unit is worth only the walking it keeps at pace, well under the store’s line').toBe(0);
    expect(state.players.find((p) => p.id === id)!.money).toBe(MONEY);
  });

  it('B-AC-food-short: with resale buying ruled out by its reserve, a short seat still buys up to what keeps it whole', () => {
    // trace-allow: below the boundary (R3c): the case needs resale values over the store's ask, which a played auction
    // reaches only by chance. The seat's own plan, with every unit worth twice the ask and its reserve set so that
    // buying past what keeps it whole would dip into it.
    const id = 'ai0';
    const state = auctionOf('food', shortOf('food', id, MONEY));
    const seat = seatOf(0);
    const obs = observe(state, id);
    const plan = goodPlan(obs, seat.mind, 'food');
    const ask = state.auction!.storeSell;
    const whole = wholeFood(state, id);
    expect(plan.mustHold).toBe(whole);
    plan.values.buy = plan.values.buy.map(() => 2 * ask);
    plan.values.block = 1;
    plan.budget = MONEY;
    plan.reserve = MONEY - whole * ask;

    const options = tradeDecision(obs, seat.mind, plan).options;

    expect(options.map((c) => c.action)).toEqual([{ side: 'buyer', upTo: whole }]);
  });
});

describe('B-AC-energy-short: a seat short of Energy buys from the store when it can pay', () => {
  it.each(ROWS)('B-AC-energy-short: %s (%s) with three farms, 1 Energy and 3,000 cr buys at the store’s price and no farm goes half next month', (id) => {
    const state = auctionOf('energy', shortOf('energy', id!, MONEY));
    const ask = state.auction!.storeSell;

    const trades = play(state);
    boughtFairly(state, trades, id!, ask, 1, MONEY);
    playOn(state, 'production', true);

    expect(halvedFor(state, id!, 'noEnergy'), `${id}'s plots halved for Energy next month`).toBe(0);
  });

  it.each(ROWS)('B-AC-energy-short: %s (%s) holding exactly what keeps it whole sells none to a short rival and no farm goes half next month', (id) => {
    const state = keepsWhole('energy', id!);
    playOn(state, 'production', true);

    expect(halvedFor(state, id!, 'noEnergy'), `${id}'s plots halved for Energy next month`).toBe(0);
  });

  it('B-AC-energy-short: a seat whose own Energy plots cover the need on paper keeps its Energy and buys what upkeep would spoil', () => {
    // Two Energy plots and three farms: the forecast says its own plots make the need, so today it sells its 1 to 0.
    // ai1 is short of Energy with money to spare, so a sale is there to make.
    const id = 'ai0';
    const state = auctionOf('energy', (s) => {
      shortOf('energy', id, MONEY, 1, ['energy', 'energy', 'food', 'food', 'food'])(s);
      shortOf('energy', 'ai1', MONEY)(s);
    });
    const need = monthNeeds(state, id).energy;
    const ask = state.auction!.storeSell;

    const trades = play(state);
    boughtFairly(state, trades, id, ask, 1, MONEY);

    // Upkeep spoils a quarter of the Energy it holds; what is left must run next month's plots.
    const me = state.players.find((p) => p.id === id)!;
    expect(Math.floor(me.stock.energy * (1 - GOOD_CONFIG.energy.spoilage))).toBeGreaterThanOrEqual(need);
  });

  it('B-AC-energy-short: a seat that can pay for part of its shortfall buys what it can and never goes negative', () => buysWhatItCan('energy'));
});

describe('B-AC-water-short: a seat short of Water buys from the store when it can pay', () => {
  it.each(ROWS)('B-AC-water-short: %s (%s) with three farms, no Water and 3,000 cr buys at the store’s price and no farm goes half next month', (id) => {
    const state = auctionOf('water', shortOf('water', id!, MONEY));
    const ask = state.auction!.storeSell;

    const trades = play(state);
    boughtFairly(state, trades, id!, ask, 0, MONEY);
    playOn(state, 'production', true);

    expect(halvedFor(state, id!, 'noWater'), `${id}'s farms halved for Water next month`).toBe(0);
  });

  it('B-AC-water-short: a seat with no farm to water is not made to buy Water: going without costs it nothing', () => {
    // Seven Energy plots: its household drinks, but nothing of its goes half without Water.
    const id = 'ai0';
    const state = auctionOf('water', shortOf('water', id, MONEY, 0, Array<Outfit>(7).fill('energy')));
    expect(needsOf(state, id).water, 'the premise: it needs Water').toBeGreaterThan(0);

    const trades = play(state);

    expect(units(trades, id)).toBe(0);
    expect(state.players.find((p) => p.id === id)!.money).toBe(MONEY);
  });

  it('B-AC-water-short: a seat that can pay for part of its shortfall buys what it can and never goes negative', () => buysWhatItCan('water'));
});
