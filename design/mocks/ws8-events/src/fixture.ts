import type { Good, MapTile, Slot, Species, Terrain } from '@mule/ui';

/**
 * WS6's fixture colony (design/mocks/ws6-ux/src/fixture.ts, month 5, four players), so Heiko sees the events on
 * the map he already knows. Fixture data only; Lena holds the phone.
 */

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

export interface Seat {
  id: string;
  name: string;
  slot: Slot;
  species: Species;
  money: number;
}

export const SEATS: Seat[] = [
  { id: 'lena', name: 'Lena', slot: 0, species: 'zipwing', money: 640 },
  { id: 'ossa', name: 'Ossa', slot: 1, species: 'bramblet', money: 910 },
  { id: 'brix', name: 'Brix', slot: 2, species: 'gearling', money: 380 },
  { id: 'kai', name: 'Kai', slot: 3, species: 'mollox', money: 215 },
];
export const ME = 'lena';
/** Which species sits in which seat, for @mule/ui's SeatSpeciesProvider. */
export const SPECIES_BY_SLOT: Record<Slot, Species> = { 0: 'zipwing', 1: 'bramblet', 2: 'gearling', 3: 'mollox', 4: 'glimmer', 5: 'quibbit' };
export const seat = (id: string) => SEATS.find((s) => s.id === id)!;

/** Who owns which plot, what stands on it, and what it made this month before any event. */
const OWNED: Record<string, [string, Good | null, number]> = {
  '6,2': ['lena', 'food', 4], '7,2': ['lena', 'food', 4], '7,3': ['lena', 'food', 4], '6,5': ['lena', 'energy', 4], '5,5': ['lena', 'energy', 4],
  '4,3': ['lena', 'water', 3], '5,6': ['lena', null, 0],
  '12,4': ['ossa', 'smithore', 4], '13,4': ['ossa', 'smithore', 4], '12,5': ['ossa', 'smithore', 4], '10,2': ['ossa', 'crystite', 2],
  '1,4': ['ossa', 'energy', 3], '2,6': ['ossa', 'food', 3], '11,1': ['ossa', null, 0],
  '9,2': ['brix', 'smithore', 3], '10,3': ['brix', 'smithore', 3], '11,3': ['brix', 'alloy', 1], '3,2': ['brix', 'food', 1],
  '4,5': ['brix', 'energy', 4], '3,5': ['brix', 'energy', 4], '8,6': ['brix', 'water', 1],
  '9,7': ['kai', 'water', 4], '10,7': ['kai', 'water', 4], '3,6': ['kai', 'energy', 3], '6,7': ['kai', 'food', 2], '13,1': ['kai', null, 0],
};

export const TILES: MapTile[] = ROWS.flatMap((row, y) =>
  [...row].map((c, x): MapTile => {
    const [owner, good] = OWNED[`${x},${y}`] ?? [null, null];
    const terrain = T[c]!;
    return {
      x,
      y,
      terrain,
      owner: owner ? seat(owner).slot : null,
      ...(good ? { good } : {}),
      ...(terrain === 'mountains' ? { peaks: 1 + ((x + y) % 3) } : {}),
    };
  }),
);

/** Every working plot and what it made before the month's events. */
export const OUTPUT: { x: number; y: number; owner: string; good: Good; made: number }[] = Object.entries(OWNED)
  .filter(([, [, good]]) => good !== null)
  .map(([k, [owner, good, made]]) => {
    const [x, y] = k.split(',').map(Number) as [number, number];
    return { x, y, owner, good: good!, made };
  });

export const ownerAt = (x: number, y: number): string | null => OWNED[`${x},${y}`]?.[0] ?? null;

/** Where each colonist stands on the TV's development map when the turn starts: round the store. */
export const STAND: Record<string, { x: number; y: number }> = {
  lena: { x: 5, y: 4 },
  ossa: { x: 7, y: 4 },
  brix: { x: 6, y: 3 },
  kai: { x: 6, y: 5 },
};
