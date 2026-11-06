/** The grounds as layout data in place units, the town hall at the origin; nothing here knows about pixels. */
import type { ObjectKind } from '../components/ObjectGlyph';

/** A project's block on the 5×5 grounds (spec AM-18 / RULE-32b): anchor cell (top-left), x east, y south. */
export interface GridPlace {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The town hall's cell; the scene puts its centre at the origin. */
const HALL = 2;

/**
 * A block's centre in place units from the hall: col runs with x and row with y, which is how the camera frame lays
 * places out (ART-DIRECTION §2, Blender (12·col, −12·row) seen from the south-east).
 */
export function centreOf({ x, y, w, h }: GridPlace): { col: number; row: number } {
  return { col: x + (w - 1) / 2 - HALL, row: y + (h - 1) / 2 - HALL };
}

/** The ring a block's farthest cell is on, counted out from the hall. */
function ringOf({ x, y, w, h }: GridPlace): number {
  return Math.max(Math.abs(x - HALL), Math.abs(x + w - 1 - HALL), Math.abs(y - HALL), Math.abs(y + h - 1 - HALL));
}

/** How many rings the scene draws: none with no place in use, else the farthest ring a place reaches (RULE-4). */
export function extentOf(places: GridPlace[]): 0 | 1 | 2 {
  return Math.min(2, Math.max(0, ...places.map(ringOf))) as 0 | 1 | 2;
}

/** Each building's massing for its SVG shape: footprint (0–1 of a place) and height, in place units. */
export const MASSING: Record<ObjectKind | 'hall', { footprint: number; height: number }> = {
  hall: { footprint: 0.62, height: 0.42 },
  park: { footprint: 0.9, height: 0.04 },
  hospital: { footprint: 0.66, height: 0.58 },
  observatory: { footprint: 0.56, height: 0.46 },
  stadium: { footprint: 0.86, height: 0.22 },
  spaceport: { footprint: 0.8, height: 0.9 },
};

export interface EdgeProp {
  col: number;
  row: number;
  kind: 'tree' | 'lamp';
}

/** Trees and lamps round the edge of the land at `radius` from the hall, interleaved by side so any first few spread round it. */
export function edgeDecoration(radius: number): EdgeProp[] {
  const out: EdgeProp[] = [];
  const steps = Math.max(2, Math.round(radius * 2));
  for (let k = 0; k < steps * 4; k++) {
    const side = Math.floor(k / steps);
    const t = -radius + ((k % steps) + 0.5) * ((2 * radius) / steps);
    const [col, row] = side === 0 ? [t, -radius] : side === 1 ? [radius, t] : side === 2 ? [-t, radius] : [-radius, -t];
    out.push({ col, row, kind: k % 3 === 2 ? 'lamp' : 'tree' });
  }
  return out.map((d, i) => ({ d, key: (i % steps) * 4 + Math.floor(i / steps) })).sort((a, b) => a.key - b.key).map((x) => x.d);
}
