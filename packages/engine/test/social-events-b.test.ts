import { afterEach, describe, expect, it } from 'vitest';
import {
  advancePhase,
  buyMule,
  COLONY,
  createGame,
  eventChance,
  EVENTS,
  firePhase,
  GOOD_CONFIG,
  HAPPINESS,
  RuleError,
  type EventRow,
  type GameState,
  type MonthReport,
  type MoodBand,
} from '../src/index.js';

// G-5 C26 PR-B: the colony's development, production and month-end social events, and the mood part of MULE theft.
// The spec's §6 has no T-AC row for C26's events, so, as in social-events.test.ts, each test names the property it
// proves (INV-C26-n) or the failure it rules out (FM-C26-n), numbered on from PR-A's.

type Row = EventRow & Record<string, unknown>;
const tables = () => [EVENTS.colony, EVENTS.player] as unknown as Record<string, Row>[];
const allRows = (): [string, Row][] => tables().flatMap((t) => Object.entries(t));
const saved = allRows().map(([, row]) => ({ row, phases: { ...row.phases }, cap: row.cap }));
afterEach(() => {
  for (const { row, phases, cap } of saved) Object.assign(row, { phases, cap });
});

/** Only `keys` roll, at `chance` (capped at 1) in each phase they list, their mood and other modifiers kept; every other row at 0. */
function only(keys: readonly string[], chance = 1) {
  for (const [k, row] of allRows()) {
    const on = keys.includes(k);
    row.phases = Object.fromEntries(Object.keys(row.phases).map((p) => [p, on ? chance : 0]));
    if (on) row.cap = 1;
  }
}

/** Each band's lowest and highest happiness, from HAPPINESS.bands. */
const { bands } = HAPPINESS;
const EDGES: Record<MoodBand, [number, number]> = {
  thriving: [bands.thriving, 100],
  content: [bands.content, bands.thriving - 1],
  restless: [bands.restless, bands.content - 1],
  unhappy: [bands.unhappy, bands.restless - 1],
  unrest: [0, bands.unhappy - 1],
};
const BANDS = Object.keys(EDGES) as MoodBand[];
const MID = (band: MoodBand) => Math.round((EDGES[band][0] + EDGES[band][1]) / 2);

/**
 * A politics game in the first month events may roll, with the mood at `h`: p0 works three Food plots, p1 two Food
 * plots and an Energy plot, p2 one Energy plot, p3 nothing; rich ground and no specials, every player with Energy and Water to spare;
 * Food at its usual price; clean air.
 */
function colonyAt(h: number, { seed = 4, politics = true } = {}): GameState {
  const state = createGame({ seed, players: [0, 1, 2, 3].map((i) => ({ id: `p${i}`, name: `P${i}`, isAi: false })), politics });
  state.month = EVENTS.firstMonth;
  if (state.politics) state.politics = { ...state.politics, governor: 'p0', election: null, council: null };
  if (state.colony) state.colony.happiness = h;
  for (const t of state.tiles) delete t.special;
  const land = state.tiles.filter((t) => t.terrain !== 'store');
  const plots: [string, 'food' | 'energy'][] = [['p0', 'food'], ['p0', 'food'], ['p0', 'food'], ['p1', 'food'], ['p1', 'food'], ['p1', 'energy'], ['p2', 'energy']];
  plots.forEach(([owner, outfit], i) => {
    const t = land[i * 3]!;
    Object.assign(t, { owner, outfit, traits: [], pollution: 0, ground: { ...t.ground, food: 6, energy: 6 } });
  });
  for (const p of state.players) Object.assign(p.stock, { energy: 20, water: 20, food: 10 });
  state.store.posted.food = GOOD_CONFIG.food.refPrice;
  state.air = 0;
  return state;
}

function row(key: string): Row {
  const found = allRows().find(([k]) => k === key);
  expect(found, `a row ${key}`).toBeDefined();
  return found![1];
}

/** A row's chance in `phase` at both edges of every band, for `player` (a colony row reads none). */
function chances(key: string, phase: 'planning' | 'development' | 'production' | 'upkeep', { player, tweak = () => {} }: { player?: string; tweak?: (s: GameState) => void } = {}) {
  return BANDS.map((band) =>
    EDGES[band].map((h) => {
      const state = colonyAt(h);
      tweak(state);
      return eventChance(state, row(key), phase, player === undefined ? {} : { player });
    }),
  );
}
const close = (xs: number[]) => xs.map((x) => [expect.closeTo(x), expect.closeTo(x)]);

describe("C26 PR-B: MULE theft's mood part", () => {
  it('INV-C26-9 (MULE theft): the mood tilts its odds in development and at the month end, never when Thriving; politics off rolls it as today', () => {
    for (const phase of ['development', 'upkeep'] as const) {
      const base = EVENTS.player.muleTheft.phases[phase];
      expect(chances('muleTheft', phase, { player: 'p0' })).toEqual(close([0, base, base + 0.005, base + 0.02, base + 0.04]));
      const off = colonyAt(MID('unrest'), { politics: false });
      expect(eventChance(off, row('muleTheft'), phase, { player: 'p0' })).toBe(base);
    }
  });

  it('FM-C26-5 ("never when" is a hard zero): a certain MULE theft never fires when Thriving, and fires from Content down', () => {
    only(['muleTheft']);
    const thefts = (band: MoodBand) => {
      const state = colonyAt(MID(band));
      state.phase = 'development';
      return firePhase(state, 'development').filter((e) => e.key === 'muleTheft').length;
    };
    expect(BANDS.map((b) => [b, thefts(b) > 0])).toEqual(BANDS.map((b) => [b, b !== 'thriving']));
  });
});

describe('C26 PR-B: the store strike, in development', () => {
  /** A colony in development at mood `h`, with this phase's events fired. */
  const developing = (h: number, politics = true) => {
    const state = colonyAt(h, { politics });
    state.phase = 'development';
    firePhase(state, 'development');
    return state;
  };

  it("INV-C26-10 (store strike odds): Unhappy +2, Unrest +4, 0 otherwise; no colony, no strike, even made certain", () => {
    expect(chances('storeStrike', 'development')).toEqual(close([0, 0, 0, 0.02, 0.04]));
    only(['storeStrike']);
    expect(developing(MID('unrest'), false).monthEvents).toEqual([]);
  });

  it('FM-C26-6 (store strike): the store sells no MULEs this turn: buyMule is refused with its message and nothing moves', () => {
    only(['storeStrike']);
    const state = developing(MID('unrest'));
    expect(state.monthEvents).toMatchObject([{ key: 'storeStrike', phase: 'development', scope: 'colony', sign: 'bad' }]);
    expect(state.monthEvents[0]!.effects).toBeUndefined();
    const before = { money: state.players[0]!.money, mules: state.store.mules, capital: state.store.capital };
    expect(before.mules).toBeGreaterThan(0);
    expect(() => buyMule(state, 'p0')).toThrow(new RuleError('The store is on strike: no MULEs this turn'));
    expect({ money: state.players[0]!.money, mules: state.store.mules, capital: state.store.capital }).toEqual(before);
    expect(state.players[0]!.carriedMule).toBeNull();
    // With no strike this turn the same buy goes through.
    only([]);
    const plain = developing(MID('unrest'));
    buyMule(plain, 'p0');
    expect(plain.players[0]!.carriedMule).toBe('empty');
  });
});

/** Production from development, as the month's phases run it; the report it files. */
function produce(state: GameState) {
  state.phase = 'development';
  advancePhase(state);
  return state.history.at(-1)!;
}

/** Each of `tiles`' output in `report`. */
const madeAt = (report: MonthReport, tiles: number[]) => tiles.map((i) => report.lines!.find((l) => l.tile === i)!.made);
const plotsOf = (state: GameState, owner: string, good?: string) =>
  state.tiles.flatMap((t, i) => (t.owner === owner && t.outfit && (good === undefined || t.outfit === good) ? [i] : []));
/** Last month's report, with the air points each player caused. */
const caused = (state: GameState, by: Record<string, number>) => state.history.push({ month: state.month - 1, pollutionBy: by } as MonthReport);

describe('C26 PR-B: the walkout, in production', () => {
  it('INV-C26-11 (walkout odds): Restless +0.5, Unhappy +2, Unrest +4, the richest +1; never when Thriving', () => {
    // p2 is neither the richest nor the poorest; p0 is the richest (cash plus land, a tie to the first seat).
    expect(chances('walkout', 'production', { player: 'p2' })).toEqual(close([0, 0, 0.005, 0.02, 0.04]));
    expect(chances('walkout', 'production', { player: 'p0' })).toEqual(close([0, 0.01, 0.015, 0.03, 0.05]));
  });

  it("INV-C26-12 (walkout's polluter part): +0.5 for every air point the player caused, only when Restless or worse, up to the row's cap", () => {
    const tweak = (points: number) => (s: GameState) => caused(s, { p2: points });
    expect(chances('walkout', 'production', { player: 'p2', tweak: tweak(10) })).toEqual(close([0, 0, 0.055, 0.07, 0.09]));
    expect(chances('walkout', 'production', { player: 'p2', tweak: tweak(1000) })).toEqual(close([0, 0, 0.9, 0.9, 0.9]));
  });

  it("INV-C26-13 (walkout's effect): every working plot of the player's most-worked good makes 20%, floored; its plots carry their deltas; no plot, no walkout", () => {
    only([]);
    const full = produce(colonyAt(MID('unrest')));
    only(['walkout']);
    const state = colonyAt(MID('unrest'));
    const report = produce(state);
    const walkouts = report.events!.filter((e) => e.key === 'walkout');
    // p3 works no plot, so it has no walkout; p1 works two Food plots and one Energy plot, so Food walks out.
    expect(walkouts.map((e) => [e.player, e.scope, e.sign, e.phase])).toEqual(['p0', 'p1', 'p2'].map((p) => [p, 'personal', 'bad', 'production']));
    for (const [player, good] of [['p0', 'food'], ['p1', 'food'], ['p2', 'energy']] as const) {
      const hit = plotsOf(state, player, good);
      const before = madeAt(full, hit);
      expect(before.every((n) => n >= 5)).toBe(true);
      const after = before.map((n) => Math.floor(n * 0.2));
      expect(madeAt(report, hit)).toEqual(after);
      const event = walkouts.find((e) => e.player === player)!;
      expect(event.plots.map((p) => [p.index, p.good, p.delta])).toEqual(hit.map((i, k) => [i, good, after[k]! - before[k]!]));
    }
    // p1's Energy plot works in full.
    const energy = plotsOf(state, 'p1', 'energy');
    expect(madeAt(report, energy)).toEqual(madeAt(full, energy));
  });

  it("FM-C26-7 (walkout's pick): a tie between the player's most-worked goods goes to the event's dice, each good on some seed, and replays", () => {
    only(['walkout']);
    const tied = (seed: number) => {
      const state = colonyAt(MID('unrest'), { seed });
      const free = state.tiles.find((t) => t.terrain !== 'store' && !t.owner)!;
      Object.assign(free, { owner: 'p1', outfit: 'energy', traits: [], pollution: 0 });
      return state;
    };
    const pick = (seed: number) => produce(tied(seed)).events!.find((e) => e.key === 'walkout' && e.player === 'p1')?.plots.map((p) => p.good);
    const picks = [1, 2, 3, 4, 5, 6, 7, 8].map(pick);
    for (const goods of picks) expect([['food', 'food'], ['energy', 'energy']]).toContainEqual(goods);
    expect(new Set(picks.map((g) => g[0]))).toEqual(new Set(['food', 'energy']));
    expect(pick(3)).toEqual(pick(3));
  });

  it('FM-C26-8 (walkout and general strike): on the same plot they stack in fired order, the unpaid strike last, each floored', () => {
    only(['generalStrike']);
    const state = colonyAt(MID('unrest'));
    firePhase(state, 'planning');
    only([]);
    const full = produce(colonyAt(MID('unrest')));
    only(['walkout']);
    const report = produce(state);
    const food = plotsOf(state, 'p0', 'food');
    expect(report.events!.map((e) => [e.key, e.player])).toContainEqual(['walkout', 'p0']);
    expect(madeAt(report, food)).toEqual(madeAt(full, food).map((n) => Math.floor(Math.floor(n * 0.2) * COLONY.strike.output)));
  });
});
