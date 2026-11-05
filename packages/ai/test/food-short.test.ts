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
  type Trade,
} from '@mule/engine';
import { applyAction } from '../src/play.js';
import { AiSeat } from '../src/seat.js';

/**
 * Heiko's ruling of 5 Nov: an AI seat short of Food for next month buys it at the store's price when it can afford
 * it. Each row plays month 1's Food auction through the engine with every seat's own hands, then reads the seat's
 * Food, money and receipts after the good closes.
 */

const SEATS: { persona: AiPersonaId; level: AiLevelId }[] = [
  { persona: 'trader', level: 'trader' },
  { persona: 'cautious', level: 'tycoon' },
  { persona: 'aggressive', level: 'rookie' },
  { persona: 'saboteur', level: 'tycoon' },
];
const SEED = 1;

/** Month 1's Food auction, the status screen up: the store's shelf holds the colonists' month and 40 more to sell. */
function foodAuction(arrange: (state: GameState) => void): GameState {
  const state = createGame({ seed: SEED, players: SEATS.map((_, i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
  while (state.phase !== 'auction') advancePhase(state);
  state.store.stock.food = Math.ceil(state.colonists / UPKEEP.colonistsPerUnit) + 40;
  // Nobody else is short: each other seat holds its need, so only the arranged seat has a reason to buy.
  for (const p of state.players) p.stock.food = monthNeeds(state, p.id).food;
  arrange(state);
  startAuction(state, ['food']);
  expect(state.auction!.good).toBe('food');
  return state;
}

/**
 * The seat as the 12-month trace found it: three working plots of its own and no Food. A seat with no land values
 * Food past any price already, so the land is what makes the shortfall a choice.
 */
function shortOfFood(state: GameState, id: string, money: number): void {
  for (const t of state.tiles.filter((x) => x.terrain === 'plains' && !x.owner).slice(0, 3)) Object.assign(t, { owner: id, outfit: 'energy' });
  const me = state.players.find((p) => p.id === id)!;
  me.stock.food = 0;
  me.money = money;
}

/** Plays the Food auction to its close with every seat's own hands; returns the trades. */
function playFood(state: GameState): Trade[] {
  const seats = SEATS.map((s, i) => new AiSeat({ id: `ai${i}`, name: `AI ${i + 1}`, ...s, seed: SEED * 10 + i }));
  const trades: Trade[] = [];
  for (let tick = 0; tick < 20_000; tick++) {
    const a = state.auction!;
    if (a.good !== 'food' || a.stage === 'close' || a.stage === 'over') break;
    for (const s of seats) s.auctionTick(state, WALK.tickMs, (x) => applyAction(state, s.id, x));
    trades.push(...stepAuction(state, WALK.tickMs));
  }
  return trades;
}

const paid = (trades: Trade[], id: string) => trades.filter((t) => t.buyer === id).reduce((n, t) => n + t.price * t.quantity, 0);
const units = (trades: Trade[], id: string) => trades.filter((t) => t.buyer === id).reduce((n, t) => n + t.quantity, 0);

describe('B-AC-food-short: a seat short of Food buys from the store when it can pay', () => {
  it.each(SEATS.map((s, k) => [`ai${k}`, `${s.persona}/${s.level}`]))('B-AC-food-short: %s (%s) with three plots, no Food and 3,000 cr ends the auction holding next month’s need', (id) => {
    const state = foodAuction((s) => shortOfFood(s, id, 3_000));
    const need = monthNeeds(state, id).food;
    const ask = state.auction!.storeSell;
    expect(need * ask, 'the premise: 3,000 cr pays the whole shortfall').toBeLessThan(3_000);

    const trades = playFood(state);

    const me = state.players.find((p) => p.id === id)!;
    expect(me.stock.food, `${id} holds next month’s ${need} Food`).toBeGreaterThanOrEqual(need);
    expect(units(trades, id)).toBe(me.stock.food);
    for (const t of trades.filter((x) => x.buyer === id)) expect(t.price, 'never above the store’s ask').toBeLessThanOrEqual(ask);
    expect(trades.some((t) => t.buyer === id && t.seller === STORE_ID), 'the store sold to it').toBe(true);
    expect(me.money, 'its money fell by what it paid').toBe(3_000 - paid(trades, id));
  });

  it('B-AC-food-short: a seat that can pay for part of its shortfall buys what it can and never goes negative', () => {
    const id = 'ai0';
    // It comes to the good with money to spare, so the Food comes up; its purse is cut once the store's ask is known.
    const state = foodAuction((s) => shortOfFood(s, id, 3_000));
    const ask = state.auction!.storeSell;
    const need = monthNeeds(state, id).food;
    // Two units' price and half of a third: enough for 2 of the 3 or more it lacks.
    const money = 2 * ask + Math.floor(ask / 2);
    expect(need).toBeGreaterThan(2);
    state.players.find((p) => p.id === id)!.money = money;

    const trades = playFood(state);

    const me = state.players.find((p) => p.id === id)!;
    expect(units(trades, id), 'it bought the two units it could pay for').toBe(2);
    expect(me.stock.food).toBe(2);
    expect(me.money).toBe(money - paid(trades, id));
    expect(me.money).toBeGreaterThanOrEqual(0);
  });
});
