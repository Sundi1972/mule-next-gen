import { describe, expect, it } from 'vitest';
import { landscapePxPerTile } from '../src/terrain/resolution';

const SMALL = { width: 13, height: 7 };
const MID = { width: 15, height: 9 };
const LARGE = { width: 19, height: 11 };

/**
 * Each expected value is worked by hand: the map fitted to the screen either way round, min(long / map width,
 * short / map height) CSS px a plot, times the pixel ratio (at most 3), rounded up to a step of 32, held to 24..180.
 */
const ROWS: [string, { width: number; height: number }, { width: number; height: number; dpr: number }, number][] = [
  ['2× phone sideways 844×390, small map: 55.7 × 2 = 111.4 → 128', SMALL, { width: 844, height: 390, dpr: 2 }, 128],
  ['the same phone upright 390×844 (iOS always reports it so): still 128', SMALL, { width: 390, height: 844, dpr: 2 }, 128],
  ['2× phone 844×390, large map: 35.5 × 2 = 70.9 → 96', LARGE, { width: 844, height: 390, dpr: 2 }, 96],
  ['3× phone 844×390, large map: 35.5 × 3 = 106.4 → 128', LARGE, { width: 844, height: 390, dpr: 3 }, 128],
  ['3× phone 844×390, small map: 167.1 → 192, held to the cap 180', SMALL, { width: 844, height: 390, dpr: 3 }, 180],
  ['a 4× screen counts as 3×: large map 35.5 × 3 → 128, not 160', LARGE, { width: 844, height: 390, dpr: 4 }, 128],
  ['iPhone SE 568×320 at 2×, small map: 43.7 × 2 = 87.4 → 96', SMALL, { width: 568, height: 320, dpr: 2 }, 96],
  ['2× laptop 1440×900, small map: 110.8 × 2 = 221.5 → the cap 180', SMALL, { width: 1440, height: 900, dpr: 2 }, 180],
  ['2× laptop 1440×900, large map: 75.8 × 2 = 151.6 → 160', LARGE, { width: 1440, height: 900, dpr: 2 }, 160],
  ['2× phone 844×390, mid map: 43.3 × 2 = 86.7 → 96', MID, { width: 844, height: 390, dpr: 2 }, 96],
  ['3× phone 844×390, mid map: 43.3 × 3 = 130 → 160', MID, { width: 844, height: 390, dpr: 3 }, 160],
  ['2× laptop 1440×900, mid map: 96 × 2 = 192 → the cap 180', MID, { width: 1440, height: 900, dpr: 2 }, 180],
  ['TV 1920×1080 at 1×, small map: 147.7 → 160', SMALL, { width: 1920, height: 1080, dpr: 1 }, 160],
  ['TV 1920×1080 at 1×, mid map: 120 → 128', MID, { width: 1920, height: 1080, dpr: 1 }, 128],
  ['TV 1920×1080 at 1×, large map: 98.2 → 128', LARGE, { width: 1920, height: 1080, dpr: 1 }, 128],
  ['on a step but for floating-point noise stays there: large map at 1382×800, 2.2×: 72.73 × 2.2 = 160.00000000000003 → 160', LARGE, { width: 1382, height: 800, dpr: 2.2 }, 160],
  ['a screen that reports no size gets the floor, 24', SMALL, { width: 0, height: 0, dpr: 2 }, 24],
];

describe('FM-FREEZE-1: the landscape resolution comes from the map and the device alone, never the element', () => {
  it.each(ROWS)('FM-FREEZE-1: %s', (_label, map, screen, expected) => {
    expect(landscapePxPerTile(map, screen)).toBe(expected);
  });
});
