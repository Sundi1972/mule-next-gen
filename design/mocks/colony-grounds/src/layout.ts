import type { PrestigeId } from '@mule/engine';

/**
 * The grounds as layout data, in grid units, independent of how they are drawn. The isometric SVG below projects it;
 * the 3D build reads the same data into react-three-fiber (three.js): x and z are the grid, y is height, one unit is
 * one slot's side. Nothing here knows about pixels, so the 2.5D mock and a later 3D scene place things identically.
 */
export interface Cell {
  /** 1–8 for a slot, 0 for the town hall. */
  slot: number;
  col: number;
  row: number;
}

/** The plaza: a 3×3 square, the town hall in the middle (WS7's rules); the ring round it is decoration only. */
export const CELLS: Cell[] = [
  { slot: 1, col: 0, row: 0 },
  { slot: 2, col: 1, row: 0 },
  { slot: 3, col: 2, row: 0 },
  { slot: 4, col: 0, row: 1 },
  { slot: 0, col: 1, row: 1 },
  { slot: 5, col: 2, row: 1 },
  { slot: 6, col: 0, row: 2 },
  { slot: 7, col: 1, row: 2 },
  { slot: 8, col: 2, row: 2 },
];

/** Each building's massing, in slot units: footprint (0–1 of the slot) and height. A 3D model replaces the shape, not these. */
export const MASSING: Record<PrestigeId | 'hall', { footprint: number; height: number }> = {
  hall: { footprint: 0.62, height: 0.42 },
  park: { footprint: 0.9, height: 0.04 },
  hospital: { footprint: 0.66, height: 0.58 },
  observatory: { footprint: 0.56, height: 0.46 },
  stadium: { footprint: 0.86, height: 0.22 },
  spaceport: { footprint: 0.8, height: 0.9 },
};

/** How rich the grounds look, from what stands and the colony's mood: the scene reads it, the rules never do. */
export interface Richness {
  /** Objects standing: 0 is a bare plaza; each one paves more and plants more. */
  standing: number;
  /** The colony's mood, 0–100 (gauges.happiness): colonists out on the plaza, lamps lit, the hall's flag up. */
  mood: number;
  /** The air, gauges.environment (0 clean): a haze over the grounds as it worsens. */
  air: number;
}

/** Decoration on the ring round the plaza, in grid units (-1 and 3 are the ring), revealed as the colony grows. */
export const RING: { col: number; row: number; kind: 'tree' | 'lamp'; from: number }[] = [
  { col: -1, row: 0, kind: 'tree', from: 1 },
  { col: 3, row: 1, kind: 'tree', from: 1 },
  { col: 1, row: -1, kind: 'lamp', from: 1 },
  { col: -1, row: 2, kind: 'tree', from: 2 },
  { col: 2, row: 3, kind: 'tree', from: 2 },
  { col: 3, row: -1, kind: 'lamp', from: 2 },
  { col: -1, row: 1, kind: 'lamp', from: 3 },
  { col: 0, row: 3, kind: 'tree', from: 3 },
  { col: 3, row: 2, kind: 'tree', from: 4 },
  { col: 1, row: 3, kind: 'lamp', from: 4 },
  { col: -1, row: -1, kind: 'tree', from: 4 },
  { col: 3, row: 3, kind: 'tree', from: 5 },
];
