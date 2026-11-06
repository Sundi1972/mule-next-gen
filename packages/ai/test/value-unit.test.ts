import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  advancePhase,
  AI_VALUE,
  createGame,
  FACTORY,
  GOOD_CONFIG,
  GROWN_BASE,
  needsOf,
  observe,
  PRICE,
  UPKEEP,
  type GameState,
  type Good,
  type Outfit,
  type Tile,
} from '@mule/engine';
import { outlook, type Outlook } from '../src/outlook.js';
import { AiSeat } from '../src/seat.js';
import { wholeNextMonth } from '../src/strategist.js';
import { shortCosts, unitNeed, unitValues, type Mind, type UnitValues } from '../src/value.js';

/**
 * The resource-utility model's rule rows, on the pure functions: a unit's value is the chance it is needed times what
 * going without it costs, plus the rest times what it fetches later. Every row runs with the model switched on.
 */

const flatGround = { food: 0, water: 0, energy: 0, smithore: 0, crystite: 0, rareEarth: 0 };

interface Plot {
  outfit: Outfit;
  /** Column on row 0: plots two apart don't touch, so no feeder saving, park or cluster bonus. */
  x: number;
  ground?: Partial<Tile['ground']>;
  runMonths?: number;
}

interface Table {
  plots: Plot[];
  posted?: Partial<Record<Good, number>>;
  stock?: Partial<Record<Good, number>>;
}

/** Month 1's auction, nobody owning land but ai0, which owns the row's plots and holds `stock`; no sales tax. */
function table({ plots, posted = {}, stock = {} }: Table): GameState {
  const state = createGame({ seed: 7, players: ['ai0', 'ai1', 'ai2', 'ai3'].map((id) => ({ id, name: id, isAi: true })) });
  while (state.phase !== 'auction') advancePhase(state);
  for (const t of state.tiles) if (t.owner) Object.assign(t, { owner: null, outfit: null });
  const me = state.players.find((p) => p.id === 'ai0')!;
  for (const plot of plots) {
    const tile = state.tiles[plot.x]!;
    expect(tile.terrain).not.toBe('store');
    Object.assign(tile, { terrain: 'plains', traits: [], ground: { ...flatGround, ...plot.ground }, owner: 'ai0', outfit: plot.outfit, pollution: 0, runMonths: plot.runMonths ?? 0 } satisfies Partial<Tile>);
    delete tile.special;
    me.analysed.push(plot.x);
  }
  state.treasury.salesTax = 0;
  Object.assign(state.store.posted, posted);
  for (const good of Object.keys(me.stock) as Good[]) me.stock[good] = stock[good] ?? 0;
  me.money = 5000;
  return state;
}

const mindOf = (persona: 'trader' | 'cautious' = 'trader'): Mind => new AiSeat({ id: 'ai0', name: 'ai0', persona, level: 'trader', seed: 70 }).mind;

/** The seat's view, and an outlook at today's posted prices, so every belief in a row is the price the row posts. */
function view(state: GameState): { obs: GameState; o: Outlook } {
  const obs = observe(state, 'ai0');
  return { obs, o: outlook(obs, 'ai0', { lookAhead: false }) };
}

/** keep and buy never rise with k. */
function nonIncreasing(v: UnitValues): void {
  for (let k = 1; k < v.keep.length; k++) expect(v.keep[k], `keep[${k}]`).toBeLessThanOrEqual(v.keep[k - 1]!);
  for (let k = 1; k < v.buy.length; k++) expect(v.buy[k], `buy[${k}]`).toBeLessThanOrEqual(v.buy[k - 1]!);
}

/** Turned off, a plot makes UPKEEP.offOutputShare of its output: going without its Energy loses the rest. */
const lost = (units: number, price: number) => (1 - UPKEEP.offOutputShare) * units * price;

const saved = { unit: AI_VALUE.unit, spoilage: GOOD_CONFIG.energy.spoilage };
beforeEach(() => {
  AI_VALUE.unit = true;
});
afterEach(() => {
  AI_VALUE.unit = saved.unit;
  GOOD_CONFIG.energy.spoilage = saved.spoilage;
});

describe('RULE-2: what going without a unit costs', () => {
  // A furnace (use 2, makes 2 Alloy at 200, fed 2 Smithore) and two farms (use 1, make 3 Food at 100), no plant:
  // energyOffOrder turns the furnace off first, then the farms. Energy is posted at 20, so buying a unit back is 22.
  const FURNACE: Plot = { outfit: 'alloy', x: 0, runMonths: FACTORY.experienceMonths };
  const FARMS: Plot[] = [
    { outfit: 'food', x: 2, ground: { food: 3 - GROWN_BASE } },
    { outfit: 'food', x: 4, ground: { food: 3 - GROWN_BASE } },
  ];
  const posted = { energy: 20, food: 100, alloy: 200 };
  const replace = 20 * (1 + PRICE.storeSpread) * AI_VALUE.shortFloorMarkup;

  it("T-AC-6: S(k) follows energyOffOrder's turn-off order: the furnace's two units, then a farm's", () => {
    // The spec's example counts no spoilage: 4 units short, one per unit of the plots' use.
    GOOD_CONFIG.energy.spoilage = 0;
    const { obs, o } = view(table({ plots: [FURNACE, ...FARMS], posted, stock: { smithore: 2 } }));
    const target = wholeNextMonth(obs, 'ai0', 'energy');
    expect(target, 'the premise: the plots use 4').toBe(4);

    const S = shortCosts(obs, o, 'energy', mindOf(), target);

    expect(S).toEqual([lost(2, 200), lost(2, 200), lost(3, 100), lost(3, 100)]);
  });

  it('T-AC-6: with spoilage, every unit of the target keeps a plot on: the furnace first, a farm last', () => {
    const { obs, o } = view(table({ plots: [FURNACE, ...FARMS], posted, stock: { smithore: 2 } }));
    const target = wholeNextMonth(obs, 'ai0', 'energy');
    expect(target, 'the premise: spoilage raises the target over the use of 4').toBeGreaterThan(4);

    const S = shortCosts(obs, o, 'energy', mindOf(), target);

    expect(S.slice(0, 2)).toEqual([lost(2, 200), lost(2, 200)]);
    expect(S.at(-1)).toBe(lost(3, 100));
    for (const s of S) expect([lost(2, 200), lost(3, 100)]).toContain(s);
  });

  it('T-AC-6: a furnace short of its experience misses the experience month as well', () => {
    GOOD_CONFIG.energy.spoilage = 0;
    const { obs, o } = view(table({ plots: [{ ...FURNACE, runMonths: 0 }, ...FARMS], posted, stock: { smithore: 2 } }));

    const S = shortCosts(obs, o, 'energy', mindOf(), 4);

    expect(S.slice(0, 2)).toEqual([lost(2, 200) + FACTORY.experienceBonus * 200, lost(2, 200) + FACTORY.experienceBonus * 200]);
  });

  it('T-AC-6: a plot worth less turned off than buying the unit back is valued at the buy-back price', () => {
    GOOD_CONFIG.energy.spoilage = 0;
    // Food at 5: a farm loses 0.8 × 3 × 5 = 12 turned off, under the 22 a unit costs to buy back.
    const { obs, o } = view(table({ plots: FARMS, posted: { ...posted, food: 5 } }));

    expect(shortCosts(obs, o, 'energy', mindOf(), 2)).toEqual([replace, replace]);
  });

  it('T-AC-6 negative: no plot needs Energy, so S is the buy-back price alone', () => {
    const { obs, o } = view(table({ plots: [{ outfit: 'energy', x: 0 }], posted }));

    expect(shortCosts(obs, o, 'energy', mindOf(), 3)).toEqual([replace, replace, replace]);
  });

  it('T-AC-6: with the store selling none, S is the damage alone, with no buy-back floor', () => {
    GOOD_CONFIG.energy.spoilage = 0;
    const state = table({ plots: FARMS, posted: { ...posted, food: 5 } });
    state.store.stock.energy = 0;
    const { obs, o } = view(state);

    expect(shortCosts(obs, o, 'energy', mindOf(), 2)).toEqual([lost(3, 5), lost(3, 5)]);
  });

  it('T-AC-6: unitValues keeps every unit of the target at S or more, and keep and buy never rise with k', () => {
    const { obs, o } = view(table({ plots: [FURNACE, ...FARMS], posted, stock: { smithore: 2 } }));
    const mind = mindOf();
    const target = wholeNextMonth(obs, 'ai0', 'energy');
    const S = shortCosts(obs, o, 'energy', mind, target);

    const v = unitValues(obs, o, 'energy', mind);

    nonIncreasing(v);
    for (let k = 0; k < target; k++) expect(v.keep[k], `keep[${k}] is never below S(${k})`).toBeGreaterThanOrEqual(S[k]!);
    expect(v.block).toBe(target);
  });
});

describe('RULE-3: the chance the seat needs the k-th unit', () => {
  it('T-AC-3: the Food target covers spoilage, eat + ⌈eat / keep⌉, and every unit of it is needed', () => {
    const { obs, o } = view(table({ plots: [{ outfit: 'energy', x: 0 }], posted: { food: 72 } }));
    const mind = mindOf();
    const target = wholeNextMonth(obs, 'ai0', 'food');
    const eat = needsOf(obs, 'ai0').food;
    expect(target, 'the target covers what spoils before next development').toBeGreaterThan(eat);

    expect(unitNeed(obs, mind, 'food')).toEqual({ sure: target, target });
    const v = unitValues(obs, o, 'food', mind);
    const S = shortCosts(obs, o, 'food', mind, target + 1);

    nonIncreasing(v);
    for (let k = 0; k < target; k++) expect(v.buy[k], `buy[${k}]: needed, so worth S at least`).toBeGreaterThanOrEqual(S[k]!);
    // The store sells Food at 72 × (1 + spread): a needed unit is worth at least that, so the seat buys it there.
    expect(v.buy[target - 1]).toBeGreaterThanOrEqual(72 * (1 + PRICE.storeSpread));
    expect(v.buy[target], 'past the target a unit is only carry').toBeLessThan(72);
  });

  it("T-AC-3: an Energy seat whose plant nets 8 for a use of 8 keeps its 2: the forecast's units keep a share of S", () => {
    // Four mines (use 2 each) and a plant making 9 for its own use of 1. No unit is needed for sure, but the target
    // stays what keeps the plots whole without the forecast.
    const mines = [0, 2, 4, 6].map((x): Plot => ({ outfit: 'smithore', x, ground: { smithore: 3 } }));
    const plant: Plot = { outfit: 'energy', x: 8, ground: { energy: 9 - GROWN_BASE } };
    const { obs, o } = view(table({ plots: [...mines, plant], posted: { energy: 20, smithore: 100 }, stock: { energy: 2 } }));
    const mind = mindOf();
    const target = wholeNextMonth(obs, 'ai0', 'energy');
    expect(target, 'the premise: ⌈8 / keep⌉').toBe(Math.ceil(8 / (1 - GOOD_CONFIG.energy.spoilage)));

    expect(unitNeed(obs, mind, 'energy')).toEqual({ sure: 0, target });
    const v = unitValues(obs, o, 'energy', mind);
    const S = shortCosts(obs, o, 'energy', mind, target);
    const q = Math.min(1, AI_VALUE.forecastRisk * mind.persona.risk);

    nonIncreasing(v);
    for (let k = 0; k < target; k++) expect(v.keep[k], `keep[${k}] holds q × S`).toBeGreaterThanOrEqual(q * S[k]!);
    // Selling to the store would fetch under a unit's share of what its mine loses turned off.
    expect(v.keep[1]).toBeGreaterThan(20);
    expect(v.floorUnits, 'nothing is needed for sure, so nothing is fenced off').toBe(0);
  });

  it('T-AC-3 negative: a seat with no plots needs no Energy, and values none above what it fetches', () => {
    const { obs, o } = view(table({ plots: [], posted: { energy: 20 } }));
    const mind = mindOf();

    expect(unitNeed(obs, mind, 'energy')).toEqual({ sure: 0, target: 0 });
    const v = unitValues(obs, o, 'energy', mind);

    expect(v.buy[0], "under the store's ask: it buys none").toBeLessThan(20 * (1 + PRICE.storeSpread));
    expect(v.block).toBe(0);
  });
});
