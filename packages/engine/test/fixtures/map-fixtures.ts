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

/** MID_SPEC's Crystite with a fourth peak at (4,3): still within the 3 to 4 peaks allowed. */
export const CRYSTITE_4_PEAKS = [
  '000000023200000',
  '000020234320000',
  '000232023200000',
  '002343202000000',
  '0002320.0000020',
  '020020000000232',
  '232000000002343',
  '343200000000232',
  '232000000000020',
];

/** CRYSTITE_4_PEAKS with a fifth peak at (10,4). */
export const CRYSTITE_5_PEAKS = [
  '000000023200000',
  '000020234320000',
  '000232023220000',
  '002343202232000',
  '0002320.2343220',
  '020020000232232',
  '232000000022343',
  '343200000000232',
  '232000000000020',
];

/**
 * An 11×5 map for 2 players with 47 plots of non-river land: plains 15 in
 * three regions of 5, the other terrains 3 or 4. Only on non-river land under
 * 75 plots can plains pass its share yet exceed a third (16 of 47), so the
 * no-dominant-terrain rule is tested here rather than on a real map size.
 * Its river has the small band's 2 bends and touches column 8, the right
 * edge it may use.
 */
export const SMALL_SPEC: MapSpec = {
  terrain: [
    'PPPHHHDD~TT',
    'PPLLLDD~~FT',
    'SSSVV#~~FFF',
    'IIIVCC~PPMM',
    'PPPPPC~PPPM',
  ],
  ground: {
    food: 1,
    water: 1,
    energy: 1,
    smithore: [
      '00000000033',
      '03300000033',
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

/**
 * A 19×11 map for 5 players that meets every map rule, built like MID_SPEC:
 * 193 plots of non-river land, a river with the large band's 4 bends, the
 * same diagonal stripes, and five Smithore seams (20 plots) leaving the
 * corner (0,0) exactly 6 steps from one.
 */
export const LARGE_SPEC: MapSpec = {
  terrain: [
    'FFFFPPP~PPPPPPTTTTT',
    'FFFFPPP~~PPPPPTTTTT',
    'FFFFPPPP~PPPPPLLLTT',
    'FFFFPPPP~PPPPLLLLMM',
    'FFFFPPPP~PPPLLLLLMM',
    'FFFFPPPP~#SSSSSMMMM',
    'HHHHHHHP~~SSSSSMMMM',
    'HHHHHIIII~SSSSDDDMM',
    'HHHHHIIII~~DDDDDDVV',
    'HHHCCCCIII~DDDDDVVV',
    'HHCCCCCCCC~~VVVVVVV',
  ],
  ground: {
    food: [
      '1100011000110001100',
      '1000110001100011000',
      '0001100011000110001',
      '0011000110001100011',
      '0110001100011000110',
      '110001100.110001100',
      '1000110001100011000',
      '0001100011000110001',
      '0011000110001100011',
      '0110001100011000110',
      '1100011000110001100',
    ],
    water: [
      '0011000110001100011',
      '0110001100011000110',
      '1100011000110001100',
      '1000110001100011000',
      '0001100011000110001',
      '001100011.001100011',
      '0110001100011000110',
      '1100011000110001100',
      '1000110001100011000',
      '0001100011000110001',
      '0011000110001100011',
    ],
    energy: [
      '1100011000110001100',
      '0110001100011000110',
      '0011000110001100011',
      '0001100011000110001',
      '1000110001100011000',
      '110001100.110001100',
      '0110001100011000110',
      '0011000110001100011',
      '0001100011000110001',
      '1000110001100011000',
      '1100011000110001100',
    ],
    smithore: [
      '0000000000000000000',
      '0000000033000000000',
      '0000330033000330000',
      '0000330000000330000',
      '0000000000000000000',
      '000000000.000000000',
      '0000000000000000000',
      '0000330000000330000',
      '0000330000000330000',
      '0000000000000000000',
      '0000000000000000000',
    ],
    crystite: [
      '0000000000200000000',
      '0000000002320000000',
      '0000000023432000000',
      '0000000002320000000',
      '0000000000200000000',
      '000000000.000000200',
      '0000000000000002320',
      '0020000000000023432',
      '0232000000000002320',
      '2343200000000000200',
      '0232000000000000000',
    ],
    rareEarth: [
      '0013100000000000010',
      '0134310000000000131',
      '0013100000000001343',
      '0001000000000000131',
      '0000000000000000010',
      '000000000.000000000',
      '0000000000010000000',
      '0000000000131000000',
      '0000000001343100000',
      '0000000000131000000',
      '0000000000010000000',
    ],
  },
};

export const LARGE_MAP = buildMap(LARGE_SPEC);
