import { describe, expect, it } from 'vitest';
import { advancePhase, AI_PERSONAS, cloneForSim, createGame, EVENTS, GROWN_BASE, observe, PRICE, rollAfterOutput, STRATEGIST, type GameState, type Outfit, type Phase, type Tile } from '@mule/engine';
import { outlook } from '../src/outlook.js';
import { AiSeat } from '../src/seat.js';
import { landDecision } from '../src/strategist.js';
import { monthlyNet, type Yield } from '../src/value.js';

/**
 * AM-17, PM ruling A: a plant counts net. It pays its own use from its own output, so only what is left (made less its
 * use, never below 0) supplies the seat's other plots, and only that is its to sell.
 */

const flatGround = { food: 0, water: 0, energy: 0, smithore: 0, crystite: 0, rareEarth: 0 };

/** Month 1's land grant. ai0 owns, analysed, a plant making 3 (uses 1), a Smithore mine (uses 2) and a farm (uses 1). */
function grant(energy: number): { state: GameState; seat: AiSeat } {
  const state = createGame({ seed: 11, players: ['ai0', 'ai1', 'ai2', 'ai3'].map((id) => ({ id, name: id, isAi: true, species: 'zipwing' as const })) });
  while (state.phase !== 'landGrant') advancePhase(state);
  const plots: [Outfit, Partial<Tile['ground']>][] = [
    ['energy', { energy: 3 - GROWN_BASE }],
    ['smithore', { smithore: 4 }],
    ['food', { food: 3 - GROWN_BASE }],
  ];
  const me = state.players.find((p) => p.id === 'ai0')!;
  plots.forEach(([outfit, ground], k) => {
    const tile = state.tiles[2 * k]!;
    expect(tile.terrain).not.toBe('store');
    Object.assign(tile, { terrain: 'plains', traits: [], ground: { ...flatGround, ...ground }, owner: 'ai0', outfit, pollution: 0, runMonths: 0 } satisfies Partial<Tile>);
    delete tile.special;
    me.analysed.push(2 * k);
  });
  // Food and Water in plenty, so Energy alone decides what the seat keeps back.
  Object.assign(me.stock, { food: 40, water: 40, energy });
  me.money = 3000;
  return { state, seat: new AiSeat({ id: 'ai0', name: 'ai0', persona: 'cautious', level: 'trader', seed: 11 }) };
}

/** The cash the seat says it keeps back, as its land decision's rationale reads it. */
function keptBack(state: GameState, seat: AiSeat): number {
  const reasons = landDecision(observe(state, 'ai0'), seat.mind).all.flatMap((c) => c.considerations.map((k) => k.reason));
  const kept = reasons.map((r) => /(\d+) cr kept back/.exec(r)?.[1]).find((n) => n !== undefined);
  return Number(kept);
}

describe('AM-17, ruling A: the AI counts a plant net', () => {
  it('FM-plant-net-supply: a plant making 3 nets 2 against plots using 3, so a seat holding no Energy keeps cash back for 1 unit', () => {
    const short = grant(0);
    const covered = grant(1);

    const diff = keptBack(short.state, short.seat) - keptBack(covered.state, covered.seat);

    // One unit, at the store's ask capped at a few times its reference price, times the persona's reserve weight.
    const store = short.state.store;
    const unit = Math.min(store.posted.energy * (1 + PRICE.storeSpread), store.refPrice.energy * STRATEGIST.reservePriceCap) * AI_PERSONAS.cautious.reserve;
    expect(Math.abs(diff - unit)).toBeLessThanOrEqual(1);
  });

  // trace-allow: below the boundary on purpose: a plant's value feeds every land and develop pick through many other terms, so no single pick isolates the one Energy a month; the promise is the equality itself.
  it('FM-plant-net-value: a plant making 3 and using 1 earns what a plant netting 2 and using nothing earns', () => {
    const { state, seat } = grant(1);
    const obs = observe(state, 'ai0');
    const o = outlook(obs, 'ai0', { lookAhead: true });
    const y = (made: number, energy: number): Yield => ({ made, energy, inputs: {}, air: 0, crew: 1 });

    expect(monthlyNet(obs, o, y(3, 1), 'energy', seat.mind)).toBeCloseTo(monthlyNet(obs, o, y(2, 0), 'energy', seat.mind), 6);
  });
});

describe("the outlook's plantsUse is what the engine charged, though the roll's meteor then strikes the plant (R1)", () => {
  type Row = { phases: Partial<Record<Phase, number>>; cap: number };
  const rows = (): Row[] => [...Object.values(EVENTS.colony), ...Object.values(EVENTS.player)] as Row[];

  it('FM-plant-net-meteor: a plant the meteor craters after its output still paid min(made, use), and plantsUse counts it', () => {
    // Only the meteor rolls, and it always strikes (test-local: the case needs the strike). Every other row at 0.
    const saved = rows().map((row) => ({ row, phases: { ...row.phases }, cap: row.cap }));
    try {
      for (const row of rows()) row.phases = Object.fromEntries(Object.keys(row.phases).map((p) => [p, row === EVENTS.colony.meteorStrike ? 1 : 0]));
      EVENTS.colony.meteorStrike.cap = 1;
      const state = createGame({ seed: 11, players: ['ai0', 'ai1', 'ai2', 'ai3'].map((id) => ({ id, name: id, isAi: true, species: 'zipwing' as const })) });
      while (state.phase !== 'landGrant') advancePhase(state);
      state.month = EVENTS.firstMonth;
      // The tile the outlook's meteor strikes: its dice read the seed (which observe zeroes), the month and the map, not
      // who owns what. ai0's one plot, a plant making 3 and using 1, goes there.
      const probe = cloneForSim(observe(state, 'ai0'));
      delete probe.whatIf;
      const hit = rollAfterOutput(probe)[0]!.plots[0]!.index;
      for (const t of state.tiles) if (t.owner === 'ai0') Object.assign(t, { owner: null, outfit: null });
      const tile = state.tiles[hit]!;
      Object.assign(tile, { terrain: 'plains', traits: [], ground: { ...flatGround, energy: 3 - GROWN_BASE }, owner: 'ai0', outfit: 'energy', pollution: 0, runMonths: 0 } satisfies Partial<Tile>);
      delete tile.special;
      const me = state.players.find((p) => p.id === 'ai0')!;
      me.analysed.push(hit);
      me.stock.energy = 0;
      const obs = observe(state, 'ai0');
      // A what-if copy rolls no event; the outlook's clone is let roll, so its meteor strikes as the real month's would.
      const o = outlook(obs, 'ai0', { lookAhead: true, apply: (sim) => delete sim.whatIf });

      expect(o.stage.tiles[hit], "the case: the roll's meteor cratered the plant").toMatchObject({ outfit: null, special: { kind: 'meteorCrater' } });
      expect(o.made.energy, 'the case: the plant made its 3 first').toBe(3);
      // What the engine charged the plant: what it made less what reached the seat's stock (it owns nothing else).
      const charged = o.made.energy - (o.stage.players.find((p) => p.id === 'ai0')!.stock.energy - obs.players.find((p) => p.id === 'ai0')!.stock.energy);
      expect(charged, 'the case: the engine charged its use, 1').toBe(1);
      expect(o.plantsUse).toBe(charged);
    } finally {
      for (const { row, phases, cap } of saved) Object.assign(row, { phases, cap });
    }
  });
});
