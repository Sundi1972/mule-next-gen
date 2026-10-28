import { GROWN_ODDS, MAP, MINERAL_ODDS, TERRAIN_ODDS } from './config.js';
import { zeroGround } from './grid.js';
import { dealGround } from './map-ground.js';
import { layoutMap } from './map-layout.js';
import type { GameMap } from './map-rules.js';
import type { Rng } from './rng.js';
import { placeSpecials } from './specials.js';
import { GROWN_GOODS, type Ground, type Terrain, type Tile, type TileTrait } from './types.js';

const TRAITS: TileTrait[] = ['bedrock', 'sheltered', 'hotSpring', 'thinVein', 'toxic', 'unstable', 'infested', 'floodPlain'];

/**
 * Builds a map that meets the map rules by construction (spec RULE-2): the
 * layout stages, then the ground stages, then traits and peaks, then special
 * fields, all from the one `rng` stream in that order, so a seed always gives
 * the same map. Special fields draw last, so they leave every earlier stage's
 * draws, and so the terrain and ground, as they were before special fields existed.
 */
export function generateMap(players: number, rng: Rng): GameMap {
  const layout = layoutMap(players, rng);
  const { ground } = dealGround(layout, players, rng);
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
  return placeSpecials({ width: layout.width, height: layout.height, tiles }, players, rng).map;
}

/** The average rating a plot of this terrain rolls for a good: what a player can expect before analysing it. */
export function expectedGround(terrain: Terrain): Ground {
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

export { neighbours, tileAt, tileIndex, zeroGround } from './grid.js';
