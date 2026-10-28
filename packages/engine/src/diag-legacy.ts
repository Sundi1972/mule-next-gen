// DIAGNOSTIC ONLY (ws5-diag worktree): frozen legacy odds, generator and hints.
import { mapSize } from './config.js';
import type { Rng } from './rng.js';
import { GROWN_GOODS, MINED_GOODS, RAW_GOODS, type GrownGood, type Ground, type MinedGood, type Terrain, type Tile, type TileTrait } from './types.js';

export const L_GROWN_ODDS = {
  good: [0, 0.05, 0.15, 0.3, 0.3, 0.2],
  neutral: [0.05, 0.2, 0.4, 0.25, 0.1, 0],
  poor: [0.3, 0.35, 0.25, 0.1, 0, 0],
} as const;
export const L_MINERAL_ODDS = {
  none: [1, 0, 0, 0, 0],
  low: [0.7, 0.2, 0.1, 0, 0],
  medium: [0.4, 0.3, 0.2, 0.1, 0],
  high: [0.1, 0.2, 0.35, 0.25, 0.1],
  veryHigh: [0.05, 0.1, 0.25, 0.35, 0.25],
} as const;
export const L_TERRAIN_ODDS: Record<Exclude<Terrain, 'store'>, { grown: Partial<Record<GrownGood, 'good' | 'poor'>>; mined: Record<MinedGood, keyof typeof L_MINERAL_ODDS> }> = {
  river: { grown: { food: 'good', water: 'good' }, mined: { smithore: 'low', crystite: 'none', rareEarth: 'low' } },
  lake: { grown: { water: 'good', food: 'good' }, mined: { smithore: 'none', crystite: 'none', rareEarth: 'none' } },
  plains: { grown: { food: 'good', energy: 'good' }, mined: { smithore: 'low', crystite: 'low', rareEarth: 'low' } },
  forest: { grown: { food: 'good', energy: 'poor' }, mined: { smithore: 'low', crystite: 'none', rareEarth: 'low' } },
  swamp: { grown: { water: 'good', food: 'poor' }, mined: { smithore: 'low', crystite: 'low', rareEarth: 'medium' } },
  hills: { grown: { food: 'poor' }, mined: { smithore: 'high', crystite: 'medium', rareEarth: 'medium' } },
  mountains: { grown: { food: 'poor', energy: 'poor' }, mined: { smithore: 'veryHigh', crystite: 'medium', rareEarth: 'high' } },
  desert: { grown: { energy: 'good', water: 'poor', food: 'poor' }, mined: { smithore: 'low', crystite: 'medium', rareEarth: 'medium' } },
  tundra: { grown: { energy: 'good', water: 'good', food: 'poor' }, mined: { smithore: 'medium', crystite: 'low', rareEarth: 'medium' } },
  ice: { grown: { water: 'good', food: 'poor', energy: 'poor' }, mined: { smithore: 'none', crystite: 'low', rareEarth: 'low' } },
  volcanic: { grown: { energy: 'good', food: 'poor' }, mined: { smithore: 'medium', crystite: 'low', rareEarth: 'high' } },
  crater: { grown: { food: 'poor' }, mined: { smithore: 'low', crystite: 'veryHigh', rareEarth: 'medium' } },
};
const LAND_TERRAINS: Exclude<Terrain, 'store'>[] = ['plains', 'plains', 'plains', 'hills', 'mountains', 'forest', 'swamp', 'desert', 'tundra', 'ice', 'lake', 'volcanic', 'crater'];
const TRAITS: TileTrait[] = ['bedrock', 'sheltered', 'hotSpring', 'thinVein', 'toxic', 'unstable', 'infested', 'floodPlain'];

export function legacyGenerateMap(players: number, rng: Rng): { width: number; height: number; tiles: Tile[] } {
  const { width, height } = mapSize(players);
  const midX = Math.floor(width / 2);
  const midY = Math.floor(height / 2);
  const seeds = Array.from({ length: Math.round((width * height) / 9) }, () => ({ x: rng.int(0, width - 1), y: rng.int(0, height - 1), terrain: rng.pick(LAND_TERRAINS) }));
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
          if (d < bestDist) { bestDist = d; best = s; }
        }
        terrain = best.terrain;
      }
      const traitCount = terrain === 'store' ? 0 : rng.pick([0, 0, 0, 1, 1, 2]);
      const traits: TileTrait[] = [];
      for (let i = 0; i < traitCount; i++) { const trait = rng.pick(TRAITS); if (!traits.includes(trait)) traits.push(trait); }
      tiles.push({ x, y, terrain, peaks: terrain === 'mountains' ? rng.int(1, 3) : 0, ground: legacyRollGround(terrain, rng), traits, owner: null, outfit: null, pollution: 0, filter: false, runMonths: 0 });
    }
  }
  return { width, height, tiles };
}

export function legacyRollGround(terrain: Terrain, rng: Rng): Ground {
  const ground = Object.fromEntries(RAW_GOODS.map((g) => [g, 0])) as Ground;
  if (terrain === 'store') return ground;
  const odds = L_TERRAIN_ODDS[terrain];
  for (const g of GROWN_GOODS) ground[g] = rng.weighted(L_GROWN_ODDS[odds.grown[g] ?? 'neutral']) - 2;
  for (const g of MINED_GOODS) ground[g] = rng.weighted(L_MINERAL_ODDS[odds.mined[g]]);
  return ground;
}

export function legacyExpectedGround(terrain: Terrain): Ground {
  const ground = Object.fromEntries(RAW_GOODS.map((g) => [g, 0])) as Ground;
  if (terrain === 'store') return ground;
  const mean = (weights: readonly number[], offset: number) => weights.reduce((sum, w, i) => sum + w * (i + offset), 0);
  const odds = L_TERRAIN_ODDS[terrain];
  for (const g of GROWN_GOODS) ground[g] = mean(L_GROWN_ODDS[odds.grown[g] ?? 'neutral'], -2);
  for (const g of MINED_GOODS) ground[g] = mean(L_MINERAL_ODDS[odds.mined[g]], 0);
  return ground;
}

export const DIAG: Record<string, string> = (() => {
  const raw: string = ((globalThis as any).process?.env?.MAPVAR as string | undefined) ?? '';
  const out: Record<string, string> = { layout: 'new', ground: 'new', hints: 'new' };
  for (const part of raw.split(',').filter(Boolean)) { const [k, v] = part.split('='); out[k!] = v!; }
  return out;
})();
