import { afterEach, describe, expect, it } from 'vitest';
import {
  advancePhase,
  cloneForSim,
  colonistDemand,
  createGame,
  eventChance,
  EVENTS,
  firePhase,
  GOOD_CONFIG,
  HAPPINESS,
  monthlyDemand,
  moodBand,
  payStrike,
  runUpkeep,
  COLONY,
  SOCIAL_EVENTS,
  START,
  UPKEEP,
  type EventRow,
  type GameState,
  type MonthEvent,
  type MoodBand,
} from '../src/index.js';

// G-5 C26: the colony's planning social events, each fired through the engine's planning roll (firePhase) on a seeded
// state. The spec's §6 has no T-AC row for C26's events (its rows are B-AC-25's production clause and C23/C37's), so
// the rest are named INV-C26-n (a property the rows must keep) or FM-C26-n (a failure the rows must never show).

type Row = EventRow & Record<string, unknown>;
const tables = () => [EVENTS.colony, EVENTS.player] as unknown as Record<string, Row>[];
const allRows = (): [string, Row][] => tables().flatMap((t) => Object.entries(t));
const saved = allRows().map(([, row]) => ({ row, phases: { ...row.phases }, cap: row.cap }));
afterEach(() => {
  for (const { row, phases, cap } of saved) Object.assign(row, { phases, cap });
});

const SOCIAL = ['festival', 'generalStrike', 'emigrationWave', 'immigrationWave', 'blamedForUnrest'] as const;

/** Only `keys` roll, at `chance` (capped at 1) in each phase they list, their mood and other modifiers kept; every other row at 0. */
function only(keys: readonly string[], chance = 1) {
  for (const [k, row] of allRows()) {
    const on = keys.includes(k);
    row.phases = Object.fromEntries(Object.keys(row.phases).map((p) => [p, on ? chance : 0]));
    if (on) row.cap = 1;
  }
}

/** The middle of each band, from HAPPINESS.bands. */
const AT: Record<MoodBand, number> = {
  thriving: HAPPINESS.bands.thriving + 5,
  content: HAPPINESS.bands.content + 5,
  restless: HAPPINESS.bands.restless + 5,
  unhappy: HAPPINESS.bands.unhappy + 5,
  unrest: HAPPINESS.bands.unhappy - 5,
};
const BANDS = Object.keys(AT) as MoodBand[];

/**
 * A politics game in planning, in the first month events may roll, with the mood at `h`: p0 governs, no vote open. p0
 * works three Food plots, p1 two Food plots and p2 one Energy plot, all plain ground, every player with Energy and
 * Water to spare; Food at its usual price.
 */
function colonyAt(h: number, { seed = 4, politics = true } = {}): GameState {
  const state = createGame({ seed, players: [0, 1, 2, 3].map((i) => ({ id: `p${i}`, name: `P${i}`, isAi: false })), politics });
  state.month = EVENTS.firstMonth;
  if (state.politics) state.politics = { ...state.politics, governor: 'p0', election: null, council: null };
  if (state.colony) state.colony.happiness = h;
  for (const t of state.tiles) delete t.special;
  const land = state.tiles.filter((t) => t.terrain !== 'store');
  const plots: [string, 'food' | 'energy'][] = [['p0', 'food'], ['p0', 'food'], ['p0', 'food'], ['p1', 'food'], ['p1', 'food'], ['p2', 'energy']];
  plots.forEach(([owner, outfit], i) => Object.assign(land[i * 3]!, { owner, outfit, traits: [], pollution: 0 }));
  for (const p of state.players) Object.assign(p.stock, { energy: 20, water: 20, food: 10 });
  state.store.posted.food = GOOD_CONFIG.food.refPrice;
  state.air = 0;
  return state;
}

const foodPlots = (state: GameState) => state.tiles.flatMap((t, i) => (t.owner && t.outfit === 'food' ? [i] : []));
const row = (key: string) => allRows().find(([k]) => k === key)![1];
const chanceIn = (key: string, band: MoodBand, tweak: (s: GameState) => void = () => {}) => {
  const state = colonyAt(AT[band]);
  tweak(state);
  return eventChance(state, row(key), 'planning', key === 'blamedForUnrest' ? { player: 'p3' } : {});
};

/** Production from development, as the month's phases run it; the report it files. */
function produce(state: GameState) {
  state.phase = 'development';
  advancePhase(state);
  return state.history.at(-1)!;
}

describe('C26: the colony\'s planning social events, fired through the planning roll', () => {
  it('INV-C26-1 (festival): Mood +10 through moodShift, prestige +2 through addPrestige, and the colonists\' Food demand +25% this month', () => {
    only(['festival']);
    const state = colonyAt(AT.content);
    const before = state.colony!.happiness;
    const fired = firePhase(state, 'planning');
    const units = Math.round((state.colonists / UPKEEP.colonistsPerUnit) * SOCIAL_EVENTS.colony.festival.foodDemand);
    expect(units).toBeGreaterThan(0);
    expect(fired).toMatchObject([
      {
        key: 'festival',
        phase: 'planning',
        scope: 'colony',
        sign: 'good',
        effects: [
          { on: 'colony', what: 'mood', delta: SOCIAL_EVENTS.colony.festival.moodShift },
          { on: 'colony', what: 'prestige', delta: SOCIAL_EVENTS.colony.festival.prestige },
          { on: 'store', what: 'food', delta: units },
        ],
      },
    ]);
    expect(state.colony!.happiness).toBe(before + 10);
    expect(state.colony!.permanentPrestige).toBe(2);

    // The extra Food is demand this month: the store's outlook and the colonists' meal at upkeep both carry it.
    const plain = colonyAt(AT.content);
    expect(monthlyDemand(state).food - monthlyDemand(plain).food).toBeCloseTo(colonistDemand(state, 'food', units));
    // A shelf one unit short of the festival month's need, at a price the colonists' wages cover, and no ship in port:
    // the festival month runs short of Food, a plain month does not.
    const need = state.colonists / UPKEEP.colonistsPerUnit;
    for (const s of [state, plain]) {
      Object.assign(s.store, { stock: { ...s.store.stock, food: need + units - 1 }, posted: { ...s.store.posted, food: 1 } });
      s.ship = { ...s.ship, arrives: s.maxMonths + 1 };
    }
    expect(runUpkeep(state).shortages).toContain('food');
    expect(runUpkeep(plain).shortages).not.toContain('food');
  });

  it("FM-C26-4 (review of #370): the festival's Food counts only until the colonists' meal; the export ship after it buys as in a plain month", () => {
    only(['festival']);
    const state = colonyAt(AT.content);
    firePhase(state, 'planning');
    const units = state.monthEvents[0]!.effects!.find((f) => f.what === 'food')!.delta;
    const plain = colonyAt(AT.content);
    // The festival month's shelf holds its extra Food, so after the meal both shelves are the same; a ship in port wants Food.
    for (const [s, food] of [[state, 60 + units], [plain, 60]] as const) {
      Object.assign(s.store, { stock: { ...s.store.stock, food }, posted: { ...s.store.posted, food: 1 } });
      s.ship = { ...s.ship, arrives: s.month, goods: ['food'], hold: { food: 100 }, bought: {} };
    }
    runUpkeep(state);
    runUpkeep(plain);
    expect(plain.store.stock.food, 'the ship took some Food in the plain month').toBeLessThan(60);
    expect(state.store.stock.food, "the ship's Food demand is the plain month's").toBe(plain.store.stock.food);
  });

  it('INV-C26-2 (emigration): 10% fewer colonists for good, as an effect on the colony; no mood delta', () => {
    only(['emigrationWave']);
    const state = colonyAt(AT.unrest);
    const was = state.colonists;
    const fired = firePhase(state, 'planning');
    const n = Math.round(was * (1 - SOCIAL_EVENTS.colony.emigrationWave.shrink)) - was;
    expect(n).toBeLessThan(0);
    expect(fired).toMatchObject([{ key: 'emigrationWave', phase: 'planning', scope: 'colony', sign: 'bad', effects: [{ on: 'colony', what: 'colonists', delta: n }] }]);
    expect(state.colonists).toBe(was + n);
    expect(state.colony!.happiness).toBe(AT.unrest);
  });

  it("INV-C26-3 (immigration's mood part): the mood tilts its odds, its effect stays today's colonists, and politics off rolls it as today", () => {
    const base = EVENTS.colony.immigrationWave.phases.planning;
    expect(BANDS.map((b) => chanceIn('immigrationWave', b))).toEqual([base + 0.06, base + 0.01, base, 0, 0].map((c) => expect.closeTo(c)));
    const off = colonyAt(AT.content, { politics: false });
    expect(eventChance(off, row('immigrationWave'), 'planning')).toBe(base);
    only(['immigrationWave']);
    const state = colonyAt(AT.thriving);
    const [wave] = firePhase(state, 'planning');
    expect(wave!.effects!.map((e) => e.what)).toEqual(['colonists']);
  });

  it('INV-C26-4 (blamed for the unrest): each player rolls it; it takes 1 reputation through reputationShift', () => {
    only(['blamedForUnrest']);
    const state = colonyAt(AT.unrest);
    const fired = firePhase(state, 'planning');
    expect(fired.map((e) => [e.key, e.player, e.scope, e.phase, e.effects])).toEqual(
      state.players.map((p) => ['blamedForUnrest', p.id, 'personal', 'planning', [{ on: p.id, what: 'reputation', delta: SOCIAL_EVENTS.player.blamedForUnrest.reputation }]]),
    );
    expect(state.players.map((p) => p.reputation)).toEqual(state.players.map(() => START.reputation - 1));
  });

  it("INV-C26-5 (general strike): announced in planning on the colony's biggest good, through callStrike; no mood delta", () => {
    only(['generalStrike']);
    const state = colonyAt(AT.unhappy);
    const fired = firePhase(state, 'planning');
    expect(fired).toMatchObject([{ key: 'generalStrike', phase: 'planning', scope: 'colony', sign: 'bad' }]);
    expect(fired[0]!.effects).toBeUndefined();
    expect(fired[0]!.plots.map((p) => [p.index, p.good, p.delta])).toEqual(foodPlots(state).map((i) => [i, 'food', 0]));
    expect(state.colony!.strike).toEqual({ month: state.month, good: 'food', cost: expect.any(Number), paid: false });
  });

  describe('B-AC-25 (production clause): the struck good\'s plots in production', () => {
    /** The month's planning with a Food strike announced, and its twin with none; every production row at 0. */
    const struck = () => {
      only(['generalStrike']);
      const state = colonyAt(AT.unhappy);
      firePhase(state, 'planning');
      only([]);
      return { state, twin: colonyAt(AT.unhappy) };
    };
    const made = (report: ReturnType<typeof produce>, tiles: number[]) => tiles.map((i) => report.lines!.find((l) => l.tile === i)!.made);

    it('unpaid: every Food plot makes COLONY.strike.output of its output, and production files a generalStrike event with each plot and its delta', () => {
      const { state, twin } = struck();
      const food = foodPlots(state);
      const full = made(produce(twin), food);
      expect(full.every((n) => n > 0)).toBe(true);
      const report = produce(state);
      const share = full.map((n) => Math.floor(n * COLONY.strike.output));
      expect(made(report, food)).toEqual(share);
      const strike = report.events!.filter((e: MonthEvent) => e.key === 'generalStrike');
      expect(strike).toMatchObject([{ phase: 'production', scope: 'colony', sign: 'bad' }]);
      expect(strike[0]!.plots.map((p) => [p.index, p.good, p.delta])).toEqual(food.map((i, k) => [i, 'food', share[k]! - full[k]!]));
      // Other goods produce in full.
      const energy = state.tiles.findIndex((t) => t.outfit === 'energy');
      expect(made(report, [energy])).toEqual(made(produce(colonyAt(AT.unhappy)), [energy]));
    });

    it('paid: the Governor pays the strikers, so there is no production event and the Food plots produce in full', () => {
      const { state, twin } = struck();
      state.treasury.money = 400;
      payStrike(state, 'p0');
      const food = foodPlots(state);
      const report = produce(state);
      expect(report.events!.filter((e: MonthEvent) => e.key === 'generalStrike')).toEqual([]);
      expect(made(report, food)).toEqual(made(produce(twin), food));
    });
  });

  it('FM-C26-1 (opposites don\'t mix): a festival and a general strike never fall in one month; the seeded dice keep one', () => {
    // Restless allows both rows; each certain, so only the excludes rule can keep one out.
    only(['festival', 'generalStrike']);
    const kept = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const keys = firePhase(colonyAt(AT.restless, { seed }), 'planning').map((e) => e.key);
      expect(keys.filter((k) => k === 'festival' || k === 'generalStrike')).toHaveLength(1);
      kept.add(keys[0]!);
    }
    expect([...kept].sort()).toEqual(['festival', 'generalStrike']);
  });

  it.each([
    { key: 'festival', never: ['unhappy', 'unrest'] },
    { key: 'generalStrike', never: ['thriving'] },
    { key: 'immigrationWave', never: ['unhappy', 'unrest'] },
  ] as { key: string; never: MoodBand[] }[])('FM-C26-2 ("never when" is a hard zero): $key never fires in $never, whatever raises it', ({ key, never }) => {
    only([key]);
    for (const band of BANDS) {
      // A stadium standing and Food dear raise what they raise; a hard zero stays 0.
      const raised = (s: GameState) => {
        s.colony!.projects.push({ id: 'stadium', stage: 'standing', funded: { credits: 0, goods: {} }, monthsLeft: null, plot: null, since: 1, plaque: {}, maxBid: null });
        s.store.posted.food = GOOD_CONFIG.food.refPrice * 2;
      };
      const chance = chanceIn(key, band, raised);
      expect([band, chance > 0]).toEqual([band, !never.includes(band)]);
      const fires = [1, 2, 3, 4, 5].some((seed) => {
        const state = colonyAt(AT[band], { seed });
        raised(state);
        return firePhase(state, 'planning').some((e) => e.key === key);
      });
      expect([band, fires]).toEqual([band, !never.includes(band)]);
    }
  });

  it('FM-C26-3 (HC-22): with politics off there is no mood, and no social event but immigration ever rolls, even made certain', () => {
    only(['festival', 'generalStrike', 'emigrationWave', 'blamedForUnrest']);
    for (let seed = 1; seed <= 10; seed++) expect(firePhase(colonyAt(AT.unrest, { seed, politics: false }), 'planning')).toEqual([]);
  });

  it("INV-C26-6 (the catalogue's odds): the mood tilts each row's chance by band, and its other raises add on top", () => {
    const at = (key: string, tweak?: (s: GameState) => void) => BANDS.map((b) => chanceIn(key, b, tweak));
    const close = (xs: number[]) => xs.map((x) => expect.closeTo(x));
    expect(at('festival')).toEqual(close([0.06, 0.02, 0.01, 0, 0]));
    const stadium = (s: GameState) => s.colony!.projects.push({ id: 'stadium', stage: 'standing', funded: { credits: 0, goods: {} }, monthsLeft: null, plot: null, since: 1, plaque: {}, maxBid: null });
    expect(at('festival', stadium)).toEqual(close([0.11, 0.07, 0.06, 0, 0]));
    expect(at('generalStrike')).toEqual(close([0, 0, 0.02, 0.05, 0.1]));
    const dearFood = (s: GameState) => (s.store.posted.food = GOOD_CONFIG.food.refPrice * 1.5 + 1);
    // UBER-AC-6's estimate: a troubled colony (Unhappy, Food above 1.5 times its usual price) draws strikes at 8% a month; a thriving one 0%.
    expect(at('generalStrike', dearFood)).toEqual(close([0, 0.03, 0.05, 0.08, 0.13]));
    expect(at('emigrationWave')).toEqual(close([0, 0, 0.01, 0.04, 0.08]));
    expect(at('emigrationWave', (s) => (s.air = 70))).toEqual(close([0.03, 0.03, 0.04, 0.07, 0.11]));
    // p3 is not the richest until it is.
    expect(at('blamedForUnrest')).toEqual(close([0, 0, 0, 0.02, 0.05]));
    expect(at('blamedForUnrest', (s) => (s.players[3]!.money = 100_000))).toEqual(close([0.02, 0.02, 0.02, 0.04, 0.07]));
  });

  it('INV-C26-7: over seeded months the mood stays 0..100 and moves in planning only by the mood effects, which only a festival carries', () => {
    only(SOCIAL, 0.5);
    let moved = 0;
    for (let seed = 1; seed <= 20; seed++) {
      for (const h of [0, 15, 45, 75, 95, 100]) {
        const state = colonyAt(h, { seed });
        const fired = firePhase(state, 'planning');
        const mood = fired.flatMap((e) => (e.effects ?? []).filter((f) => f.what === 'mood').map((f) => ({ key: e.key, delta: f.delta })));
        expect(mood.every((m) => m.key === 'festival')).toBe(true);
        const after = state.colony!.happiness;
        expect(after).toBeGreaterThanOrEqual(0);
        expect(after).toBeLessThanOrEqual(100);
        expect(after - h).toBe(mood.reduce((n, m) => n + m.delta, 0));
        if (after !== h) moved++;
        expect(moodBand(after)).toBeDefined();
      }
    }
    expect(moved).toBeGreaterThan(0);
  });

  it('INV-C26-8: a what-if copy rolls no social event, and the real game\'s planning roll replays from the seed', () => {
    only(SOCIAL);
    expect(firePhase(cloneForSim(colonyAt(AT.restless)), 'planning')).toEqual([]);
    expect(firePhase(colonyAt(AT.restless), 'planning')).toEqual(firePhase(colonyAt(AT.restless), 'planning'));
  });
});
