import { describe, expect, it } from 'vitest';
import { budgetTerrain, layoutMap, placeRiver, type Sketch } from '../src/map-layout.js';
import {
  checkMap,
  createRng,
  MAP,
  sizeBand,
  zeroGround,
  type GameMap,
  type RuleId,
  type ShareTerrain,
  type Terrain,
  type Tile,
} from '../src/index.js';

// One player count per size band: 3 and 6 players get the same map size, so they would repeat 2's and 5's layouts.
const BANDS = [2, 4, 5];
// The 500-seed sweep per band runs only with MULE_FULL=1; CI runs the regression seeds below. Every map CI deals is
// checked against S1-S8 by B-AC-3 in map-quality.test.ts.
const FULL = process.env.MULE_FULL === '1';
const SEEDS = FULL ? 500 : 0;
/**
 * Seeds whose layout once broke a rule, checked by name on top of the sweep (and in CI): 28670 (S5) and 45216 (S4)
 * from review, 3475 and 9530 (AM-4) that only the repair's lookahead fixes.
 */
const REGRESSIONS: Record<number, number[]> = { 2: [28670, 3475, 9530], 4: [45216], 5: [] };
const TIMEOUT = 30_000;

/** A map of the given terrain with zero ground everywhere: the ground rules always fire on it, so callers filter to layout rules. */
function zeroGroundMap(width: number, height: number, terrain: Terrain[]): GameMap {
  const tiles: Tile[] = terrain.map((t, i) => ({
    x: i % width,
    y: Math.floor(i / width),
    terrain: t,
    peaks: 0,
    ground: zeroGround(),
    traits: [],
    owner: null,
    outfit: null,
    pollution: 0,
    filter: false,
    runMonths: 0,
  }));
  return { width, height, tiles };
}

type Check = (map: GameMap, players: number) => string[];

/**
 * Every (players, seed, rule, detail) a stage's maps break among `rules`, plus whatever `extra` finds,
 * over SEEDS seeds per size band and the named regression seeds.
 */
function failures(rules: RuleId[], build: (players: number, seed: number) => GameMap | string, extra: Check = () => []): string[] {
  const out: string[] = [];
  for (const players of BANDS) {
    const seeds = [...Array.from({ length: SEEDS }, (_, i) => i + 1), ...REGRESSIONS[players]!];
    for (const seed of seeds) {
      const map = build(players, seed);
      if (typeof map === 'string') {
        out.push(`${players}p seed ${seed}: ${map}`);
        continue;
      }
      for (const v of checkMap(map, players).violations.filter((v) => rules.includes(v.rule))) {
        out.push(`${players}p seed ${seed} ${v.rule}: ${v.detail}`);
      }
      for (const problem of extra(map, players)) out.push(`${players}p seed ${seed} ${problem}`);
    }
  }
  return out;
}

/** AM-4: land plots with no hills or mountains plot within Smithore reach. */
const miningCoverage: Check = (map, players) => {
  const reach = MAP.reach[sizeBand(players)].smithore;
  const mining = map.tiles.filter((t) => t.terrain === 'hills' || t.terrain === 'mountains');
  const far = map.tiles.filter((t) => t.terrain !== 'store' && !mining.some((m) => Math.abs(m.x - t.x) + Math.abs(m.y - t.y) <= reach));
  return far.map((t) => `AM-4: plot (${t.x},${t.y}) has no hills or mountains within ${reach} steps`);
};

/** The river stage's sketch with every free plot set to plains: only the river and store matter to S6 and S7. */
function riverMap(sketch: Sketch): GameMap {
  return zeroGroundMap(sketch.width, sketch.height, sketch.terrain.map((t) => t ?? 'plains'));
}

/** The budget laid onto the free plots in index order, or why it can't be: S1-S3 read only the counts. */
function budgetMap(sketch: Sketch, budget: Record<ShareTerrain, number>): GameMap | string {
  const free = sketch.terrain.filter((t) => t === null).length;
  const fill = (Object.keys(MAP.shares) as ShareTerrain[]).flatMap((t) => Array<Terrain>(budget[t]).fill(t));
  if (fill.length !== free) return `budget sums to ${fill.length} plots, free land is ${free}`;
  let next = 0;
  return zeroGroundMap(sketch.width, sketch.height, sketch.terrain.map((t) => t ?? fill[next++]!));
}

/**
 * Where a bend's two touching river plots may sit: the river joins on the row nearer the store, so a row holds one
 * river plot or two touching ones, and the top row, the store's row and the bottom row, never nearer than their
 * neighbour, hold one.
 */
function joinRows(map: GameMap): string[] {
  const storeRow = map.tiles.find((t) => t.terrain === 'store')!.y;
  const out: string[] = [];
  for (let y = 0; y < map.height; y++) {
    const cols = map.tiles.filter((t) => t.y === y && t.terrain === 'river').map((t) => t.x);
    const single = y === 0 || y === storeRow || y === map.height - 1;
    if (cols.length === 1) continue;
    if (cols.length === 2 && Math.abs(cols[0]! - cols[1]!) === 1 && !single) continue;
    out.push(`row ${y} holds river plots at columns ${cols.join(', ')}; ${single ? 'one' : 'one, or two touching,'} wanted`);
  }
  return out;
}

describe('map layout stages', () => {
  it('T-AC-5: river stage meets S6 and S7', { timeout: TIMEOUT }, () => {
    const seen = new Map<number, Set<number>>(BANDS.map((p) => [p, new Set()]));
    const broken = failures(['S6', 'S7'], (players, seed) => riverMap(placeRiver(players, createRng(seed))), (map, players) => {
      const bends = checkMap(map, players).metrics.bends;
      const fewest = MAP.bends[sizeBand(players)];
      seen.get(players)!.add(bends);
      return [...(bends > fewest + 1 ? [`${bends} bends, at most ${fewest + 1} wanted`] : []), ...joinRows(map)];
    });
    // Both bend counts turning up is a property of the sweep (MULE_FULL).
    for (const players of FULL ? BANDS : []) {
      const fewest = MAP.bends[sizeBand(players)];
      const values = [...seen.get(players)!].sort((a, b) => a - b);
      if (values.join() !== `${fewest},${fewest + 1}`) broken.push(`${players}p: bends seen ${values.join(', ')}, want both ${fewest} and ${fewest + 1}`);
    }
    expect(broken, broken.join('\n')).toEqual([]);
  });

  it('T-AC-5: budget meets S1-S3', { timeout: TIMEOUT }, () => {
    const broken = failures(['S1', 'S2', 'S3'], (players, seed) => {
      const rng = createRng(seed);
      const sketch = placeRiver(players, rng);
      return budgetMap(sketch, budgetTerrain(sketch.terrain.filter((t) => t === null).length, rng));
    });
    expect(broken, broken.join('\n')).toEqual([]);
  });

  it('T-AC-5: regions meet S4 and S5', { timeout: TIMEOUT }, () => {
    // The whole layout, so the regions are checked on the real river and budget, and must keep S1-S3, the river,
    // and hills or mountains within Smithore reach of every land plot (AM-4).
    const broken = failures(
      ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'],
      (players, seed) => {
        const layout = layoutMap(players, createRng(seed));
        return zeroGroundMap(layout.width, layout.height, layout.terrain);
      },
      miningCoverage,
    );
    expect(broken, broken.join('\n')).toEqual([]);
  });
});
