import { floorConfig, type FloorConfig, type GameState } from '@mule/engine';
import { doorTable } from '../floor-time.js';
import { unreachablePlot } from '../hands/develop.js';

/**
 * Why no MULE can be walked to plot `plot` on the floor, or null when one can: 'shore' for a lake plot with no spot on
 * its shore to install from (unreachablePlot, the hands' own lake refusal); 'walk' for a plot no door of the store has
 * a walk to (doorTable's Infinity), such as a lake whose only shore is a corner, which the walk, moving on sides, never
 * reaches. The hands refuse the second only once the clock is read, as "the walk takes Infinity s". Reads only.
 */
export function noWalkTo(state: GameState, plot: number, cfg: FloorConfig = floorConfig()): 'shore' | 'walk' | null {
  if (unreachablePlot(state, plot, cfg)) return 'shore';
  return [...doorTable(state, cfg).values()].every((walks) => walks[plot]!.seconds === Infinity) ? 'walk' : null;
}

/** What the plot is, in a mark or a refusal: a lake, or land the floor cuts off. */
export const cutOffAs = (state: GameState, plot: number): string => (state.tiles[plot]!.terrain === 'lake' ? 'lake' : 'cut off');
