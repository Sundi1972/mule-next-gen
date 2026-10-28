import type { GameState, Terrain } from '../types.js';
import type { FloorColonist, FloorConfig } from './floor.js';

/** A land's share of full speed under the config's switches; 0 blocks it. */
export function terrainShare(terrain: Terrain, cfg: FloorConfig): number {
  throw new Error('NotImplemented: terrainShare');
}

/** How fast a colonist walks where it stands: tiles a second on the map, hall units a second in the hall. */
export function speedOf(c: FloorColonist, state: GameState, cfg: FloorConfig): number {
  throw new Error('NotImplemented: speedOf');
}
