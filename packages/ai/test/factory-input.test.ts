import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  AI_LEVELS,
  AI_PERSONAS,
  createGame,
  observe,
  startAuction,
  stepAuction,
  WALK,
  type GameState,
  type Outfit,
  type Stock,
  type Tile,
} from '@mule/engine';
import { developDecision, goodPlan } from '../src/strategist.js';
import { applyAction } from '../src/play.js';
import { AiSeat } from '../src/seat.js';
import { outlook } from '../src/outlook.js';
import { canFeed, unitValues, type Mind } from '../src/value.js';

/**
 * A factory seat keeps its factory fed (PM ruling of 6 Nov, options 3 and 1, buy side only):
 * - it does not count on a farm to feed a new factory when the farm makes nothing, or only what its household eats;
 * - a seat whose factory run is worth more than its inputs bids for the input Food at a worthwhile ask, rather than
 *   letting its household's low walking value average the run's share down, so the factory runs next month.
 * Heiko's 5 Nov "sell surplus" stands: what a seat keeps of Food, Water and Energy, and its sell floor, do not move.
 */

const ME = 'ai0';
const flatGround = { food: 0, water: 0, energy: 0, smithore: 0, crystite: 0, rareEarth: 0 };

const mindOf = (level: 'trader' | 'rookie' = 'trader'): Mind => ({ me: ME, personaId: 'trader', persona: AI_PERSONAS.trader, levelId: level, level: AI_LEVELS[level] });

/** Clears every plot and places ai0's plots on the given columns of row 0, on flat plains. */
function place(state: GameState, plots: { x: number; outfit: Outfit | null; food?: number }[]): void {
  for (const t of state.tiles) if (t.owner) Object.assign(t, { owner: null, outfit: null });
  const me = state.players.find((p) => p.id === ME)!;
  for (const plot of plots) {
    const tile = state.tiles[plot.x]!;
    expect(tile.terrain).not.toBe('store');
    Object.assign(tile, { terrain: 'plains', traits: [], ground: { ...flatGround, food: plot.food ?? 0 }, owner: ME, outfit: plot.outfit, pollution: 0, runMonths: 0 } satisfies Partial<Tile>);
    delete tile.special;
    if (!me.analysed.includes(plot.x)) me.analysed.push(plot.x);
  }
}

function game(): GameState {
  return createGame({ seed: 7, players: ['ai0', 'ai1', 'ai2', 'ai3'].map((id) => ({ id, name: id, isAi: true, species: 'zipwing' as const })) });
}

function setStock(state: GameState, id: string, stock: Partial<Stock>, money: number): void {
  const p = state.players.find((q) => q.id === id)!;
  for (const k of Object.keys(p.stock) as (keyof Stock)[]) p.stock[k] = 0;
  Object.assign(p.stock, stock);
  p.money = money;
}

describe('a farm feeds a new factory only with what is left after the household eats (FM-factory-input, option 3)', () => {
  /** Development: ai0 owns a farm on column 0 (a plot rating `food` over the grown base) and an idle plot on column 2. */
  function develop(food: number, stock: Partial<Stock>, farmMakes: number): string | null | undefined {
    const state = game();
    while (state.phase !== 'development') advancePhase(state);
    place(state, [
      { x: 0, outfit: 'food', food },
      { x: 2, outfit: null },
    ]);
    for (const p of state.players) setStock(state, p.id, p.id === ME ? stock : {}, p.id === ME ? 5000 : 0);
    // The arrangement: what the farm makes at this month's production, on a copy of what the seat sees.
    expect(outlook(observe(state, ME), ME, { lookAhead: true }).made.food, 'the farm makes').toBe(farmMakes);
    const list = developDecision(observe(state, ME), mindOf(), 0);
    const medicine = list.all.find((c) => c.key === 'install:medicine:2');
    expect(medicine, 'a Medicine install on the idle plot is listed').toBeDefined();
    return medicine!.veto;
  }

  it('FM-factory-input-3a: a farm that makes nothing (no Energy, so it is turned off) does not feed a new Medicine factory', () => {
    // The farm (2 a month on flat ground) is turned off without Energy and makes 20% of 2, which rounds to 0.
    expect(develop(0, { water: 10 }, 0) ?? "").toMatch(/nothing to feed/);
  });

  it("FM-factory-input-3b: a farm that makes only what the household eats (3, with the factory's crew) does not feed it", () => {
    // Crew: 1 for the farm and 2 for the factory, so the household eats 2 + ceil(3 / 4) = 3 a month: the farm's 3.
    expect(develop(1, { water: 10, energy: 10 }, 3) ?? "").toMatch(/nothing to feed/);
  });

  it('FM-factory-input-3c: a farm that makes more than the household eats, with Food in stock, still feeds it', () => {
    // 5 a month against the household's 3 and the factory's 1: a unit to spare, and 4 in stock besides.
    expect(develop(3, { water: 10, energy: 10, food: 4 }, 5) ?? "").not.toMatch(/nothing to feed/);
  });
});

describe('a farm feeds a new factory only with what its factories already running leave (FM-factory-input, N7)', () => {
  /**
   * Development: ai0 owns a farm on column 0 (rating `food`), a Medicine factory on column 1 and an idle plot on column
   * 2, with Water and Energy to spare and no Food. Whether a second Medicine factory on column 2 is vetoed for want of Food.
   */
  function secondFactory(food: number, farmMakes: number): string | null | undefined {
    const state = game();
    while (state.phase !== 'development') advancePhase(state);
    place(state, [
      { x: 0, outfit: 'food', food },
      { x: 1, outfit: 'medicine' },
      { x: 2, outfit: null },
    ]);
    for (const p of state.players) setStock(state, p.id, p.id === ME ? { water: 30, energy: 20 } : {}, p.id === ME ? 5000 : 0);
    expect(outlook(observe(state, ME), ME, { lookAhead: true }).made.food, 'the farm makes').toBe(farmMakes);
    const medicine = developDecision(observe(state, ME), mindOf(), 0).all.find((c) => c.key === 'install:medicine:2');
    expect(medicine, 'a Medicine install on the idle plot is listed').toBeDefined();
    return medicine!.veto;
  }

  it('FM-factory-input-N7a: a farm whose one spare Food the first Medicine factory takes does not feed a second', () => {
    // Crew: 1 for the farm and 2 for each factory, so the household eats 2 + ceil(5 / 4) = 4 of the farm's 5; the first
    // factory takes the fifth. Nothing is left for a second, which would idle.
    expect(secondFactory(3, 5) ?? '').toMatch(/nothing to feed/);
  });

  it('FM-factory-input-N7b: a farm with a Food to spare beyond the household and the first factory feeds a second', () => {
    expect(secondFactory(4, 6) ?? '').not.toMatch(/nothing to feed/);
  });
});

describe("a farm the new factory's own Energy use would turn off does not feed it (N9)", () => {
  /**
   * Development: ai0 owns a farm on column 0 (rating 3: 5 Food a month on its own) and an idle plot on column 2, with
   * `energy` Energy, 2 Food (so the new factory is fed from stock and takes its Energy in production's first pass) and
   * Water to spare. Whether a Medicine factory on column 2 is vetoed for want of Food, and what the farm makes alone.
   */
  function withEnergy(energy: number): { veto: string | null | undefined; alone: number } {
    const state = game();
    while (state.phase !== 'development') advancePhase(state);
    place(state, [
      { x: 0, outfit: 'food', food: 3 },
      { x: 2, outfit: null },
    ]);
    for (const p of state.players) setStock(state, p.id, p.id === ME ? { food: 2, water: 10, energy } : {}, p.id === ME ? 5000 : 0);
    const alone = outlook(observe(state, ME), ME, { lookAhead: true }).made.food;
    const medicine = developDecision(observe(state, ME), mindOf(), 0).all.find((c) => c.key === 'install:medicine:2');
    expect(medicine, 'a Medicine install on the idle plot is listed').toBeDefined();
    return { veto: medicine!.veto, alone };
  }

  it("FM-factory-input-N9: with Energy for one plot, the factory's use turns the farm off, so the farm does not feed it", () => {
    // The farm and the factory use 1 Energy each; the farm's 5 Food are worth less than the factory's 2 Medicine, so
    // AM-17 turns the farm off first, and it makes 20% of 5: 1 Food, under the household's 3.
    const one = withEnergy(1);
    expect(one.alone, 'the case: on its own the farm makes 5').toBe(5);
    expect(one.veto ?? '').toMatch(/nothing to feed/);
    // The control: Energy for both, and the farm feeds it.
    expect(withEnergy(10).veto ?? '').not.toMatch(/nothing to feed/);
  });
});

describe("in the production phase a farm counts with what it makes, not with nothing (N8)", () => {
  /** ai0's farm (rating `food`) and an idle plot, played into the production phase; then its Food set to 0. */
  function inProduction(food: number): { state: GameState; made: number } {
    const state = game();
    while (state.phase !== 'development') advancePhase(state);
    place(state, [
      { x: 0, outfit: 'food', food },
      { x: 2, outfit: null },
    ]);
    for (const p of state.players) setStock(state, p.id, p.id === ME ? { water: 30, energy: 20 } : {}, p.id === ME ? 5000 : 0);
    advancePhase(state);
    expect(state.phase).toBe('production');
    const made = state.history.at(-1)!.produced[ME]!.food;
    state.players.find((p) => p.id === ME)!.stock.food = 0;
    return { state, made };
  }

  it('FM-factory-input-N8: a farm with Food to spare feeds a new Medicine factory in the production phase as in development', () => {
    // 5 a month against the household's 3 and the factory's 1, as in FM-factory-input-3c: fed, though no Food is in stock.
    const spare = inProduction(3);
    expect(spare.made, 'the case: the farm made 5 this month').toBe(5);
    expect(canFeed(observe(spare.state, ME), ME, 'medicine'), 'a Food to spare each month').toBe(true);
    // The control: a farm making only the household's 3 feeds nothing, in this phase too.
    const just = inProduction(1);
    expect(just.made, 'the case: the farm made 3 this month').toBe(3);
    expect(canFeed(observe(just.state, ME), ME, 'medicine'), 'only the household\'s Food').toBe(false);
  });
});

describe("a factory seat bids for its Food at a worthwhile ask (FM-factory-input, option 1)", () => {
  /**
   * Month 1's auction, Food up: ai0 owns one Medicine factory and holds Water and Energy for it, no Food. The store
   * has no Food to sell (its shelf is the colonists'); ai1 holds 30 Food and nothing else. Medicine posts at `medicine`.
   */
  function auction(medicine: number): GameState {
    const state = game();
    while (state.phase !== 'auction') advancePhase(state);
    place(state, [{ x: 0, outfit: 'medicine' }]);
    setStock(state, ME, { water: 10, energy: 10 }, 5000);
    setStock(state, 'ai1', { food: 30 }, 0);
    setStock(state, 'ai2', {}, 0);
    setStock(state, 'ai3', {}, 0);
    state.store.stock.food = 0;
    state.store.stock.medicine = 0;
    state.store.posted.food = 300;
    state.store.posted.medicine = medicine;
    startAuction(state);
    expect(state.auction!.good).toBe('food');
    return state;
  }

  /** Plays the auction with every seat's own hands, then the month on to next month's production; the Medicine made. */
  function medicineMadeNextMonth(state: GameState): { bought: number; made: number } {
    const seats = state.players.map((p, i) => new AiSeat({ id: p.id, name: p.name, persona: 'trader', level: 'trader', seed: 70 + i }));
    let bought = 0;
    for (let i = 0; i < 60_000 && state.auction && state.auction.stage !== 'over'; i++) {
      for (const s of seats) s.auctionTick(state, WALK.tickMs, (x) => applyAction(state, s.id, x));
      bought += stepAuction(state, WALK.tickMs).filter((t) => t.good === 'food' && t.buyer === ME).reduce((n, t) => n + t.quantity, 0);
    }
    const month = state.month;
    while (!(state.month === month + 1 && state.phase === 'production')) advancePhase(state);
    const line = state.history.at(-1)!.lines!.find((l) => l.tile === 0);
    return { bought, made: line?.made ?? 0 };
  }

  it('FM-factory-input-1: its run worth far more than its inputs, it buys enough Food from a player for the factory to run', () => {
    const state = auction(1500);
    const obs = observe(state, ME);
    const o = outlook(obs, ME, { lookAhead: true });
    // The arrangement: the run's two Medicine are worth twice and more the 5 Food the factory needs past upkeep (3 eaten,
    // then 2 so that 1 is left after half spoils), at the store's ask; the seat can pay for them.
    const run = 2 * o.price('medicine');
    expect(run).toBeGreaterThan(2 * 5 * state.auction!.storeSell);
    expect(goodPlan(obs, mindOf(), 'food').budget).toBeGreaterThan(5 * state.auction!.storeSell);
    const { bought, made } = medicineMadeNextMonth(state);
    expect(made, `the factory ran next month (it bought ${bought} Food)`).toBeGreaterThan(0);
  });
});

describe('the keep side does not move (Heiko 5 Nov, "sell surplus")', () => {
  /** Month 1's auction with `good` up; ai0 owns `plots` and holds `stock`. */
  function at(plots: { x: number; outfit: Outfit }[], stock: Partial<Stock>): GameState {
    const state = game();
    while (state.phase !== 'auction') advancePhase(state);
    place(state, plots);
    setStock(state, ME, stock, 2000);
    state.store.posted.medicine = 600;
    startAuction(state);
    return state;
  }
  const keepOf = (state: GameState, good: 'food' | 'water' | 'energy', level: 'trader' | 'rookie') => {
    const obs = observe(state, ME);
    const mind = mindOf(level);
    const v = unitValues(obs, outlook(obs, ME, { lookAhead: mind.level.lookAhead }), good, mind);
    const plan = goodPlan(obs, mind, good);
    const r = (xs: number[]) => xs.map((x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : x));
    return { keep: r(v.keep), floorUnits: v.floorUnits, block: v.block, need: v.need, planKeep: r(plan.values.keep), planFloor: plan.values.floorUnits };
  };

  it.each(['trader', 'rookie'] as const)('FM-factory-input-keep: a seat with no factory keeps what it kept (%s)', (level) => {
    const state = at([{ x: 0, outfit: 'food' }, { x: 2, outfit: 'water' }], { food: 12, water: 9, energy: 4 });
    expect({ food: keepOf(state, 'food', level), water: keepOf(state, 'water', level), energy: keepOf(state, 'energy', level) }).toMatchSnapshot();
  });

  it.each(['trader', 'rookie'] as const)('FM-factory-input-keep: a seat with a Medicine factory keeps what it kept (%s)', (level) => {
    const state = at([{ x: 0, outfit: 'medicine' }, { x: 2, outfit: 'food' }], { food: 12, water: 9, energy: 4 });
    expect({ food: keepOf(state, 'food', level), water: keepOf(state, 'water', level), energy: keepOf(state, 'energy', level) }).toMatchSnapshot();
  });
});
