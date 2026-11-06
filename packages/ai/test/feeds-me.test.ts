import { describe, expect, it } from 'vitest';
import { advancePhase, callStrike, createGame, GROWN_BASE, monthNeeds, observe, STRATEGIST, type GameState, type Outfit, type Tile } from '@mule/engine';
import { AiSeat } from '../src/seat.js';
import { landDecision } from '../src/strategist.js';
import { outlook } from '../src/outlook.js';

/**
 * The land plan's "Feeds me" counts units, not plots: a seat is covered only while what its own plots supply of Food and
 * Energy next month reaches what it needs. Found by WS2: a seat with farms making no Food (turned off for want of
 * Energy) was told "my Food and Energy are covered", and its land plans turned away from growing Food.
 */

/** What the farm makes when it runs: over the household's Food (checked below). */
const FARM = 4;

const flatGround = { food: 0, water: 0, energy: 0, smithore: 0, crystite: 0, rareEarth: 0 };

/**
 * Month 1's land grant. ai0 owns, analysed, a plant making `plant` Energy and a farm making `farm` Food, on plots apart
 * (no cluster bonus). It holds no Energy, so the farm runs only on what the plant nets after its own use; Water in plenty.
 */
function grant(plant: number, farm: number, level: 'trader' | 'rookie' = 'trader', energy = 0): { state: GameState; seat: AiSeat } {
  const state = createGame({ seed: 11, players: ['ai0', 'ai1', 'ai2', 'ai3'].map((id) => ({ id, name: id, isAi: true, species: 'zipwing' as const })) });
  while (state.phase !== 'landGrant') advancePhase(state);
  const plots: [Outfit, Partial<Tile['ground']>][] = [
    ['energy', { energy: plant - GROWN_BASE }],
    ['food', { food: farm - GROWN_BASE }],
  ];
  const me = state.players.find((p) => p.id === 'ai0')!;
  plots.forEach(([outfit, ground], k) => {
    const tile = state.tiles[2 * k]!;
    expect(tile.terrain).not.toBe('store');
    Object.assign(tile, { terrain: 'plains', traits: [], ground: { ...flatGround, ...ground }, owner: 'ai0', outfit, pollution: 0, runMonths: 0 } satisfies Partial<Tile>);
    delete tile.special;
    me.analysed.push(2 * k);
  });
  Object.assign(me.stock, { food: 0, water: 40, energy });
  me.money = 3000;
  return { state, seat: new AiSeat({ id: 'ai0', name: 'ai0', persona: 'cautious', level, seed: 11 }) };
}

/** Each land plan's "Feeds me" consideration, as the seat's rationale reads it. */
function feedsMe(state: GameState, seat: AiSeat) {
  return landDecision(observe(state, 'ai0'), seat.mind).all.map((c) => ({ plan: c.action.focus, ...c.considerations.find((k) => k.name === 'Feeds me')! }));
}

describe('FM-feeds-me: the land plan counts Food and Energy as units against need', () => {
  it('FM-feeds-me: a seat whose farm is turned off for want of Energy reads as short, though it owns a farm and a plant', () => {
    // The plant makes 1 and uses 1: it nets nothing, so the farm (using 1) is turned off and makes no Food.
    const { state, seat } = grant(1, FARM);

    const plans = feedsMe(state, seat);

    expect(plans.length).toBeGreaterThan(0);
    for (const k of plans) {
      expect(k.reason, `${k.plan} plan`).toBe('I still buy my Food and Energy');
      expect(k.score, `${k.plan} plan`).toBe(k.plan === 'grown' ? 1 : STRATEGIST.land.feedsMe.short);
    }
  });

  it('FM-feeds-me: a seat whose plant powers its farm, and whose farm makes its Food, reads as covered', () => {
    // The plant makes 3 and uses 1: it nets 2, over the farm's 1. The farm makes 4, over the household's Food.
    const { state, seat } = grant(3, FARM);
    expect(FARM).toBeGreaterThanOrEqual(monthNeeds(state, 'ai0').food);

    const plans = feedsMe(state, seat);

    expect(plans.length).toBeGreaterThan(0);
    for (const k of plans) {
      expect(k.reason, `${k.plan} plan`).toBe('my Food and Energy are covered');
      expect(k.score, `${k.plan} plan`).toBe(STRATEGIST.land.feedsMe.covered);
    }
  });

  it('FM-feeds-me: Food alone short: a powered farm making less than the household eats reads as short', () => {
    // The plant nets 2 over the farm's 1, so Energy is covered; the farm makes 1, under the household's Food.
    const { state, seat } = grant(3, 1);
    expect(monthNeeds(state, 'ai0').food).toBeGreaterThan(1);

    const plans = feedsMe(state, seat);

    expect(plans.length).toBeGreaterThan(0);
    for (const k of plans) expect(k.reason, `${k.plan} plan`).toBe('I still buy my Food and Energy');
  });

  it('FM-feeds-me: Energy alone short: a farm run on stock while the plant nets nothing reads as short', () => {
    // Energy in stock runs the farm this month, so it makes its 4 Food; the plant makes 1 and uses 1, so the seat's own
    // plots supply no Energy against the farm's 1.
    const { state, seat } = grant(1, FARM, 'trader', 5);

    const plans = feedsMe(state, seat);

    expect(plans.length).toBeGreaterThan(0);
    for (const k of plans) expect(k.reason, `${k.plan} plan`).toBe('I still buy my Food and Energy');
  });

  it('FM-feeds-me: a Rookie, which does not look ahead, still counts plots: owning a farm and a plant reads as covered', () => {
    // The same turned-off farm as above: without a look-ahead the seat can't see it, so it keeps trunk's plot count.
    const { state, seat } = grant(1, FARM, 'rookie');

    const plans = feedsMe(state, seat);

    expect(plans.length).toBeGreaterThan(0);
    for (const k of plans) {
      expect(k.reason, `${k.plan} plan`).toBe('my Food and Energy are covered');
      expect(k.score, `${k.plan} plan`).toBe(STRATEGIST.land.feedsMe.covered);
    }
  });
});

describe("FM-feeds-me: a plant pays its own use only from what it makes (runProduction's min(made, use))", () => {
  /**
   * Month 1's land grant under an unpaid general strike on Energy: plants make 20% of their output, rounded down. ai0
   * owns a big plant (22 a month, so 4 struck) and a small one (3, so 0 struck), a farm and a Smithore mine, on plots
   * apart; no Energy in stock. The small plant makes nothing, so it pays nothing of its use: the big one's 4 less its 1
   * leave 3, the farm's 1 and the mine's 2.
   */
  function struck(): { state: GameState; seat: AiSeat } {
    const state = createGame({ seed: 11, players: ['ai0', 'ai1', 'ai2', 'ai3'].map((id) => ({ id, name: id, isAi: true, species: 'zipwing' as const })) });
    while (state.phase !== 'landGrant') advancePhase(state);
    const plots: [Outfit, Partial<Tile['ground']>][] = [
      ['energy', { energy: 22 - GROWN_BASE }],
      ['energy', { energy: 3 - GROWN_BASE }],
      ['food', { food: 8 - GROWN_BASE }],
      ['smithore', { smithore: 2 }],
    ];
    const me = state.players.find((p) => p.id === 'ai0')!;
    plots.forEach(([outfit, ground], k) => {
      const tile = state.tiles[2 * k]!;
      expect(tile.terrain).not.toBe('store');
      Object.assign(tile, { terrain: 'plains', traits: [], ground: { ...flatGround, ...ground }, owner: 'ai0', outfit, pollution: 0, runMonths: 0 } satisfies Partial<Tile>);
      delete tile.special;
      me.analysed.push(2 * k);
    });
    Object.assign(me.stock, { food: 0, water: 40, energy: 0 });
    me.money = 3000;
    callStrike(state, 'energy');
    return { state, seat: new AiSeat({ id: 'ai0', name: 'ai0', persona: 'cautious', level: 'trader', seed: 11 }) };
  }

  it('FM-feeds-me-plant-use: a plant that makes nothing pays none of its use, so the seat reads as covered', () => {
    const { state, seat } = struck();
    // The arrangement: the plants make 4 and 0 at the coming production; the farm and the mine use 3; Food is covered.
    const o = outlook(observe(state, 'ai0'), 'ai0', { lookAhead: true });
    expect(o.made.energy, 'the plants make 4 + 0').toBe(4);
    expect(monthNeeds(state, 'ai0').energy, "the farm's and the mine's use").toBe(3);
    expect(o.made.food).toBeGreaterThanOrEqual(monthNeeds(state, 'ai0').food);

    const plans = feedsMe(state, seat);

    expect(plans.length).toBeGreaterThan(0);
    for (const k of plans) expect(k.reason, `${k.plan} plan`).toBe('my Food and Energy are covered');
  });
});
