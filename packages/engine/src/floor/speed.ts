import { tileAt } from '../grid.js';
import type { GameState, Terrain } from '../types.js';
import type { FloorColonist, FloorConfig } from './floor.js';
import type { HallPlan } from './hall.js';

/** A land's share of full speed under the config's switches; 0 blocks it. Nobody walks on the store's tile. */
export function terrainShare(terrain: Terrain, cfg: FloorConfig): number {
  const { steer } = cfg;
  if (terrain === 'store') return 0;
  if (terrain === 'lake' && steer.lakeMode === 'wade') return steer.wading;
  if (terrain === 'mountains' && steer.mountainsImpassable) return 0;
  return steer.terrain[terrain];
}

/** A land's share as the config lists it, whatever the switches say: a lake's is its wading share. The store has none. */
function listedShare(terrain: Terrain, { steer }: FloorConfig): number {
  if (terrain === 'store') return 0;
  return terrain === 'lake' ? steer.wading : steer.terrain[terrain];
}

/** The walk floorSeconds times, in hall units: from the left door's spot to the corral's, as the arcade mock measures it. */
export function doorToCorral(hall: HallPlan): number {
  const { doorL, corral } = hall.spots;
  return Math.hypot(corral.x - doorL.x, corral.y - doorL.y);
}

/** Hall units a second at full pace: the door-to-corral walk in floorSeconds. */
export function hallSpeed(cfg: FloorConfig): number {
  return doorToCorral(cfg.hall) / cfg.steer.floorSeconds;
}

/**
 * How fast a colonist walks where it stands: tiles a second on the map, hall units a second in the hall, where the
 * door-to-corral walk takes floorSeconds at full pace and neither a bite nor an AI seat slows it.
 */
export function speedOf(c: FloorColonist, state: GameState, cfg: FloorConfig): number {
  const lead = c.lead ? cfg.steer.leadPace : 1;
  if (c.space === 'hall') return hallSpeed(cfg) * c.pace * lead;
  const terrain = tileAt(state.tiles, state.width, Math.floor(c.x), Math.floor(c.y))!.terrain;
  // On land it may not enter, a colonist still walks at the land's listed speed, or 1 if it has none, to get off it.
  const ground = terrainShare(terrain, cfg) || listedShare(terrain, cfg) || 1;
  const bitten = c.bitten ? cfg.wolves.bittenPace : 1;
  const bot = c.bot ? cfg.steer.botSpeed : 1;
  return cfg.steer.mapTilesPerSecond * ground * c.pace * lead * bitten * bot;
}
