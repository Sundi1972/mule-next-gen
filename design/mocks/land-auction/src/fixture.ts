import { emptyStock, type Outfit, type Terrain } from '@mule/engine';
import type { MyView, PlayerView, TileView } from '@mule/protocol';
import type { LandAuctionView, ListingView, LotsView } from './proto';

/**
 * One 4-player game in month 4, as the land auction opens. Fixture data only:
 * every number is plausible against the engine's config, none is computed.
 */

const W = 15;
const H = 9;
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
  { id: 'lena', name: 'Lena', isAi: false, color: '#e4572e', species: 'zipwing', money: 640, plots: 5, ready: false, doneDeveloping: false },
  { id: 'ossa', name: 'Ossa', isAi: true, color: '#3a86ff', species: 'bramblet', money: 910, plots: 6, ready: true, doneDeveloping: false },
  { id: 'brix', name: 'Brix', isAi: false, color: '#2bb673', species: 'gearling', money: 380, plots: 7, ready: false, doneDeveloping: false },
  { id: 'kai', name: 'Kai', isAi: true, color: '#f2a541', species: 'mollox', money: 215, plots: 4, ready: true, doneDeveloping: false },
];

/** Who owns which plot, and what stands on it. */
const OWNED: Record<string, [string, Outfit | null]> = {
  '5,3': ['brix', 'energy'], '4,3': ['brix', 'energy'], '4,4': ['brix', null], '9,2': ['brix', 'smithore'], '10,3': ['brix', 'smithore'],
  '3,2': ['brix', 'food'], '8,6': ['brix', 'water'],
  '6,2': ['lena', 'food'], '7,2': ['lena', 'food'], '7,3': ['lena', 'food'], '6,5': ['lena', 'energy'], '5,5': ['lena', null],
  '12,4': ['ossa', 'smithore'], '13,4': ['ossa', 'smithore'], '12,5': ['ossa', 'crystite'], '1,4': ['ossa', 'energy'], '2,6': ['ossa', 'food'], '11,1': ['ossa', null],
  '9,7': ['kai', 'water'], '10,7': ['kai', 'water'], '3,6': ['kai', 'energy'], '13,1': ['kai', null],
};

export const TILES: TileView[] = ROWS.flatMap((row, y) =>
  [...row].map((c, x): TileView => {
    const [owner, outfit] = OWNED[`${x},${y}`] ?? [null, null];
    const terrain = T[c]!;
    return {
      x, y, terrain, peaks: terrain === 'mountains' ? 1 + ((x + y) % 3) : 0, owner, outfit, pollution: 0, filter: false,
      // Lena analysed the plot up for sale last month.
      ...(x === 5 && y === 3 ? { ground: { food: 0, water: 0, energy: 3, smithore: 1, crystite: 0, rareEarth: 0 } } : {}),
    };
  }),
);

export const ME: MyView = {
  id: 'lena', species: 'zipwing', stock: { ...emptyStock(), food: 7, water: 4, energy: 3, smithore: 2 }, carriedMule: null, claimsLeft: 0,
  hungry: false, sick: false, needs: { food: 5, water: 4 }, devEndsAt: null, devSeconds: 45, produced: null, mulePrice: 148,
  outfitCosts: { food: 25, water: 25, energy: 50, smithore: 75, crystite: 100, rareEarth: 100, alloy: 150, electronics: 200, medicine: 150, greenBelt: 40 },
  droneOrder: [],
};

export const LISTINGS: ListingView[] = [
  { id: 'l1', seller: 'ossa', item: { kind: 'plot', x: 11, y: 1 }, minimum: 180, unsold: 'store', storePays: 200 },
  { id: 'l2', seller: 'brix', item: { kind: 'plot', x: 5, y: 3 }, minimum: 250, unsold: 'keep', storePays: 200 },
  { id: 'l3', seller: 'brix', item: { kind: 'mule', x: 9, y: 2, outfit: 'smithore' }, minimum: 90, unsold: 'store', storePays: 74 },
];

/** Lot 2 of 3 mid-walk: Ossa leads, Lena is a buyer, Kai can't pay the minimum, Brix is the seller and off the board. */
export const WALK: LandAuctionView = {
  lot: LISTINGS[1]!, stage: 'walk', seconds: 7.4, total: 12, number: 2, count: 3, lo: 180, hi: 520, speed: 57,
  walkers: [
    { id: 'lena', side: 'buyer', price: 290, at: 290.4, dir: 0, done: false },
    { id: 'ossa', side: 'buyer', price: 310, at: 310.2, dir: 0, done: false },
    { id: 'kai', side: 'pass', price: 0, at: 0, dir: 0, done: false, aside: 'money' },
  ],
  leader: { id: 'ossa', bid: 310 }, result: null, next: [LISTINGS[2]!],
};

export const VIEW: LotsView = {
  finished: false, month: 4, maxMonths: 12, phase: 'development', phaseEndsAt: null, width: W, height: H, tiles: TILES, lit: null,
  players: PLAYERS, me: ME, market: [], storeMules: 6, mulePrice: 148, colonists: 1240, air: { level: 18, band: 'clean' },
  ship: { arrives: 6, inPort: false, wants: null }, treasury: { money: 310, salesTax: 0.05 }, news: ['Lena bought 3 Food from the store.'],
  scores: null, auction: null, listings: LISTINGS, lotSlots: { used: 3, max: 4 }, landAuction: WALK,
};
