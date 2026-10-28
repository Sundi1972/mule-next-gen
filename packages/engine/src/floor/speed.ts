import { tileAt } from '../grid.js';
import type { GameState, Terrain } from '../types.js';
import type { FloorColonist, FloorConfig } from './floor.js';

/** A land's share of full speed under the config's switches; 0 blocks it. Nobody walks on the store's tile. */
export function terrainShare(terrain: Terrain, cfg: FloorConfig): number {
  const { steer } = cfg;
  if (terrain === 'store') return 0;
  if (terrain === 'lake' && steer.lakeMode === 'wade') return steer.wading;
  if (terrain === 'mountains' && steer.mountainsImpassable) return 0;
  return steer.terrain[terrain];
}

/** How fast a colonist walks where it stands: tiles a second on the map, hall units a second in the hall. */
export function speedOf(c: FloorColonist, state: GameState, cfg: FloorConfig): number {
  const lead = c.lead ? cfg.steer.leadPace : 1;
  if (c.space === 'hall') return (cfg.hall.width / cfg.steer.floorSeconds) * c.pace * lead;
  const ground = terrainShare(tileAt(state.tiles, state.width, Math.floor(c.x), Math.floor(c.y))!.terrain, cfg);
  const bitten = c.bitten ? cfg.wolves.bittenPace : 1;
  const bot = c.bot ? cfg.steer.botSpeed : 1;
  return cfg.steer.mapTilesPerSecond * ground * c.pace * lead * bitten * bot;
}
