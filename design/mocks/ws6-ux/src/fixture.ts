import { emptyStock, type Good, type Outfit, type Terrain } from '@mule/engine';
import type { AuctionView, LandAuctionView, ListingView, MarketRow, MuleView, MyView, PlayerView, TileView } from '@mule/protocol';

/**
 * One 4-player game in month 5, at the kitchen table. Fixture data only: every
 * number is plausible against the engine's config, none is computed by it.
 * Lena holds this phone.
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

export const PLAYERS: PlayerView[] = [
  { id: 'lena', slot: 0, name: 'Lena', isAi: false, color: '#e4572e', species: 'zipwing', money: 640, plots: 7, ready: false, doneDeveloping: false, colonist: null, condition: null },
  { id: 'ossa', slot: 1, name: 'Ossa', isAi: true, color: '#3a86ff', species: 'bramblet', money: 910, plots: 7, ready: true, doneDeveloping: false, colonist: null, condition: null },
  { id: 'brix', slot: 2, name: 'Brix', isAi: false, color: '#2bb673', species: 'gearling', money: 380, plots: 7, ready: false, doneDeveloping: false, colonist: null, condition: null },
  { id: 'kai', slot: 3, name: 'Kai', isAi: true, color: '#f2a541', species: 'mollox', money: 215, plots: 5, ready: true, doneDeveloping: false, colonist: null, condition: null },
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

export const ME: MyView = {
  id: 'lena', species: 'zipwing', stock: { ...emptyStock(), food: 9, water: 4, energy: 3, smithore: 0, alloy: 1 }, carriedMule: null, claimsLeft: 0,
  hungry: false, sick: false, installedThisTurn: false, needs: { food: 5, water: 3 }, monthNeeds: { ...emptyStock(), food: 5, water: 3, energy: 4 }, devEndsAt: null, devSeconds: 50, produced: { ...emptyStock(), food: 11, water: 3, energy: 6 }, mulePrice: 148,
  outfitCosts: { food: 25, water: 25, energy: 50, smithore: 75, crystite: 100, rareEarth: 100, alloy: 150, electronics: 200, medicine: 150, greenBelt: 40 },
  droneOrder: [], politics: null,
};

const row = (good: Good, price: number, storeStock: number, cover: number): MarketRow => ({
  good, price, storeBuys: Math.floor(price * 0.9), storeSells: storeStock > 0 ? Math.ceil(price * 1.1) : null, storeStock, cover, demand: 10, shipPays: null,
});
export const MARKET: MarketRow[] = [row('food', 31, 12, 2.1), row('water', 27, 9, 2.6), row('energy', 26, 7, 1.4), row('smithore', 60, 2, 0.6), row('crystite', 96, 0, 4)];

export const VIEW: MuleView = {
  finished: false, month: 5, maxMonths: 12, phase: 'auction', phaseEndsAt: null, width: W, height: H, tiles: TILES, lit: null,
  players: PLAYERS, me: ME, market: MARKET, storeMules: 5, mulePrice: 148, colonists: 1260, air: { level: 22, band: 'clean' },
  ship: { arrives: 6, inPort: false, wants: null }, treasury: { money: 340, salesTax: 0.05 }, news: ['Ossa bought 2 Food from the store.'],
  scores: null, auction: null, listings: [], lotSlots: { used: 0, max: 4 }, landAuction: null, production: null, politics: null,
};

// --- The Smithore auction -----------------------------------------------------

/** Units held and the surplus over this month's need, per player, before any Smithore trades. */
export const SMITHORE_HOLD: Record<string, { units: number; need: number }> = {
  lena: { units: 0, need: 2 },
  ossa: { units: 7, need: 3 },
  brix: { units: 12, need: 4 },
  kai: { units: 1, need: 3 },
};

const BASE: AuctionView = {
  good: 'smithore', stage: 'walk', seconds: 9.2, total: 15, slowed: false, next: ['crystite', 'alloy'],
  storeBuys: 54, storeSells: 66, shipPays: null, lo: 40, hi: 84, speed: 7.3, walkers: [], deals: [], units: 0, storeForSale: 2,
  status: [
    { id: 'lena', had: 0, used: 0, made: 0, now: 0, need: 2, spoils: 0 },
    { id: 'ossa', had: 2, used: 0, made: 5, now: 7, need: 3, spoils: 0 },
    { id: 'brix', had: 4, used: 2, made: 10, now: 12, need: 4, spoils: 0 },
    { id: 'kai', had: 1, used: 0, made: 0, now: 1, need: 3, spoils: 0 },
  ],
  skipped: [{ good: 'water', reason: 'nobody buys' }],
};

/** A walker carries its stock of the good up now, as the status table has it. */
const walker = (id: string, side: 'buyer' | 'seller' | 'pass', at: number, done = false) => ({
  id, side, price: Math.round(at), at, dir: 0 as const, done, units: BASE.status.find((s) => s.id === id)?.now ?? 0,
});

/** The bell has just rung: sellers at the top, buyers at the bottom, the two lines as far apart as they get. */
export const SMITHORE_START: AuctionView = {
  ...BASE, seconds: 15,
  walkers: [walker('lena', 'buyer', 40), walker('ossa', 'seller', 84), walker('brix', 'seller', 84), walker('kai', 'buyer', 40)],
};
/** Mid-walk: Brix asks 70, Ossa 76; Kai bids 61, Lena 58. Nine apart. */
export const SMITHORE_MID: AuctionView = {
  ...BASE,
  walkers: [walker('lena', 'buyer', 58.2), walker('ossa', 'seller', 76.4), walker('brix', 'seller', 70.1), walker('kai', 'buyer', 61.3)],
};
/** Brix walked down to Kai's bid: units change hands at 63, the two lines have become the trade bar. */
export const SMITHORE_TRADE: AuctionView = {
  ...BASE, slowed: true, units: 2,
  walkers: [walker('lena', 'buyer', 58.2), walker('ossa', 'seller', 69.4), walker('brix', 'seller', 63), walker('kai', 'buyer', 63)],
  deals: [{ buyer: 'kai', seller: 'brix', price: 63, units: 2 }],
};
/** The store has no Smithore: no selling line, nothing caps the buyers, SOLD OUT at the top. */
export const SMITHORE_SOLD_OUT: AuctionView = { ...SMITHORE_MID, storeSells: null };
/** Units already traded in the trade fixture, to count down Brix and up Kai. */
export const TRADE_MOVED: Record<string, number> = { brix: -2, kai: 2 };

/** The status screen, before the declare. */
export const SMITHORE_STATUS: AuctionView = { ...BASE, stage: 'status', seconds: 6, total: 6, walkers: BASE.status.map((r) => walker(r.id, 'pass', 0)) };

// --- The land auction ---------------------------------------------------------

export const LOT: ListingView = { id: 'l2', seller: 'brix', item: { kind: 'plot', x: 4, y: 5 }, minimum: 250, unsold: 'keep', storePays: 200 };
/** Ossa leads at 310, Lena bids 290, Kai can't pay the minimum, Brix sells and is off the board. */
export const LAND_WALK: LandAuctionView = {
  lot: LOT, stage: 'walk', seconds: 7.4, total: 12, number: 2, count: 3, lo: 180, hi: 520, speed: 57,
  walkers: [
    { id: 'lena', side: 'buyer', price: 290, at: 290.4, dir: 0, done: false },
    { id: 'ossa', side: 'buyer', price: 310, at: 310.2, dir: 0, done: false },
    { id: 'kai', side: 'pass', price: 0, at: 0, dir: 0, done: false, aside: 'money' },
  ],
  leader: { id: 'ossa', bid: 310 }, result: null, next: [],
};
/** Lena has taken the lead. */
export const LAND_LEAD: LandAuctionView = {
  ...LAND_WALK,
  walkers: LAND_WALK.walkers.map((w) => (w.id === 'lena' ? { ...w, price: 325, at: 325 } : w)),
  leader: { id: 'lena', bid: 325 },
};
/** Nobody has reached the minimum yet: the bid line sits under MIN. */
export const LAND_UNDER: LandAuctionView = {
  ...LAND_WALK, seconds: 10.5,
  walkers: LAND_WALK.walkers.map((w) => (w.side === 'buyer' ? { ...w, price: w.id === 'lena' ? 214 : 226, at: w.id === 'lena' ? 214 : 226 } : w)),
  leader: null,
};
