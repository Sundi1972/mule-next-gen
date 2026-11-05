import type { Good, Slot, Species } from '@mule/ui';
import type { BoardDeal, BoardWalker } from './proposed/WalkBoard';

/**
 * The Food auction in month 5, under WS3's self-trading rules (docs/specs/2026-11-05-ws3-auction-auto-trade.md,
 * DRAFT): everyone starts as a buyer at the foot of the board, no Pass; where the lines meet, units trade by themselves,
 * slow at first and then faster; nothing asks "how many". Fixture data only. Lena holds this phone.
 */

export const GOOD: Good = 'food';
export const LO = 18;
export const HI = 46;
export const STORE_BUYS = 27;
export const STORE_SELLS = 36;
export const STORE_STOCK = 9;
/** The good's clock, in seconds. */
export const TOTAL = 20;

export interface Seat {
  id: string;
  name: string;
  slot: Slot;
  species: Species;
  ai: boolean;
  have: number;
  need: number;
  money: number;
}

export const SEATS: Seat[] = [
  { id: 'lena', name: 'Lena', slot: 0, species: 'zipwing', ai: false, have: 12, need: 5, money: 640 },
  { id: 'ossa', name: 'Ossa', slot: 1, species: 'bramblet', ai: true, have: 3, need: 4, money: 910 },
  { id: 'brix', name: 'Brix', slot: 2, species: 'gearling', ai: false, have: 0, need: 4, money: 380 },
  { id: 'kai', name: 'Kai', slot: 3, species: 'mollox', ai: true, have: 6, need: 4, money: 215 },
];
export const ME = SEATS[0]!;

/** WALK's trading curve, today's named values (config.ts WALK.tradeStartMs, tradeSpeedUp, tradeFloorMs). */
export const TRADE = { startMs: 400, speedUp: 0.8, floorMs: 60, clockRate: 0.25 } as const;

/** The wait before unit k+1 of a running deal (k units already traded). */
export const gapMs = (k: number) => Math.max(TRADE.floorMs, TRADE.startMs * Math.pow(TRADE.speedUp, k));

/** A deal that has run for `ms`: units traded (at most `max`), and how fast it goes now, 0 slowest to 1 top speed. */
export function dealAt(ms: number, max: number): { units: number; speed: number } {
  let t = 0;
  let k = 0;
  while (k < max && t + gapMs(k) <= ms) {
    t += gapMs(k);
    k += 1;
  }
  return { units: k, speed: (TRADE.startMs - gapMs(k)) / (TRADE.startMs - TRADE.floorMs) };
}

/** How long a deal takes to trade n units. */
export const dealMs = (n: number) => Array.from({ length: n }, (_, k) => gapMs(k)).reduce((a, b) => a + b, 0);

const walker = (s: Seat, side: BoardWalker['side'], at: number, units = s.have, done = false): BoardWalker => ({
  id: s.id,
  name: s.name,
  slot: s.slot,
  side,
  price: Math.round(at),
  at,
  units,
  surplus: units - s.need,
  done,
});

/** The board's states, as the mock steps through them. */
export type State = 'status' | 'walk' | 'switched' | 'store' | 'players';

/** Everyone at the bottom edge, below the store's buying line: standing still trades nothing. */
const BOTTOM = LO;

export function board(state: State, sold: number): { walkers: BoardWalker[]; deals: BoardDeal[] } {
  const [lena, ossa, brix, kai] = SEATS as [Seat, Seat, Seat, Seat];
  if (state === 'status' || state === 'walk') {
    return { walkers: [walker(lena, 'buyer', BOTTOM), walker(ossa, 'buyer', state === 'walk' ? 21 : BOTTOM), walker(brix, 'buyer', state === 'walk' ? 22 : BOTTOM), walker(kai, 'buyer', BOTTOM, kai.have, state === 'walk')], deals: [] };
  }
  if (state === 'switched') {
    return { walkers: [walker(lena, 'seller', HI), walker(ossa, 'buyer', 23), walker(brix, 'buyer', 25), walker(kai, 'buyer', BOTTOM, kai.have, true)], deals: [] };
  }
  if (state === 'store') {
    return {
      walkers: [walker(lena, 'seller', STORE_BUYS, lena.have - sold), walker(ossa, 'buyer', 24), walker(brix, 'buyer', 25), walker(kai, 'buyer', BOTTOM, kai.have, true)],
      deals: sold > 0 ? [{ buyer: 'store', seller: 'lena', price: STORE_BUYS, units: sold }] : [],
    };
  }
  // Lena and Brix meet at 31.
  return {
    walkers: [walker(lena, 'seller', 31, lena.have - sold), walker(ossa, 'buyer', 24), walker(brix, 'buyer', 31, brix.have + sold), walker(kai, 'buyer', BOTTOM, kai.have, true)],
    deals: sold > 0 ? [{ buyer: 'brix', seller: 'lena', price: 31, units: sold }] : [],
  };
}
