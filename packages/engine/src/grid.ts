/** Plain map helpers, kept apart from map.ts so the generator's stages and the map rules can use them without importing the generator. */

import { GROWN_GOODS, MINED_GOODS, type Ground, type Tile } from './types.js';

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

export function zeroGround(): Ground {
  return Object.fromEntries([...GROWN_GOODS, ...MINED_GOODS].map((g) => [g, 0])) as Ground;
}
