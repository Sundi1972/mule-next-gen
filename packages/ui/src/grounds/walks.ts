/** Where the grounds' colonists walk (spec C4), in place units from the hall: col runs east, row south. Pure. */
import type { GridPlace } from './layout';
import { W } from './projection';

export type Spot = [number, number];

/** A place is 12 m across (ART-DIRECTION §2), so one metre is this many scene units. */
export const METRE = W / 12;
/** The colonists walk at an easy walking pace, 1.3 m/s (Heiko, 8 Nov; the scaffold's figures ran at 2.9). */
const PACE = (1.3 * METRE) / W;
/** Each colonist starts this far round the walk behind the one before (the scaffold's spacing). */
const SPACING = 0.29;

/** The four path spokes out from the hall: north, east, south, west. */
const SPOKES: Spot[] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/** Where spoke k's path, the gap half a place to its side, meets the ring of paths round the hall: a corner of it. */
const cornerOf = (k: number): Spot => {
  const [dc, dr] = SPOKES[k]!;
  return [(dc - dr) / 2, (dr + dc) / 2];
};

/** Whether a spot lies inside a block's footprint; its edges are paths, so they do not count. */
function inside([c, r]: Spot, { x, y, w, h }: GridPlace): boolean {
  return c > x - 2.5 && c < x + w - 2.5 && r > y - 2.5 && r < y + h - 2.5;
}

/**
 * The paths out from spoke k's corner of the hall's ring to the outermost gap line at `edge`: the fewest gap segments,
 * straight out along the spoke when nothing stands across it. A segment whose middle is inside a block is the centre
 * line of a 2×2 (or larger) building, not a path, so it is never taken.
 */
function pathOut(k: number, edge: number, blocks: GridPlace[]): Spot[] {
  const [dc, dr] = SPOKES[k]!;
  // Straight on first, then sideways, then back: on a clear spoke the first way found is the straight one.
  const steps: Spot[] = [[dc, dr], [-dr, dc], [dr, -dc], [-dc, -dr]];
  const start = cornerOf(k);
  const key = ([c, r]: Spot) => `${c},${r}`;
  const cameFrom = new Map<string, Spot | null>([[key(start), null]]);
  const queue: Spot[] = [start];
  for (let n = 0; n < queue.length; n++) {
    const at = queue[n]!;
    if (Math.abs(at[0]) === edge || Math.abs(at[1]) === edge) {
      const path: Spot[] = [];
      for (let p: Spot | null = at; p; p = cameFrom.get(key(p))!) path.unshift(p);
      return path;
    }
    for (const [sc, sr] of steps) {
      const next: Spot = [at[0] + sc, at[1] + sr];
      const middle: Spot = [at[0] + sc / 2, at[1] + sr / 2];
      if (Math.abs(next[0]) > edge || Math.abs(next[1]) > edge || cameFrom.has(key(next))) continue;
      if (blocks.some((b) => inside(middle, b))) continue;
      cameFrom.set(key(next), at);
      queue.push(next);
    }
  }
  // Unreachable: a block's own edges are paths, so the outer gap line can always be reached.
  return [start];
}

/** From a spot on the outermost gap line `edge`, straight out to the rim, the way the spoke points where it can. */
function toRim([c, r]: Spot, k: number, edge: number, rim: number): Spot {
  const along = SPOKES[k]![1] !== 0;
  const outRow = Math.abs(r) === edge && (along || Math.abs(c) !== edge);
  return outRow ? [c, Math.sign(r) * rim] : [Math.sign(c) * rim, r];
}

/**
 * Colonist i's walk as the scaffold has it: in along one spoke's path from the rim, round the hall, out along another.
 * It keeps to the gaps between the places in use (`blocks`), round a large building rather than through it.
 */
export function walkRoute(i: number, rim: number, blocks: GridPlace[]): Spot[] {
  const a = i % 4;
  const b = (i + 1 + (i % 2)) % 4;
  // The outermost gap line inside the rim: the far edge of the farthest ring of places.
  const edge = Math.floor(rim - 0.5) + 0.5;
  const inbound = pathOut(a, edge, blocks).reverse();
  const outbound = pathOut(b, edge, blocks);
  const round: Spot[] = [];
  for (let k = (a + 1) % 4; k !== b; k = (k + 1) % 4) round.push(cornerOf(k));
  return [toRim(inbound[0]!, a, edge, rim), ...inbound, ...round, ...outbound, toRim(outbound[outbound.length - 1]!, b, edge, rim)];
}

/** Where colonist i is on its route `seconds` into the walk; past the route's end, the walk starts again at the rim. */
export function walkerAt(i: number, seconds: number, route: Spot[]): Spot {
  return walkerOn(i, seconds, route).spot;
}

/** Where colonist i is, and the leg of its route it is walking (from, to). */
export function walkerOn(i: number, seconds: number, route: Spot[]): { spot: Spot; leg: [Spot, Spot] } {
  const legs = route.slice(1).map((p, k) => Math.hypot(p[0] - route[k]![0], p[1] - route[k]![1]));
  const length = legs.reduce((s, l) => s + l, 0);
  let d = (seconds * PACE + SPACING * i * length) % length;
  for (let k = 0; k < legs.length; k++) {
    if (d <= legs[k]!) {
      const t = legs[k]! === 0 ? 0 : d / legs[k]!;
      const [p, q] = [route[k]!, route[k + 1]!];
      return { spot: [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t], leg: [p, q] };
    }
    d -= legs[k]!;
  }
  const last = route[route.length - 1]!;
  return { spot: last, leg: [route[route.length - 2] ?? last, last] };
}
