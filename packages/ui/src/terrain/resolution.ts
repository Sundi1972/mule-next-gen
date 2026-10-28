/** The screen a map is drawn on: CSS pixels, either way round, and device pixels per CSS pixel. */
export interface DeviceScreen {
  width: number;
  height: number;
  dpr: number;
}

/** Pictures come in steps of this many pixels a plot, so devices of nearly one size share a picture. */
const STEP = 32;
const MIN_PX_PER_TILE = 24;
const MAX_PX_PER_TILE = 180;
/** Denser screens get a 3× picture, as before: more pixels than that no one sees on a map. */
const MAX_DPR = 3;

/**
 * Pixels per plot for a map's landscape on this device: the largest the map can be drawn on the screen, held
 * either way round, at the screen's pixel density. The element the map sits in plays no part, so every screen of
 * a session shares one picture, and a resize or a new layout never repaints it; CSS scales it down to fit.
 */
export function landscapePxPerTile(map: { width: number; height: number }, screen: DeviceScreen): number {
  const fit = Math.max(Math.min(screen.width / map.width, screen.height / map.height), Math.min(screen.height / map.width, screen.width / map.height));
  const px = fit * Math.min(MAX_DPR, screen.dpr || 1);
  // The small allowance keeps a size exactly on a step from being rounded up by floating-point noise.
  return Math.max(MIN_PX_PER_TILE, Math.min(MAX_PX_PER_TILE, Math.ceil(px / STEP - 1e-9) * STEP));
}
