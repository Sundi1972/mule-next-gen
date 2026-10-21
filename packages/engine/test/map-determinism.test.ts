import { describe, expect, it } from 'vitest';
import { createRng, generateMap } from '../src/index.js';

const TILE_KEYS = ['x', 'y', 'terrain', 'peaks', 'ground', 'traits', 'owner', 'outfit', 'pollution', 'filter', 'runMonths'];

describe('map determinism', () => {
  it('T-AC-3: the same rng seed gives a deep-equal map', () => {
    for (let players = 2; players <= 6; players++) {
      for (let seed = 1; seed <= 50; seed++) {
        const first = generateMap(players, createRng(seed));
        const second = generateMap(players, createRng(seed));
        expect(second, `seed ${seed}, ${players} players`).toEqual(first);
        for (const tile of first.tiles) expect(Object.keys(tile), `seed ${seed}, ${players} players`).toEqual(TILE_KEYS);
      }
    }
  }, 120_000);
});
