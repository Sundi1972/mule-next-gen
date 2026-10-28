import type { GameState } from '../types.js';
import type { DevFloor, FloorConfig, FloorInput } from './floor.js';

/** One tick of the floor: every colonist moved by its seat's input. Pure; a seat with no input stands still. */
export function stepFloor(floor: DevFloor, state: GameState, inputs: Readonly<Record<string, FloorInput>>, dtMs: number, cfg: FloorConfig): DevFloor {
  throw new Error('NotImplemented: stepFloor');
}
