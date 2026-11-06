import type { ColonistView, DevFrame, MuleView, MyView, PlayerView, ReachView, TableView, TileView } from '@mule/protocol';
import type { Terrain } from '@mule/engine';
import { aMuleView, aPlayer } from './views';

/**
 * The arcade's table on real data: month 2's development on a 15 × 9 map with the store at 8·5 (x 7, y 4). Lena (s1,
 * this phone, a Zipwing) owns Plains 4·1 (free), Tundra 4·4 (an Energy MULE on it) and Crater 15·1 (free); Ossa (s2)
 * plays on another phone; Kai (s3) and Brix (s4) are AI seats. Every position comes from a frame, as the server sends it.
 */

const LAND: Record<string, Terrain> = { '.': 'plains', '^': 'mountains', s: 'swamp', '~': 'lake', f: 'forest', t: 'tundra', c: 'crater', S: 'store', r: 'river' };
const MAP = [
  '...f......^^..c',
  '..ff......^^...',
  '.....~~...r....',
  '.s.t......r....',
  '.s.....S..r....',
  '....^^....r..~.',
  '..........r....',
  '..........r....',
  '..........r....',
];

const OWNERS: Record<string, string> = { '3,0': 's1', '3,3': 's1', '14,0': 's1', '12,2': 's2', '1,6': 's3', '9,7': 's4' };
const OUTFITS: Record<string, TileView['outfit']> = { '3,3': 'energy', '1,6': 'food' };

export const TILES: TileView[] = MAP.flatMap((row, y) =>
  [...row].map((ch, x) => ({ x, y, terrain: LAND[ch]!, peaks: ch === '^' ? 2 : 0, owner: OWNERS[`${x},${y}`] ?? null, outfit: OUTFITS[`${x},${y}`] ?? null, pollution: 0, filter: false })),
);

export const STORE = { x: 7, y: 4 };
export const LENAS_PLOTS = [
  { x: 3, y: 0 },
  { x: 3, y: 3 },
  { x: 14, y: 0 },
];

const WELL = { foodShare: 1, foodNeed: 3, sick: false, sickBecause: null, conditionPace: 1 } as const;
const colonist = (c: Partial<ColonistView> = {}): ColonistView => ({ at: 'store', assayUntil: null, pace: 1, pelts: 0, encounter: null, ...c });

export const PLAYERS: PlayerView[] = [
  aPlayer({ id: 's1', name: 'Lena', slot: 0, species: 'zipwing', money: 600, plots: 3, condition: WELL, colonist: colonist({ pace: 1.25 }) }),
  aPlayer({ id: 's2', name: 'Ossa', slot: 1, species: 'gearling', plots: 1, condition: { ...WELL, foodShare: 0.5, conditionPace: 0.6 }, colonist: colonist({ pace: 0.6 }) }),
  aPlayer({ id: 's3', name: 'Kai', slot: 2, species: 'mollox', isAi: true, plots: 1, condition: WELL, colonist: colonist() }),
  aPlayer({ id: 's4', name: 'Brix', slot: 3, species: 'bramblet', isAi: true, plots: 1, condition: WELL, colonist: colonist() }),
];

const STOCK = { food: 3, water: 2, energy: 2, smithore: 0, crystite: 0, rareEarth: 0, alloy: 0, electronics: 0, medicine: 0 };

/** Lena's own view: no MULE yet, 600 cr, the clock 30 s from its end. */
export function lenasMe(over: Partial<MyView> = {}): MyView {
  return {
    id: 's1',
    species: 'zipwing',
    stock: STOCK,
    carriedMule: null,
    installedThisTurn: false,
    worthParts: { money: 0, goods: 0, plots: 0, land: 0, mules: 0, muleValue: 0, office: 0, donated: 0, cut: 0 },
    claimsLeft: 0,
    hungry: false,
    sick: false,
    needs: { food: 3, water: 2 },
    monthNeeds: { ...STOCK, food: 3, water: 2 },
    devEndsAt: NOW + 30_000,
    devSeconds: 50,
    produced: null,
    mulePrice: 148,
    outfitCosts: { food: 25, water: 25, energy: 50, smithore: 75, crystite: 100, rareEarth: 100, alloy: 150, electronics: 200, medicine: 150, greenBelt: 40 },
    droneOrder: [],
    politics: null,
    reach: { verb: 'TO THE STORE', detail: null, enabled: false },
    ...over,
  };
}

/** The server's time in every fixture: the clock reads 30 s left. */
export const NOW = 1_000_000;

export function devView(me: MyView = lenasMe(), over: Partial<MuleView> = {}): MuleView {
  return aMuleView({ month: 2, phase: 'development', phaseEndsAt: NOW + 30_000, width: 15, height: 9, tiles: TILES, players: PLAYERS, me, politics: null, storeMules: 8, mulePrice: 148, ...over });
}

export function tableOf(game: MuleView): TableView<MuleView> {
  return { code: 'MULE', status: 'playing', hostId: 's1', boards: 1, game, seats: PLAYERS.map((p) => ({ id: p.id, name: p.name, isAi: p.isAi, connected: true, color: p.slot })) };
}

type Framed = DevFrame['colonists'][number];
export const at = (id: string, x: number, y: number, over: Partial<Framed> = {}): Framed => ({ id, x, y, space: 'map', facing: 'right', moving: false, lead: null, ...over });

/** Where everyone stands in the frames: Lena by the store's left door, Ossa on the river, Kai in the hall, Brix by his plot. */
export const FRAMED: Framed[] = [at('s1', 6.6, 4.5), at('s2', 10.5, 3.5, { moving: true }), at('s3', 8, 6, { space: 'hall' }), at('s4', 9.5, 6.8, { moving: true, facing: 'left' })];

export const reach = (verb: string, detail: string | null = null, enabled = true): ReachView => ({ verb, detail, enabled });
