import type { FloorGood } from './config.js';
import type { Layout } from './map-layout.js';
import type { Rng } from './rng.js';
import type { Ground } from './types.js';

/**
 * The ground stages of the map generator (spec RULE-2 stages 4-9): hidden ratings
 * dealt onto a finished layout, then repaired in bounded passes, never rerolled.
 */

/** Per floor good, one smooth-field value per plot: where that good's best ratings go. */
export type Fields = Record<FloorGood, number[]>;

/** The ground part-way through the stages, with what later stages read. */
export interface Dealt {
  layout: Layout;
  players: number;
  fields: Fields;
  /** One rating set per plot, row-major like the layout; the store's is all 0. */
  ground: Ground[];
}

export interface GroundDeal {
  ground: Ground[];
  /** The map's one scarce good, or null when it has none. */
  scarce: FloorGood | null;
}

export function dealGround(_layout: Layout, _players: number, _rng: Rng): GroundDeal {
  throw new Error('NotImplemented: dealGround');
}

export function dealOdds(_layout: Layout, _players: number, _rng: Rng): Dealt {
  throw new Error('NotImplemented: dealOdds');
}

export function placePeaks(_dealt: Dealt, _rng: Rng): Dealt {
  throw new Error('NotImplemented: placePeaks');
}

export function pickScarce(_rng: Rng): FloorGood | null {
  throw new Error('NotImplemented: pickScarce');
}

export function liftFloors(_dealt: Dealt, _scarce: FloorGood | null): Dealt {
  throw new Error('NotImplemented: liftFloors');
}

export function repairReach(_dealt: Dealt): Dealt {
  throw new Error('NotImplemented: repairReach');
}

export function joinSeams(_dealt: Dealt): Dealt {
  throw new Error('NotImplemented: joinSeams');
}

export function applyScarcity(_dealt: Dealt, _scarce: FloorGood | null): Dealt {
  throw new Error('NotImplemented: applyScarcity');
}
