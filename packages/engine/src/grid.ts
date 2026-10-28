/** Plain map helpers, kept apart from map.ts so the generator's stages and the map rules can use them without importing the generator. */

import { GROWN_GOODS, MINED_GOODS, type Ground, type Tile } from './types.js';

/** Shares and odds are fractions: a value exactly on an edge must land on the side it would without float rounding. */
export const EPS = 1e-9; // literal-ok: float tolerance for shares and odds

export function tileIndex(width: number, x: number, y: number): number {
  return y * width + x;
}

export function tileAt(tiles: Tile[], width: number, x: number, y: number): Tile | undefined {
  if (x < 0 || y < 0 || x >= width) return undefined;
  return tiles[y * width + x];
}

export function neighbours(tiles: Tile[], width: number, tile: Tile): Tile[] {
  return [
    tileAt(tiles, width, tile.x + 1, tile.y),
    tileAt(tiles, width, tile.x - 1, tile.y),
    tileAt(tiles, width, tile.x, tile.y + 1),
    tileAt(tiles, width, tile.x, tile.y - 1),
  ].filter((t): t is Tile => t !== undefined);
}

/** Plot lists shared by every map of one size: built once, never written to. */
export type ReachTable = readonly (readonly number[])[];

const reachTables = new Map<string, ReachTable>();

/**
 * For each plot of a width x height map, every plot within `limit` steps of it
 * except `skip` (-1 skips none), in index order. Memoised, since a map size has
 * one store plot and a handful of reach limits, so callers must not mutate it.
 */
export function reachTable(width: number, height: number, skip: number, limit: number): ReachTable {
  const key = `${width}x${height} ${skip} ${limit}`;
  let table = reachTables.get(key);
  if (!table) {
    table = Array.from({ length: width * height }, (_, i) => {
      const x = i % width;
      const y = Math.floor(i / width);
      const out: number[] = [];
      for (let ny = Math.max(0, y - limit); ny <= Math.min(height - 1, y + limit); ny++) {
        const span = limit - Math.abs(ny - y);
        for (let nx = Math.max(0, x - span); nx <= Math.min(width - 1, x + span); nx++) {
          const j = ny * width + nx;
          if (j !== skip) out.push(j);
        }
      }
      return out;
    });
    reachTables.set(key, table);
  }
  return table;
}

export function zeroGround(): Ground {
  return Object.fromEntries([...GROWN_GOODS, ...MINED_GOODS].map((g) => [g, 0])) as Ground;
}
