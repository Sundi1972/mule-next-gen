import { emptyStock, EXPORT_SHIP, WALK, type Good, type StatusRow } from '@mule/engine';
import type { AuctionView, MarketRow, MuleView, PlayerView, WalkerView } from '@mule/protocol';
import { ME, VIEW } from '../../../fixture';

/**
 * The goods auction audit's game (docs/research/2026-10-28-ws6-ux-audit.md §8): month 2, three seats. Lena holds the
 * phone and is the host; Kai is a person whose phone has dropped (away); The Accountant is an AI (the cautious
 * persona, packages/ai/src/personas.ts). Fixture data only: plausible against the engine's config, not computed by it,
 * except the spoilage column (auction.ts statusRows), the sales tax (economy.ts taxSale) and the ship's step-down.
 *
 * Food: Lena has 1 and needs 3; the store sells at 30 and buys at 24; The Accountant has 6 spare and passes.
 * Water: Lena has 3 and needs 2; the store sells at 10 and buys at 8; The Accountant bids 6.
 * The sales tax is 10%. The export ship is in port this month and wants 24 Crystite, at 120 for the first.
 */

export const SALES_TAX = 0.1;
export const LENA_MONEY = 280;

export const PLAYERS: PlayerView[] = [
  { id: 'lena', slot: 0, name: 'Lena', isAi: false, color: '#e4572e', species: 'zipwing', money: LENA_MONEY, plots: 3, ready: true, doneDeveloping: false },
  { id: 'accountant', slot: 1, name: 'The Accountant', isAi: true, color: '#3a86ff', species: 'bramblet', money: 520, plots: 4, ready: true, doneDeveloping: false },
  { id: 'kai', slot: 3, name: 'Kai', isAi: false, color: '#f2a541', species: 'mollox', money: 310, plots: 3, ready: false, doneDeveloping: false },
];

/** Kai's phone has dropped: he is away, but still a person the side-pick waits for. */
export const AWAY = ['kai'];
export const HOST = 'lena';

const row = (good: Good, price: number, storeBuys: number | null, storeSells: number | null, storeStock: number, shipPays: number | null = null): MarketRow => ({
  good, price, storeBuys, storeSells, storeStock, cover: 1.6, demand: 8, shipPays,
});
export const MARKET: MarketRow[] = [row('food', 27, 24, 30, 9), row('water', 9, 8, 10, 6), row('energy', 25, 22, 28, 5), row('smithore', 50, 45, 55, 2), row('crystite', 96, 86, null, 0, 120)];

/** What the export ship wants this month and pays for its first unit (MarketRow.shipPays). */
export const SHIP = { good: 'crystite' as const, wants: 24, pays: 120 };

/** The ship pays less for each further unit (EXPORT_SHIP.stepDown), as the engine's ship line does. */
export const shipPrice = (sold: number) => Math.round(SHIP.pays * Math.pow(1 - EXPORT_SHIP.stepDown, sold));

export const VIEW2: MuleView = {
  ...VIEW,
  month: 2,
  players: PLAYERS,
  me: {
    ...ME,
    stock: { ...emptyStock(), food: 1, water: 3, energy: 2, crystite: 4 },
    needs: { food: 3, water: 2 },
    monthNeeds: { ...emptyStock(), food: 3, water: 2, energy: 2 },
  },
  market: MARKET,
  ship: { arrives: 2, inPort: true, wants: { crystite: SHIP.wants } },
  treasury: { money: 120, salesTax: SALES_TAX },
  news: ['The export ship is in port: it wants 24 Crystite.'],
};

// --- One good's auction, from Lena's side ---------------------------------------------------------

export interface Other {
  id: string;
  side: WalkerView['side'];
  at: number;
}

/** One good as this mock plays it: Lena's numbers, the houses' lines, the others on the board, the status rows. */
export interface Scenario {
  good: Good;
  /** Lena's side, picked on the status screen. */
  side: 'buyer' | 'seller';
  have: number;
  need: number;
  storeSells: number | null;
  storeBuys: number | null;
  /** Units the store will sell (AuctionView.storeForSale). */
  storeForSale: number;
  /** The ship's line, while it is in port and wants this good. */
  shipPays: number | null;
  lo: number;
  hi: number;
  /** Where Lena stands when the walk opens in #walk. */
  start: number;
  others: Other[];
  status: StatusRow[];
  /** Her money and the month's running total before this good. */
  money: number;
  tally: number;
  /** The good that comes up next, for the receipt. */
  next: Good;
  seconds: number;
}

/** Food, first good of the month: Lena 2 short; the store is the only seller (The Accountant keeps its 6 spare). */
export const FOOD: Scenario = {
  good: 'food',
  side: 'buyer',
  have: 1,
  need: 3,
  storeSells: 30,
  storeBuys: 24,
  storeForSale: 9,
  shipPays: null,
  lo: 16,
  hi: 38,
  start: 21,
  others: [
    { id: 'accountant', side: 'pass', at: 0 },
    { id: 'kai', side: 'pass', at: 0 },
  ],
  status: [
    { id: 'lena', had: 2, used: 2, made: 1, now: 1, need: 3, spoils: 0 },
    // Food spoils by half (GOOD_CONFIG.food.spoilage 0.5): 3 of its 6 spare would go bad.
    { id: 'accountant', had: 4, used: 3, made: 8, now: 9, need: 3, spoils: 3 },
    { id: 'kai', had: 1, used: 1, made: 3, now: 3, need: 3, spoils: 0 },
  ],
  money: LENA_MONEY,
  tally: 0,
  next: 'water',
  seconds: 16,
};

/** Water, second: Lena 1 spare; the store pays 8 (the sellers' floor), The Accountant bids 6 under it. */
export const WATER: Scenario = {
  good: 'water',
  side: 'seller',
  have: 3,
  need: 2,
  storeSells: 10,
  storeBuys: 8,
  storeForSale: 6,
  shipPays: null,
  lo: 3,
  hi: 15,
  start: 12,
  others: [
    { id: 'accountant', side: 'buyer', at: 6 },
    { id: 'kai', side: 'pass', at: 0 },
  ],
  status: [
    // Water spoils at 5%: floor(1 × 0.95) = 0 kept, so her 1 spare would go bad if she kept it.
    { id: 'lena', had: 1, used: 1, made: 3, now: 3, need: 2, spoils: 1 },
    { id: 'accountant', had: 1, used: 0, made: 0, now: 1, need: 2, spoils: 0 },
    { id: 'kai', had: 2, used: 2, made: 2, now: 2, need: 2, spoils: 0 },
  ],
  money: LENA_MONEY - 60,
  tally: -60,
  next: 'energy',
  seconds: 14,
};

/** Crystite, fifth, with the ship in port: Lena sells her 4; the store has none to sell and pays 86. */
export const CRYSTITE: Scenario = {
  good: 'crystite',
  side: 'seller',
  have: 4,
  need: 0,
  storeSells: null,
  storeBuys: 86,
  storeForSale: 0,
  shipPays: SHIP.pays,
  lo: 60,
  hi: 156,
  start: 134,
  others: [
    { id: 'accountant', side: 'seller', at: 127 },
    { id: 'kai', side: 'pass', at: 0 },
  ],
  status: [
    { id: 'lena', had: 0, used: 0, made: 4, now: 4, need: 0, spoils: 0 },
    { id: 'accountant', had: 2, used: 0, made: 3, now: 5, need: 0, spoils: 0 },
    { id: 'kai', had: 0, used: 0, made: 0, now: 0, need: 0, spoils: 0 },
  ],
  money: LENA_MONEY - 53,
  tally: -53,
  next: 'rareEarth',
  seconds: 15,
};

/** The auction as every screen receives it, for this scenario with Lena at `at` and her stock at `have`. */
export function auctionOf(s: Scenario, o: { stage: AuctionView['stage']; at: number; have: number; deals?: AuctionView['deals']; seconds?: number; sides?: Record<string, WalkerView['side']> }): AuctionView {
  const units = (id: string) => (id === 'lena' ? o.have : (s.status.find((r) => r.id === id)?.now ?? 0));
  const walker = (id: string, side: WalkerView['side'], at: number): WalkerView => ({ id, side, price: Math.round(at), at, dir: 0, done: false, units: units(id) });
  const deals = o.deals ?? [];
  return {
    good: s.good,
    stage: o.stage,
    seconds: o.seconds ?? s.seconds,
    total: o.stage === 'status' ? WALK.statusMs / 1000 : WALK.goodMs / 1000,
    slowed: deals.length > 0,
    next: WALK.order.slice(WALK.order.indexOf(s.good) + 1),
    storeBuys: s.storeBuys,
    storeSells: s.storeSells,
    storeForSale: s.storeForSale,
    shipPays: s.shipPays,
    lo: s.lo,
    hi: s.hi,
    speed: (s.hi - s.lo) / WALK.crossSeconds,
    walkers: [walker('lena', o.sides?.lena ?? s.side, o.at), ...s.others.map((w) => walker(w.id, o.sides?.[w.id] ?? w.side, w.at))],
    deals,
    units: deals.reduce((n, d) => n + d.units, 0),
    status: s.status.map((r) => (r.id === 'lena' ? { ...r, now: o.have } : r)),
    skipped: [],
  };
}
