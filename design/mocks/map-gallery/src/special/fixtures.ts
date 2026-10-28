import { createGame, createRng, formMeteorCrater, generateMap, MAP, TERRAIN_ODDS, type GameMap, type Tile } from '@mule/engine';
import type { Good, Slot, Terrain } from '@mule/ui';
import { SPECIAL_KINDS, type MapSpecial, type SpecialKind, type SpecialTile } from './kinds';

/**
 * Fixture data for the special-field view: real generated maps, with a few plots owned and
 * developed by hand so the glyphs are seen next to everything else a plot can carry.
 */

/** The 6-player map for seed 93: all five kinds (only the large map has five specials). */
export const SEED = 93;
export const PLAYERS = 6;

export function realMap(): GameMap {
  return generateMap(PLAYERS, createRng(SEED));
}

function base(t: Tile): SpecialTile {
  const tile: SpecialTile = { x: t.x, y: t.y, terrain: t.terrain, owner: null, peaks: t.peaks };
  if (t.special) tile.special = { kind: t.special.kind, ...(t.special.salvage ? { salvage: t.special.salvage } : {}) };
  return tile;
}

/** A plot's ground as a geo analysis reports it, in pips 1 to 4 (derive.ts groundPips: grown goods rate one higher). */
function analysis(t: Tile): Partial<Record<Good, number>> {
  const pips = (['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth'] as const).map((g) => {
    const grown = g === 'food' || g === 'water' || g === 'energy';
    return [g, Math.max(0, Math.min(4, grown ? t.ground[g] + 1 : t.ground[g]))] as const;
  });
  return Object.fromEntries(pips.filter(([, n]) => n > 0));
}

export function specialsOf(map: GameMap): Tile[] {
  return map.tiles.filter((t) => t.special);
}

export function find(map: GameMap, kind: SpecialKind): Tile {
  const t = map.tiles.find((p) => p.special?.kind === kind);
  if (!t) throw new Error(`seed ${SEED} has no ${kind}`);
  return t;
}

const OWNED: { slot: Slot; at: [number, number]; good?: Good }[] = [
  { slot: 0, at: [2, 6], good: 'food' },
  { slot: 0, at: [2, 5] },
  { slot: 1, at: [5, 3], good: 'energy' },
  { slot: 2, at: [15, 4], good: 'smithore' },
  { slot: 2, at: [15, 3] },
  { slot: 4, at: [8, 8], good: 'water' },
  { slot: 5, at: [12, 2], good: 'energy' },
];

/**
 * The overview: the second month on seed 93. A few plots are worked; the geyser is P2's and makes Energy,
 * the oasis is P4's but not yet farmed; the relic, the cavern and the ruins are still free.
 */
export function overviewTiles(map: GameMap): SpecialTile[] {
  const tiles = map.tiles.map(base);
  const at = (x: number, y: number) => tiles.find((t) => t.x === x && t.y === y)!;
  for (const o of OWNED) {
    const t = at(...o.at);
    if (t.special) continue;
    t.owner = o.slot;
    if (o.good) t.good = o.good;
  }
  const geyser = find(map, 'geyser');
  Object.assign(at(geyser.x, geyser.y), { owner: 1 as Slot, good: 'energy' as Good });
  const oasis = find(map, 'oasis');
  Object.assign(at(oasis.x, oasis.y), { owner: 3 as Slot });
  return tiles;
}

export interface Crop {
  width: number;
  height: number;
  tiles: SpecialTile[];
}

/** A window of the map, renumbered from 0, so one corner of the real map can be shown at true plot size. */
export function crop(map: GameMap, x0: number, y0: number, width: number, height: number): Crop {
  const tiles = map.tiles
    .filter((t) => t.x >= x0 && t.x < x0 + width && t.y >= y0 && t.y < y0 + height)
    .map((t) => ({ ...base(t), x: t.x - x0, y: t.y - y0 }));
  return { width, height, tiles };
}

export type StateId = 'unowned' | 'owned' | 'selected' | 'lit' | 'developed' | 'analysed' | 'public' | 'gone' | 'before' | 'after';

export interface StateCard {
  id: StateId;
  title: string;
  note: string;
  crop: Crop;
  selected?: { x: number; y: number };
  cursor?: { x: number; y: number };
  hideGround?: boolean;
}

/**
 * The state strip: one 5 × 5 corner of seed 93 (x 13–17, y 3–7) that holds three special fields, the
 * crystal cavern, the oasis and the ruins, shown in each state a plot can be in.
 */
export function stateCards(map: GameMap, density: 'phone' | 'tv'): StateCard[] {
  const X0 = 13;
  const Y0 = 3;
  const fresh = () => crop(map, X0, Y0, 5, 5);
  const local = (kind: SpecialKind) => {
    const t = find(map, kind);
    return { x: t.x - X0, y: t.y - Y0 };
  };
  const edit = (c: Crop, kind: SpecialKind, change: Partial<SpecialTile>) => {
    const p = local(kind);
    Object.assign(c.tiles.find((t) => t.x === p.x && t.y === p.y)!, change);
    return c;
  };
  const withGround = () => {
    const c = fresh();
    for (const kind of ['crystalCavern', 'oasis'] as const) {
      const t = find(map, kind);
      edit(c, kind, { ground: analysis(t) });
    }
    return c;
  };
  const owned = () => {
    const c = fresh();
    edit(c, 'crystalCavern', { owner: 0 });
    edit(c, 'oasis', { owner: 1 });
    edit(c, 'ruins', { owner: 5 });
    return c;
  };
  const developed = () => {
    const c = owned();
    edit(c, 'crystalCavern', { good: 'crystite' });
    edit(c, 'oasis', { good: 'food' });
    return c;
  };
  const gone = () => {
    const c = developed();
    edit(c, 'crystalCavern', { special: undefined, good: undefined });
    edit(c, 'ruins', { special: undefined });
    return c;
  };
  const cards: StateCard[] = [
    { id: 'unowned', title: 'Unowned', note: 'As the first land grant finds them.', crop: fresh() },
    { id: 'owned', title: 'Owned', note: "Over P1's, P2's and P6's glow.", crop: owned() },
  ];
  if (density === 'phone') {
    cards.push(
      { id: 'selected', title: 'Selected', note: 'The cavern, looked at in Develop.', crop: owned(), selected: local('crystalCavern') },
      { id: 'developed', title: 'Worked', note: 'A MULE mines the cavern, another farms the oasis.', crop: developed() },
      { id: 'analysed', title: 'Geo analysis', note: 'Ground chips on the same plots, on your phone only.', crop: withGround() },
    );
  } else {
    cards.push(
      { id: 'lit', title: 'Lit', note: 'The land grant cursor on the cavern.', crop: fresh(), cursor: local('crystalCavern') },
      { id: 'developed', title: 'Worked', note: 'A MULE mines the cavern, another farms the oasis.', crop: developed() },
      { id: 'public', title: 'Public table', note: 'The same analysed plots: the TV hides ground.', crop: withGround(), hideGround: true },
    );
  }
  cards.push({ id: 'gone', title: 'Gone', note: 'Ruins paid out; the cavern caved in. Plain plots now.', crop: gone() });
  return cards;
}

/** Every dry terrain a special field can stand on, the union of MAP.special.on. */
export const SWEEP_TERRAINS: Terrain[] = [...new Set(Object.values(MAP.special.on).flat())];

/**
 * The legibility sweep: one column per terrain, one row per kind, every kind on every dry terrain. The
 * generator only puts each kind on some of them; this is a stress test of the art, not a map.
 */
export function sweep(): Crop {
  const tiles: SpecialTile[] = [];
  SWEEP_TERRAINS.forEach((terrain, x) =>
    SPECIAL_KINDS.forEach((kind, y) => {
      const special: MapSpecial = kind === 'ruins' ? { kind, salvage: 'alloy' } : { kind };
      tiles.push({ x, y, terrain, owner: null, peaks: terrain === 'mountains' ? 2 : 0, special });
    }),
  );
  return { width: SWEEP_TERRAINS.length, height: SPECIAL_KINDS.length, tiles };
}

/** The plot the meteor strikes: P3's Smithore mine on seed 93, right beside the crystal cavern P1 mines. */
export const STRUCK = { x: 15, y: 4 } as const;

export interface CraterView {
  cards: StateCard[];
  /** The struck plot and the cavern beside it, as the engine holds them after the strike. */
  crater: Tile;
  cavern: Tile;
}

/**
 * The meteor crater beside the crystal cavern, on the state strip's corner of seed 93 (x 13–17, y 3–7): the
 * second month, before and after a meteor strikes P3's mine. The strike is the engine's own formMeteorCrater,
 * run on seed 93's game, so the crater, its owner and its Crystite are what the game will hold.
 */
export function craterView(density: 'phone' | 'tv'): CraterView {
  const X0 = 13;
  const Y0 = 3;
  const players = Array.from({ length: PLAYERS }, (_, i) => ({ id: `p${i}`, name: `P${i + 1}`, isAi: true }));
  const game = createGame({ seed: SEED, players });
  const mine = game.tiles.find((t) => t.x === STRUCK.x && t.y === STRUCK.y)!;
  Object.assign(mine, { owner: 'p2', outfit: 'smithore', runMonths: 1 });
  const before = structuredClone(game);
  formMeteorCrater(game, STRUCK.x, STRUCK.y);
  const cavern = find(game, 'crystalCavern');

  const local = (t: { x: number; y: number }) => ({ x: t.x - X0, y: t.y - Y0 });
  const at = (c: Crop, t: { x: number; y: number }) => c.tiles.find((p) => p.x === t.x - X0 && p.y === t.y - Y0)!;
  /** The corner as everyone sees it: P1 mines the cavern, P3 owns the struck plot and the one above it. */
  const corner = (map: GameMap): Crop => {
    const c = crop(map, X0, Y0, 5, 5);
    Object.assign(at(c, cavern), { owner: 0 as Slot, good: 'crystite' as Good });
    Object.assign(at(c, { x: STRUCK.x, y: STRUCK.y - 1 }), { owner: 2 as Slot });
    const struck = at(c, STRUCK);
    struck.owner = 2;
    const outfit = map.tiles.find((t) => t.x === STRUCK.x && t.y === STRUCK.y)!.outfit;
    if (outfit) struck.good = outfit as Good;
    return c;
  };
  const analysed = () => {
    const c = corner(game);
    at(c, STRUCK).ground = analysis(mine);
    return c;
  };
  const cards: StateCard[] = [
    { id: 'before', title: 'Before', note: "P3's Smithore mine, beside the cavern P1 mines.", crop: corner(before) },
    { id: 'after', title: 'After the strike', note: 'P3 keeps the plot; its MULE is gone. A crater, Crystite 4.', crop: corner(game) },
  ];
  if (density === 'phone') {
    cards.push(
      { id: 'selected', title: 'Selected', note: 'P3 looks at the crater in Develop.', crop: corner(game), selected: local(STRUCK) },
      { id: 'analysed', title: 'Geo analysis', note: "P3's own analysis: Crystite 4 under the crater.", crop: analysed() },
    );
  }
  return { cards, crater: mine, cavern };
}

/** The meteor crater on every land terrain, river and lake included: a meteor can strike any plot but the store. */
export function craterSweep(): Crop {
  const terrains = Object.keys(TERRAIN_ODDS) as Terrain[];
  const tiles: SpecialTile[] = terrains.map((terrain, x) => ({
    x,
    y: 0,
    terrain,
    owner: null,
    peaks: terrain === 'mountains' ? 2 : 0,
    special: { kind: 'meteorCrater' },
  }));
  return { width: terrains.length, height: 1, tiles };
}
