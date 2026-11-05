import type { Ground, Outfit, RawGood, Terrain } from '@mule/engine';
import type { MuleView, PlayerView, TileView } from '@mule/protocol';

/**
 * Plot info (Heiko's five points, approach B, 5 Nov): the ws6-ux month-5 table, with hidden ratings in the engine's own
 * terms (grown −2..+3, mined 0..4). Fixture data only. Lena holds this phone; she owns 7 plots.
 */

// --- The ws6-ux mocks' month-5 map and players (design/mocks/ws6-ux/src/fixture.ts), copied: that fixture's auction view
// predates today's protocol and no longer typechecks. -----------------------------------------------------------------
export const W = 15;
export const H = 9;
const ROWS = [
  'mmhppfrrpsdddtt',
  'mhppffrrppsddti',
  'hppplfrrppcsdti',
  'pppllprrpphhdii',
  'ppfpppSrrpphhmm',
  'fppvpprrpppdmmm',
  'ffppprrpplpdhmm',
  'sfpppprpplldhhm',
  'ssfpprrppplddhh',
];
const T: Record<string, Terrain> = {
  m: 'mountains', h: 'hills', p: 'plains', f: 'forest', r: 'river', s: 'swamp', d: 'desert', t: 'tundra', i: 'ice',
  l: 'lake', c: 'crater', v: 'volcanic', S: 'store',
};

export const PLAYERS: PlayerView[] = [
  { id: 'lena', slot: 0, name: 'Lena', isAi: false, color: '#e4572e', species: 'zipwing', money: 640, plots: 7, ready: false, doneDeveloping: false, colonist: null, condition: null, lastWorth: null, worthBeforeCut: null, worth: 4333 },
  { id: 'ossa', slot: 1, name: 'Ossa', isAi: true, color: '#3a86ff', species: 'bramblet', money: 910, plots: 7, ready: true, doneDeveloping: false, colonist: null, condition: null, lastWorth: null, worthBeforeCut: null, worth: 4543 },
  { id: 'brix', slot: 2, name: 'Brix', isAi: false, color: '#2bb673', species: 'gearling', money: 380, plots: 7, ready: false, doneDeveloping: false, colonist: null, condition: null, lastWorth: null, worthBeforeCut: null, worth: 4178 },
  { id: 'kai', slot: 3, name: 'Kai', isAi: true, color: '#f2a541', species: 'mollox', money: 215, plots: 5, ready: true, doneDeveloping: false, colonist: null, condition: null, lastWorth: null, worthBeforeCut: null, worth: 2625 },
];

/** Who owns which plot, and what stands on it. Empty outfit: claimed, no MULE yet. */
const OWNED: Record<string, [string, Outfit | null]> = {
  // Lena: a Food cluster on the river, two Energy plants, a Water well, one plot still empty.
  '6,2': ['lena', 'food'], '7,2': ['lena', 'food'], '7,3': ['lena', 'food'], '6,5': ['lena', 'energy'], '5,5': ['lena', 'energy'],
  '4,3': ['lena', 'water'], '5,6': ['lena', null],
  // Ossa: Smithore in the hills and mountains, a Crystite mine by the crater, Food and Energy on the west side.
  '12,4': ['ossa', 'smithore'], '13,4': ['ossa', 'smithore'], '12,5': ['ossa', 'smithore'], '10,2': ['ossa', 'crystite'],
  '1,4': ['ossa', 'energy'], '2,6': ['ossa', 'food'], '11,1': ['ossa', null],
  // Brix: Energy and Smithore, an Alloy smelter beside the Smithore, a farm short of Water.
  '9,2': ['brix', 'smithore'], '10,3': ['brix', 'smithore'], '11,3': ['brix', 'alloy'], '3,2': ['brix', 'food'],
  '4,5': ['brix', 'energy'], '3,5': ['brix', 'energy'], '8,6': ['brix', 'water'],
  // Kai: Water on the lakes, a farm, one Energy plant.
  '9,7': ['kai', 'water'], '10,7': ['kai', 'water'], '3,6': ['kai', 'energy'], '6,7': ['kai', 'food'], '13,1': ['kai', null],
};

export const TILES: TileView[] = ROWS.flatMap((row, y) =>
  [...row].map((c, x): TileView => {
    const [owner, outfit] = OWNED[`${x},${y}`] ?? [null, null];
    const terrain = T[c]!;
    return { x, y, terrain, peaks: terrain === 'mountains' ? 1 + ((x + y) % 3) : 0, owner, outfit, pollution: x === 11 && y === 3 ? 1 : 0, filter: false };
  }),
);

/** Only what the map reads: the tiles, the players (for each plot's slot) and the colony's objects (none here). */
const VIEW = { width: W, height: H, tiles: TILES, players: PLAYERS, colony: null } as unknown as MuleView;
export const RAW: RawGood[] = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth'];
const g = (food: number, water: number, energy: number, smithore = 0, crystite = 0, rareEarth = 0): Ground => ({ food, water, energy, smithore, crystite, rareEarth });

/** The real ratings, known or not. */
export const GROUND: Record<string, Ground> = {
  // Lena's plots, all analysed by month 5 but the empty one.
  '6,2': g(3, 1, 0),
  '7,2': g(2, 2, -1, 0, 2),
  '7,3': g(1, 1, 0, 0, 0, 1),
  '6,5': g(1, -1, 2),
  '5,5': g(0, -1, 3, 0, 0, 3),
  '4,3': g(2, 3, -1),
  '5,6': g(0, -2, 1, 0, 3),
  // Free plots: two for the drone, one to Analyse in development, one analysed last month.
  '9,4': g(2, 0, 1, 0, 0, 2),
  '8,1': g(1, -1, 3, 1),
  '8,5': g(3, 1, 0, 0, 1),
  '10,6': g(0, 1, 1, 0, 2),
};

/** Plots Lena has analysed before this screen: her own (but the empty one) and one free plot. */
export const KNOWN = new Set(['6,2', '7,2', '7,3', '6,5', '5,5', '4,3', '10,6']);
export const DRONE_PICKS = [
  { x: 9, y: 4 },
  { x: 8, y: 1 },
];
export const ANALYSE_AT = { x: 8, y: 5 };

const key = (x: number, y: number) => `${x},${y}`;

/** The view Lena's phone holds, with `known` plots carrying their ground (as the server sends only to her). */
export function viewWith(known: Set<string>): MuleView {
  const tiles: TileView[] = TILES.map((t) => (known.has(key(t.x, t.y)) && GROUND[key(t.x, t.y)] ? { ...t, ground: GROUND[key(t.x, t.y)]! } : t));
  return { ...VIEW, phase: 'planning', tiles };
}

export const tileOf = (view: MuleView, x: number, y: number) => view.tiles.find((t) => t.x === x && t.y === y)!;
export const myPlots = (view: MuleView) => view.tiles.filter((t) => t.owner === 'lena');
