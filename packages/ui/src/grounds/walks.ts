/** Where the grounds' colonists walk (spec C4), in place units from the hall: col runs east, row south. Pure. */
import type { GridPlace } from './layout';
import { W } from './projection';

export type Spot = [number, number];

/** A place is 12 m across (ART-DIRECTION §2), so one metre is this many scene units. */
export const METRE = W / 12;
/** The scaffold's colonists walk their paths at about 2.9 m/s (3.3 m of path in 0.4 of a 2.86 s lap). */
const PACE = (2.9 * METRE) / W;
/** Each colonist starts this far round the walk behind the one before (the scaffold's spacing). */
const SPACING = 0.29;

/** The four path spokes out from the hall: north, east, south, west. */
const SPOKES: Spot[] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/** Where spoke k's path, the gap half a place to its side, meets the ring of paths round the hall: a corner of it. */
const cornerOf = (k: number): Spot => {
  const [dc, dr] = SPOKES[k]!;
  return [(dc - dr) / 2, (dr + dc) / 2];
};

/**
 * Colonist i's walk as the scaffold has it: in along one spoke's path from the rim, round the hall, out along another.
 * `blocks` are the places in use.
 */
export function walkRoute(i: number, rim: number, _blocks: GridPlace[]): Spot[] {
  const a = i % 4;
  const b = (i + 1 + (i % 2)) % 4;
  const out = (k: number): Spot => {
    const [c, r] = cornerOf(k);
    const [dc, dr] = SPOKES[k]!;
    const reach = rim - 0.5;
    return [c + dc * reach, r + dr * reach];
  };
  const round: Spot[] = [];
  for (let k = a; k !== b; k = (k + 1) % 4) round.push(cornerOf(k));
  return [out(a), ...round, cornerOf(b), out(b)];
}

/** Where colonist i is on its route `seconds` into the walk; past the route's end, the walk starts again at the rim. */
export function walkerAt(i: number, seconds: number, route: Spot[]): Spot {
  const legs = route.slice(1).map((p, k) => Math.hypot(p[0] - route[k]![0], p[1] - route[k]![1]));
  const length = legs.reduce((s, l) => s + l, 0);
  let d = (seconds * PACE + SPACING * i * length) % length;
  for (let k = 0; k < legs.length; k++) {
    if (d <= legs[k]!) {
      const t = legs[k]! === 0 ? 0 : d / legs[k]!;
      const [p, q] = [route[k]!, route[k + 1]!];
      return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    }
    d -= legs[k]!;
  }
  return route[route.length - 1]!;
}
