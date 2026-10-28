import type { TileView } from '@mule/protocol';
import { H, PLAYERS, W } from '../../fixture';
import { devView } from '../audit/dev/fixture';
import { initWorld, type Seat, type Tunables, type WalkTerrain, type World } from './sim';

/**
 * The arcade's table: the development audit's month 2 (audit/dev/fixture.ts), its map and its four colonists, with one
 * free plot for each bot so every bot has somewhere to install. Lena (this phone) owns Plains 4·1 and Crater 15·1 free,
 * and starts on the plains at 3·7, below her Tundra 3·4. Ossa's free plot is up in the mountains and Kai's across the
 * river, so the TV shows terrain slowing them.
 */

export const MONTH = 2;
const BASE = devView(MONTH, 300);
const FREED = new Set(['13,4', '6,7']);
export const ARCADE_TILES: TileView[] = BASE.tiles.map((t) => (FREED.has(`${t.x},${t.y}`) ? { ...t, outfit: null } : t));

// Lena starts on open plains south of her Tundra, so her first push in any direction walks. Kai beside his Water
// plot 10·8, not on it: it is a lake, and a lake is impassable.
const START: Record<string, { x: number; y: number }> = { lena: { x: 2, y: 6 }, ossa: { x: 12, y: 4 }, brix: { x: 9, y: 2 }, kai: { x: 8, y: 7 } };

export const SEATS: Seat[] = PLAYERS.map((p) => ({ id: p.id, name: p.name, slot: p.slot as Seat['slot'], species: p.species, bot: p.id !== 'lena', start: START[p.id]! }));
export const ME = 'lena';
export const ARCADE_VIEW = BASE;

export const SEED = 20261029;
export const newWorld = (tun: Tunables, seed = SEED): World => initWorld(seed, SEATS, ARCADE_TILES, { width: W, height: H, month: MONTH }, tun);

/** The tunables' test track: one tile of each land with room to walk right across it, for feeling (and measuring) a speed. */
export const TRACK: Partial<Record<WalkTerrain, { x: number; y: number }>> = {
  plains: { x: 2, y: 7 },
  mountains: { x: 12, y: 5 },
  swamp: { x: 0, y: 8 },
  forest: { x: 0, y: 6 },
  river: { x: 6, y: 0 },
  desert: { x: 10, y: 0 },
};
