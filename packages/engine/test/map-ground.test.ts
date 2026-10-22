import { beforeAll, describe, expect, it } from 'vitest';
import {
  applyScarcity,
  dealGround,
  dealOdds,
  joinSeams,
  liftFloors,
  pickScarce,
  placePeaks,
  repairReach,
  type Dealt,
  type Lift,
} from '../src/map-ground.js';
import { layoutMap, type Layout } from '../src/map-layout.js';
import {
  checkMap,
  createRng,
  GROWN_ODDS,
  MAP,
  MINERAL_ODDS,
  sizeBand,
  TERRAIN_ODDS,
  type FloorGood,
  type GameMap,
  type Ground,
  type MapReport,
  type RuleId,
  type Terrain,
  type Tile,
} from '../src/index.js';

const PLAYERS = [2, 3, 4, 5, 6];
/** Seeds every stage test runs. */
const SEEDS = 200;
/**
 * The seams and scarcity stages fail rarely and only on 2-player maps, so their tests run
 * more seeds there, plus two seeds that broke them before the fields reached the map edges
 * (2p 171: stage 8 left 5 of 8 plots joined; 2p 2469: Smithore scarce, no cut kept S8). Those
 * maps are gone; the seeds stay as extra cover.
 */
const SEAM_SEEDS_2P = 1000;
const REGRESSION_SEEDS_2P = [171, 2469];
const FLOOR_GOODS: FloorGood[] = ['food', 'water', 'energy', 'smithore'];

type LandTerrain = Exclude<Terrain, 'store'>;

/** Every stage's output for one map, copied as produced so a stage that mutated its input can't fake a later test. */
interface Run {
  players: number;
  seed: number;
  /** In the stage tests' window (seed <= SEEDS); the rest only feed the seams and scarcity tests. */
  wide: boolean;
  layout: Layout;
  odds: Dealt;
  peaks: Dealt;
  scarce: FloorGood | null;
  floors: Dealt;
  reach: Dealt;
  reachLifts: Lift[];
  seams: Dealt;
  seamLifts: Lift[];
  scarcity: Dealt;
  scarcityLifts: Lift[];
}

let runs: Run[] | undefined;

function seedsFor(players: number): number[] {
  const count = players === 2 ? SEAM_SEEDS_2P : SEEDS;
  const seeds = Array.from({ length: count }, (_, k) => k + 1);
  return players === 2 ? [...seeds, ...REGRESSION_SEEDS_2P.filter((s) => s > count)] : seeds;
}

function allRuns(): Run[] {
  if (runs) return runs;
  const keep = (d: Dealt): Dealt => ({
    ...d,
    ground: d.ground.map((g) => ({ ...g })),
    fields: { food: [...d.fields.food], water: [...d.fields.water], energy: [...d.fields.energy], smithore: [...d.fields.smithore] },
  });
  const copyLifts = (lifts: Lift[]) => lifts.map((l) => ({ ...l }));
  // Filled locally and kept only when complete: a stage that throws must fail every test, not leave an empty cache.
  const built: Run[] = [];
  for (const players of PLAYERS) {
    for (const seed of seedsFor(players)) {
      // One rng from the layout on into the ground, as the generator runs them.
      const rng = createRng(seed);
      const layout = layoutMap(players, rng);
      const odds = keep(dealOdds(layout, players, rng));
      const peaks = keep(placePeaks(odds, rng));
      const scarce = pickScarce(rng);
      const floors = keep(liftFloors(peaks, scarce));
      const reached = repairReach(floors);
      const reachLifts = copyLifts(reached.lifts);
      const reach = keep(reached);
      const seamed = joinSeams(reach);
      const seamLifts = copyLifts(seamed.lifts);
      const seams = keep(seamed);
      const scarced = applyScarcity(seams, scarce);
      const scarcityLifts = copyLifts(scarced.lifts);
      const scarcity = keep(scarced);
      const wide = seed <= SEEDS;
      built.push({ players, seed, wide, layout, odds, peaks, scarce, floors, reach, reachLifts, seams, seamLifts, scarcity, scarcityLifts });
    }
  }
  runs = built;
  return built;
}

const stageRuns = () => allRuns().filter((r) => r.wide);

function toMap(layout: Layout, ground: Ground[]): GameMap {
  const tiles: Tile[] = layout.terrain.map((terrain, i) => ({
    x: i % layout.width,
    y: Math.floor(i / layout.width),
    terrain,
    peaks: 0,
    ground: ground[i]!,
    traits: [],
    owner: null,
    outfit: null,
    pollution: 0,
    filter: false,
    runMonths: 0,
  }));
  return { width: layout.width, height: layout.height, tiles };
}

const reports = new Map<Dealt, MapReport>();

/** checkMap on a stage's output, once per output: the scarcity and all-rules tests read the same one. */
function reportOf(run: Run, dealt: Dealt): MapReport {
  let report = reports.get(dealt);
  if (!report) {
    report = checkMap(toMap(run.layout, dealt.ground), run.players);
    reports.set(dealt, report);
  }
  return report;
}

/** Every (players, seed, rule, detail) a stage's output breaks among `rules`, plus whatever `extra` finds wrong. */
function failures(
  among: Run[],
  stage: (r: Run) => Dealt,
  rules: RuleId[],
  extra?: (r: Run, report: MapReport) => string[],
): string[] {
  const out: string[] = [];
  for (const run of among) {
    const report = reportOf(run, stage(run));
    const where = `${run.players}p seed ${run.seed}`;
    for (const v of report.violations.filter((v) => rules.includes(v.rule))) out.push(`${where} ${v.rule}: ${v.detail}`);
    for (const e of extra?.(run, report) ?? []) out.push(`${where}: ${e}`);
  }
  return out;
}

/** The published odds for a terrain and good, as ratings and their chances. */
function oddsOf(terrain: LandTerrain, good: FloorGood): { values: number[]; weights: readonly number[] } {
  const odds = TERRAIN_ODDS[terrain];
  if (good === 'smithore') return { values: [0, 1, 2, 3, 4], weights: MINERAL_ODDS[odds.mined.smithore] };
  return { values: [-2, -1, 0, 1, 2, 3], weights: GROWN_ODDS[odds.grown[good] ?? 'neutral'] };
}

/** Chance a plot of the terrain is dealt a good rating for the good, from the published odds. */
function chanceOfGood(terrain: LandTerrain, good: FloorGood): number {
  const { values, weights } = oddsOf(terrain, good);
  return values.reduce((sum, v, k) => sum + (v >= MAP.goodAt[good] ? weights[k]! : 0), 0);
}

/**
 * Replays the floor-lift rule from stage 6's input: each lift goes to the capable terrain whose
 * mean it raises least (counting earlier lifts on it), offering that terrain's highest-field plot
 * not yet good; then the likelier terrain, then the higher field. Names the first lift that differs.
 */
function floorLiftOrder(run: Run, good: FloorGood): string[] {
  const before = run.peaks.ground;
  const after = run.floors.ground;
  const field = run.peaks.fields[good];
  const threshold = MAP.goodAt[good];
  const lifted = new Set(run.layout.terrain.flatMap((_, i) => (after[i]![good] !== before[i]![good] ? [i] : [])));
  const terrains = [...plotsByTerrain(run.layout)].filter(([t]) => canBeGood(t, good));
  const target = Math.ceil((good === run.scarce ? MAP.floor[good] : MAP.normalLo[good]) * run.players);
  let have = run.layout.terrain.filter((_, i) => before[i]![good] >= threshold).length;
  const gained = new Map<LandTerrain, number>();
  const done = new Set<number>();
  while (have < target) {
    const offers = terrains.flatMap(([terrain, plots]) => {
      const next = plots.filter((i) => before[i]![good] < threshold && !done.has(i)).sort((a, b) => field[b]! - field[a]! || a - b)[0];
      if (next === undefined) return [];
      return [{ terrain, i: next, rise: ((gained.get(terrain) ?? 0) + threshold - before[next]![good]) / plots.length, odds: chanceOfGood(terrain, good) }];
    });
    const pick = offers.sort((a, b) => a.rise - b.rise || b.odds - a.odds || field[b.i]! - field[a.i]! || a.i - b.i)[0];
    if (!pick) break;
    if (!lifted.has(pick.i)) return [`${good} floor lift ${done.size + 1} should go to plot ${pick.i} (${pick.terrain}, mean +${pick.rise.toFixed(3)}), the least rise`];
    gained.set(pick.terrain, (gained.get(pick.terrain) ?? 0) + threshold - before[pick.i]![good]);
    done.add(pick.i);
    have++;
  }
  return done.size === lifted.size ? [] : [`${good}: ${lifted.size} floor lifts, the rule makes ${done.size}`];
}

/** Whether the terrain's odds give any chance of a good rating for the good. */
function canBeGood(terrain: LandTerrain, good: FloorGood): boolean {
  const { values, weights } = oddsOf(terrain, good);
  return values.some((v, k) => v >= MAP.goodAt[good] && weights[k]! > 0);
}

function plotsByTerrain(layout: Layout): Map<LandTerrain, number[]> {
  const out = new Map<LandTerrain, number[]>();
  layout.terrain.forEach((t, i) => {
    if (t === 'store') return;
    out.set(t, [...(out.get(t) ?? []), i]);
  });
  return out;
}

const steps = (layout: Layout, a: number, b: number) =>
  Math.abs((a % layout.width) - (b % layout.width)) + Math.abs(Math.floor(a / layout.width) - Math.floor(b / layout.width));

const sorted = (ratings: number[]) => [...ratings].sort((a, b) => a - b).join(',');

/**
 * A terrain's ratings for a good after a stage, from the ones before: each recorded lift on one
 * of its plots turns one `from` into exactly the threshold. Anything else changed is unrecorded.
 */
function expectedRatings(before: number[], lifts: { from: number }[], good: FloorGood): number[] | string {
  const out = [...before];
  for (const lift of lifts) {
    const at = out.indexOf(lift.from);
    if (at < 0) return `a lift from ${lift.from}, which the terrain never held`;
    out[at] = MAP.goodAt[good];
  }
  return out;
}

/** Whether `after` is `expected` with some good ratings lowered to exactly one under the threshold, and nothing else changed. */
function onlyLowered(expected: number[], after: number[], good: FloorGood): boolean {
  const count = (list: number[]) => list.reduce((m, r) => m.set(r, (m.get(r) ?? 0) + 1), new Map<number, number>());
  const want = count(expected);
  const got = count(after);
  const under = MAP.goodAt[good] - 1;
  let removed = 0;
  for (const r of new Set([...want.keys(), ...got.keys()])) {
    const diff = (want.get(r) ?? 0) - (got.get(r) ?? 0);
    if (r >= MAP.goodAt[good]) {
      if (diff < 0) return false;
      removed += diff;
    } else if (r !== under && diff !== 0) return false;
  }
  return (got.get(under) ?? 0) - (want.get(under) ?? 0) === removed;
}

/** A hand-built map: hills except `plains`, the store at the centre, every grown good rated good, Smithore and field per plot. */
interface FixtureSpec {
  players: number;
  width: number;
  height: number;
  /** Smithore rating of each plot (the store's is ignored). */
  smithore: (i: number) => number;
  plains?: number[];
  /** Field of each plot for every good; it fixes the lowering and lifting order. */
  field?: (i: number) => number;
}

function buildFixture(spec: FixtureSpec): { layout: Layout; dealt: Dealt } {
  const { players, width, height } = spec;
  const terrain: Terrain[] = Array.from({ length: width * height }, (_, i) => (spec.plains?.includes(i) ? 'plains' : 'hills'));
  terrain[Math.floor(height / 2) * width + Math.floor(width / 2)] = 'store';
  const layout: Layout = { width, height, terrain };
  const ground = terrain.map((t, i) =>
    t === 'store' ? { food: 0, water: 0, energy: 0, smithore: 0, crystite: 0, rareEarth: 0 } : { food: 3, water: 3, energy: 3, smithore: spec.smithore(i), crystite: 0, rareEarth: 0 },
  );
  const field = terrain.map((_, i) => spec.field?.(i) ?? i);
  const base = dealOdds(layout, players, createRng(1));
  return { layout, dealt: { ...base, ground, fields: { food: field, water: field, energy: field, smithore: field } } };
}

/** Good Smithore (rated 3) on exactly these plots, 0 elsewhere. */
const goodAt = (...plots: number[]) => (i: number) => (plots.includes(i) ? 3 : 0);

/**
 * What every seam lift must be: on a terrain whose odds allow good Smithore, beside the plot it
 * joins, raised from below the threshold to exactly it, and still good when its stage ends.
 */
function seamLiftProblems(layout: Layout, before: Ground[], after: Ground[], lifts: Lift[]): string[] {
  return lifts.flatMap((lift) => {
    const problems: string[] = [];
    const terrain = layout.terrain[lift.plot] as LandTerrain;
    if (!canBeGood(terrain, 'smithore')) problems.push(`seam lift at ${lift.plot} on ${terrain}, whose odds give no good Smithore`);
    if (lift.kind === 'seam' && steps(layout, lift.plot, lift.joins) !== 1) problems.push(`seam lift at ${lift.plot} doesn't touch the plot ${lift.joins} it joins`);
    if (before[lift.plot]!.smithore >= MAP.goodAt.smithore) problems.push(`seam lift at ${lift.plot} on a plot already good before the stage`);
    if (after[lift.plot]!.smithore !== MAP.goodAt.smithore) problems.push(`seam lift at ${lift.plot} ends rated ${after[lift.plot]!.smithore}, not ${MAP.goodAt.smithore}`);
    return problems;
  });
}

const smithoreCount = (ground: Ground[]) => ground.filter((g) => g.smithore >= MAP.goodAt.smithore).length;

/**
 * Stage 9 on a fixture with Smithore scarce: reach, floors and the scarce band always hold, the
 * listed `also` rules too, and every seam lift is a proper one; `expect` adds the fixture's own point.
 */
function scarcityFixture(name: string, spec: FixtureSpec, also: RuleId[], expect: (out: ReturnType<typeof applyScarcity>) => string[]) {
  return {
    check(): string[] {
      const { layout, dealt } = buildFixture(spec);
      const out = applyScarcity(dealt, 'smithore');
      const report = checkMap(toMap(layout, out.ground), spec.players);
      const problems = report.violations.filter((v) => ['F1', 'F2', 'F3', ...also].includes(v.rule)).map((v) => `${v.rule}: ${v.detail}`);
      if (report.metrics.scarce !== 'smithore') problems.push(`scarce on the map ${report.metrics.scarce ?? 'none'}, not smithore`);
      problems.push(...seamLiftProblems(layout, dealt.ground, out.ground, out.lifts), ...expect(out));
      return problems.map((p) => `fixture ${name}: ${p}`);
    },
  };
}

// Rows below are 1 plot high, 2 players (band 6-7, Smithore reach 5): lone good plots 11 apart each cover a stretch nobody else does.
const SCARCITY_FIXTURES = [
  // 3 players: band 9-11. 12 good plots, 7 in seams and 5 alone: lowering one lone plot leaves 7 of 11 joined (64%),
  // two leave 7 of 10 (70%), so only a deeper cut keeps S8.
  scarcityFixture(
    'deeper cut',
    { players: 3, width: 13, height: 4, smithore: goodAt(0, 1, 2, 4, 5, 10, 11, 26, 29, 46, 35, 38) },
    ['S8'],
    (out) => [
      ...(out.lifts.length > 0 ? [`${out.lifts.length} seam lifts where a deeper cut was enough`] : []),
      ...(smithoreCount(out.ground) !== 10 ? [`${smithoreCount(out.ground)} good Smithore plots, the deeper cut leaves 10`] : []),
    ],
  ),
  // Two pairs and 4 alone: no 6 or 7 of them keep S8, so one seam lift joins a lone plot and one more lone plot is lowered.
  scarcityFixture('seam lift', { players: 2, width: 9, height: 3, smithore: goodAt(0, 1, 7, 8, 18, 21, 23, 26) }, ['S8'], (out) => [
    ...(out.lifts.length !== 1 ? [`${out.lifts.length} seam lifts, one is needed`] : []),
    ...(smithoreCount(out.ground) !== 7 ? [`${smithoreCount(out.ground)} good Smithore plots, the band's top is 7`] : []),
  ]),
  // Found by a random search: an earlier round's seam lift was taken as a later round's extra lowering.
  scarcityFixture(
    'earlier lift kept',
    {
      players: 2,
      width: 24,
      height: 3,
      plains: [1, 5, 9, 15, 16, 17, 21, 22, 24, 31, 33, 34, 35, 39, 40, 41, 50],
      smithore: (i) => [3, 0, 1, 0, 1, 2, 1, 2, 2, 0, 2, 2, 1, 1, 3, 1, 1, 0, 0, 1, 1, 1, 0, 1, 0, 2, 2, 1, 2, 2, 0, 2, 2, 0, 0, 2, 0, 0, 0, 1, 0, 0, 1, 3, 3, 0, 3, 1, 2, 0, 2, 1, 2, 2, 1, 3, 2, 2, 2, 0, 2, 2, 2, 2, 1, 3, 1, 1, 2, 2, 2, 3][i]!,
      field: (i) => [0.8912, 0.957, 0.5126, 0.6173, 0.738, 0.7134, 0.5593, 0.247, 0.9104, 0.3185, 0.5954, 0.7563, 0.9891, 0.3924, 0.3901, 0.7292, 0.003, 0.724, 0.7333, 0.5105, 0.664, 0.2738, 0.6762, 0.7504, 0.1425, 0.1046, 0.1252, 0.8169, 0.3618, 0.1007, 0.5379, 0.3017, 0.0383, 0.6856, 0.818, 0.4187, 0.2549, 0.7445, 0.7969, 0.6604, 0.3946, 0.5593, 0.986, 0.8464, 0.1567, 0.9528, 0.6907, 0.4417, 0.0567, 0.8106, 0.9018, 0.9273, 0.0126, 0.0845, 0.503, 0.345, 0.5048, 0.9073, 0.4143, 0.3464, 0.5476, 0.387, 0.7351, 0.5458, 0.7701, 0.168, 0.1961, 0.9856, 0.4274, 0.6428, 0.5826, 0.2659][i]!,
    },
    [],
    () => [],
  ),
  // A triple, then lone plots 11 apart: the cheapest extra lowering after a seam lift is a lone plot, which reach pins; only
  // a triple member may go. Plains beside the last lone plot outranks the hills one by field, so the lift must skip it.
  scarcityFixture('reach blocks the cheapest extra', { players: 2, width: 61, height: 1, smithore: goodAt(0, 1, 2, 11, 22, 33, 44, 55), plains: [56] }, [], (out) =>
    out.lifts.length === 0 ? ['no seam lift; the fixture needs one'] : [],
  ),
  // A pair, then lone plots 11 apart that reach all pins: after the one possible cut, a seam lift finds no plot to lower
  // with it, so the lift is undone and the count stays at the band's top.
  scarcityFixture('no extra, lift undone', { players: 2, width: 72, height: 1, smithore: goodAt(0, 1, 11, 22, 33, 44, 55, 66) }, [], (out) => [
    ...(out.lifts.length !== 0 ? [`${out.lifts.length} seam lifts kept with no plot lowered to pay for them`] : []),
    ...(smithoreCount(out.ground) !== 7 ? [`${smithoreCount(out.ground)} good Smithore plots, the cut leaves 7`] : []),
  ]),
  // Plains everywhere but the good plots and plot 54: lifting plains would raise its mean least (many plots), but its
  // odds give no good Smithore, so the one seam lift must be the hills plot 54.
  scarcityFixture(
    'only capable terrain lifted',
    {
      players: 2,
      width: 61,
      height: 1,
      smithore: goodAt(0, 1, 2, 11, 22, 33, 44, 55),
      plains: Array.from({ length: 61 }, (_, i) => i).filter((i) => ![0, 1, 2, 11, 22, 33, 44, 55, 54].includes(i)),
    },
    [],
    (out) => (out.lifts.length === 0 ? ['no seam lift; the fixture needs one'] : []),
  ),
  // The cut lowers plot 0 (rated 2 after), the cheapest plot to lift next to the lone plot 1; it must not be lifted again.
  scarcityFixture(
    'lowered plot not lifted',
    { players: 2, width: 50, height: 1, smithore: goodAt(0, 1, 11, 22, 33, 42, 43, 44), field: (i) => ({ 0: 0.5, 1: 0.9, 42: 0.95, 43: 0.96, 44: 0.97 })[i] ?? 0.1 },
    [],
    (out) => (out.lifts.length === 0 ? ['no seam lift; the fixture needs one'] : []),
  ),
];

/** Stage 8 on a fixture: two pairs and five lone plots that reach pins: S8 needs two seam lifts (4 of 9 joined, 6 of 10, then 8 of 11). */
function twoSeamLiftsFixture(): string[] {
  const spec: FixtureSpec = { players: 2, width: 72, height: 1, smithore: goodAt(0, 1, 11, 22, 33, 34, 45, 56, 67) };
  const { layout, dealt } = buildFixture(spec);
  const out = joinSeams(dealt);
  const report = checkMap(toMap(layout, out.ground), spec.players);
  const problems = report.violations.filter((v) => ['F3', 'S8'].includes(v.rule)).map((v) => `${v.rule}: ${v.detail}`);
  if (out.lifts.length !== 2) problems.push(`${out.lifts.length} seam lifts, two are needed`);
  problems.push(...seamLiftProblems(layout, dealt.ground, out.ground, out.lifts));
  return problems.map((p) => `fixture two seam lifts: ${p}`);
}

/** Non-scarce goods must stay at or above their normal lower edge. */
function belowNormal(run: Run, report: MapReport): string[] {
  return FLOOR_GOODS.filter((g) => g !== run.scarce && report.metrics.perPlayer[g] < MAP.normalLo[g]).map(
    (g) => `${g} ${report.metrics.perPlayer[g].toFixed(2)} per player, under its normal ${MAP.normalLo[g]} though not the scarce good`,
  );
}

describe('map ground stages', () => {
  // One shared, read-only build of every stage's output; each test then only checks it.
  beforeAll(() => {
    allRuns();
  }, 60_000);

  it('T-AC-5: ground stage deals each terrain its odds by stratified draw', () => {
    const broken: string[] = [];
    for (const run of stageRuns()) {
      const where = `${run.players}p seed ${run.seed}`;
      const { ground, fields } = run.odds;
      for (const [terrain, plots] of plotsByTerrain(run.layout)) {
        const n = plots.length;
        for (const good of FLOOR_GOODS) {
          const { values, weights } = oddsOf(terrain, good);
          // Stratified: for every rating v, the count rated v or less is within one plot of n x P(rating <= v).
          let cumulative = 0;
          for (const [k, v] of values.entries()) {
            cumulative += weights[k]!;
            const count = plots.filter((i) => ground[i]![good] <= v).length;
            if (Math.abs(count - n * cumulative) >= 1 + 1e-9) {
              broken.push(`${where} ${terrain} ${good}: ${count} of ${n} plots rated <= ${v}, odds say ${(n * cumulative).toFixed(2)}`);
            }
          }
          const byField = [...plots].sort((a, b) => fields[good][b]! - fields[good][a]!);
          const outOfOrder = byField.findIndex((i, k) => k > 0 && ground[i]![good] > ground[byField[k - 1]!]![good]);
          if (outOfOrder > 0) broken.push(`${where} ${terrain} ${good}: a higher rating sits on a lower field`);
        }
        const mineral = plots.find((i) => ground[i]!.crystite !== 0 || ground[i]!.rareEarth !== 0);
        if (mineral !== undefined) broken.push(`${where} ${terrain}: plot ${mineral} has Crystite or Rare earth before the peaks stage`);
      }
      const store = run.layout.terrain.indexOf('store');
      if (Object.values(ground[store]!).some((r) => r !== 0)) broken.push(`${where}: the store has ground`);
    }
    expect(broken, broken.join('\n')).toEqual([]);
  });

  it('T-AC-5: peaks stage meets S10', () => {
    const broken = failures(stageRuns(), (r) => r.peaks, ['S10']);
    expect(broken, broken.join('\n')).toEqual([]);
  });

  it('T-AC-5: floors stage meets F1 and F2 lower side', () => {
    const broken = failures(stageRuns(), (r) => r.floors, ['F1', 'F2'], (run, report) => {
      const out = belowNormal(run, report);
      for (const good of FLOOR_GOODS) {
        const before = run.peaks.ground;
        const after = run.floors.ground;
        const field = run.peaks.fields[good];
        for (const [terrain, plots] of plotsByTerrain(run.layout)) {
          const lifted = plots.filter((i) => after[i]![good] !== before[i]![good]);
          if (lifted.length === 0) continue;
          for (const i of lifted) {
            if (before[i]![good] >= MAP.goodAt[good] || after[i]![good] !== MAP.goodAt[good]) {
              out.push(`${good} plot ${i} (${terrain}) changed ${before[i]![good]} -> ${after[i]![good]}; a floor lift raises a plot that wasn't good to exactly ${MAP.goodAt[good]}`);
            }
          }
          if (!canBeGood(terrain, good)) out.push(`${lifted.length} ${good} floor lifts on ${terrain}, whose odds give no good plot`);
          // Highest field first within a terrain: no plot left behind outranks one that was lifted.
          const lowestLifted = Math.min(...lifted.map((i) => field[i]!));
          const skipped = plots.find((i) => before[i]![good] < MAP.goodAt[good] && !lifted.includes(i) && field[i]! > lowestLifted);
          if (skipped !== undefined) out.push(`${good} on ${terrain}: plot ${skipped} has a higher field than a lifted plot but wasn't lifted`);
        }
        out.push(...floorLiftOrder(run, good));
      }
      return out;
    });
    // S9's margin: what the floor lifts add to each terrain's mean, per player count, stays inside the honesty bound.
    for (const players of PLAYERS) {
      const drift = new Map<string, { sum: number; plots: number }>();
      for (const run of stageRuns().filter((r) => r.players === players)) {
        for (const [terrain, plots] of plotsByTerrain(run.layout)) {
          for (const good of FLOOR_GOODS) {
            const d = drift.get(`${terrain} ${good}`) ?? { sum: 0, plots: 0 };
            for (const i of plots) d.sum += run.floors.ground[i]![good] - run.peaks.ground[i]![good];
            d.plots += plots.length;
            drift.set(`${terrain} ${good}`, d);
          }
        }
      }
      for (const [key, d] of drift) {
        if (d.sum / d.plots > MAP.honesty) broken.push(`${players}p: floor lifts raise ${key} by ${(d.sum / d.plots).toFixed(3)} on average, over ${MAP.honesty}`);
      }
    }
    expect(broken, broken.join('\n')).toEqual([]);
  });

  it('T-AC-5: reach stage meets F3', () => {
    const broken = failures(stageRuns(), (r) => r.reach, ['F1', 'F2', 'F3'], belowNormal);
    expect(broken, broken.join('\n')).toEqual([]);
  });

  it('T-AC-5: seams stage meets S8', () => {
    // RULE-4: seams may not undo reach.
    const broken = failures(allRuns(), (r) => r.seams, ['S8', 'F3'], (run) => seamLiftProblems(run.layout, run.reach.ground, run.seams.ground, run.seamLifts));
    broken.push(...twoSeamLiftsFixture());
    expect(broken, broken.join('\n')).toEqual([]);
  });

  it('T-AC-5: scarcity stage meets F2', () => {
    // RULE-4 trap: lowering the scarce good must not undo reach, so F3 is checked here too.
    const broken = failures(allRuns(), (r) => r.scarcity, ['F1', 'F2', 'F3', 'S8'], (run, report) => {
      const out: string[] = [];
      if (report.metrics.scarce !== run.scarce) {
        out.push(`scarce good picked ${run.scarce ?? 'none'}, below normal after the stage ${report.metrics.scarce ?? 'none'}`);
      }
      const good = run.scarce;
      if (good === null) {
        if (run.scarcityLifts.length > 0 || JSON.stringify(run.scarcity.ground) !== JSON.stringify(run.seams.ground)) out.push('no scarce good, yet the stage changed the ground');
        return out;
      }
      out.push(...seamLiftProblems(run.layout, run.seams.ground, run.scarcity.ground, run.scarcityLifts));
      const other = run.layout.terrain.findIndex((_, i) => FLOOR_GOODS.some((g) => g !== good && run.scarcity.ground[i]![g] !== run.seams.ground[i]![g]));
      if (other >= 0) out.push(`plot ${other}: a good other than the scarce ${good} changed`);
      // Per terrain: stage 8's ratings, with some good ones now exactly one under the threshold and the recorded seam lifts at it.
      for (const [terrain, plots] of plotsByTerrain(run.layout)) {
        const lifts = run.scarcityLifts.filter((l) => l.good === good && plots.includes(l.plot));
        const before = plots.map((i) => run.seams.ground[i]![good]);
        const after = plots.map((i) => run.scarcity.ground[i]![good]);
        const expected = expectedRatings(before, lifts, good);
        if (typeof expected === 'string') out.push(`${terrain} ${good}: ${expected}`);
        else if (!onlyLowered(expected, after, good)) out.push(`${terrain} ${good}: stage 8 [${sorted(before)}] became [${sorted(after)}], more than lowerings and recorded lifts`);
      }
      // Lowest field first: a good plot kept while a higher-field one was lowered must be one whose loss strands a plot.
      if (good !== 'smithore') {
        const field = run.seams.fields[good];
        const loweredPlots = run.layout.terrain.flatMap((_, i) => (run.seams.ground[i]![good] >= MAP.goodAt[good] && run.scarcity.ground[i]![good] < MAP.goodAt[good] ? [i] : []));
        const highest = Math.max(...loweredPlots.map((i) => field[i]!));
        for (const kept of run.layout.terrain.flatMap((_, i) => (run.scarcity.ground[i]![good] >= MAP.goodAt[good] && field[i]! < highest ? [i] : []))) {
          const ground = run.scarcity.ground.map((g) => ({ ...g }));
          ground[kept]![good] = MAP.goodAt[good] - 1;
          const strands = checkMap(toMap(run.layout, ground), run.players).violations.some((v) => v.rule === 'F3' && v.detail.startsWith(`${good}:`));
          if (!strands) out.push(`${good} plot ${kept} kept though a higher-field plot was lowered and losing it strands nobody`);
        }
      }
      return out;
    });
    for (const fixture of SCARCITY_FIXTURES) broken.push(...fixture.check());
    // RULE-3: the twist comes at its chance, from any of the four goods, by exactly two draws whatever they give.
    const picked = allRuns().filter((r) => r.scarce !== null);
    const share = picked.length / allRuns().length;
    if (share < 0.2 || share > 0.3) broken.push(`scarce share ${share.toFixed(3)} over ${allRuns().length} maps, outside 0.2-0.3`);
    for (const g of FLOOR_GOODS) if (!picked.some((r) => r.scarce === g)) broken.push(`${g} never picked as the scarce good`);
    for (let seed = 1; seed <= 20; seed++) {
      const rng = createRng(seed);
      pickScarce(rng);
      const fresh = createRng(seed);
      fresh.next();
      fresh.next();
      if (rng.next() !== fresh.next()) broken.push(`seed ${seed}: pickScarce did not take exactly two draws`);
    }
    expect(broken, broken.join('\n')).toEqual([]);
  });

  it("T-AC-5: stages 7-8 keep each terrain's ratings but for their recorded lifts", () => {
    const broken: string[] = [];
    for (const run of allRuns()) {
      const where = `${run.players}p seed ${run.seed}`;
      const limitOf = (good: FloorGood) => MAP.reach[sizeBand(run.players)][good];
      const lifts = [...run.reachLifts, ...run.seamLifts];
      for (const lift of lifts) {
        const terrain = run.layout.terrain[lift.plot] as LandTerrain;
        if (lift.from >= MAP.goodAt[lift.good]) broken.push(`${where}: ${lift.kind} lift of ${lift.good} at plot ${lift.plot} from ${lift.from}, already good`);
        if (lift.kind === 'reach') {
          const limit = limitOf(lift.good);
          if (steps(run.layout, lift.plot, lift.stranded) > limit) broken.push(`${where}: reach lift at ${lift.plot} is beyond reach of its stranded plot ${lift.stranded}`);
          // Everything near a stranded plot is not good, so a capable plot in reach means the lift could have been honest.
          const capableInReach = run.layout.terrain.some(
            (t, i) => t !== 'store' && canBeGood(t, lift.good) && steps(run.layout, i, lift.stranded) <= limit,
          );
          if (lift.impossible !== !capableInReach) broken.push(`${where}: reach lift of ${lift.good} on ${terrain} marked impossible ${lift.impossible}, capable plot in reach ${capableInReach}`);
          if (!lift.impossible && !canBeGood(terrain, lift.good)) broken.push(`${where}: reach lift of ${lift.good} on ${terrain}, whose odds give no good plot, though not marked impossible`);
        } else {
          if (!canBeGood(terrain, lift.good)) broken.push(`${where}: seam lift on ${terrain}, whose odds give no good Smithore`);
          if (steps(run.layout, lift.plot, lift.joins) !== 1) broken.push(`${where}: seam lift at ${lift.plot} doesn't touch the plot ${lift.joins} it joins`);
        }
      }
      for (const [terrain, plots] of plotsByTerrain(run.layout)) {
        for (const good of FLOOR_GOODS) {
          const expected = expectedRatings(
            plots.map((i) => run.floors.ground[i]![good]),
            lifts.filter((l) => l.good === good && plots.includes(l.plot)),
            good,
          );
          const after = plots.map((i) => run.seams.ground[i]![good]);
          if (typeof expected === 'string') broken.push(`${where} ${terrain} ${good}: ${expected}`);
          else if (sorted(expected) !== sorted(after)) broken.push(`${where} ${terrain} ${good}: expected [${sorted(expected)}], got [${sorted(after)}]`);
        }
      }
    }
    expect(broken, broken.join('\n')).toEqual([]);
  });

  it('T-AC-5: a laid-out map dealt its ground breaks no map rule', () => {
    const broken: string[] = [];
    for (const run of allRuns()) {
      const where = `${run.players}p seed ${run.seed}`;
      const report = reportOf(run, run.scarcity);
      // Special fields come at stage 11, after the ground; P1 is checked on the map a player receives (B-AC-5).
      for (const v of report.violations.filter((v) => v.rule !== 'P1')) broken.push(`${where} ${v.rule}: ${v.detail}`);
      const store = run.layout.terrain.indexOf('store');
      if (Object.values(run.scarcity.ground[store]!).some((r) => r !== 0)) broken.push(`${where}: the store has ground`);
      // dealGround is the stages in order: on a sample, the same rng stream through it gives the same ground, scarce good and lifts.
      if (run.seed % 20 !== 0) continue;
      const rng = createRng(run.seed);
      const layout = layoutMap(run.players, rng);
      const dealt = dealGround(layout, run.players, rng);
      const stages = { ground: run.scarcity.ground, scarce: run.scarce, lifts: [...run.reachLifts, ...run.seamLifts, ...run.scarcityLifts] };
      if (JSON.stringify(dealt) !== JSON.stringify(stages)) broken.push(`${where}: dealGround differs from the stages run in order`);
    }
    expect(broken, broken.join('\n')).toEqual([]);
  });
});
