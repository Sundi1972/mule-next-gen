import type { Ground, RawGood } from '@mule/engine';

/**
 * PROPOSED (§2 RULE, Heiko's rule 4, "the screen first"): one 0–3 scale for every good, from today's hidden numbers.
 *   Food, Water, Energy (rated −2..+3, making 2 + rating, at least 1): −2/−1 → 0 · 0 → 1 · +1 → 2 · +2/+3 → 3
 *   Smithore, Crystite, Rare earth (0..4, making the rating):           0 → 0 · 1 → 1 · 2 → 2 · 3/4 → 3
 * Graft target: apps/web/src/game/derive.ts::groundPips (today 0–4).
 */
const GROWN: RawGood[] = ['food', 'water', 'energy'];

export function groundDots(good: RawGood, rating: number): number {
  if (GROWN.includes(good)) return rating <= -1 ? 0 : rating === 0 ? 1 : rating === 1 ? 2 : 3;
  return Math.max(0, Math.min(3, rating));
}

/** The specials that stand out (Heiko's point 3): Crystite and Rare earth, once geology finds any. */
export const GEMS: RawGood[] = ['crystite', 'rareEarth'];
export const gemsIn = (ground: Ground): RawGood[] => GEMS.filter((g) => groundDots(g, ground[g]) >= 1);

/** The good a plot is best for: the most dots, Food first on a tie (the outfitters' order). */
export function bestOf(ground: Ground): RawGood {
  const order: RawGood[] = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth'];
  return order.reduce((b, g) => (groundDots(g, ground[g]) > groundDots(b, ground[b]) ? g : b), order[0]!);
}
