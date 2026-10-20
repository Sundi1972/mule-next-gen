import { mapSize } from './config.js';
import type { Rng } from './rng.js';
import type { Terrain, Tile, TileTrait } from './types.js';

const LAND_TERRAINS: Terrain[] = [
  'plains', 'plains', 'plains', 'hills', 'mountains', 'forest', 'swamp',
  'desert', 'ice', 'lake', 'volcanic', 'crater', 'wasteland',
];

const TRAITS: TileTrait[] = [
  'fertile', 'richVein', 'spring', 'bedrock', 'sheltered', 'hotSpring', 'thinVein', 'toxic', 'unstable',
];

/**
 * Builds the map: a river runs top to bottom through the middle column, the
 * store sits at the centre, and the rest is grown from random terrain seeds
 * so similar terrain forms regions rather than noise.
 */
export function generateMap(players: number, rng: Rng): { width: number; height: number; tiles: Tile[] } {
  const { width, height } = mapSize(players);
  const midX = Math.floor(width / 2);
  const midY = Math.floor(height / 2);

  const seeds = Array.from({ length: Math.round((width * height) / 9) }, () => ({
    x: rng.int(0, width - 1),
    y: rng.int(0, height - 1),
    terrain: rng.pick(LAND_TERRAINS),
  }));

  const tiles: Tile[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let terrain: Terrain;
      if (x === midX && y === midY) terrain = 'store';
      else if (x === midX) terrain = 'river';
      else {
        let best = seeds[0]!;
        let bestDist = Infinity;
        for (const s of seeds) {
          const d = Math.abs(s.x - x) + Math.abs(s.y - y) + rng.next() * 1.5;
          if (d < bestDist) {
            bestDist = d;
            best = s;
          }
        }
        terrain = best.terrain;
      }
      const traitCount = terrain === 'store' ? 0 : rng.pick([0, 0, 1, 1, 2]);
      const traits: TileTrait[] = [];
      for (let i = 0; i < traitCount; i++) {
        const trait = rng.pick(TRAITS);
        if (!traits.includes(trait)) traits.push(trait);
      }
      tiles.push({
        x,
        y,
        terrain,
        peaks: terrain === 'mountains' ? rng.int(1, 3) : 0,
        crystite: crystiteFor(terrain, rng),
        traits,
        owner: null,
        outfit: null,
      });
    }
  }
  return { width, height, tiles };
}

function crystiteFor(terrain: Terrain, rng: Rng): number {
  if (terrain === 'store' || terrain === 'river') return 0;
  const chance = terrain === 'crater' ? 0.8 : terrain === 'hills' ? 0.35 : 0.15;
  return rng.chance(chance) ? rng.int(1, 4) : 0;
}

export function tileAt(tiles: Tile[], width: number, x: number, y: number): Tile | undefined {
  if (x < 0 || y < 0 || x >= width) return undefined;
  return tiles[y * width + x];
}

export function neighbours(tiles: Tile[], width: number, tile: Tile): Tile[] {
  return [
    tileAt(tiles, width, tile.x + 1, tile.y),
    tileAt(tiles, width, tile.x - 1, tile.y),
    tileAt(tiles, width, tile.x, tile.y + 1),
    tileAt(tiles, width, tile.x, tile.y - 1),
  ].filter((t): t is Tile => t !== undefined);
}
