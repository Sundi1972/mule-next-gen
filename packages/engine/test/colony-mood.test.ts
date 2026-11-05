import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  callStrike,
  cloneForSim,
  createGame,
  createRng,
  GAME,
  HAPPINESS,
  moodBand,
  moodInputs,
  moodShift,
  moodStep,
  moodTarget,
  PERCENT,
  POLITICS,
  PRESTIGE,
  runColony,
  wealthGap,
  type GameState,
  type MoodInputs,
} from '../src/index.js';

const SEATS = ['lena', 'brix', 'ossa', 'kai'];
const W = HAPPINESS.weights;

/** A politics game in month 1 with Lena governing and no election open; the air clean and the tax at its free level. */
function colony(): GameState {
  const state = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })) });
  state.politics = { ...state.politics!, governor: 'lena', election: null };
  state.treasury.salesTax = W.taxFree / PERCENT;
  state.air = 0;
  return state;
}

const QUIET: MoodInputs = { short: 0, air: 0, tax: W.taxFree, broken: 0, prestige: 0, gap: 0 };

describe('C23: the colony\'s happiness (RULE-20)', () => {
  it('T-AC-31: each input moves the target its own way with the others fixed; a month\'s step never exceeds maxStep and h stays 0..100', () => {
    const rng = createRng(20);
    const draw = (): MoodInputs => ({
      short: rng.int(0, 5),
      air: rng.int(0, 100),
      tax: rng.int(POLITICS.tax.min, POLITICS.tax.max),
      broken: rng.chance(0.5) ? 1 : 0,
      prestige: rng.int(0, 25),
      gap: rng.int(0, 20_000),
    });
    // Worse with more of it: shortages, air, tax, a broken promise, the gap. Better with more prestige.
    const worse: (keyof MoodInputs)[] = ['short', 'air', 'tax', 'broken', 'gap'];
    let moved = 0;
    for (let i = 0; i < 500; i++) {
      const at = draw();
      const target = moodTarget(at);
      expect(target).toBeGreaterThanOrEqual(0);
      expect(target).toBeLessThanOrEqual(100);
      for (const key of worse) {
        const more = { ...at, [key]: key === 'broken' ? 1 : at[key] + (key === 'gap' ? 1_000 : 1) };
        expect(moodTarget(more), `more ${key} never raises the target`).toBeLessThanOrEqual(target);
        if (moodTarget(more) < target) moved++;
      }
      expect(moodTarget({ ...at, prestige: at.prestige + 1 }), 'more prestige never lowers the target').toBeGreaterThanOrEqual(target);

      const h = rng.int(0, 100);
      const next = moodStep(h, target);
      expect(Number.isInteger(next)).toBe(true);
      expect(Math.abs(next - h)).toBeLessThanOrEqual(HAPPINESS.maxStep);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThanOrEqual(100);
      // It moves toward the target and never past it.
      if (target >= h) expect(next).toBeGreaterThanOrEqual(h);
      if (target <= h) expect(next).toBeLessThanOrEqual(h);
      expect(Math.abs(next - target)).toBeLessThanOrEqual(Math.abs(h - target) + 0.5);
    }
    expect(moved, 'the inputs do move the target, not only never raise it').toBeGreaterThan(100);
  });

  it("T-AC-31: RULE-20's example — from 60, a month with two goods short and the air at 70 falls by maxStep to Restless", () => {
    const target = moodTarget({ ...QUIET, short: 2, air: 70 });
    expect(target).toBeCloseTo(HAPPINESS.base - 2 * W.shortage - W.air * (70 - W.airFree));
    expect(moodStep(60, target)).toBe(60 - HAPPINESS.maxStep);
    expect(moodBand(60 - HAPPINESS.maxStep)).toBe('restless');
    expect(moodTarget(QUIET), 'a quiet month aims at the base').toBe(HAPPINESS.base);
    expect(moodTarget({ ...QUIET, prestige: W.prestigeCap + 10 }), 'prestige past its cap adds nothing').toBe(moodTarget({ ...QUIET, prestige: W.prestigeCap }));
    expect(moodTarget({ ...QUIET, gap: 1_000_000 }), 'the gap past its cap takes nothing more').toBe(moodTarget({ ...QUIET, gap: W.gapCap * W.gapUnit }));
  });

  it('T-AC-31: moodInputs reads the month: the shortages given, the air, the tax in whole %, standing prestige and the gap', () => {
    const state = colony();
    state.air = 55;
    state.treasury.salesTax = 9 / PERCENT;
    state.players[0]!.money += 2_500;
    state.colony!.projects.push({ id: 'park', stage: 'standing', funded: { credits: 0, goods: {} }, monthsLeft: null, plot: null, since: 1, plaque: {} });
    expect(moodInputs(state, ['food', 'energy'])).toEqual({ short: 2, air: 55, tax: 9, broken: 0, prestige: PRESTIGE.park.prestige, gap: 2_500 });
  });

  it("T-AC-31: a real upkeep feeds the mood that upkeep's shortages, not the report's empty list from production", () => {
    const state = colony();
    while (state.phase !== 'auction') advancePhase(state);
    state.store.stock.food = 0;
    state.store.stock.water = 0;
    advancePhase(state);
    expect(state.phase).toBe('upkeep');
    const short = state.history.at(-1)!.shortages;
    expect(short.length, 'an empty shelf leaves the colonists short').toBeGreaterThan(0);
    expect(state.colony!.happiness).toBe(moodStep(HAPPINESS.start, moodTarget(moodInputs(state, short))));
    expect(state.colony!.happiness).toBeLessThan(moodStep(HAPPINESS.start, moodTarget(moodInputs(state, []))));
  });

  it('T-AC-32: the unknowns contribute 0 — no Governor, no promise this month, one player, nothing short', () => {
    const none = colony();
    none.politics = { ...none.politics!, governor: null };
    expect(moodInputs(none, [])).toMatchObject({ short: 0, broken: 0 });

    const kept = colony();
    kept.colony!.promises.push({ month: kept.month, governor: 'lena', kind: 'hold', kept: true });
    expect(moodInputs(kept, []).broken).toBe(0);
    const earlier = colony();
    earlier.month = 3;
    earlier.colony!.promises.push({ month: 2, governor: 'lena', kind: 'hold', kept: false });
    expect(moodInputs(earlier, []).broken, "last month's broken promise is not this month's").toBe(0);
    const broken = colony();
    broken.colony!.promises.push({ month: broken.month, governor: 'lena', kind: 'hold', kept: false });
    expect(moodInputs(broken, []).broken).toBe(1);

    // A game needs two players at least; the helper is asked of one, as a colony down to its last settler would be.
    const alone = colony();
    alone.players = alone.players.slice(0, 1);
    alone.players[0]!.money += 5_000;
    expect(wealthGap(alone)).toBe(0);
  });

  it('T-AC-32: the gap is the richest less the poorest by cash and land, from one helper', () => {
    const state = colony();
    const plot = state.tiles.find((t) => t.owner === null && t.terrain !== 'store')!;
    plot.owner = 'brix';
    state.players.find((p) => p.id === 'brix')!.money += 300;
    const worth = (id: string) => state.players.find((p) => p.id === id)!.money + state.tiles.filter((t) => t.owner === id).length * GAME.plotScore;
    const values = SEATS.map(worth);
    expect(wealthGap(state)).toBe(Math.max(...values) - Math.min(...values));
  });

  it('T-AC-33 (§7 mood runaway): from 30, quiet months with a park standing bring the colony back to 60 within 6 upkeeps', () => {
    const state = colony();
    state.colony!.happiness = 30;
    state.treasury.money = 10_000;
    state.colony!.projects.push({ id: 'park', stage: 'standing', funded: { credits: 0, goods: {} }, monthsLeft: null, plot: null, since: 1, plaque: {} });
    const seen: number[] = [];
    for (let month = 0; month < 6; month++) {
      runColony(state, []);
      seen.push(state.colony!.happiness);
    }
    expect(seen.at(-1)).toBeGreaterThanOrEqual(60);
    expect(seen.every((h, i) => h - (i === 0 ? 30 : seen[i - 1]!) <= HAPPINESS.maxStep)).toBe(true);
    expect(state.colony!.monthEnds.at(-1)!.happiness, "the month end carries this month's mood").toBe(seen.at(-1));
  });

  it('T-AC-34: moodShift moves h by its delta at once, not capped by maxStep, and clamps to 0..100', () => {
    const state = colony();
    state.colony!.happiness = 78;
    moodShift(state, 10);
    expect(state.colony!.happiness).toBe(88);
    moodShift(state, 50);
    expect(state.colony!.happiness).toBe(100);
    moodShift(state, -150);
    expect(state.colony!.happiness).toBe(0);
  });

  it.each([
    { what: 'moodShift', write: (s: GameState) => moodShift(s, 10), read: (s: GameState) => s.colony!.happiness },
    { what: 'callStrike', write: (s: GameState) => callStrike(s, 'food'), read: (s: GameState) => s.colony!.strike },
  ])("INV-whatif (HC-21): $what on a what-if copy never reaches the real game, and the real game's never reaches a copy", ({ write, read }) => {
    // The real game has written once, so it owns its colony, which a fresh copy then shares until either side writes.
    const real = colony();
    moodShift(real, -1);
    const before = read(real);
    const copy = cloneForSim(real);
    write(copy);
    expect(read(real), "the copy's write stays in the copy").toEqual(before);

    const later = cloneForSim(real);
    write(real);
    expect(read(later), "the real game's later write stays out of a copy").toEqual(before);
  });

  it('T-AC-34: a new colony starts at HAPPINESS.start; with politics off there is no colony and moodShift does nothing', () => {
    expect(colony().colony!.happiness).toBe(HAPPINESS.start);
    const off = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })), politics: false });
    moodShift(off, 10);
    expect(off.colony).toBeNull();
  });

  it.each([
    [100, 'thriving'],
    [HAPPINESS.bands.thriving, 'thriving'],
    [HAPPINESS.bands.thriving - 1, 'content'],
    [HAPPINESS.bands.content, 'content'],
    [HAPPINESS.bands.content - 1, 'restless'],
    [HAPPINESS.bands.restless, 'restless'],
    [HAPPINESS.bands.restless - 1, 'unhappy'],
    [HAPPINESS.bands.unhappy, 'unhappy'],
    [HAPPINESS.bands.unhappy - 1, 'unrest'],
    [0, 'unrest'],
  ] as const)('T-AC-34: moodBand(%i) is %s', (h, band) => {
    expect(moodBand(h)).toBe(band);
  });
});
