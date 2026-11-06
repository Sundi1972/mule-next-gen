import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  advancePhase,
  AI_VALUE,
  createGame,
  GROWN_BASE,
  observe,
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
import { applyAction } from '../src/play.js';
import { AiSeat } from '../src/seat.js';
import { cashReserve } from '../src/value.js';
import { goodPlan, wholeNextMonth } from '../src/strategist.js';

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
const saved = { unit: AI_VALUE.unit, buyShortfall: STRATEGIST.buyShortfall };
beforeEach(() => {
  AI_VALUE.unit = true;
  STRATEGIST.buyShortfall = [];
});
afterEach(() => {
  AI_VALUE.unit = saved.unit;
  STRATEGIST.buyShortfall = saved.buyShortfall;
});

/** Three Smithore mines (use 2 each, make 3 at 100): a unit of Energy short keeps 0.8 × 3 × 100 ÷ 2 = 120 on. */
const MINES: Plot[] = [0, 2, 4].map((x) => ({ outfit: 'smithore', x, ground: { smithore: 3 } }));
/** Energy at 30 (ask 33): each needed unit gains about 3.6 credits per credit; a Food unit at its ask about 1. */
const POSTED = { smithore: 100, energy: 30, food: 30 };

describe('RULE-5: one cash shadow price across the month’s auctions', () => {
  it('T-AC-2: with money for its Energy and not its Food too, Food’s budget is under one unit and the Energy auction buys every needed unit', () => {
    const base: Seat = { plots: MINES, posted: POSTED, money: 0 };
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
