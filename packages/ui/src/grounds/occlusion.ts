/**
 * Which colonists a building hides (spec C4, T-AC-13). Pure. A colonist is hidden where a picture drawn after it in
 * the painter's order covers it on screen: tested against the picture's own silhouette (the manifest's `skyline`,
 * measured from its opaque pixels by design/art/colony/skyline.py), not a box, so a low roof edge or the open sky
 * beside a tower never hides anyone.
 */
import type { Frame, Skyline } from './pick';
import { iso, W, type Pt } from './projection';

/** A standing picture as the live layer sees it: when it is drawn, and where its silhouette's columns fall on screen. */
export interface Occluder {
  /** Its painter's-order depth, col + row of its centre: it is drawn after every colonist standing shallower. */
  depth: number;
  /** The picture's top-left corner and height, in scene units. */
  x: number;
  y: number;
  height: number;
  /** One silhouette column's width, in scene units. */
  column: number;
  top: number[];
  bottom: number[];
}

/** The occluder for a picture drawn with `frame` centred on (c, r), as ColonyGrounds' Picture places it. */
export function occluderOf(frame: Frame, skyline: Skyline, c: number, r: number, depth: number): Occluder {
  const [x, y] = iso(c, r);
  const k = W / frame.place;
  return { depth, x: x - frame.centre[0] * k, y: y - frame.centre[1] * k, height: frame.height * k, column: skyline.column * k, top: skyline.top, bottom: skyline.bottom };
}

/** Whether a screen point lies inside the occluder's silhouette. */
function covers([px, py]: Pt, o: Occluder): boolean {
  const k = Math.floor((px - o.x) / o.column);
  if (k < 0 || k >= o.top.length) return false;
  const v = (py - o.y) / o.height;
  return v >= o.top[k]! && v <= o.bottom[k]!;
}

/** Where on a colonist's figure the test looks, in metres up from its feet: the shins, the waist and the head. */
const FIGURE = [0.3, 0.9, 1.5];
const METRES_PER_PLACE = 12;

/** Whether any of `occluders` drawn after a colonist standing at `spot` (depth col + row) covers part of its figure. */
export function hiddenBy([c, r]: [number, number], occluders: Occluder[]): boolean {
  const depth = c + r;
  const points = FIGURE.map((m) => iso(c, r, m / METRES_PER_PLACE));
  return occluders.some((o) => o.depth > depth && points.some((p) => covers(p, o)));
}
