import { describe, expect, it } from 'vitest';
import { advancePhase, AI_PLANS, createGame, LOTS, observe, stableJson, storePaysFor, type GameState, type Outfit } from '@mule/engine';
import { outlook } from '../src/outlook.js';
import { draftPlaybook, validatePlaybook } from '../src/playbook/index.js';
import { AiSeat } from '../src/seat.js';
import { applySets } from '../src/sim.js';
import { plotValue, sellWanted } from '../src/strategist.js';
import { cashReserve, installGain, type Mind } from '../src/value.js';

// Seed 11's map: plot 10 is desert, 1 and 2 plains, 56 and 57 mountains.
const DESERT = 10;
const PLAINS = 1;
const PLAINS_2 = 2;
const MOUNTAIN = 56;
const MOUNTAIN_2 = 57;

/** A trader whose reserve weight puts its reserve at 120 with nothing short: 60 cr of floor, twice. */
function seller(): Mind {
  const mind = new AiSeat({ id: 'ai0', name: 'AI 1', persona: 'trader', level: 'trader', seed: 100 }).mind;
  return { ...mind, persona: { ...mind.persona, reserve: 2 } };
}

/** Month 1's planning on seed 11, ai0 holding `money` and the given plots: an outfit puts a MULE on it, null leaves it idle. */
function holding(money: number, plots: [number, Outfit | null][]): GameState {
  const state = createGame({ seed: 11, players: [0, 1, 2, 3].map((i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
  for (const [index, outfit] of plots) Object.assign(state.tiles[index]!, { owner: 'ai0', outfit });
  state.players[0]!.money = money;
  return state;
}

const wanted = (state: GameState, mind = seller()) => sellWanted(observe(state, 'ai0'), mind);

/** RULE-12's worth of each kind of lot, from the strategist's own values. */
function plotWorth(state: GameState, index: number, mind = seller()) {
  return plotValue(observe(state, 'ai0'), mind, index);
}
function muleWorth(state: GameState, index: number, mind = seller()) {
  const obs = observe(state, 'ai0');
  const tile = obs.tiles[index]!;
  const g = installGain(obs, outlook(obs, 'ai0', { lookAhead: mind.level.lookAhead }), tile, tile.outfit!, mind);
  return g.gain + g.cost;
}
const minimumFor = (state: GameState, kind: 'plot' | 'mule', worth: number) =>
  Math.max(storePaysFor(state, kind) + 1, Math.round(AI_PLANS.sell.minimumShare * worth));

/** Runs `fn` with config paths set as --set sets them, then puts each back. */
function withSets<T>(sets: string[], fn: () => T): T {
  const read = (path: string) => {
    const [block, ...keys] = path.split('.');
    return keys.reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], { AI_PLANS, LOTS }[block as 'AI_PLANS' | 'LOTS']);
  };
  const saved = sets.map((s) => `${s.split('=')[0]}=${String(read(s.split('=')[0]!))}`);
  applySets(sets);
  try {
    return fn();
  } finally {
    applySets(saved);
  }
}

describe('selling when short of cash (C10, RULE-12)', () => {
  it("T-AC-10: RULE-12's rows and examples", () => {
    const mind = seller();
    const short = holding(40, [[DESERT, null], [MOUNTAIN, 'smithore']]);
    expect(cashReserve(observe(short, 'ai0'), mind)).toBe(120);

    // Example: money 40, reserve 120, an idle plot and a Smithore MULE → lists the idle plot, for the store if unsold.
    const worth = plotWorth(short, DESERT);
    expect(worth - storePaysFor(short, 'plot')).toBeLessThan(muleWorth(short, MOUNTAIN) - storePaysFor(short, 'mule'));
    expect(wanted(short)).toEqual([{ item: 'plot', plot: DESERT, minimum: minimumFor(short, 'plot', worth), unsold: 'store' }]);

    // Example: money 400 → nothing. Row 1's edge: money equal to the reserve is not short; one credit under is.
    expect(wanted(holding(400, [[DESERT, null], [MOUNTAIN, 'smithore']]))).toEqual([]);
    expect(wanted(holding(120, [[DESERT, null], [MOUNTAIN, 'smithore']]))).toEqual([]);
    expect(wanted(holding(119, [[DESERT, null], [MOUNTAIN, 'smithore']]))).toHaveLength(1);

    // Example (row 2): only one MULE, a Food MULE → nothing. Nor its last Energy MULE.
    expect(wanted(holding(40, [[PLAINS, 'food']]))).toEqual([]);
    expect(wanted(holding(40, [[PLAINS, 'energy']]))).toEqual([]);
    expect(wanted(holding(40, []))).toEqual([]);
    // With two Food MULEs, one of them may go; a plot with a MULE on it is never a plot lot.
    const twoFarms = holding(40, [[PLAINS, 'food'], [PLAINS_2, 'food']]);
    const farms = wanted(twoFarms);
    expect(farms).toHaveLength(1);
    expect(farms[0]).toMatchObject({ item: 'mule', unsold: 'store' });
    expect([PLAINS, PLAINS_2]).toContain(farms[0]!.plot);
    expect(farms[0]!.minimum).toBe(minimumFor(twoFarms, 'mule', muleWorth(twoFarms, farms[0]!.plot)));

    // Row 3: at most AI_PLANS.sell.perMonth listings, least worth over the store's price first.
    const three = holding(40, [[DESERT, null], [MOUNTAIN, 'smithore'], [MOUNTAIN_2, 'smithore']]);
    expect(wanted(three)).toHaveLength(AI_PLANS.sell.perMonth);
    expect(withSets(['AI_PLANS.sell.perMonth=0'], () => wanted(three))).toEqual([]);
    const lots = [
      { item: 'plot' as const, plot: DESERT, worth: plotWorth(three, DESERT) },
      { item: 'mule' as const, plot: MOUNTAIN, worth: muleWorth(three, MOUNTAIN) },
      { item: 'mule' as const, plot: MOUNTAIN_2, worth: muleWorth(three, MOUNTAIN_2) },
    ].sort((a, b) => a.worth - storePaysFor(three, a.item) - (b.worth - storePaysFor(three, b.item)));
    expect(lots.every((l) => l.worth > 0)).toBe(true);
    const two = withSets(['AI_PLANS.sell.perMonth=2'], () => wanted(three));
    expect(two).toEqual(lots.slice(0, 2).map(({ item, plot, worth }) => ({ item, plot, minimum: minimumFor(three, item, worth), unsold: 'store' })));
  });

  it('T-AC-10: RULE-12 unknown, a worth of 0 or less ranks first and lists at one over what the store pays', () => {
    // A Smithore MULE on plains earns nothing. With the store paying 5 plot scores for land, the plot's worth over the
    // store's price would be the lower; a lot that earns nothing still goes first.
    const state = holding(40, [[DESERT, null], [PLAINS, 'smithore']]);
    const dud = muleWorth(state, PLAINS);
    expect(dud).toBeLessThanOrEqual(0);
    const listed = withSets(['LOTS.storePlotShare=5'], () => {
      expect(plotWorth(state, DESERT) - storePaysFor(state, 'plot')).toBeLessThan(dud - storePaysFor(state, 'mule'));
      return wanted(state);
    });
    expect(listed).toEqual([{ item: 'mule', plot: PLAINS, minimum: storePaysFor(state, 'mule') + 1, unsold: 'store' }]);
  });

  it("T-AC-10: the planning draft's list is RULE-12's, it passes the gate unchanged, and it is absent with nothing to list", () => {
    const mind = seller();
    const draft = (state: GameState) => draftPlaybook({ state, seat: 'ai0', mind, seed: 100, phase: 'planning' });
    const short = holding(40, [[DESERT, null], [MOUNTAIN, 'smithore']]);
    const planned = draft(short);
    expect(planned.planning).toEqual({ list: wanted(short) });
    const { playbook, rejected } = validatePlaybook({ mind, seed: 100 })(short, 'ai0', planned, []);
    expect(rejected).toEqual([]);
    expect(stableJson(playbook)).toBe(stableJson(planned));

    expect(draft(holding(400, [[DESERT, null], [MOUNTAIN, 'smithore']])).planning).toEqual({});
    // Listings are made in planning only, so a planning draft made in any other phase lists nothing.
    const later = holding(40, [[DESERT, null], [MOUNTAIN, 'smithore']]);
    advancePhase(later);
    expect(later.phase).not.toBe('planning');
    expect(draft(later).planning).toEqual({});
  });

  it('T-AC-10 (negative): a seat with money at or over its reserve never lists, whatever it holds', () => {
    const plots: [number, Outfit | null][] = [[DESERT, null], [PLAINS, 'smithore'], [MOUNTAIN, 'smithore'], [PLAINS_2, 'food'], [MOUNTAIN_2, 'food']];
    const reserve = cashReserve(observe(holding(0, plots), 'ai0'), seller());
    expect(wanted(holding(reserve - 1, plots))).toHaveLength(1);
    for (const money of [reserve, reserve + 1, 5_000]) expect(wanted(holding(money, plots)), `money ${money}`).toEqual([]);
  });
});
