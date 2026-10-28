import { tileIndex } from '../grid.js';
import type { GameState } from '../types.js';
import type { FloorConfig, FloorPoint } from './floor.js';
import { terrainShare } from './speed.js';

/** A walk from tile to tile, four ways, both ends included, and how long it takes at full pace. */
export interface MapPath {
  tiles: FloorPoint[];
  seconds: number;
}

const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/**
 * The quickest walk between the tiles under two points, a colonist's position or a plot, at RULE-2's terrain speeds,
 * for the AI's legs and the guide ring; null when none is open. A goal nobody may stand on (a lake plot, worked from
 * its shore) is reached at its edge, at no cost.
 */
export function pathTo(state: GameState, from: FloorPoint, to: FloorPoint, cfg: FloorConfig): MapPath | null {
  const { width, height, tiles } = state;
  const tileUnder = (p: FloorPoint) => tileIndex(width, Math.floor(p.x), Math.floor(p.y));
  const goal = tileUnder(to);
  const enter = (i: number) => {
    const share = terrainShare(tiles[i]!.terrain, cfg);
    if (share > 0) return 1 / (cfg.steer.mapTilesPerSecond * share);
    return i === goal ? 0 : Infinity;
  };
  const seconds = new Array<number>(tiles.length).fill(Infinity);
  const prev = new Array<number>(tiles.length).fill(-1);
  const done = new Array<boolean>(tiles.length).fill(false);
  seconds[tileUnder(from)] = 0;
  for (;;) {
    // The nearest open tile not yet settled; on a tie the lowest index, so the same map always gives the same path.
    let u = -1;
    for (let i = 0; i < tiles.length; i++) if (!done[i] && seconds[i]! < Infinity && (u < 0 || seconds[i]! < seconds[u]!)) u = i;
    if (u < 0) return null;
    if (u === goal) break;
    done[u] = true;
    const ux = u % width;
    const uy = Math.floor(u / width);
    for (const [dx, dy] of STEPS) {
      const vx = ux + dx;
      const vy = uy + dy;
      if (vx < 0 || vy < 0 || vx >= width || vy >= height) continue;
      const v = tileIndex(width, vx, vy);
      const through = seconds[u]! + enter(v);
      if (through < seconds[v]!) {
        seconds[v] = through;
        prev[v] = u;
      }
    }
  }
  const path: FloorPoint[] = [];
  for (let v = goal; v >= 0; v = prev[v]!) path.unshift({ x: v % width, y: Math.floor(v / width) });
  return { tiles: path, seconds: seconds[goal]! };
}
