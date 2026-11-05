import type { Good, Slot, Species } from '@mule/ui';
import type { BoardDeal, BoardWalker } from './proposed/WalkBoard';

/**
 * Four rule changes Heiko asked for at the table (5 Nov), drawn for the PM; WS3 writes the rules. Fixture data only;
 * Lena holds this phone.
 *  B  a seller stops by herself at next month's need and steps up off the line; selling into a shortage is an act.
 *  C  Buy | Sell during the walk: a switch puts you in your new side's rest band, so it never trades by itself.
 *  D  rest bands beyond the store's lines, hard-edged: nobody trades in them.
 *  E  the store sold out: buyers bid past its old price, and its selling line follows the highest bid.
 * And the pace: about one unit a second at first, rising to five a second (WS3 is setting the values now).
 */

export const PACE = { startMs: 1000, floorMs: 200, speedUp: 0.8 } as const;
/** The wait before unit k+1 of a deal, k units in. */
export const gapMs = (k: number) => Math.max(PACE.floorMs, PACE.startMs * Math.pow(PACE.speedUp, k));
/** Units a deal has traded `ms` after its first beat (at most `max`), and its speed, 0 slowest to 1 top. */
export function dealAt(ms: number, max: number): { units: number; speed: number; doneAt: number } {
  let t = 0;
  let k = 0;
  while (k < max && t + gapMs(k) <= ms) {
    t += gapMs(k);
    k += 1;
  }
  let all = 0;
  for (let j = 0; j < max; j++) all += gapMs(j);
  return { units: k, speed: (PACE.startMs - gapMs(k)) / (PACE.startMs - PACE.floorMs), doneAt: all };
}

export interface Seat {
  id: string;
  name: string;
  slot: Slot;
  species: Species;
  have: number;
  need: number;
}

// --- B, C, D: Food, month 5 ---------------------------------------------------------------------------------------

export const FOOD = {
  good: 'food' as Good,
  lo: 18,
  hi: 46,
  storeBuys: 27,
  storeSells: 36,
  stock: 9,
  total: 20,
};
export const LENA: Seat = { id: 'lena', name: 'Lena', slot: 0, species: 'zipwing', have: 12, need: 5 };
export const OSSA: Seat = { id: 'ossa', name: 'Ossa', slot: 1, species: 'bramblet', have: 3, need: 4 };
export const BRIX: Seat = { id: 'brix', name: 'Brix', slot: 2, species: 'gearling', have: 0, need: 4 };
export const KAI: Seat = { id: 'kai', name: 'Kai', slot: 3, species: 'mollox', have: 6, need: 4 };

export const walker = (s: Seat, side: BoardWalker['side'], at: number, units = s.have, more: Partial<BoardWalker> = {}): BoardWalker => ({
  id: s.id,
  name: s.name,
  slot: s.slot,
  side,
  price: Math.round(at),
  at,
  units,
  surplus: units - s.need,
  ...more,
});

const lerp = (a: number, b: number, f: number) => a + (b - a) * Math.min(1, Math.max(0, f));

/** Where B's sale is, `t` ms after it starts; `unlock` is when Lena chose to sell into the shortage, `stop` when she tapped ▲. */
export interface Sale {
  at: number;
  sold: number;
  /** Units sold past the need, on purpose. */
  short: number;
  /** Stopped at the need and stepped up off the line. */
  held: boolean;
  trading: boolean;
  speed: number;
  /** What the rail says. */
  phase: 'walking' | 'beat' | 'selling' | 'held' | 'returning' | 'short' | 'stopped' | 'out';
}

const APPROACH = 1200;
const BEAT = 600;
const LIFT = 500;
const SPARE = LENA.have - LENA.need;

export function saleAt(t: number, unlock: number | null, stop: number | null): Sale {
  if (t < APPROACH) return { at: lerp(31, FOOD.storeBuys, t / APPROACH), sold: 0, short: 0, held: false, trading: false, speed: 0, phase: 'walking' };
  if (t < APPROACH + BEAT) return { at: FOOD.storeBuys, sold: 0, short: 0, held: false, trading: false, speed: 0, phase: 'beat' };
  const first = dealAt(t - APPROACH - BEAT, SPARE);
  const stoppedAt = APPROACH + BEAT + first.doneAt;
  if (first.units < SPARE) return { at: FOOD.storeBuys, sold: first.units, short: 0, held: false, trading: true, speed: first.speed, phase: 'selling' };
  // At the need: the sale stops by itself and Lena steps one price step up off the line (WS3's RULE-4, a33879c4).
  if (unlock === null || t < unlock) {
    return { at: lerp(FOOD.storeBuys, FOOD.storeBuys + 1, (t - stoppedAt) / LIFT), sold: SPARE, short: 0, held: true, trading: false, speed: 0, phase: 'held' };
  }
  // She chose to sell on: back down to the line, a beat, then a new deal, slow again.
  const back = t - unlock;
  if (back < LIFT) return { at: lerp(FOOD.storeBuys + 1, FOOD.storeBuys, back / LIFT), sold: SPARE, short: 0, held: false, trading: false, speed: 0, phase: 'returning' };
  if (back < LIFT + BEAT) return { at: FOOD.storeBuys, sold: SPARE, short: 0, held: false, trading: false, speed: 0, phase: 'beat' };
  const ms = (stop !== null && stop > unlock ? stop : t) - unlock - LIFT - BEAT;
  const more = dealAt(Math.max(0, ms), LENA.need);
  const out = more.units >= LENA.need;
  const stopped = stop !== null && stop > unlock + LIFT + BEAT;
  return {
    at: stopped ? lerp(FOOD.storeBuys, FOOD.storeBuys + 1, (t - stop) / LIFT) : FOOD.storeBuys,
    sold: SPARE + more.units,
    short: more.units,
    held: false,
    trading: !out && !stopped && more.units >= 0,
    speed: more.speed,
    phase: out ? 'out' : stopped ? 'stopped' : 'short',
  };
}

/** B's board: Lena selling to the store; the others where the walk left them. */
export function saleBoard(s: Sale): { walkers: BoardWalker[]; deals: BoardDeal[] } {
  const units = LENA.have - s.sold;
  const lena = walker(LENA, 'seller', s.at, units, s.short > 0 ? { short: s.short } : s.held ? { keeps: units } : {});
  return {
    walkers: [lena, walker(OSSA, 'buyer', 24), walker(BRIX, 'buyer', 25.5), walker(KAI, 'buyer', 20, KAI.have, { done: true })],
    deals: s.trading && s.sold > 0 ? [{ buyer: 'store', seller: 'lena', price: FOOD.storeBuys, units: s.short > 0 ? s.short : s.sold, speed: s.speed }] : [],
  };
}

// --- C: the switch -----------------------------------------------------------------------------------------------

/** Where Lena glides when she switches: into the rest band of her new side, never across a trade. */
export const REST_AT = { seller: 43, buyer: 21 } as const;

// --- E: Energy, the store sold out ---------------------------------------------------------------------------------

export const ENERGY = {
  good: 'energy' as Good,
  lo: 16,
  hi: 52,
  storeBuys: 24,
  /** What the store sold at before it ran out. */
  oldSells: 34,
  total: 20,
};
export const LENA_E: Seat = { ...LENA, have: 2, need: 5 };
export const BRIX_E: Seat = { ...BRIX, have: 9, need: 3 };
export const OSSA_E: Seat = { ...OSSA, have: 4, need: 4 };
export const KAI_E: Seat = { ...KAI, have: 1, need: 3 };

/** E, `t` ms in: Lena and Kai bid past the old price; the store's line rides on the top bid; Brix walks down to meet it. */
export function soldOutAt(t: number) {
  const lena = lerp(30, 43, t / 4200);
  const kai = lerp(28, 38, t / 4200);
  const brix = t < 3000 ? lerp(50, 46, t / 3000) : lerp(46, 43, (t - 3000) / 1400);
  const met = t >= 4400;
  const deal = met ? dealAt(t - 4400 - BEAT, LENA_E.need - LENA_E.have) : { units: 0, speed: 0, doneAt: 0 };
  const top = Math.max(lena, kai);
  return {
    line: Math.max(ENERGY.oldSells, top),
    walkers: [
      walker(LENA_E, 'buyer', lena, LENA_E.have + deal.units),
      walker(OSSA_E, 'buyer', 22, OSSA_E.have, { done: true }),
      walker(BRIX_E, 'seller', brix, BRIX_E.have - deal.units),
      walker(KAI_E, 'buyer', kai),
    ],
    deals: met && deal.units > 0 && deal.units < LENA_E.need - LENA_E.have + 1 ? [{ buyer: 'lena', seller: 'brix', price: 43, units: deal.units, speed: deal.speed }] : [],
    bought: deal.units,
    phase: t < 4200 ? ('bidding' as const) : met && deal.units >= LENA_E.need - LENA_E.have ? ('done' as const) : met ? ('trading' as const) : ('met' as const),
  };
}
