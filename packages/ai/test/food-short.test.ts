import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  createGame,
  monthNeeds,
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
 * Heiko's ruling of 5 Nov: an AI seat short of Food or Energy for next month buys it at the store's price when it can
 * afford it (Food first; Energy and Water joined the same day). Each row plays month 1's auction of the good through the engine with every seat's own hands, then reads
 * the seat's stock, money and receipts after the good closes.
 */

const SEATS: { persona: AiPersonaId; level: AiLevelId }[] = [
  { persona: 'trader', level: 'trader' },
  { persona: 'cautious', level: 'tycoon' },
  { persona: 'aggressive', level: 'rookie' },
  { persona: 'saboteur', level: 'tycoon' },
];
const SEED = 1;

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
 * The seat as the 5-game trace found it short, one arrangement per cause. Food: three Energy plots, so a unit is worth
 * only the walking it keeps at pace. Energy: two Energy plots and three farms, so its own plots' forecast covers the
 * need on paper and its units count at resale; it holds 1 of the 3 it needs, which today it sells. Water: seven Energy
 * plots and no farm to irrigate, so Water counts at resale. A seat with no land values Food past any price already.
 */
const PLOTS: Partial<Record<Good, Outfit[]>> = {
  food: ['energy', 'energy', 'energy'],
  energy: ['energy', 'energy', 'food', 'food', 'food'],
  water: ['energy', 'energy', 'energy', 'energy', 'energy', 'energy', 'energy'],
};
const HELD: Partial<Record<Good, number>> = { food: 0, energy: 1, water: 0 };

function shortOf(good: Good, id: string, money: number, held = HELD[good]!): (state: GameState) => void {
  return (state) => {
    const plots = state.tiles.filter((x) => x.terrain === 'plains' && !x.owner);
    PLOTS[good]!.forEach((outfit, i) => Object.assign(plots[i]!, { owner: id, outfit }));
    const me = state.players.find((p) => p.id === id)!;
    for (const g of ['food', 'energy', 'water'] as const) me.stock[g] = g === good ? held : monthNeeds(state, id)[g];
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

const paid = (trades: Trade[], id: string) => trades.filter((t) => t.buyer === id).reduce((n, t) => n + t.price * t.quantity, 0);
const units = (trades: Trade[], id: string) => trades.filter((t) => t.buyer === id).reduce((n, t) => n + t.quantity, 0);
const ROWS = SEATS.map((s, k) => [`ai${k}`, `${s.persona}/${s.level}`]);

/** The promise for `good`: a short seat with money to spare ends holding next month's need, bought at or under the store's ask. */
function buysItsShortfall(good: Good, id: string): void {
  const state = auctionOf(good, shortOf(good, id, 3_000));
  const need = monthNeeds(state, id)[good];
  const ask = state.auction!.storeSell;
  expect(need, 'the premise: it needs some').toBeGreaterThan(0);
  expect(need * ask, 'the premise: 3,000 cr pays the whole shortfall').toBeLessThan(3_000);
  expect(HELD[good]!, 'the premise: it is short').toBeLessThan(need);

  const trades = play(state);

  const me = state.players.find((p) => p.id === id)!;
  expect(me.stock[good], `${id} holds next month’s ${need} ${good}`).toBeGreaterThanOrEqual(need);
  expect(trades.filter((t) => t.seller === id), 'it sold none of what it needs').toEqual([]);
  expect(units(trades, id)).toBe(me.stock[good] - HELD[good]!);
  for (const t of trades.filter((x) => x.buyer === id)) expect(t.price, 'never above the store’s ask').toBeLessThanOrEqual(ask);
  expect(trades.some((t) => t.buyer === id && t.seller === STORE_ID), 'the store sold to it').toBe(true);
  expect(me.money, 'its money fell by what it paid').toBe(3_000 - paid(trades, id));
}

/** The negative row for `good`: a seat that can pay for two units of a larger shortfall buys two and never goes negative. */
function buysWhatItCan(good: Good): void {
  const id = 'ai0';
  // It comes to the good with money to spare, so the good comes up; its purse is cut once the store's ask is known.
  const state = auctionOf(good, shortOf(good, id, 3_000, 0));
  const ask = state.auction!.storeSell;
  const need = monthNeeds(state, id)[good];
  // Two units' price and half of a third: enough for 2 of the 3 or more it lacks.
  const money = 2 * ask + Math.floor(ask / 2);
  expect(need).toBeGreaterThan(2);
  state.players.find((p) => p.id === id)!.money = money;

  const trades = play(state);

  const me = state.players.find((p) => p.id === id)!;
  expect(units(trades, id), 'it bought the two units it could pay for').toBe(2);
  expect(me.stock[good]).toBe(2);
  expect(me.money).toBe(money - paid(trades, id));
  expect(me.money).toBeGreaterThanOrEqual(0);
}

describe('B-AC-food-short: a seat short of Food buys from the store when it can pay', () => {
  it.each(ROWS)('B-AC-food-short: %s (%s) with three plots, no Food and 3,000 cr ends the auction holding next month’s need', (id) => buysItsShortfall('food', id!));
  it('B-AC-food-short: a seat that can pay for part of its shortfall buys what it can and never goes negative', () => buysWhatItCan('food'));
});

describe('B-AC-energy-short: a seat short of Energy buys from the store when it can pay', () => {
  it.each(ROWS)('B-AC-energy-short: %s (%s) with its own Energy plots, 1 Energy and 3,000 cr ends the auction holding next month’s need', (id) => buysItsShortfall('energy', id!));
  it('B-AC-energy-short: a seat that can pay for part of its shortfall buys what it can and never goes negative', () => buysWhatItCan('energy'));
});

describe('B-AC-water-short: a seat short of Water buys from the store when it can pay', () => {
  it.each(ROWS)('B-AC-water-short: %s (%s) with no farm, no Water and 3,000 cr ends the auction holding next month’s need', (id) => buysItsShortfall('water', id!));
  it('B-AC-water-short: a seat that can pay for part of its shortfall buys what it can and never goes negative', () => buysWhatItCan('water'));
});
