import { beforeAll, describe, expect, it } from 'vitest';
import { checkMap, createGame, type GameMap, type MapReport, type RuleId } from '../src/index.js';

const SEEDS = 1000;
const PLAYER_COUNTS = [2, 3, 4, 5, 6];
const TIMEOUT = 120_000;
const MAX_LINES = 30;

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
});
