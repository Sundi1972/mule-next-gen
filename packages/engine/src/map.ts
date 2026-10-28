import { GROWN_ODDS, MAP, MINERAL_ODDS, TERRAIN_ODDS } from './config.js';
import { dealGround } from './map-ground.js';
import { layoutMap } from './map-layout.js';
import type { GameMap } from './map-rules.js';
import type { Rng } from './rng.js';
import { GROWN_GOODS, MINED_GOODS, type Ground, type Terrain, type Tile, type TileTrait } from './types.js';
import { DIAG, legacyExpectedGround, legacyGenerateMap, legacyRollGround } from './diag-legacy.js';

const TRAITS: TileTrait[] = ['bedrock', 'sheltered', 'hotSpring', 'thinVein', 'toxic', 'unstable', 'infested', 'floodPlain'];

/**
 * Builds a map that meets the map rules by construction (spec RULE-2): the
 * layout stages, then the ground stages, then traits and peaks, all from the
 * one `rng` stream in that order, so a seed always gives the same map.
 */
export function generateMap(players: number, rng: Rng): GameMap {
  if (DIAG.layout === 'legacy' && DIAG.ground === 'legacy') return legacyGenerateMap(players, rng);
  let layout: { width: number; height: number; terrain: Terrain[] };
  if (DIAG.layout === 'legacy') {
    const m = legacyGenerateMap(players, rng);
    layout = { width: m.width, height: m.height, terrain: m.tiles.map((t) => t.terrain) };
  } else layout = layoutMap(players, rng);
  const ground = DIAG.ground === 'legacy' ? layout.terrain.map((t) => legacyRollGround(t, rng)) : dealGround(layout as never, players, rng).ground;
  const tiles = layout.terrain.map((terrain, i): Tile => {
    const traitCount = terrain === 'store' ? 0 : rng.pick([0, 0, 0, 1, 1, 2]);
    const traits: TileTrait[] = [];
    for (let n = 0; n < traitCount; n++) {
      const trait = rng.pick(TRAITS);
      if (!traits.includes(trait)) traits.push(trait);
    }
    return {
      x: i % layout.width,
      y: Math.floor(i / layout.width),
      terrain,
      peaks: terrain === 'mountains' ? rng.int(1, 3) : 0,
      ground: ground[i]!,
      traits,
      owner: null,
      outfit: null,
      pollution: 0,
      filter: false,
      runMonths: 0,
    };
  });
  return { width: layout.width, height: layout.height, tiles };
}

/** The average rating a plot of this terrain rolls for a good: what a player can expect before analysing it. */
export function expectedGround(terrain: Terrain): Ground {
  if (DIAG.hints === 'old') return legacyExpectedGround(terrain);
  const ground = zeroGround();
  if (terrain === 'store') return ground;
  const mean = (weights: readonly number[], offset: number) => weights.reduce((sum, w, i) => sum + w * (i + offset), 0);
  const odds = TERRAIN_ODDS[terrain];
  for (const g of GROWN_GOODS) ground[g] = mean(GROWN_ODDS[odds.grown[g] ?? 'neutral'], -2);
  ground.smithore = mean(MINERAL_ODDS[odds.mined.smithore], 0);
  // Crystite and Rare earth sit in random rings, not by terrain, so every terrain hints the same map-wide average.
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
