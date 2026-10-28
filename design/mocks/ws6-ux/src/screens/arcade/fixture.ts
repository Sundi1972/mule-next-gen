import type { TileView } from '@mule/protocol';
import { H, PLAYERS, W } from '../../fixture';
import { devView } from '../audit/dev/fixture';
import { initWorld, type Seat, type Tunables, type WalkTerrain, type World } from './sim';

/**
 * The arcade's table: the development audit's month 2 (audit/dev/fixture.ts), its map and its four colonists, with one
 * free plot for each bot so every bot has somewhere to install. Lena (this phone) owns Plains 4·1, Crater 15·1 and Lake 4·4 free,
 * and starts on the plains at 3·7, below her Tundra 3·4. Ossa's free plot is up in the mountains and Kai's across the
 * river, so the TV shows terrain slowing them.
 */

export const MONTH = 2;
const BASE = devView(MONTH, 300);
const FREED = new Set(['13,4', '6,7']);
/** Lena's lake plot 4·4 (free), so Heiko's lake question (wade, or install from the shore) can be played. */
const LENA_LAKE = '3,3';
export const ARCADE_TILES: TileView[] = BASE.tiles.map((t) => {
  const k = `${t.x},${t.y}`;
  if (k === LENA_LAKE) return { ...t, owner: 'lena', outfit: null };
  return FREED.has(k) ? { ...t, outfit: null } : t;
});

// Lena starts on open plains south of her Tundra, so her first push in any direction walks. Kai beside his Water
// plot 10·8, not on it: it is a lake, and a lake is impassable.
const START: Record<string, { x: number; y: number }> = { lena: { x: 2, y: 6 }, ossa: { x: 12, y: 4 }, brix: { x: 9, y: 2 }, kai: { x: 8, y: 7 } };

/** Each bot's fighting level; Lena's is the autopilot's. */
const LEVEL: Record<string, Seat['level']> = { lena: 'regular', ossa: 'veteran', brix: 'regular', kai: 'rookie' };

export const SEATS: Seat[] = PLAYERS.map((p) => ({ id: p.id, name: p.name, slot: p.slot as Seat['slot'], species: p.species, bot: p.id !== 'lena', level: LEVEL[p.id]!, start: START[p.id]! }));
export const ME = 'lena';
export const ARCADE_VIEW = BASE;

export const SEED = 20261029;
export const newWorld = (tun: Tunables, seed = SEED): World => initWorld(seed, SEATS, ARCADE_TILES, { width: W, height: H, month: MONTH }, tun);

/** The tunables' test track: one tile of each land with room to walk right across it, for feeling (and measuring) a speed. */
/** #arcade-wolves: Lena starts here, on forest at 5·2, a plot from the plains and off the map's edge. */
export const WOLF_START = { x: 4, y: 1 };

/**
 * #arcade-glint: Lena on the plains at 3·7, the glint on the plains at 8·7 (5 tiles east, across the river), and Ossa
 * on the mountain at 13·6, about 5 tiles on its other side. Measured headless at Heiko's half speed: Lena gets there in
 * 3.7 s if she sets off at once, Ossa in 4.6 s, so she wins if she reacts within about 0.7 s; both well inside the 8 s.
 */
export const GLINT_RACE = { lena: { x: 2, y: 6 }, at: { x: 7, y: 6 }, bot: 'ossa', botAt: { x: 12, y: 5 } };

/**
 * #arcade-scramble: three MULEs in the corral for four colonists, so the first sale starts the race for the last two.
 * Lena on the plains at 3·7, about 4 tiles from the store's left door, as Brix is from its right. Measured headless at
 * the defaults: played at once (by the bot rules) she buys at 4.8 s and the bots at 5.8–7.2 s; idle, she is left out.
 */
export const SCRAMBLE_RACE = { mules: 3, lena: { x: 2, y: 6 } };

export const TRACK: Partial<Record<WalkTerrain, { x: number; y: number }>> = {
  plains: { x: 2, y: 7 },
  mountains: { x: 12, y: 5 },
  swamp: { x: 0, y: 8 },
  forest: { x: 0, y: 6 },
  river: { x: 6, y: 0 },
  desert: { x: 10, y: 0 },
  // Beside Lena's lake plot 4·4: walk right into it to wade, or stand here to install from the shore.
  tundra: { x: 2, y: 3 },
};
