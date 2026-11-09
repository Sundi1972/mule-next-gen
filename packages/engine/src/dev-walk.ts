import { DEV_WALK, SPECIES_PERK } from './config.js';
import { needsOf } from './production.js';
import type { GameState } from './types.js';

/** Where a colonist is in development: on a map tile (its index), in the store, or at the corral across its floor. */
export type DevPlace = number | 'store' | 'corral';

/** The share of the month's Food the player holds, 0 to 1: the less, the hungrier, so the screens can show how hungry. */
export function foodShare(state: GameState, id: string): number {
  const p = state.players.find((q) => q.id === id)!;
  return Math.min(1, p.stock.food / Math.max(1, needsOf(state, id).food));
}

/** The share of its pace a colonist walks at for hunger: 1 fed, falling linearly with the shortfall to hungerPaceMin. */
export function hungerPace(state: GameState, id: string): number {
  return 1 - (1 - DEV_WALK.hungerPaceMin) * (1 - foodShare(state, id));
}

/** The share of its pace a colonist walks at for sickness: DEV_WALK.sickPace while sick, else 1. */
export function sickPace(state: GameState, id: string): number {
  return state.players.find((q) => q.id === id)!.sick ? DEV_WALK.sickPace : 1;
}

/** How fast a colonist walks, as a share of a well-fed, healthy one's pace: a Zipwing faster; hunger and sickness multiply. */
export function pace(state: GameState, id: string): number {
  const zipwing = state.players.find((q) => q.id === id)!.species === 'zipwing';
  return (zipwing ? SPECIES_PERK.zipwingSpeed : 1) * hungerPace(state, id) * sickPace(state, id);
}

/**
 * Seconds a colonist takes to walk from one place to another in development: a step per map tile, never diagonally,
 * plus the walk across the store floor when it ends at the corral (once a visit; leaving the corral costs only the
 * steps), at the colonist's pace. The seconds are development seconds, unscaled, like Player.devSeconds: a table that
 * runs its clock faster scales them as it scales the turn. The server and the sim both charge this, so walking is one
 * rule; neither keeps its own.
 */
export function walkSeconds(state: GameState, id: string, from: DevPlace, to: DevPlace): number {
  const store = state.tiles.find((t) => t.terrain === 'store')!;
  const tile = (place: DevPlace) => (typeof place === 'number' ? state.tiles[place]! : store);
  const a = tile(from);
  const b = tile(to);
  const steps = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const floor = to === 'corral' && from !== 'corral' ? DEV_WALK.floorSeconds : 0;
  return (steps * DEV_WALK.tileSeconds + floor) / pace(state, id);
}
