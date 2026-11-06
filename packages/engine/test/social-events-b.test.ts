import { afterEach, describe, expect, it } from 'vitest';
import {
  createGame,
  eventChance,
  EVENTS,
  firePhase,
  GOOD_CONFIG,
  HAPPINESS,
  type EventRow,
  type GameState,
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
 * plots and an Energy plot, p2 one Energy plot, p3 nothing; plain ground, every player with Energy and Water to spare;
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
  plots.forEach(([owner, outfit], i) => Object.assign(land[i * 3]!, { owner, outfit, traits: [], pollution: 0 }));
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
