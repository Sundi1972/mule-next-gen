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
 * more seeds there, plus the seeds that once broke them (2p 171: stage 8 left 5 of 8 plots
 * joined; 2p 2469: Smithore scarce, no cut kept S8).
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
      }
      return out;
    });
    expect(broken, broken.join('\n')).toEqual([]);
  });

  it('T-AC-5: reach stage meets F3', () => {
    const broken = failures(stageRuns(), (r) => r.reach, ['F1', 'F2', 'F3'], belowNormal);
    expect(broken, broken.join('\n')).toEqual([]);
  });

  it('T-AC-5: seams stage meets S8', () => {
    // RULE-4: seams may not undo reach.
    const broken = failures(allRuns(), (r) => r.seams, ['S8', 'F3']);
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
      for (const v of report.violations) broken.push(`${where} ${v.rule}: ${v.detail}`);
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
