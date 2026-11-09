import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createRng, generateMap, type GameMap } from '../src/index.js';

const TILE_KEYS = ['x', 'y', 'terrain', 'peaks', 'ground', 'traits', 'owner', 'outfit', 'pollution', 'filter', 'runMonths'];
/** Seeds per player count the deep-equal check runs: 10 in CI, 50 with MULE_FULL=1. The fingerprint is the guard. */
const DEEP_SEEDS = process.env.MULE_FULL === '1' ? 50 : 10;

// A change that alters any generated map updates this in the same commit and says why in its message.
const FINGERPRINT = 'fb80007841308441955903f9d8d4425332ff7ca72aa4e699e854c33bb361d907';

/** The maps seeds 1-200 give at each player count 2-6, in that order: each plot's terrain, ground, traits, peaks and special field. */
function fingerprint(): string {
  const hash = createHash('sha256');
  for (let seed = 1; seed <= 200; seed++) {
    for (let players = 2; players <= 6; players++) hash.update(mapLine(generateMap(players, createRng(seed)))).update('\n');
  }
  return hash.digest('hex');
}

function mapLine(map: GameMap): string {
  return JSON.stringify(map.tiles.map((t) => [t.terrain, t.ground, t.traits, t.peaks, t.special ?? null]));
}

describe('map determinism', () => {
  it('T-AC-3: the same rng seed gives a deep-equal map', () => {
    for (let players = 2; players <= 6; players++) {
      for (let seed = 1; seed <= DEEP_SEEDS; seed++) {
        const first = generateMap(players, createRng(seed));
        const second = generateMap(players, createRng(seed));
        expect(second, `seed ${seed}, ${players} players`).toEqual(first);
        // A plot without a special field carries no `special` key at all.
        for (const tile of first.tiles) expect(Object.keys(tile), `seed ${seed}, ${players} players`).toEqual(tile.special ? [...TILE_KEYS, 'special'] : TILE_KEYS);
      }
    }
  }, 120_000);

  it("T-AC-3: generateMap's output over a fixed seed set matches its recorded fingerprint", () => {
    expect(fingerprint()).toBe(FINGERPRINT);
  }, 120_000);
});
