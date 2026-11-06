import type { MuleView } from '@mule/protocol';

/** A plot on the map. */
export type Plot = { x: number; y: number };

const same = (a: Plot, b: Plot) => a.x === b.x && a.y === b.y;

/**
 * RULE-3: the plot the Analyse card shows after `next`, given the card shown (or null) and the view before it, null on
 * the first view since the page loaded. A plot whose ground arrives in `next` during development opens its card,
 * replacing the one shown, unless the drone found it; outside development there is no card. See spec C5.
 */
export function analyseCard(shown: Plot | null, prev: MuleView | null, next: MuleView): Plot | null {
  if (next.phase !== 'development') return null;
  // Without a previous view every known plot looks new: a rejoin opens no card.
  if (!prev) return null;
  const drone = next.me?.droneFound ?? [];
  const fresh = next.tiles.filter((t, i) => t.ground && !prev.tiles[i]?.ground && !drone.some((p) => same(p, t)));
  const newest = fresh.at(-1);
  return newest ? { x: newest.x, y: newest.y } : shown;
}
