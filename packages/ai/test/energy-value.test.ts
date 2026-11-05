import { afterEach, describe, expect, it } from 'vitest';
import { advancePhase, createGame, GROWN_BASE, PRICE, STRATEGIST, stepAuction, WALK, type GameState, type Good, type Outfit, type Tile, type Trade } from '@mule/engine';
import { applyAction } from '../src/play.js';
import { AiSeat } from '../src/seat.js';

/**
 * AM-17 in the AI's Energy value: a unit short of covering its plots keeps on the plot the engine would turn off at
 * that point, so it is worth what that plot loses turned off, (1 − UPKEEP.offOutputShare) × its output × the good's
 * price after tax, spread over the plot's use. Plants' net output covers the plots that go off last; a factory the
 * stock can't feed runs last, so its units are covered last. Observed where the seat receives it: what it buys at the
 * Energy auction.
 */

const flatGround = { food: 0, water: 0, energy: 0, smithore: 0, crystite: 0, rareEarth: 0 };

/** PR #386's stopgap buys any shortfall at the store's ask; off here, so the seat's own Energy value decides. */
const savedShortfall = (STRATEGIST as Record<string, unknown>).buyShortfall;
afterEach(() => {
  if (savedShortfall === undefined) delete (STRATEGIST as Record<string, unknown>).buyShortfall;
  else Object.assign(STRATEGIST, { buyShortfall: savedShortfall });
});

interface Plot {
  outfit: Outfit;
  /** Column on row 0: plots two apart don't touch; one apart, a furnace beside its mine is fed (saves 1 Energy). */
  x: number;
  ground?: Partial<Tile['ground']>;
}

/** The store's Energy ask in every row: about 195 a unit. */
const ASK = 195;

/**
 * Month 1's auction. ai0 (Rookie: no look-ahead, so its prices are the store's posted ones, and nothing spoils) owns
 * the row's plots, all analysed, and holds `energy` Energy and no Smithore; nobody else holds Energy or money.
 */
function table(plots: Plot[], posted: Partial<Record<Good, number>>, energy: number, salesTax: number): GameState {
  const state = createGame({ seed: 7, players: ['ai0', 'ai1', 'ai2', 'ai3'].map((id) => ({ id, name: id, isAi: true, species: 'zipwing' as const })) });
  while (state.phase !== 'auction') advancePhase(state);
  for (const t of state.tiles) if (t.owner) Object.assign(t, { owner: null, outfit: null });
  const me = state.players.find((p) => p.id === 'ai0')!;
  for (const plot of plots) {
    const tile = state.tiles[plot.x]!;
    expect(tile.terrain).not.toBe('store');
    Object.assign(tile, { terrain: 'plains', traits: [], ground: { ...flatGround, ...plot.ground }, owner: 'ai0', outfit: plot.outfit, pollution: 0, runMonths: 0 } satisfies Partial<Tile>);
    delete tile.special;
    me.analysed.push(plot.x);
  }
  state.treasury.salesTax = salesTax;
  Object.assign(state.store.posted, posted);
  state.store.posted.energy = Math.round(ASK / (1 + PRICE.storeSpread));
  state.store.stock.energy = 20;
  for (const p of state.players) {
    p.stock.energy = p.id === 'ai0' ? energy : 0;
    p.stock.smithore = 0;
    p.money = p.id === 'ai0' ? 5000 : 0;
  }
  return state;
}

/** Plays the auction with every seat's own hands; returns the Energy ai0 bought. */
function boughtAt(state: GameState): number {
  const seats = state.players.map((p, i) => new AiSeat({ id: p.id, name: p.name, persona: 'cautious', level: i === 0 ? 'rookie' : 'trader', seed: 70 + i }));
  const trades: Trade[] = [];
  let ask: number | null = null;
  for (let i = 0; i < 60_000 && state.auction && state.auction.stage !== 'over'; i++) {
    if (state.auction.good === 'energy') ask = state.auction.storeSell;
    for (const s of seats) s.auctionTick(state, WALK.tickMs, (x) => applyAction(state, s.id, x));
    trades.push(...stepAuction(state, WALK.tickMs));
  }
  // The arrangement held: the store sold Energy at about ASK.
  expect(Math.abs(ask! - ASK)).toBeLessThanOrEqual(2);
  return trades.filter((t) => t.good === 'energy' && t.buyer === 'ai0').reduce((n, t) => n + t.quantity, 0);
}

const MINE: Plot = { outfit: 'smithore', x: 0, ground: { smithore: 6 } };

describe('AM-17: the AI values Energy by the plot it keeps on', () => {
  const rows: { name: string; plots: Plot[]; posted: Partial<Record<Good, number>>; energy?: number; salesTax?: number; bought: number }[] = [
    {
      // Turned off the mine (6, use 2) loses 0.8 × 6 × 100 = 480, 240 a unit of its use: both units are worth the ask.
      name: 'the mine turned off loses 240 a unit of its use, more than the ask: it buys both units',
      plots: [MINE],
      posted: { smithore: 100 },
      bought: 2,
    },
    {
      name: 'at Smithore 50 the mine loses 240 in all but 120 a unit of its use, under the ask: it buys none',
      plots: [MINE],
      posted: { smithore: 50 },
      bought: 0,
    },
    {
      name: 'with a 25% sales tax a unit keeps on 240 × 0.75 = 180 of Smithore, under the ask: it buys none',
      plots: [MINE],
      posted: { smithore: 100 },
      salesTax: 0.25,
      bought: 0,
    },
    {
      // Order: the mine (use 2) first, the farm (use 1, worth 0.8 × 3 × 10 = 24) last. The plant (makes 2, uses 1) nets
      // 1, which covers the farm at the back; the 2 units short are the mine's, 240 each.
      name: 'a plant nets 1 and covers the cheap farm that goes off last; the 2 units short keep the mine on: it buys both',
      plots: [MINE, { outfit: 'food', x: 2, ground: { food: 3 - GROWN_BASE } }, { outfit: 'energy', x: 4 }],
      posted: { smithore: 100, food: 10 },
      bought: 2,
    },
    {
      // The furnace beside the mine holds no Smithore before production, so it waits for the second pass and its use
      // (2 less 1 for the feeder) is covered last: the 2 Energy held cover the mine; one more unit runs the furnace,
      // worth 0.8 × 2 × 200 = 320.
      name: 'a furnace fed by the mine runs in the second pass: its unit, covered last, is worth 320: it buys it',
      plots: [MINE, { outfit: 'alloy', x: 1 }],
      posted: { smithore: 100, alloy: 200 },
      energy: 2,
      bought: 1,
    },
  ];

  it.each(rows)('B-AC-energy-value: $name', ({ plots, posted, energy = 0, salesTax = 0, bought }) => {
    Object.assign(STRATEGIST, { buyShortfall: [] as Good[] });
    const state = table(plots, posted, energy, salesTax);

    expect(boughtAt(state)).toBe(bought);
    expect(state.players.find((p) => p.id === 'ai0')!.stock.energy).toBe(energy + bought);
  });
});
