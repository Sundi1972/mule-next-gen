import type { Rng } from './rng.js';
import type { Terrain } from './types.js';

/**
 * The visible landscape before any ground is dealt: one terrain per plot,
 * row-major (index y * width + x), the store at the centre plot.
 */
export interface Layout {
  width: number;
  height: number;
  terrain: Terrain[];
}

/** Lays out a map's river, terrain shares and regions (spec RULE-2 stages 1-3). Pure: every choice comes from `rng`. */
export function layoutMap(players: number, rng: Rng): Layout {
  throw new Error('NotImplemented: layoutMap');
}
