import { POLLUTION } from './config.js';
import { neighbours } from './map.js';
import type { GameState, Tile } from './types.js';

export type AirBand = (typeof POLLUTION.bands)[number];

/** The band the colony air gauge is in: clean, smoggy, toxic or collapse. */
export function airBand(air: number): AirBand {
  let band: AirBand = POLLUTION.bands[0];
  for (const b of POLLUTION.bands) if (air >= b.from) band = b;
  return band;
}

/** Colony air points a plot adds each month, after its filter. */
export function airPoints(tile: Tile): number {
  if (!tile.owner || !tile.outfit) return 0;
  const source = POLLUTION.sources[tile.outfit];
  if (!source) return 0;
  return source.air * (tile.filter ? POLLUTION.filterFactor : 1);
}

/**
 * Runs one month of pollution after production. Polluters raise their own
 * plot and the four touching it by 1, whoever owns them, and add points to
 * the colony air gauge. Plots with no polluter beside them recover; green
 * belts and untouched forest and swamp clean faster. Nature cleans a little
 * of the air by itself. Returns the air points each player caused.
 */
export function runPollution(state: GameState): Record<string, number> {
  const by: Record<string, number> = {};
  for (const p of state.players) by[p.id] = 0;

  const fouled = new Set<Tile>();
  const cleaned = new Map<Tile, number>();
  let air = state.air;

  for (const tile of state.tiles) {
    if (!tile.owner || !tile.outfit) continue;
    const points = airPoints(tile);
    if (points > 0) {
      by[tile.owner] = (by[tile.owner] ?? 0) + points;
      air += points;
      if (POLLUTION.sources[tile.outfit]?.spreads && !tile.filter) {
        fouled.add(tile);
        for (const n of neighbours(state.tiles, state.width, tile)) fouled.add(n);
      }
    }
    if (tile.outfit === 'greenBelt') {
      air -= POLLUTION.greenBeltAir;
      for (const t of [tile, ...neighbours(state.tiles, state.width, tile)]) {
        cleaned.set(t, (cleaned.get(t) ?? 0) + POLLUTION.greenBeltCleans);
      }
    }
  }

  for (const tile of state.tiles) {
    if (tile.terrain === 'store') continue;
    if (fouled.has(tile)) {
      tile.pollution = Math.min(POLLUTION.maxPlot, tile.pollution + 1);
    } else {
      const wild = !tile.outfit && (tile.terrain === 'forest' || tile.terrain === 'swamp');
      tile.pollution = Math.max(0, tile.pollution - (wild ? POLLUTION.wildRecovery : POLLUTION.recovery));
    }
    tile.pollution = Math.max(0, tile.pollution - (cleaned.get(tile) ?? 0));
  }

  state.air = Math.min(100, Math.max(0, air - POLLUTION.natureCleans));
  return by;
}
