import { RAW_GOODS, zeroGround, type RawGood, type Terrain, type Tile } from '../../src/index.js';

/** Hand-built maps for the map-rule tests: terrain and ground drawn as ASCII, one character per plot. */

export interface TestMap {
  width: number;
  height: number;
  tiles: Tile[];
}

/** Terrain rows, and for each raw good either rating rows (digits; `.` on the store) or one rating for every plot. */
export interface MapSpec {
  terrain: string[];
  ground: Record<RawGood, string[] | number>;
}

const TERRAIN_BY_LETTER: Record<string, Terrain> = {
  P: 'plains',
  F: 'forest',
  H: 'hills',
  D: 'desert',
  T: 'tundra',
  M: 'mountains',
  S: 'swamp',
  L: 'lake',
  V: 'volcanic',
  C: 'crater',
  I: 'ice',
  '~': 'river',
  '#': 'store',
};

export function buildMap(spec: MapSpec): TestMap {
  const height = spec.terrain.length;
  const width = spec.terrain[0]!.length;
  const tiles: Tile[] = [];
  for (let y = 0; y < height; y++) {
    const row = spec.terrain[y]!;
    if (row.length !== width) throw new Error(`terrain row ${y} is ${row.length} wide, expected ${width}`);
    for (let x = 0; x < width; x++) {
      const terrain = TERRAIN_BY_LETTER[row[x]!];
      if (!terrain) throw new Error(`unknown terrain letter '${row[x]}' at (${x},${y})`);
      const ground = zeroGround();
      if (terrain !== 'store') for (const good of RAW_GOODS) ground[good] = rating(spec.ground[good], x, y);
      tiles.push({ x, y, terrain, peaks: 0, ground, traits: [], owner: null, outfit: null, pollution: 0, filter: false, runMonths: 0 });
    }
  }
  return { width, height, tiles };
}

function rating(layer: string[] | number, x: number, y: number): number {
  if (typeof layer === 'number') return layer;
  const char = layer[y]?.[x];
  if (char === undefined || !/[0-9]/.test(char)) throw new Error(`no rating digit at (${x},${y})`);
  return Number(char);
}

/** A copy of the map with some plots' terrain changed: [x, y, letter]. */
export function withTerrain(map: TestMap, edits: [number, number, string][]): TestMap {
  const tiles = map.tiles.map((t) => ({ ...t, ground: { ...t.ground } }));
  for (const [x, y, letter] of edits) {
    const terrain = TERRAIN_BY_LETTER[letter];
    if (!terrain) throw new Error(`unknown terrain letter '${letter}'`);
    tiles[y * map.width + x]!.terrain = terrain;
  }
  return { ...map, tiles };
}

/** A copy of the map with one good's rating changed on some plots: [x, y, rating]. */
export function withGround(map: TestMap, good: RawGood, edits: [number, number, number][]): TestMap {
  const tiles = map.tiles.map((t) => ({ ...t, ground: { ...t.ground } }));
  for (const [x, y, value] of edits) tiles[y * map.width + x]!.ground[good] = value;
  return { ...map, tiles };
}

/**
 * A 15×9 map for 4 players that meets every map rule. Non-river land is 122
 * plots. Grown goods lie in diagonal stripes (good = 1), so every plot is at
 * most 2 steps from each: food 53, water 54, energy 54 good plots. Smithore
 * is four 2×2 seams rated 3 (16 plots), so the corners are exactly 5 steps from
 * one. Crystite and Rare earth are three rings each.
 */
export const MID_SPEC: MapSpec = {
  terrain: [
    'FFFPPP~PPPPTTTT',
    'FFFPP~~PPPPTTTT',
    'FFFPP~PPPPLLLTT',
    'FFPPP~~PPLLLLMM',
    'FFPPPP~#SSSSMMM',
    'HHHHII~SSSSSMMM',
    'HHHHII~~DDDDDDM',
    'HHCCCII~DDDDDVV',
    'HHCCCII~VVVVVVV',
  ],
  ground: {
    food: [
      '110001100011000',
      '100011000110001',
      '000110001100011',
      '001100011000110',
      '0110001.0001100',
      '110001100011000',
      '100011000110001',
      '000110001100011',
      '001100011000110',
    ],
    water: [
      '001100011000110',
      '011000110001100',
      '110001100011000',
      '100011000110001',
      '0001100.1100011',
      '001100011000110',
      '011000110001100',
      '110001100011000',
      '100011000110001',
    ],
    energy: [
      '110001100011000',
      '011000110001100',
      '001100011000110',
      '000110001100011',
      '1000110.0110001',
      '110001100011000',
      '011000110001100',
      '001100011000110',
      '000110001100011',
    ],
    smithore: [
      '000000000000000',
      '000000000000000',
      '000330000033000',
      '000330000033000',
      '0000000.0000000',
      '000330000033000',
      '000330000033000',
      '000000000000000',
      '000000000000000',
    ],
    crystite: [
      '000000023200000',
      '000000234320000',
      '000000023200000',
      '000000002000000',
      '0000000.0000020',
      '020000000000232',
      '232000000002343',
      '343200000000232',
      '232000000000020',
    ],
    rareEarth: [
      '013100000000010',
      '134310000000131',
      '013100000001343',
      '001000000000131',
      '0000000.0000010',
      '000000000100000',
      '000000001310000',
      '000000013431000',
      '000000001310000',
    ],
  },
};

export const MID_MAP = buildMap(MID_SPEC);

/**
 * An 11×5 map for 2 players with 47 plots of non-river land: plains 15 in
 * three regions of 5, the other terrains 3 or 4. Only on non-river land under
 * 75 plots can plains pass its share yet exceed a third (16 of 47), so the
 * no-dominant-terrain rule is tested here rather than on a real map size.
 */
export const SMALL_SPEC: MapSpec = {
  terrain: [
    'PPP~PPPFFTT',
    'PPL~~PPFFTD',
    'HLLC~#SMMDD',
    'HHCC~SSVMPP',
    'IIIC~~VVPPP',
  ],
  ground: {
    food: 1,
    water: 1,
    energy: 1,
    smithore: [
      '00000000000',
      '03300000000',
      '03300.00330',
      '00000000330',
      '00000000000',
    ],
    crystite: [
      '43200000023',
      '32000000234',
      '20000.00023',
      '00002320002',
      '00023432000',
    ],
    rareEarth: [
      '00000134310',
      '00000013100',
      '00100.01001',
      '01310000013',
      '13431000134',
    ],
  },
};

export const SMALL_MAP = buildMap(SMALL_SPEC);
