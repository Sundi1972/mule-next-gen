import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  createGame,
  GOOD_CONFIG,
  monthNeeds,
  needsOf,
  startAuction,
  stepAuction,
  STORE_ID,
  UPKEEP,
  WALK,
  type AiLevelId,
  type AiPersonaId,
  type GameState,
  type Good,
  type Outfit,
  type Trade,
} from '@mule/engine';
import { applyAction } from '../src/play.js';
import { AiSeat } from '../src/seat.js';

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

/** Month 1's auction of `good`, the status screen up: the store's shelf holds the colonists' month and 40 more to sell. */
function auctionOf(good: Good, arrange: (state: GameState) => void): GameState {
  const state = createGame({ seed: SEED, players: SEATS.map((_, i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
  while (state.phase !== 'auction') advancePhase(state);
  state.store.stock[good] = (good === 'food' || good === 'water' ? Math.ceil(state.colonists / UPKEEP.colonistsPerUnit) : 0) + 40;
  // Nobody else is short: each other seat holds its need, so only the arranged seat has a reason to buy.
  for (const p of state.players) p.stock[good] = monthNeeds(state, p.id)[good];
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

function shortOf(good: Good, id: string, money: number, held = HELD[good]!, plots = PLOTS[good]!): (state: GameState) => void {
  return (state) => {
    const free = state.tiles.filter((x) => x.terrain === 'plains' && !x.owner);
    plots.forEach((outfit, i) => Object.assign(free[i]!, { owner: id, outfit }));
    const me = state.players.find((p) => p.id === id)!;
    for (const g of ['food', 'energy', 'water'] as const) me.stock[g] = g === good ? held : 2 * (monthNeeds(state, id)[g] + 2);
    me.money = money;
  };
}

/** Plays the good that is up to its close with every seat's own hands; returns the trades. */
function play(state: GameState): Trade[] {
  const good = state.auction!.good;
  const seats = SEATS.map((s, i) => new AiSeat({ id: `ai${i}`, name: `AI ${i + 1}`, ...s, seed: SEED * 10 + i }));
  const trades: Trade[] = [];
  for (let tick = 0; tick < 20_000; tick++) {
    const a = state.auction!;
    if (a.good !== good || a.stage === 'close' || a.stage === 'over') break;
    for (const s of seats) s.auctionTick(state, WALK.tickMs, (x) => applyAction(state, s.id, x));
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
const ROWS = SEATS.map((s, k) => [`ai${k}`, `${s.persona}/${s.level}`]);

/** The auction's half of the promise: it bought at or under the store's ask, from the store too, sold none, and paid it. */
function boughtFairly(state: GameState, trades: Trade[], id: string, ask: number, held: number, money: number): void {
  const me = state.players.find((p) => p.id === id)!;
  expect(units(trades, id), 'it bought').toBeGreaterThan(0);
  expect(trades.filter((t) => t.seller === id), 'it sold none of what it needs').toEqual([]);
  expect(units(trades, id)).toBe(me.stock[state.auction!.good!] - held);
  for (const t of trades.filter((x) => x.buyer === id)) expect(t.price, 'never above the store’s ask').toBeLessThanOrEqual(ask);
  expect(trades.some((t) => t.buyer === id && t.seller === STORE_ID), 'the store sold to it').toBe(true);
  expect(me.money, 'its money fell by what it paid').toBe(money - paid(trades, id));
}

/** The negative row for `good`: a seat that can pay for two units of a larger shortfall buys two and never goes negative. */
function buysWhatItCan(good: Good): void {
  const id = 'ai0';
  // It comes to the good with money to spare, so the good comes up; its purse is cut once the store's ask is known.
  const state = auctionOf(good, shortOf(good, id, MONEY, 0));
  const ask = state.auction!.storeSell;
  // Two units' price and half of a third: enough for 2 of the 3 or more it lacks.
  const money = 2 * ask + Math.floor(ask / 2);
  expect(monthNeeds(state, id)[good] + (good === 'energy' ? 0 : 1), 'the premise: it lacks 3 or more (Food and Water: the need upkeep takes, and one or more to keep)').toBeGreaterThan(2);
  state.players.find((p) => p.id === id)!.money = money;

  const trades = play(state);

  const me = state.players.find((p) => p.id === id)!;
  expect(units(trades, id), 'it bought the two units it could pay for').toBe(2);
  expect(me.stock[good]).toBe(2);
  expect(me.money).toBe(money - paid(trades, id));
  expect(me.money).toBeGreaterThanOrEqual(0);
}

describe('B-AC-food-short: a seat short of Food buys from the store when it can pay', () => {
  it.each(ROWS)('B-AC-food-short: %s (%s) with three plots, no Food and 3,000 cr buys at the store’s price and starts next month fed', (id) => {
    const state = auctionOf('food', shortOf('food', id!, MONEY));
    const ask = state.auction!.storeSell;

    const trades = play(state);
    boughtFairly(state, trades, id!, ask, 0, MONEY);
    playOn(state, 'development');

    const me = state.players.find((p) => p.id === id)!;
    expect(me.hungry, `${id} starts next month's development fed`).toBe(false);
  });

  it('B-AC-food-short: a seat that can pay for part of its shortfall buys what it can and never goes negative', () => buysWhatItCan('food'));
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

  it('B-AC-energy-short: a seat whose own Energy plots cover the need on paper keeps its Energy and buys what upkeep would spoil', () => {
    // Two Energy plots and three farms: the forecast says its own plots make the need, so today it sells its 1 to 0.
    const id = 'ai0';
    const state = auctionOf('energy', shortOf('energy', id, MONEY, 1, ['energy', 'energy', 'food', 'food', 'food']));
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
