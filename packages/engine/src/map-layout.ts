import type { ShareTerrain } from './config.js';
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

/** A layout part-way through the stages: null marks a plot no stage has filled yet. */
export interface Sketch {
  width: number;
  height: number;
  terrain: (Terrain | null)[];
}

/** Lays out a map's river, terrain shares and regions (spec RULE-2 stages 1-3). Pure: every choice comes from `rng`. */
export function layoutMap(players: number, rng: Rng): Layout {
  throw new Error('NotImplemented: layoutMap');
}

/** Stage 1: the store at the centre and a bending river from the top row to the bottom row. */
export function placeRiver(players: number, rng: Rng): Sketch {
  throw new Error('NotImplemented: placeRiver');
}

/** Stage 2: how many plots of the free land each terrain gets. */
export function budgetTerrain(freeLand: number, rng: Rng): Record<ShareTerrain, number> {
  throw new Error('NotImplemented: budgetTerrain');
}

/** Stage 3: fills the sketch's free plots with regions of the budgeted terrains. */
export function growRegions(sketch: Sketch, budget: Record<ShareTerrain, number>, rng: Rng): Layout {
  throw new Error('NotImplemented: growRegions');
}
