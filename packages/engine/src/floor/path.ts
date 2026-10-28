import type { GameState } from '../types.js';
import type { FloorConfig, FloorPoint } from './floor.js';

/** A walk from tile to tile, four ways, both ends included, and how long it takes at full pace. */
export interface MapPath {
  tiles: FloorPoint[];
  seconds: number;
}

/** The quickest walk between two tiles at RULE-2's terrain speeds; null when none is open. */
export function pathTo(state: GameState, from: FloorPoint, to: FloorPoint, cfg: FloorConfig): MapPath | null {
  throw new Error('NotImplemented: pathTo');
}
