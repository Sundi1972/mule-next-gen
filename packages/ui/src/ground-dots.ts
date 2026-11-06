/** A plot's ground as every screen shows it: one 0–3 scale for all six raw goods, from the engine's hidden ratings. */
import type { Good } from './components/tokens';

export type RawGood = Extract<Good, 'food' | 'water' | 'energy' | 'smithore' | 'crystite' | 'rareEarth'>;

/** The outfitters' order, which also breaks a tie for a plot's best good. */
const RAW_GOODS: readonly RawGood[] = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth'];

const GROWN: readonly RawGood[] = ['food', 'water', 'energy'];

const GEMS: readonly RawGood[] = ['crystite', 'rareEarth'];

/** Each raw good's dots on one plot; a good with no entry is not known, never 0. */
export type Dots = Partial<Record<RawGood, number>>;
type Ratings = Partial<Record<RawGood, number>>;

/** A rating as 0–3 dots: grown −2..+3 (−1 and below 0, 0 → 1, +1 → 2, +2 and up 3); mined 0..4 (3 and up 3). */
export function groundDots(good: RawGood, rating: number): number {
  if (GROWN.includes(good)) return rating <= -1 ? 0 : rating === 0 ? 1 : rating === 1 ? 2 : 3;
  return Math.max(0, Math.min(3, rating));
}

/** Every rated good's dots; no ground (not analysed) gives no dots at all. */
export function dotsOf(ground: Readonly<Record<RawGood, number>>): Record<RawGood, number>;
export function dotsOf(ground: Ratings | undefined): Dots | undefined;
export function dotsOf(ground: Ratings | undefined): Dots | undefined {
  if (!ground) return undefined;
  return Object.fromEntries(RAW_GOODS.filter((g) => ground[g] !== undefined).map((g) => [g, groundDots(g, ground[g]!)]));
}

/** The good with the most dots, the outfitters' order on a tie; none when no good is known. */
export function bestOf(dots: Readonly<Record<RawGood, number>>): RawGood;
export function bestOf(dots: Dots): RawGood | undefined;
export function bestOf(dots: Dots): RawGood | undefined {
  return RAW_GOODS.reduce<RawGood | undefined>((best, g) => (dots[g] !== undefined && (best === undefined || dots[g]! > dots[best]!) ? g : best), undefined);
}

/** Crystite and Rare earth where they show 1 dot or more. */
export function gemsIn(dots: Dots): RawGood[] {
  return GEMS.filter((g) => (dots[g] ?? 0) >= 1);
}
