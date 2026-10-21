import { describe, expect, it } from 'vitest';
import { createGame, expectedGround, MAP, observe, TERRAIN_ODDS, type Terrain } from '../src/index.js';

const players = [
  { id: 'p0', name: 'P0', isAi: true },
  { id: 'p1', name: 'P1', isAi: false },
];
const LAND = Object.keys(TERRAIN_ODDS) as Exclude<Terrain, 'store'>[];

describe('map hints', () => {
  it('T-AC-8: Crystite and Rare earth hint the same on every terrain', () => {
    for (const t of LAND) {
      expect(expectedGround(t).crystite, `${t} crystite`).toBe(MAP.unknownMineral);
      expect(expectedGround(t).rareEarth, `${t} rareEarth`).toBe(MAP.unknownMineral);
    }

    // What the AI seat receives: every unanalysed plot, crater and plains included.
    const seen = new Set<Terrain>();
    for (let seed = 1; seed <= 20; seed++) {
      const seen_ = observe(createGame({ seed, players }), 'p0');
      for (const tile of seen_.tiles) {
        if (tile.terrain === 'store') continue;
        seen.add(tile.terrain);
        expect(tile.ground.crystite).toBe(MAP.unknownMineral);
        expect(tile.ground.rareEarth).toBe(MAP.unknownMineral);
      }
    }
    expect(seen.has('crater') && seen.has('plains')).toBe(true);
  });
});
