import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  AI_LEVELS,
  AI_PERSONAS,
  createGame,
  EVENTS,
  GAME,
  GOODS,
  mulePriceFor,
  observe,
  STRATEGIST,
  walkSeconds,
  type AiLevelConfig,
  type AiLevelId,
  type GameState,
} from '@mule/engine';
import { outlook } from '../src/outlook.js';
import { AiSeat } from '../src/seat.js';
import { developDecision, goodPlan, landDecision, muleValue, plotRoom, plotValue, tradeDecision, wantsPlot } from '../src/strategist.js';
import { cashReserve, installGain, type Mind } from '../src/value.js';

const fourSeats = (seed: number) => createGame({ seed, players: [0, 1, 2, 3].map((i) => ({ id: `ai${i}`, name: `AI${i}`, isAi: true })) });

/** A land grant in its third sweep, where any free plot is otherwise wanted, with `idle` undeveloped plots given to ai0. */
function grantWithIdleLand(idle: number, money: number): GameState {
  const state = fourSeats(3);
  while (state.phase !== 'landGrant') advancePhase(state);
  state.grant!.sweep = 2;
  const lit = state.grant!.order[state.grant!.step];
  const spare = state.tiles.map((t, i) => ({ t, i })).filter(({ t, i }) => !t.owner && t.terrain !== 'store' && i !== lit);
  for (const { t } of spare.slice(0, idle)) t.owner = 'ai0';
  state.players[0]!.money = money;
  return state;
}

const tycoon = () => new AiSeat({ id: 'ai0', name: 'AI0', persona: 'trader', level: 'tycoon', seed: 11 });

describe('land claims', () => {
  it('T-AC-1: a seat holding idle land it cannot develop does not bid for a lit plot', () => {
    // Tycoon leads 3 MULEs a month; 3 idle plots and 100 credits can't develop them.
    expect(tycoon().onLit(grantWithIdleLand(3, 100))).toBeNull();
    // Negative cases: no idle land, or the money to develop it, and it bids as before.
    expect(tycoon().onLit(grantWithIdleLand(0, 100))).toBeTypeOf('number');
    expect(tycoon().onLit(grantWithIdleLand(3, 5_000))).toBeTypeOf('number');
  });
});

/** Month 1's development, with the colony's Water (store and every depot) set to `water` units. */
function developmentWithWater(water: number): GameState {
  const state = fourSeats(3);
  while (state.phase !== 'development') advancePhase(state);
  state.store.stock.water = water;
  for (const p of state.players) p.stock.water = 0;
  return state;
}

const traderMind: Mind = { me: 'ai0', personaId: 'trader', persona: AI_PERSONAS.trader, levelId: 'trader', level: AI_LEVELS.trader };

describe('land claims off reading order', () => {
  it('T-AC-10: in the first sweep a seat lets go of a plot outside its top open plots, and seats break ties differently', () => {
    const state = fourSeats(3);
    while (state.phase !== 'landGrant') advancePhase(state);
    const obs = observe(state, 'ai0');
    const mind = (salt: number): Mind => ({ ...traderMind, salt });
    const ranking = landDecision(obs, mind(1)).all[0]!.action.ranking;
    const top = GAME.claimsPerGrant + STRATEGIST.grantSpare;
    // A plot that clears grantShare of the best, but ranks below the seat's top open plots.
    const outside = ranking.slice(top).find((s) => s.utility >= ranking[0]!.utility * STRATEGIST.grantShare);
    expect(outside).toBeDefined();
    const plan = landDecision(obs, mind(1)).all[0]!.action;
    expect(wantsPlot(plan, obs, outside!.index, 0, mind(1))).toBe(false);
    expect(wantsPlot(plan, obs, ranking[0]!.index, 0, mind(1))).toBe(true);
    // Tied plots: two salts order them differently, so seats don't all reach for the same first rows.
    const order = (salt: number) => landDecision(obs, mind(salt)).all[0]!.action.ranking.map((s) => s.index);
    expect(order(1)).not.toEqual(order(2));
  });
});

/** Month 1's land grant on seed 3, ai0 already fed by its own Food and Energy plots, Smithore posted at `smithore`. */
function grantWithFarms(smithore: number): GameState {
  const state = fourSeats(3);
  while (state.phase !== 'landGrant') advancePhase(state);
  state.store.posted.smithore = smithore;
  const [food, energy] = state.tiles.filter((t) => !t.owner && t.terrain === 'plains');
  Object.assign(food!, { owner: 'ai0', outfit: 'food' });
  Object.assign(energy!, { owner: 'ai0', outfit: 'energy' });
  return state;
}

describe('land plans by worth', () => {
  it('T-AC-14: a land plan worth a quarter of the best is not offered to the decider; plans close in worth still are', () => {
    // Smithore at 400: two mountain mines are worth about 6,400, the best two farms about 1,700.
    const rich = landDecision(observe(grantWithFarms(400), 'ai0'), traderMind);
    const best = Math.max(...rich.all.map((c) => c.value));
    expect(best).toBeGreaterThan(3 * Math.min(...rich.all.filter((c) => c.action.focus === 'grown').map((c) => c.value)));
    for (const option of rich.options) expect(option.value).toBeGreaterThan(best / 2);
    // Negative case: at month 1's own Smithore price the farm plan is worth about 70% of the mines, and stays on offer.
    const even = landDecision(observe(grantWithFarms(31), 'ai0'), traderMind);
    const top = Math.max(...even.all.map((c) => c.value));
    expect(even.options.some((c) => c.value < top && c.value > top / 2)).toBe(true);
  });
});

describe('cash reserve', () => {
  it('T-AC-3: a Water farm whose own first output covers the gap is not vetoed by the reserve', () => {
    // ai0 holds one idle river plot, and neither Food nor Water: the reserve holds back cash for next month's Food.
    const arrange = (mind: Mind = traderMind) => {
      const state = developmentWithWater(0);
      const tile = state.tiles.find((t) => t.terrain === 'river' && !t.owner)!;
      tile.owner = 'ai0';
      state.players[0]!.stock.food = 0;
      const obs = observe(state, 'ai0');
      const o = outlook(obs, 'ai0', { lookAhead: true });
      const { cost, net } = installGain(obs, o, obs.tiles[state.tiles.indexOf(tile)]!, 'water', mind);
      return { state, mind, keepBack: cashReserve(obs, mind, o, 'water'), cost, net };
    };
    const waterVeto = (money: (a: ReturnType<typeof arrange>) => number, mind?: Mind) => {
      const a = arrange(mind);
      a.state.players[0]!.money = money(a);
      const c = developDecision(observe(a.state, 'ai0'), a.mind, 0).all.find((x) => x.key.startsWith('install:water'))!;
      return c.veto;
    };
    const { net } = arrange();
    expect(net).toBeGreaterThan(0);
    // One credit under today's reserve, but the farm's own output closes the gap: live.
    expect(waterVeto((a) => a.cost + a.keepBack - 1)).toBeNull();
    // Negative cases: a seat so careful its reserve is more than the farm makes, one credit short even
    // with the output; or a seat that can't pay at all.
    const careful: Mind = { ...traderMind, persona: { ...AI_PERSONAS.trader, reserve: 20 } };
    expect(waterVeto((a) => a.cost + a.keepBack - Math.ceil(a.net) - 1, careful)).toMatch(/kept for upkeep/);
    expect(waterVeto((a) => a.cost - 1)).not.toBeNull();
  });
});

describe('walking', () => {
  it('T-AC-19: a walk-aware seat vetoes a MULE whose walk to the corral and on to the plot is longer than its time left', () => {
    // ai0, rich and fed, holds one idle plot well away from the store and stands in the store.
    const state = developmentWithWater(40);
    const store = state.tiles.find((t) => t.terrain === 'store')!;
    const far = state.tiles.find((t) => !t.owner && t.terrain !== 'store' && Math.abs(t.x - store.x) + Math.abs(t.y - store.y) >= 4)!;
    far.owner = 'ai0';
    const me = state.players[0]!;
    me.money = 5_000;
    me.stock.food = 20;
    const index = state.tiles.indexOf(far);
    const taps = 4;
    const walk = walkSeconds(state, 'ai0', 'store', 'corral') + walkSeconds(state, 'ai0', 'corral', index);
    const farm = (left?: number) =>
      developDecision(observe(state, 'ai0'), traderMind, 0, left === undefined ? undefined : { at: 'store', left, taps }).all.find(
        (c) => c.key === `install:food:${index}`,
      )!;
    expect(walk).toBeGreaterThan(2);
    // Without a walk the farm is live, as today.
    expect(farm().veto).toBeNull();
    // A moment short of the walk and the taps: vetoed, and the walk is named.
    expect(farm(walk + taps - 0.1).veto).toMatch(/walk/);
    // Time enough: live.
    expect(farm(walk + taps + 0.1).veto).toBeNull();
  });
});

describe('factories', () => {
  it('T-AC-4: in month 1 with start stock and no farms, no factory needing Food or Water is a live option', () => {
    const arrange = (farms: boolean) => {
      const state = fourSeats(3);
      while (state.phase !== 'development') advancePhase(state);
      const free = state.tiles.filter((t) => !t.owner && t.terrain !== 'store');
      free[0]!.owner = 'ai0';
      if (farms) {
        Object.assign(free[1]!, { owner: 'ai0', outfit: 'food' });
        Object.assign(free[2]!, { owner: 'ai0', outfit: 'water' });
      }
      state.players[0]!.money = 5_000;
      return developDecision(observe(state, 'ai0'), traderMind, 0).all.filter((c) => c.key.startsWith('install:medicine'));
    };
    // Start stock (6 Food, 6 Water) can't feed the household, the new crew and the works for two months.
    const bare = arrange(false);
    expect(bare.length).toBeGreaterThan(0);
    for (const c of bare) expect(c.veto ?? '').toMatch(/nothing to feed/);
    // Negative case: its own Food and Water farms feed the works.
    for (const c of arrange(true)) expect(c.veto ?? '').not.toMatch(/nothing to feed/);
  });
});

describe('shortage foresight', () => {
  it('T-AC-5: a seat prices Water at what colonists would pay once its outlook shows Water running short', () => {
    // Colonists pay at most 120 a unit, the store adds 10%: 120 / 1.1 is about 109.
    const ceiling = 120 / 1.1;
    const short = outlook(observe(developmentWithWater(0), 'ai0'), 'ai0', { lookAhead: true });
    expect(short.later('water')).toBeGreaterThanOrEqual(ceiling);
    // Negative case: with Water to spare the forecast stays a market price, far under the ceiling.
    const plenty = outlook(observe(developmentWithWater(300), 'ai0'), 'ai0', { lookAhead: true });
    expect(plenty.later('water')).toBeLessThan(ceiling / 2);
  });
});

describe('values for lot bids (WS3 caps AI bids at these)', () => {
  it('INV-WS3-1: every free plot is worth at least its score, and a finite number of credits', () => {
    // A river plot with the colony out of Water has a Water farm to give: worth more than the plot alone.
    const dry = developmentWithWater(0);
    const river = dry.tiles.findIndex((t) => t.terrain === 'river' && !t.owner);
    expect(plotValue(observe(dry, 'ai0'), traderMind, river)).toBeGreaterThan(GAME.plotScore);
    const state = developmentWithWater(36);
    const obs = observe(state, 'ai0');
    const free = state.tiles.map((t, i) => ({ t, i })).filter(({ t }) => !t.owner && t.terrain !== 'store');
    expect(free.length).toBeGreaterThan(0);
    for (const { i } of free) {
      const v = plotValue(obs, traderMind, i);
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(GAME.plotScore);
    }
  });

  it('T-AC-15: a seat bids for a lot plot only what leaves the cash to develop it and its idle plots', () => {
    const state = developmentWithWater(36);
    const index = state.tiles.findIndex((t) => !t.owner && t.terrain === 'river');
    const [a, b] = state.tiles.filter((t, i) => !t.owner && t.terrain !== 'store' && i !== index);
    a!.owner = 'ai0';
    b!.owner = 'ai0';
    const mule = mulePriceFor(state, 'ai0');
    // The lot hand bids up to the lower of the two (and its cash reserve).
    const bidWith = (money: number) => {
      state.players[0]!.money = money;
      const obs = observe(state, 'ai0');
      return Math.min(plotValue(obs, traderMind, index), plotRoom(obs, traderMind));
    };
    // Rich, it bids the plot's worth; with 1,000 cr and 2 idle plots, no more than 1,000 less 3 MULEs.
    const worth = bidWith(100_000);
    expect(worth).toBeGreaterThan(1000 - 3 * mule);
    expect(bidWith(1000)).toBe(1000 - 3 * mule);
    // With less than 3 MULEs' price on hand it bids nothing.
    expect(bidWith(3 * mule - 1)).toBe(0);
  });

  it('INV-WS5-1: the AI values a geyser plot above the same plot without it', () => {
    // The colony is out of Water, so a Water plot pays; a geyser adds to it (spec RULE-6).
    const state = developmentWithWater(0);
    const index = state.tiles.findIndex((t) => !t.owner && !t.special && ['tundra', 'volcanic', 'ice'].includes(t.terrain));
    expect(index).toBeGreaterThanOrEqual(0);
    const plain = plotValue(observe(state, 'ai0'), traderMind, index);
    state.tiles[index]!.special = { kind: 'geyser' };
    const geyser = plotValue(observe(state, 'ai0'), traderMind, index);
    expect(geyser).toBeGreaterThan(plain);
  });

  it('INV-WS3-2: a MULE is worth nothing without idle land, and at least the store price with a profitable use', () => {
    const state = developmentWithWater(0);
    state.players[0]!.money = 5_000;
    expect(muleValue(observe(state, 'ai0'), traderMind)).toBe(0);
    // A river plot with the colony out of Water: a Water farm there pays, so the MULE is worth its store price or more.
    state.tiles.find((t) => t.terrain === 'river' && !t.owner)!.owner = 'ai0';
    const obs = observe(state, 'ai0');
    expect(muleValue(obs, traderMind)).toBeGreaterThanOrEqual(mulePriceFor(obs, 'ai0'));
  });
});

/** The auction of month 1, with the store's Water shelf at `shelf` and ai0 holding 8 Water and no Water farm. */
function auctionWithShelf(shelf: number): GameState {
  const state = fourSeats(3);
  while (state.phase !== 'auction') advancePhase(state);
  state.store.stock.water = shelf;
  state.players[0]!.stock.water = 8;
  return state;
}

describe('surplus to a short store', () => {
  it('T-AC-8: with the store’s Water shelf under the colonists’ need, a seat offers its Water beyond its own needs', () => {
    // 100 colonists need 5 Water a month; the shelf holds 2.
    const obs = observe(auctionWithShelf(2), 'ai0');
    const plan = goodPlan(obs, traderMind, 'water');
    const sell = tradeDecision(obs, traderMind, plan).all.find((c) => c.key === 'sell' && !c.veto);
    expect(sell).toBeDefined();
    // It keeps what next month takes and sells the rest.
    expect((sell!.action as { keep: number }).keep).toBeLessThanOrEqual(Math.max(plan.values.block, plan.values.need));
    // Negative case: with the shelf full, it holds Water as before, as a bet on the price.
    const full = observe(auctionWithShelf(40), 'ai0');
    const before = tradeDecision(full, traderMind, goodPlan(full, traderMind, 'water')).all.find((c) => c.key === 'sell');
    expect(before === undefined || (before.action as { keep: number }).keep > plan.values.block).toBe(true);
  });
});

/** The month-1 auction with the store's shelves full, ai0 holding `stock` of `good`, and the sales tax at `tax`. */
function auctionAtTax(tax: number, good: 'food' | 'water', stock: number): GameState {
  const state = auctionWithShelf(40);
  state.store.stock.food = 40;
  state.players[0]!.stock[good] = stock;
  state.treasury.salesTax = tax;
  return state;
}

describe('the sales tax', () => {
  it('T-AC-9: at a 15% tax a seat sells the same resale stock for 85% of the gain, and values its own use the same', () => {
    const sell = (tax: number) => {
      const obs = observe(auctionAtTax(tax, 'water', 30), 'ai0');
      return tradeDecision(obs, traderMind, goodPlan(obs, traderMind, 'water')).all.find((c) => c.key === 'sell')!;
    };
    const [free, taxed] = [sell(0), sell(0.15)];
    expect(free).toBeDefined();
    expect((taxed.action as { keep: number }).keep).toBe((free.action as { keep: number }).keep);
    expect(taxed.value).toBeCloseTo(free.value * 0.85, 0);

    const food = (tax: number) => goodPlan(observe(auctionAtTax(tax, 'food', 20), 'ai0'), traderMind, 'food').values;
    const [v0, v15] = [food(0), food(0.15)];
    const resale0 = v0.keep[v0.block]!;
    const own = [...Array(v0.block).keys()].filter((k) => k >= v0.floorUnits && v0.keep[k]! > resale0);
    expect(own.length).toBeGreaterThan(0);
    for (const k of own) expect(v15.keep[k]).toBe(v0.keep[k]);
    // Negative case: a unit held for resale next month is taxed when it sells, so it is worth 85%.
    expect(v15.keep[v15.block]).toBeCloseTo(resale0 * 0.85, 6);
  });
});

/** Month 1's auction with Smithore up and scarce: the store holds 2, ai2 and ai3 are 3 short each; ai1 leads but isn't short, so no spite; ai0 holds none. */
function auctionWithScarceSmithore(): GameState {
  const state = fourSeats(3);
  while (state.phase !== 'auction') advancePhase(state);
  state.store.stock.smithore = 2;
  state.players[0]!.stock.smithore = 0;
  state.players[1]!.money = 100_000;
  const row = (id: string, now: number, need: number) => ({ id, had: now, used: 0, made: 0, now, need, spoils: 0 });
  Object.assign(state.auction!, { good: 'smithore', stage: 'status', status: [row('ai0', 0, 0), row('ai1', 4, 4), row('ai2', 0, 3), row('ai3', 0, 3)] });
  return state;
}

describe('cornering', () => {
  it('T-AC-28: a Rookie seat never pursues a monopoly', () => {
    const obs = observe(auctionWithScarceSmithore(), 'ai0');
    const aggressive = (levelId: AiLevelId, level: Partial<AiLevelConfig> = {}): Mind => ({
      me: 'ai0',
      personaId: 'aggressive',
      persona: AI_PERSONAS.aggressive,
      levelId,
      level: { ...AI_LEVELS[levelId], ...level },
    });
    const plan = (mind: Mind) => goodPlan(obs, mind, 'smithore');
    // The same seat with no taste for cornering: what each unit is worth to it plainly.
    const plainBuy = (mind: Mind) => plan({ ...mind, persona: { ...mind.persona, corner: 0 } }).values.buy;

    const trader = plan(aggressive('trader'));
    expect(trader.spiteBid).toBe(0);
    expect(trader.corner.units).toBeGreaterThan(0);
    expect(trader.values.buy[0]).toBeGreaterThan(plainBuy(aggressive('trader'))[0]!);

    const rookie = plan(aggressive('rookie'));
    expect(rookie.corner.units).toBe(0);
    expect(rookie.values.buy).toEqual(plainBuy(aggressive('rookie')));

    // Positive control: the same Rookie seat, allowed to corner, corners here.
    const cornering = plan(aggressive('rookie', { corners: true }));
    expect(cornering.corner.units).toBeGreaterThan(0);
    expect(cornering.values.buy[0]).toBeGreaterThan(rookie.values.buy[0]!);
  });
});

describe('production events and the outlook', () => {
  it('T-AC-7: a seat’s outlook forecasts the same with events on as off: it never sees next month’s event', () => {
    const forecast = (seed: number, chance: number) => {
      const saved = EVENTS.chance;
      EVENTS.chance = chance;
      try {
        const state = fourSeats(seed);
        while (state.phase !== 'development') advancePhase(state);
        const free = state.tiles.filter((t) => !t.owner && t.terrain !== 'store');
        state.players.forEach((p, i) => (['food', 'energy', 'water'] as const).forEach((o, k) => Object.assign(free[i * 3 + k]!, { owner: p.id, outfit: o })));
        const o = outlook(observe(state, 'ai0'), 'ai0', { lookAhead: true });
        return GOODS.map((g) => [o.price(g), o.later(g)]);
      } finally {
        EVENTS.chance = saved;
      }
    };
    for (let seed = 1; seed <= 6; seed++) expect(forecast(seed, 1)).toEqual(forecast(seed, 0));
  });
});
