import { describe, expect, it } from 'vitest';
import { advancePhase, AI_LEVELS, AI_PERSONAS, createGame, GAME, mulePriceFor, observe, type GameState } from '@mule/engine';
import { outlook } from '../src/outlook.js';
import { AiSeat } from '../src/seat.js';
import { developDecision, muleValue, plotValue } from '../src/strategist.js';
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
