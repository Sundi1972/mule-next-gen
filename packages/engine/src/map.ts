import { GROWN_ODDS, MAP, MINERAL_ODDS, TERRAIN_ODDS, mapSize } from './config.js';
import type { Rng } from './rng.js';
import { GROWN_GOODS, MINED_GOODS, type Ground, type Terrain, type Tile, type TileTrait } from './types.js';

const LAND_TERRAINS: Exclude<Terrain, 'store'>[] = [
  'plains', 'plains', 'plains', 'hills', 'mountains', 'forest', 'swamp',
  'desert', 'tundra', 'ice', 'lake', 'volcanic', 'crater',
];

const TRAITS: TileTrait[] = ['bedrock', 'sheltered', 'hotSpring', 'thinVein', 'toxic', 'unstable', 'infested', 'floodPlain'];

/**
 * Builds the map: a river runs top to bottom through the middle column, the
 * store sits at the centre, and the rest is grown from random terrain seeds
 * so similar terrain forms regions rather than noise. Every plot then rolls
 * its hidden ground rating from its terrain's odds.
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
      const traitCount = terrain === 'store' ? 0 : rng.pick([0, 0, 0, 1, 1, 2]);
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
        ground: rollGround(terrain, rng),
        traits,
        owner: null,
        outfit: null,
        pollution: 0,
        filter: false,
        runMonths: 0,
      });
    }
  }
  return { width, height, tiles };
}

export function rollGround(terrain: Terrain, rng: Rng): Ground {
  const ground = zeroGround();
  if (terrain === 'store') return ground;
  const odds = TERRAIN_ODDS[terrain];
  for (const g of GROWN_GOODS) ground[g] = rng.weighted(GROWN_ODDS[odds.grown[g] ?? 'neutral']) - 2;
  ground.smithore = rng.weighted(MINERAL_ODDS[odds.mined.smithore]);
  return ground;
}

/** The average rating a plot of this terrain rolls for a good: what a player can expect before analysing it. */
export function expectedGround(terrain: Terrain): Ground {
  const ground = zeroGround();
  if (terrain === 'store') return ground;
  const mean = (weights: readonly number[], offset: number) => weights.reduce((sum, w, i) => sum + w * (i + offset), 0);
  const odds = TERRAIN_ODDS[terrain];
  for (const g of GROWN_GOODS) ground[g] = mean(GROWN_ODDS[odds.grown[g] ?? 'neutral'], -2);
  ground.smithore = mean(MINERAL_ODDS[odds.mined.smithore], 0);
  // Rings hold the rest, so no terrain hints at them.
  ground.crystite = MAP.unknownMineral;
  ground.rareEarth = MAP.unknownMineral;
  return ground;
}

export function zeroGround(): Ground {
  return Object.fromEntries([...GROWN_GOODS, ...MINED_GOODS].map((g) => [g, 0])) as Ground;
}

export function tileIndex(width: number, x: number, y: number): number {
  return y * width + x;
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
