import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  advancePhase,
  AI_VALUE,
  createGame,
  FACTORY,
  GOOD_CONFIG,
  GROWN_BASE,
  monthNeeds,
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
import { goodPlan, tradeDecision, wholeNextMonth } from '../src/strategist.js';
import { cashPlan, monthlyNet, shortCosts, unitNeed, unitValues, yieldOf, type Mind, type UnitValues } from '../src/value.js';

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
  // The store sells plenty of every good the seat lives on, past the colonists' own month.
  for (const good of ['food', 'water', 'energy'] as const) state.store.stock[good] = 200;
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

/**
 * Turned off, a plot makes UPKEEP.offOutputShare of its output: going without its Energy loses the rest, spread over
 * the plot's use, since only all of its units together keep it on.
 */
const lost = (units: number, price: number, use: number) => ((1 - UPKEEP.offOutputShare) * units * price) / use;

const saved = { unit: AI_VALUE.unit, holdMonths: AI_VALUE.holdMonths, spoilage: GOOD_CONFIG.energy.spoilage };
beforeEach(() => {
  AI_VALUE.unit = true;
});
afterEach(() => {
  AI_VALUE.unit = saved.unit;
  AI_VALUE.holdMonths = saved.holdMonths;
  GOOD_CONFIG.energy.spoilage = saved.spoilage;
});

describe('RULE-2: what going without a unit costs', () => {
  // A furnace (use 2, experienced, so it makes 2 + 1 Alloy at 200, fed 2 Smithore) and two farms (use 1, make 3 Food
  // at 80), no plant:
  // energyOffOrder turns the furnace off first, then the farms. Energy is posted at 20: buying a unit back costs little.
  const FURNACE: Plot = { outfit: 'alloy', x: 0, runMonths: FACTORY.experienceMonths };
  const FARMS: Plot[] = [
    { outfit: 'food', x: 2, ground: { food: 3 - GROWN_BASE } },
    { outfit: 'food', x: 4, ground: { food: 3 - GROWN_BASE } },
  ];
  const posted = { energy: 20, food: 80, alloy: 200 };
  const made = 2 + FACTORY.experienceBonus;
  const replace = 20 * (1 + PRICE.storeSpread) * AI_VALUE.shortFloorMarkup;

  it("T-AC-6: S(k) follows energyOffOrder's turn-off order: the furnace's two units at half its loss each, then a farm's", () => {
    // The spec's example counts no spoilage: 4 units short, one per unit of the plots' use.
    GOOD_CONFIG.energy.spoilage = 0;
    const { obs, o } = view(table({ plots: [FURNACE, ...FARMS], posted, stock: { smithore: 2 } }));
    const target = wholeNextMonth(obs, 'ai0', 'energy');
    expect(target, 'the premise: the plots use 4').toBe(4);

    const S = shortCosts(obs, o, 'energy', mindOf(), target);

    expect(S).toEqual([lost(made, 200, 2), lost(made, 200, 2), lost(3, 80, 1), lost(3, 80, 1)]);
  });

  it('T-AC-6: with spoilage, each held unit covers the share of a unit of use that survives: the furnace first, a farm last', () => {
    const { obs, o } = view(table({ plots: [FURNACE, ...FARMS], posted, stock: { smithore: 2 } }));
    const target = wholeNextMonth(obs, 'ai0', 'energy');
    expect(target, 'the premise: spoilage raises the target over the use of 4').toBeGreaterThan(4);
    const keep = 1 - GOOD_CONFIG.energy.spoilage;

    const S = shortCosts(obs, o, 'energy', mindOf(), target);

    expect(S.slice(0, 2)).toEqual([lost(made, 200, 2) * keep, lost(made, 200, 2) * keep]);
    expect(S.at(-1)).toBe(lost(3, 80, 1) * keep);
    for (const s of S) expect([lost(made, 200, 2) * keep, lost(3, 80, 1) * keep]).toContain(s);
  });

  it('T-AC-6: a furnace short of its experience makes 2 and misses the experience month as well', () => {
    GOOD_CONFIG.energy.spoilage = 0;
    const { obs, o } = view(table({ plots: [{ ...FURNACE, runMonths: 0 }, ...FARMS], posted, stock: { smithore: 2 } }));

    const S = shortCosts(obs, o, 'energy', mindOf(), 4);

    const furnace = lost(2, 200, 2) + (FACTORY.experienceBonus * 200) / 2;
    expect(S.slice(0, 2)).toEqual([furnace, furnace]);
  });

  it('T-AC-6: a plot worth less turned off than buying the unit back is valued at the buy-back price', () => {
    GOOD_CONFIG.energy.spoilage = 0;
    // Food at 5: a farm loses 0.8 × 3 × 5 = 12 turned off, under what a unit of Energy costs to buy back.
    const { obs, o } = view(table({ plots: FARMS, posted: { ...posted, food: 5 } }));

    expect(shortCosts(obs, o, 'energy', mindOf(), 2)).toEqual([replace, replace]);
  });

  it("T-AC-6: a needed unit is never valued below the store's ask today, though the belief for next month is lower", () => {
    GOOD_CONFIG.energy.spoilage = 0;
    // Food at 5, so a farm loses little turned off; the belief says Energy will post at 10, under today's 20.
    const { obs, o } = view(table({ plots: FARMS, posted: { ...posted, food: 5 } }));
    const cheaper: Outlook = { ...o, price: (good) => (good === 'energy' ? 10 : o.price(good)) };
    const ask = Math.ceil(20 * (1 + PRICE.storeSpread));

    expect(shortCosts(obs, cheaper, 'energy', mindOf(), 2)).toEqual([ask, ask]);
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

    expect(shortCosts(obs, o, 'energy', mindOf(), 2)).toEqual([lost(3, 5, 1), lost(3, 5, 1)]);
  });

  it('T-AC-6: unitValues keeps every unit of the target at S or more, and keep and buy never rise with k', () => {
    const { obs, o } = view(table({ plots: [FURNACE, ...FARMS], posted, stock: { smithore: 2 } }));
    const mind = mindOf();
    const target = wholeNextMonth(obs, 'ai0', 'energy');
    const S = shortCosts(obs, o, 'energy', mind, target).sort((a, b) => b - a);

    const v = unitValues(obs, o, 'energy', mind);

    nonIncreasing(v);
    for (let k = 0; k < target; k++) expect(v.keep[k], `keep[${k}] is never below the k-th largest S`).toBeGreaterThanOrEqual(S[k]!);
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
    const S = shortCosts(obs, o, 'energy', mind, target).sort((a, b) => b - a);
    const q = Math.min(1, AI_VALUE.forecastRisk * mind.persona.risk);

    // RULE-4: what the store pays for a unit after the months it is held (no sales tax here).
    const carry = 20 * (1 - PRICE.storeSpread) * (1 - GOOD_CONFIG.energy.spoilage) ** AI_VALUE.holdMonths;

    nonIncreasing(v);
    const expected = S.map((s) => q * s + (1 - q) * carry).sort((a, b) => b - a);
    for (let k = 0; k < target; k++) expect(v.keep[k], `keep[${k}] is q × S + (1 − q) × carry`).toBeCloseTo(expected[k]!, 9);
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

describe('RULE-4: what an unneeded unit is worth', () => {
  /** A seat with no plots, so no unit is needed and each is worth its carry alone; Energy posted at 40, tax 8%. */
  function carryAt(spoilage: number, persona: 'trader' | 'cautious' = 'trader'): UnitValues {
    GOOD_CONFIG.energy.spoilage = spoilage;
    AI_VALUE.holdMonths = 1;
    const state = table({ plots: [], posted: { energy: 40 } });
    state.treasury.salesTax = 0.08;
    const { obs, o } = view(state);
    return unitValues(obs, o, 'energy', mindOf(persona));
  }

  it("T-AC-7: Ck at RULE-4's example is about 29.8, and a seat speculating less pays that share of it", () => {
    expect(PRICE.storeSpread, 'the premise: the example’s spread').toBe(0.1);
    // 40 × (1 − 0.1 spread) × (1 − 0.08 tax) × 0.9 kept a month = 29.808.
    const trader = carryAt(0.1);
    const cautious = carryAt(0.1, 'cautious');

    expect(trader.keep[0]).toBeCloseTo(29.808, 6);
    expect(trader.buy[0], 'speculate 1.4 counts as 1').toBeCloseTo(29.808, 6);
    expect(cautious.buy[0], 'speculate 0.3').toBeCloseTo(29.808 * 0.3, 6);
  });

  it("T-AC-7: held 0 months, a Food unit is worth 40 × 0.9 × 0.92 = 33.12 in unitValues' carry and as a farm's surplus in monthlyNet", () => {
    AI_VALUE.holdMonths = 0;
    // One plant, so the seat's walking time, and with it what going without Food costs, is finite.
    const state = table({ plots: [{ outfit: 'energy', x: 0 }], posted: { food: 40 } });
    state.treasury.salesTax = 0.08;
    const { obs, o } = view(state);
    const mind = mindOf();
    const target = wholeNextMonth(obs, 'ai0', 'food');
    // Past the target every unit the farm makes is surplus: the next one adds what it sells for.
    const farmMaking = (made: number) => monthlyNet(obs, o, { made, energy: 0, inputs: {}, air: 0, crew: 0 }, 'food', mind);

    expect(unitValues(obs, o, 'food', mind).keep[target], 'the first unit past the target').toBeCloseTo(33.12, 6);
    expect(farmMaking(target + 1) - farmMaking(target)).toBeCloseTo(33.12, 6);
  });

  it('T-AC-7 negative: a good that spoils fully carries nothing', () => {
    const v = carryAt(1);

    expect(v.keep[0]).toBe(0);
    expect(v.buy[0]).toBe(0);
  });
});

describe('C4: a pass that leaves a funded shortfall carries its cost', () => {
  // Three mines (use 2 each, make 3 Smithore at 100): each Energy unit short keeps 120 on; Energy asks 22.
  const mines = [0, 2, 4].map((x): Plot => ({ outfit: 'smithore', x, ground: { smithore: 3 } }));
  const shortlistOf = (money: number) => {
    const state = table({ plots: mines, posted: { smithore: 100, energy: 20 } });
    state.players.find((p) => p.id === 'ai0')!.money = money;
    const obs = observe(state, 'ai0');
    const mind = mindOf();
    return tradeDecision(obs, mind, goodPlan(obs, mind, 'energy')).all;
  };

  it("T-AC-5: short and funded, the pass candidate's gain is below the buy's, and nothing vetoes the pass", () => {
    const all = shortlistOf(5000);
    const pass = all.find((c) => c.key === 'pass')!;
    const buy = all.find((c) => c.key === 'buy' || c.key === 'buy:need')!;

    expect(pass.veto).toBeNull();
    expect(pass.value, 'the pass carries the shortfall it leaves').toBeLessThan(0);
    expect(pass.value).toBeLessThan(buy.value);
  });

  it("T-AC-5: with each needed unit worth exactly its ask, the pass gives up every funded unit's value", () => {
    // Two farms making 3 Food at 5: turned off one loses 12, under Energy's ask of 22, so each unit is worth the ask.
    const farms = [0, 2].map((x): Plot => ({ outfit: 'food', x, ground: { food: 3 - GROWN_BASE } }));
    const state = table({ plots: farms, posted: { food: 5, energy: 20 } });
    const obs = observe(state, 'ai0');
    const mind = mindOf();
    const plan = goodPlan(obs, mind, 'energy');
    const ask = Math.ceil(20 * (1 + PRICE.storeSpread));
    const target = wholeNextMonth(obs, 'ai0', 'energy');
    expect(plan.values.buy.slice(0, target), 'the premise: every needed unit is worth the ask').toEqual(Array(target).fill(ask));
    expect(plan.cash?.funded, 'the premise: the cash plan funds them all').toBe(target);

    const all = tradeDecision(obs, mind, plan).all;
    const pass = all.find((c) => c.key === 'pass')!;
    const buy = all.find((c) => c.key === 'buy' || c.key === 'buy:need')!;

    expect(pass.value, 'minus the value of every funded unit').toBe(-target * ask);
    expect(pass.veto).toBeNull();
    expect(buy.utility, 'the buy outranks the pass').toBeGreaterThan(pass.utility);
  });

  it('T-AC-5 negative: with less money than one unit, nothing is funded and the pass gains 0', () => {
    const pass = shortlistOf(10).find((c) => c.key === 'pass')!;

    expect(pass.value).toBe(0);
    expect(pass.veto).toBeNull();
  });
});

describe('RULE-5: the cash plan fills in rank order', () => {
  it("T-AC-2: a dear unit the money can't cover is skipped, and the cheaper needed units ranked after it are funded", () => {
    // Seed 1, month 5, ai3's Water: 311 cr, 2 Water needed at 188 each against an ask of 29, and a Medicine worth 5,000
    // at 400, ranked first and out of reach.
    const state = table({ plots: [] });
    state.players.find((p) => p.id === 'ai0')!.money = 311;
    const values = (good: Good, worth: number, units: number): UnitValues => ({ good, keep: Array(units).fill(worth), buy: Array(units).fill(worth), block: units, need: units, floorUnits: 0 });
    const valuesOf = (good: Good) => (good === 'water' ? values('water', 188, 2) : values('medicine', 5000, 1));
    const askOf = (good: Good) => (good === 'water' ? 29 : 400);

    const plan = cashPlan(observe(state, 'ai0'), mindOf(), ['water', 'medicine'], valuesOf, askOf);

    expect(plan.funded).toEqual({ water: 2 });
    expect(plan.cost).toEqual({ water: 58 });
    expect(plan.left).toBe(311 - 58);
    expect(plan.left, 'money never goes negative').toBeGreaterThanOrEqual(0);
  });

  it('T-AC-2: with a needed unit left unfunded, λ is what the last funded unit gains per credit', () => {
    // 50 cr: the first Water unit (188 at 29) fits, the second doesn't, nor the Medicine (5,000 at 400).
    const state = table({ plots: [] });
    state.players.find((p) => p.id === 'ai0')!.money = 50;
    const values = (good: Good, worth: number, units: number): UnitValues => ({ good, keep: Array(units).fill(worth), buy: Array(units).fill(worth), block: units, need: units, floorUnits: 0 });
    const valuesOf = (good: Good) => (good === 'water' ? values('water', 188, 2) : values('medicine', 5000, 1));

    const plan = cashPlan(observe(state, 'ai0'), mindOf(), ['water', 'medicine'], valuesOf, (good) => (good === 'water' ? 29 : 400));

    expect(plan.funded).toEqual({ water: 1 });
    expect(plan.lambda).toBeCloseTo(188 / 29 - 1, 9);
  });
});

describe('RULE-5: a unit past the target buys only above the shadow price', () => {
  // trace-allow: below the boundary: the shadow price comes from the month's other goods, which a built state reaches
  // only by chance; the seat's own plan, with λ set, is the rule's row.
  it('T-AC-2: a unit past the target is refused when what it gains per credit is no more than λ, and bought when more', () => {
    const mines = [0, 2, 4].map((x): Plot => ({ outfit: 'smithore', x, ground: { smithore: 3 } }));
    const state = table({ plots: mines, posted: { smithore: 100, energy: 20 } });
    const obs = observe(state, 'ai0');
    const mind = mindOf();
    const ask = Math.ceil(20 * (1 + PRICE.storeSpread));
    const upTo = (lambda: number) => {
      const plan = goodPlan(obs, mind, 'energy');
      // One unit past the target, worth 30: it gains (30 − 22) ÷ 22 ≈ 0.36 a credit.
      plan.values.buy[plan.values.block] = 30;
      plan.cash = { funded: plan.values.block, lambda };
      const buy = tradeDecision(obs, mind, plan).all.find((c) => c.key === 'buy')!.action;
      return buy.side === 'buyer' ? buy.upTo : -1;
    };
    const block = goodPlan(obs, mind, 'energy').values.block;
    expect((30 - ask) / ask, 'the premise').toBeCloseTo(0.364, 2);

    expect(upTo(0.5), 'λ 0.5: refused').toBe(block);
    expect(upTo(0.3), 'λ 0.3: bought').toBe(block + 1);
  });
});

describe("C8: a new plot's own-use units are worth what going short costs", () => {
  /** An idle plot at x 6 rated for Energy (a plant makes 4, uses 1) and Water; Energy and Water posted at 20. */
  const IDLE: Plot = { outfit: null as unknown as Outfit, x: 6, ground: { energy: 2, water: 2 } };
  const seatOf = (plots: Plot[], store: Partial<Record<Good, number>> = {}) => {
    const state = table({ plots: [...plots, IDLE], posted: { smithore: 100, energy: 20, water: 20, food: 40 } });
    Object.assign(state.store.stock, store);
    return { ...view(state), mind: mindOf() };
  };
  /** What the store pays for a unit posted at 20: what a unit the seat doesn't use earns (AM-6). */
  const storePays = 20 * (1 - PRICE.storeSpread);
  const netOf = (plots: Plot[], outfit: Outfit, store: Partial<Record<Good, number>> = {}) => {
    const { obs, o, mind } = seatOf(plots, store);
    return monthlyNet(obs, o, yieldOf(obs, obs.tiles[6]!, outfit, 'ai0'), outfit, mind);
  };

  it('T-AC-12 (C8): a plant beside plots short of Energy earns, over its sale, S − price for each unit they would go without', () => {
    const rich = [0, 2, 4].map((x): Plot => ({ outfit: 'smithore', x, ground: { smithore: 6 } }));
    // The mines use 6; the plant nets 3, each keeping a mine's unit on: 0.8 × 6 × 100 ÷ 2 = 240, sold to the store at 20 less its spread.
    const gain = netOf(rich, 'energy') - netOf([], 'energy');

    expect(gain).toBeCloseTo(3 * (lost(6, 100, 2) - storePays), 6);
  });

  it("T-AC-12 (C8) negative: a seat with no farm gains nothing from a well's drink units, whether the store sells Water or not", () => {
    expect(netOf([], 'water', { water: 200 })).toBeCloseTo(netOf([], 'water', { water: 0 }), 6);
  });

  it("T-AC-12 (C8): a seat with a farm counts a well's own-use units up to its Water target, spoilage cover included, not the screen need", () => {
    // A farm makes the seat drink 2 a month; holding 5 keeps it whole after spoilage. The well makes 4: all four are
    // its own use, each at S − price.
    const farm: Plot = { outfit: 'food', x: 0, ground: { food: 1 } };
    const { obs, o, mind } = seatOf([farm]);
    const target = unitNeed(obs, mind, 'water').target;
    const made = yieldOf(obs, obs.tiles[6]!, 'water', 'ai0').made;
    expect(target, 'the premise: the target covers spoilage over the screen need').toBeGreaterThan(monthNeeds(obs, 'ai0').water);
    expect(made, 'the premise: the well makes more than the screen need').toBeGreaterThan(monthNeeds(obs, 'ai0').water);
    const [S = 0] = shortCosts(obs, o, 'water', mind, 1);
    const own = Math.min(made, target);

    const gain = netOf([farm], 'water') - netOf([farm], 'water', { water: 0 });
    // With the store selling none, S has no floor; the damage alone is what its farm loses.
    const [bare = 0] = shortCosts(seatOf([farm], { water: 0 }).obs, seatOf([farm], { water: 0 }).o, 'water', mind, 1);

    expect(gain).toBeCloseTo(own * (Math.max(0, S - storePays) - Math.max(0, bare - storePays)), 6);
  });
});
