import type { PrestigeId } from '@mule/engine';

/**
 * The grounds as layout data, in grid units, independent of how they are drawn. The isometric SVG projects it; a 3D
 * build reads the same data into react-three-fiber (three.js): x and z are the grid, y is height, one unit is one
 * place's side, the town hall at the origin. Nothing here knows about pixels.
 *
 * PM ruling, 6 Nov (after Heiko saw the 3×3): no fixed slots and no Governor's pick. Buildings take the next place in
 * one growth order, ring by ring out from the town hall, up to 5×5 (24 places); the scene is only as big as it needs.
 */
export interface Place {
  /** The order the colony builds in: the n-th building commissioned stands here (ColonyView's slot, 0-based). */
  index: number;
  col: number;
  row: number;
}

/** Ring 1 (the 3×3 round the hall), then ring 2 (the 5×5), front places first so the first buildings face the viewer. */
const OFFSETS: [number, number][] = [
  [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1], [1, -1], [-1, 1], [-1, -1],
  [2, 0], [0, 2], [2, 1], [1, 2], [2, 2], [-2, 0], [0, -2], [2, -1], [-1, 2], [-2, 1], [1, -2], [2, -2], [-2, 2], [-2, -1], [-1, -2], [-2, -2],
];

export const PLACES: Place[] = OFFSETS.map(([col, row], index) => ({ index, col, row }));

/** How many rings the scene draws: none round a lone hall, one up to 8 buildings, two up to 24. */
export function extentOf(buildings: number): 0 | 1 | 2 {
  return buildings === 0 ? 0 : buildings <= 8 ? 1 : 2;
}

/** Each building's massing, in place units: footprint (0–1 of a place) and height. A 3D model replaces the shape, not these. */
export const MASSING: Record<PrestigeId | 'hall', { footprint: number; height: number }> = {
  hall: { footprint: 0.62, height: 0.42 },
  park: { footprint: 0.9, height: 0.04 },
  hospital: { footprint: 0.66, height: 0.58 },
  observatory: { footprint: 0.56, height: 0.46 },
  stadium: { footprint: 0.86, height: 0.22 },
  spaceport: { footprint: 0.8, height: 0.9 },
};

/** How rich the grounds look, from what stands and the colony's gauges: the scene reads it, the rules never do. */
export interface Richness {
  /** Objects standing: each one paves more and plants more. */
  standing: number;
  /** gauges.happiness, 0–100: colonists out, lamps lit, the hall's flag up. */
  mood: number;
  /** gauges.environment (0 clean): a haze over the grounds as it worsens. */
  air: number;
}

/**
 * Trees and lamps along the edge of the land, at `radius` from the hall, a tree then a lamp round the square; the scene
 * shows the first `shown` of them, so the edge fills in as the colony grows.
 */
export function edgeDecoration(radius: number): { col: number; row: number; kind: 'tree' | 'lamp' }[] {
  const out: { col: number; row: number; kind: 'tree' | 'lamp' }[] = [];
  const steps = Math.max(2, Math.round(radius * 2));
  for (let k = 0; k < steps * 4; k++) {
    const side = Math.floor(k / steps);
    const t = -radius + ((k % steps) + 0.5) * ((2 * radius) / steps);
    const [col, row] = side === 0 ? [t, -radius] : side === 1 ? [radius, t] : side === 2 ? [-t, radius] : [-radius, -t];
    out.push({ col, row, kind: k % 3 === 2 ? 'lamp' : 'tree' });
  }
  // Interleave the sides, so a few shown are spread round the land, not bunched on one edge.
  return out.map((d, i) => ({ d, key: (i % steps) * 4 + Math.floor(i / steps) })).sort((a, b) => a.key - b.key).map((x) => x.d);
}
