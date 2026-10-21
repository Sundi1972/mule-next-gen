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
const SEEDS = 200;
const FLOOR_GOODS: FloorGood[] = ['food', 'water', 'energy', 'smithore'];

type LandTerrain = Exclude<Terrain, 'store'>;

/** Every stage's output for one map, deep-copied as produced so a stage that mutated its input can't fake a later test. */
interface Run {
  players: number;
  seed: number;
  layout: Layout;
  odds: Dealt;
  peaks: Dealt;
  scarce: FloorGood | null;
  floors: Dealt;
  reach: Dealt;
  lifts: Lift[];
  seams: Dealt;
  scarcity: Dealt;
}

let runs: Run[] | undefined;

function allRuns(): Run[] {
  if (runs) return runs;
  const keep = (d: Dealt): Dealt => ({
    ...d,
    ground: d.ground.map((g) => ({ ...g })),
    fields: { food: [...d.fields.food], water: [...d.fields.water], energy: [...d.fields.energy], smithore: [...d.fields.smithore] },
  });
  // Filled locally and kept only when complete: a stage that throws must fail every test, not leave an empty cache.
  const built: Run[] = [];
  for (const players of PLAYERS) {
    for (let seed = 1; seed <= SEEDS; seed++) {
      // One rng from the layout on into the ground, as the generator runs them.
      const rng = createRng(seed);
      const layout = layoutMap(players, rng);
      const odds = keep(dealOdds(layout, players, rng));
      const peaks = keep(placePeaks(odds, rng));
      const scarce = pickScarce(rng);
      const floors = keep(liftFloors(peaks, scarce));
      const reached = repairReach(floors);
      const lifts = reached.lifts.map((l) => ({ ...l }));
      const reach = keep(reached);
      const seams = keep(joinSeams(reach));
      const scarcity = keep(applyScarcity(seams, scarce));
      built.push({ players, seed, layout, odds, peaks, scarce, floors, reach, lifts, seams, scarcity });
    }
  }
  runs = built;
  return built;
}

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

/** Every (players, seed, rule, detail) a stage's output breaks among `rules`, plus whatever `extra` finds wrong. */
function failures(stage: (r: Run) => Dealt, rules: RuleId[], extra?: (r: Run, report: MapReport) => string[]): string[] {
  const out: string[] = [];
  for (const run of allRuns()) {
    const report = checkMap(toMap(run.layout, stage(run).ground), run.players);
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

function plotsByTerrain(layout: Layout): Map<LandTerrain, number[]> {
  const out = new Map<LandTerrain, number[]>();
  layout.terrain.forEach((t, i) => {
    if (t === 'store') return;
    out.set(t, [...(out.get(t) ?? []), i]);
  });
  return out;
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
  }, 30_000);

  it('T-AC-5: ground stage deals each terrain its odds by stratified draw', () => {
    const broken: string[] = [];
    for (const run of allRuns()) {
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
    const broken = failures((r) => r.peaks, ['S10']);
    expect(broken, broken.join('\n')).toEqual([]);
  });

  it('T-AC-5: floors stage meets F1 and F2 lower side', () => {
    const broken = failures((r) => r.floors, ['F1', 'F2'], belowNormal);
    expect(broken, broken.join('\n')).toEqual([]);
  });

  it('T-AC-5: reach stage meets F3', () => {
    const broken = failures((r) => r.reach, ['F1', 'F2', 'F3'], belowNormal);
    expect(broken, broken.join('\n')).toEqual([]);
  });

  it('T-AC-5: seams stage meets S8', () => {
    // RULE-4: seams may not undo reach.
    const broken = failures((r) => r.seams, ['S8', 'F3']);
    expect(broken, broken.join('\n')).toEqual([]);
  });

  it('T-AC-5: scarcity stage meets F2', () => {
    // RULE-4 trap: lowering the scarce good must not undo reach, so F3 is checked here too.
    const broken = failures((r) => r.scarcity, ['F1', 'F2', 'F3', 'S8'], (run, report) => {
      const below = report.metrics.scarce;
      if (below === run.scarce) return [];
      return [`scarce good picked ${run.scarce ?? 'none'}, below normal after the stage ${below ?? 'none'}`];
    });
    expect(broken, broken.join('\n')).toEqual([]);
  });

  it("T-AC-5: stages 7-8 keep each terrain's ratings but for stage 7's recorded lifts", () => {
    const broken: string[] = [];
    const sorted = (ratings: number[]) => [...ratings].sort((a, b) => a - b).join(',');
    for (const run of allRuns()) {
      const where = `${run.players}p seed ${run.seed}`;
      for (const lift of run.lifts) {
        const terrain = run.layout.terrain[lift.plot] as LandTerrain;
        if (lift.from >= MAP.goodAt[lift.good]) broken.push(`${where}: lift of ${lift.good} at plot ${lift.plot} from ${lift.from}, already good`);
        const canBeGood = oddsOf(terrain, lift.good).weights.some((w, k) => w > 0 && oddsOf(terrain, lift.good).values[k]! >= MAP.goodAt[lift.good]);
        if (lift.impossible === canBeGood) broken.push(`${where}: lift of ${lift.good} on ${terrain} marked impossible ${lift.impossible}`);
      }
      for (const [terrain, plots] of plotsByTerrain(run.layout)) {
        for (const good of FLOOR_GOODS) {
          // Each lift swaps one `from` in the terrain's ratings for exactly the threshold; nothing else may change them.
          const expected = plots.map((i) => run.floors.ground[i]![good]);
          for (const lift of run.lifts.filter((l) => l.good === good && plots.includes(l.plot))) {
            const at = expected.indexOf(lift.from);
            if (at >= 0) expected[at] = MAP.goodAt[good];
            else broken.push(`${where} ${terrain} ${good}: lift from ${lift.from}, which the terrain never held`);
          }
          const after = plots.map((i) => run.seams.ground[i]![good]);
          if (sorted(expected) !== sorted(after)) {
            broken.push(`${where} ${terrain} ${good}: expected [${sorted(expected)}], got [${sorted(after)}]`);
          }
        }
      }
    }
    expect(broken, broken.join('\n')).toEqual([]);
  });

  it('T-AC-5: a laid-out map dealt its ground breaks no map rule', () => {
    const broken: string[] = [];
    for (const run of allRuns()) {
      const where = `${run.players}p seed ${run.seed}`;
      const report = checkMap(toMap(run.layout, run.scarcity.ground), run.players);
      for (const v of report.violations) broken.push(`${where} ${v.rule}: ${v.detail}`);
      if (report.metrics.scarce !== run.scarce) broken.push(`${where}: picked scarce ${run.scarce ?? 'none'}, the map has ${report.metrics.scarce ?? 'none'}`);
      const store = run.layout.terrain.indexOf('store');
      if (Object.values(run.scarcity.ground[store]!).some((r) => r !== 0)) broken.push(`${where}: the store has ground`);
      // dealGround is the stages in order: on a sample, the same rng stream through it gives the same ground and scarce good.
      if (run.seed % 20 !== 0) continue;
      const rng = createRng(run.seed);
      const layout = layoutMap(run.players, rng);
      const dealt = dealGround(layout, run.players, rng);
      if (JSON.stringify(dealt) !== JSON.stringify({ ground: run.scarcity.ground, scarce: run.scarce })) broken.push(`${where}: dealGround differs from the stages run in order`);
    }
    expect(broken, broken.join('\n')).toEqual([]);
  });
});
