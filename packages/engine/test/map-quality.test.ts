import { beforeAll, describe, expect, it } from 'vitest';
import { SMALL_MAP, withSpecials, withTerrain } from './fixtures/map-fixtures.js';
import {
  checkMap,
  createGame,
  createRng,
  expectedGround,
  MAP,
  placeSpecials,
  TERRAIN_ODDS,
  type GameMap,
  type MapReport,
  type RuleId,
  type Terrain,
  type Tile,
} from '../src/index.js';

const SEEDS = 1000;
const PLAYER_COUNTS = [2, 3, 4, 5, 6];
const TIMEOUT = 120_000;
const MAX_LINES = 30;
const LAND = Object.keys(TERRAIN_ODDS) as Exclude<Terrain, 'store'>[];
const HINTED = ['food', 'water', 'energy', 'smithore'] as const;
const MINERALS = ['crystite', 'rareEarth'] as const;
/** RULE-5's count by player count: 3 small, 4 mid, 5 large. */
const SPECIALS: Record<number, number> = { 2: 3, 3: 3, 4: 4, 5: 5, 6: 5 };
/**
 * Maps outside the 5,000 that once broke RULE-5, as [seed, players]: 1090 at 2 and 3 players
 * got only ruins and a relic, both left of the river, because the last slot had to be a third
 * kind on the right and the right had no plot for one. Placement no longer falls short; the
 * seeds stay as extra cover.
 */
const REGRESSION_SEEDS: [number, number][] = [[1090, 2], [1090, 3]];
/** Placement draws per map beyond the one createGame made, each from its own rng seed. */
const EXTRA_PLACEMENTS = 8;

interface Built {
  seed: number;
  players: number;
  map: GameMap;
  report: MapReport;
}

function newGame(seed: number, players: number) {
  return createGame({ seed, players: Array.from({ length: players }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isAi: true })) });
}

/** The map a player receives: what createGame put in the game state. */
function received(seed: number, players: number): GameMap {
  const { width, height, tiles } = newGame(seed, players);
  return { width, height, tiles };
}

interface Drift {
  label: string;
  mean: number;
  hint: number;
}

function drift(label: string, ratings: number[], hint: number): Drift {
  return { label, mean: ratings.reduce((a, b) => a + b, 0) / ratings.length, hint };
}

/** Which part of the map a plot sits on: an edge row or column, or the interior. */
function placeOf(tile: Tile, map: GameMap): string {
  if (tile.y === 0) return 'top row';
  if (tile.y === map.height - 1) return 'bottom row';
  if (tile.x === 0) return 'left column';
  if (tile.x === map.width - 1) return 'right column';
  return 'interior';
}

/** Per part of the map and hinted good: the mean of rating minus its terrain's hint, against 0. */
function placeDrifts(built: Built[]): Drift[] {
  const gaps = new Map<string, number[]>();
  for (const { map } of built) {
    for (const tile of map.tiles) {
      if (tile.terrain === 'store') continue;
      const hint = expectedGround(tile.terrain);
      for (const good of HINTED) {
        const label = `${placeOf(tile, map)} ${good}`;
        if (!gaps.has(label)) gaps.set(label, []);
        gaps.get(label)!.push(tile.ground[good] - hint[good]);
      }
    }
  }
  return [...gaps].map(([label, ratings]) => drift(label, ratings, 0));
}

/** Every failing line, capped, with a count of the rest. */
function listed(lines: string[]): string {
  const shown = lines.slice(0, MAX_LINES).join('\n');
  return lines.length > MAX_LINES ? `${shown}\n…and ${lines.length - MAX_LINES} more` : shown;
}

function violationsOf(built: Built[], rules: RuleId[]): string[] {
  return built.flatMap(({ seed, players, report }) =>
    report.violations.filter((v) => rules.includes(v.rule)).map((v) => `seed ${seed}, ${players} players, ${v.rule}: ${v.detail}`),
  );
}

function build(seed: number, players: number): Built {
  const map = received(seed, players);
  return { seed, players, map, report: checkMap(map, players) };
}

let built: Built[] = [];
let regressions: Built[] = [];

beforeAll(() => {
  built = PLAYER_COUNTS.flatMap((players) => Array.from({ length: SEEDS }, (_, i) => build(i + 1, players)));
  regressions = REGRESSION_SEEDS.map(([seed, players]) => build(seed, players));
}, TIMEOUT);

describe('map quality, every map createGame deals', () => {
  it('B-AC-1: every map passes F1 and F3', () => {
    const failures = violationsOf(built, ['F1', 'F3']);
    expect(failures, listed(failures)).toEqual([]);
  }, TIMEOUT);

  it('B-AC-3: every map passes S1-S8 and S10', () => {
    const failures = violationsOf(built, ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S10']);
    expect(failures, listed(failures)).toEqual([]);
  }, TIMEOUT);

  it('B-AC-2: 20-30% of maps have exactly one scarce good, none has two', () => {
    const failures = violationsOf(built, ['F2']);
    for (const players of PLAYER_COUNTS) {
      const maps = built.filter((b) => b.players === players);
      const rate = maps.filter((b) => b.report.metrics.scarce !== null).length / maps.length;
      if (rate < 0.2 || rate > 0.3) failures.push(`${players} players: ${(rate * 100).toFixed(1)}% of maps have one scarce good`);
    }
    for (const players of PLAYER_COUNTS) {
      for (let seed = 1; seed <= 20; seed++) {
        if (JSON.stringify(newGame(seed, players).tiles) !== JSON.stringify(newGame(seed, players).tiles)) {
          failures.push(`seed ${seed}, ${players} players: creating it twice gave different tiles`);
        }
      }
    }
    expect(failures, listed(failures)).toEqual([]);
  }, TIMEOUT);

  it("B-AC-5: every map's special fields pass RULE-5", () => {
    const failures = violationsOf([...built, ...regressions], ['P1']);
    for (const { seed, players, map } of [...built, ...regressions]) {
      const count = map.tiles.filter((t) => t.special).length;
      if (count !== SPECIALS[players]) failures.push(`seed ${seed}, ${players} players: ${count} special fields on the tiles, ${SPECIALS[players]} expected`);
    }
    expect(failures, listed(failures)).toEqual([]);
  }, TIMEOUT);

  it('T-AC-5: placement meets P1 on every map it is given', () => {
    // Placement is cheap next to building a map, so each built map is placed again from fresh rng seeds.
    const failures: string[] = [];
    for (const { seed, players, map } of [...built, ...regressions]) {
      const bare: GameMap = { ...map, tiles: map.tiles.map(({ special: _, ...tile }) => tile) };
      for (let k = 1; k <= EXTRA_PLACEMENTS; k++) {
        const placed = placeSpecials(bare, players, createRng(seed * 1_000 + k)).map;
        for (const v of checkMap(placed, players).violations.filter((v) => v.rule === 'P1')) {
          failures.push(`seed ${seed}, ${players} players, placement rng ${k}: ${v.detail}`);
        }
      }
    }
    expect(failures, listed(failures)).toEqual([]);

    // A map with no dry land right of the river can't hold RULE-5: placement says so rather than place it short.
    const rightOfRiver: [number, number, string][] = [[9, 0], [10, 0], [9, 1], [10, 1], [8, 2], [9, 2], [10, 2], [7, 3], [8, 3], [9, 3], [10, 3], [7, 4], [8, 4], [9, 4], [10, 4]].map(
      ([x, y]) => [x!, y!, 'L'],
    );
    const flooded = withTerrain(withSpecials(SMALL_MAP, [[0, 3, null], [6, 1, null], [10, 4, null]]), rightOfRiver);
    expect(() => placeSpecials(flooded, 2, createRng(1))).toThrow(/special fields/);
  }, TIMEOUT);

  it('B-AC-4: hints are honest', () => {
    const land = built.flatMap((b) => b.map.tiles.filter((t) => t.terrain !== 'store').map((t) => ({ players: b.players, tile: t })));
    const drifts: Drift[] = [];
    for (const terrain of LAND) {
      const plots = land.filter((p) => p.tile.terrain === terrain);
      for (const good of HINTED) drifts.push(drift(`${terrain} ${good}`, plots.map((p) => p.tile.ground[good]), expectedGround(terrain)[good]));
    }
    for (const players of PLAYER_COUNTS) {
      const plots = land.filter((p) => p.players === players);
      for (const good of MINERALS) drifts.push(drift(`${players} players ${good}`, plots.map((p) => p.tile.ground[good]), MAP.unknownMineral));
    }
    const misleading = drifts
      .filter((d) => Math.abs(d.mean - d.hint) > MAP.honesty)
      .concat(placeDrifts(built).filter((d) => Math.abs(d.mean - d.hint) > MAP.placeHonesty));
    const offenders = misleading
      .sort((a, b) => Math.abs(b.mean - b.hint) - Math.abs(a.mean - a.hint))
      .map((d) => `${d.label}: mean ${d.mean.toFixed(3)}, hint ${d.hint.toFixed(3)}, off by ${(d.mean - d.hint).toFixed(3)}`);
    expect(offenders, listed(offenders)).toEqual([]);
  }, TIMEOUT);
});
