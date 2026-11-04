import { describe, expect, it } from 'vitest';
import {
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
  runColony,
  wealthGap,
  type GameState,
  type MoodInputs,
} from '../src/index.js';

const SEATS = ['lena', 'brix', 'ossa', 'kai'];
const W = HAPPINESS.weights;

/** A politics game in month 1 with Lena governing and no election open; the air clean and the tax at its free level. */
function colony(seats = SEATS): GameState {
  const state = createGame({ seed: 7, players: seats.map((id) => ({ id, name: id, isAi: false })) });
  state.politics = { ...state.politics!, governor: 'lena', election: null };
  state.treasury.salesTax = W.taxFree / PERCENT;
  state.history.at(-1)!.air = 0;
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
  });

  it('T-AC-31: moodInputs reads the month: the shortages given, the air, the tax in whole %, standing prestige and the gap', () => {
    const state = colony();
    state.history.at(-1)!.air = 55;
    state.treasury.salesTax = 9 / PERCENT;
    state.players[0]!.money += 2_500;
    expect(moodInputs(state, ['food', 'energy'])).toEqual({ short: 2, air: 55, tax: 9, broken: 0, prestige: 0, gap: 2_500 });
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

    const alone = colony(['lena']);
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
