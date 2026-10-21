import { beforeAll, describe, expect, it } from 'vitest';
import { checkMap, createGame, expectedGround, MAP, TERRAIN_ODDS, type GameMap, type MapReport, type RuleId, type Terrain, type Tile } from '../src/index.js';

const SEEDS = 1000;
const PLAYER_COUNTS = [2, 3, 4, 5, 6];
const TIMEOUT = 120_000;
const MAX_LINES = 30;
const LAND = Object.keys(TERRAIN_ODDS) as Exclude<Terrain, 'store'>[];
const HINTED = ['food', 'water', 'energy', 'smithore'] as const;
const MINERALS = ['crystite', 'rareEarth'] as const;

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

let built: Built[] = [];

beforeAll(() => {
  built = PLAYER_COUNTS.flatMap((players) =>
    Array.from({ length: SEEDS }, (_, i) => {
      const seed = i + 1;
      const map = received(seed, players);
      return { seed, players, map, report: checkMap(map, players) };
    }),
  );
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
