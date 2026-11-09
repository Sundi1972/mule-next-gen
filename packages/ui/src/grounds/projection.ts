/** The grounds' 2:1 isometric projection: place units in, SVG units out. */

export type Pt = [number, number];

/** A place's width on screen; one height unit is one place's side. */
export const W = 120;

export const iso = (c: number, r: number, z = 0): Pt => [((c - r) * W) / 2, ((c + r) * W) / 4 - z * W * 0.82];

export const poly = (pts: Pt[]) => pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

/** The square footprint's corners at height z, centred on (c, r), half-side h. Order: back, right, front, left. */
export const square = (c: number, r: number, h: number, z = 0): Pt[] => [iso(c - h, r - h, z), iso(c + h, r - h, z), iso(c + h, r + h, z), iso(c - h, r + h, z)];
