import { floorConfig, type FloorConfig, type GameState } from '@mule/engine';
import { unreachablePlot } from '../hands/develop.js';

/**
 * Why no MULE can be walked to plot `plot` on the floor, or null when one can, as the hands judge it (unreachablePlot,
 * which asks that a walk from the store reaches a stand the install is made from): 'shore' for a lake, 'walk' for land
 * the floor cuts off. Reads only.
 */
export function noWalkTo(state: GameState, plot: number, cfg: FloorConfig = floorConfig()): 'shore' | 'walk' | null {
  if (!unreachablePlot(state, plot, cfg)) return null;
  return state.tiles[plot]!.terrain === 'lake' ? 'shore' : 'walk';
}

/** What the plot is, in a mark or a refusal: a lake, or land the floor cuts off. */
export const cutOffAs = (state: GameState, plot: number): string => (state.tiles[plot]!.terrain === 'lake' ? 'lake' : 'cut off');
