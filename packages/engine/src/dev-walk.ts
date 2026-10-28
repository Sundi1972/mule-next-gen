import { DEV_WALK, SPECIES_PERK } from './config.js';
import type { GameState } from './types.js';

/** Where a colonist is in development: on a map tile (its index), in the store, or at the corral across its floor. */
export type DevPlace = number | 'store' | 'corral';

/**
 * Seconds a colonist takes to walk from one place to another in development: a step per map tile, never diagonally,
 * plus the walk across the store floor when it ends at the corral. A Zipwing walks faster. The server and the sim
 * both charge this, so walking is one rule; neither keeps its own.
 */
export function walkSeconds(state: GameState, id: string, from: DevPlace, to: DevPlace): number {
  const store = state.tiles.find((t) => t.terrain === 'store')!;
  const tile = (place: DevPlace) => (typeof place === 'number' ? state.tiles[place]! : store);
  const a = tile(from);
  const b = tile(to);
  const steps = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const floor = to === 'corral' && from !== 'corral' ? DEV_WALK.floorSeconds : 0;
  const zipwing = state.players.find((p) => p.id === id)!.species === 'zipwing';
  return (steps * DEV_WALK.tileSeconds + floor) / (zipwing ? SPECIES_PERK.zipwingSpeed : 1);
}
