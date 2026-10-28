import type { GameState } from './types.js';

/** Where a colonist is in development: on a map tile (its index), in the store, or at the corral across its floor. */
export type DevPlace = number | 'store' | 'corral';

export function walkSeconds(state: GameState, id: string, from: DevPlace, to: DevPlace): number {
  throw new Error('NotImplemented: walkSeconds');
}
