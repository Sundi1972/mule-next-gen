/** Map zoom on the phone: the view that frames a player's own land. See spec C11, RULE-4. */

import type { MapTile } from './HoloMap';
import type { Slot } from './tokens';

/** A zoomed view in plot units: its top-left corner, and how far it is magnified. */
export interface ZoomBox {
  scale: number;
  x: number;
  y: number;
}

/** Your plots plus a ring of one plot around them, grown to the map's shape and kept inside it; null if you own none. */
export function zoomBox(tiles: MapTile[], width: number, height: number, slot: Slot): ZoomBox | null {
  const mine = tiles.filter((t) => t.owner === slot);
  if (mine.length === 0) return null;
  const x0 = Math.max(0, Math.min(...mine.map((t) => t.x)) - 1);
  const x1 = Math.min(width, Math.max(...mine.map((t) => t.x)) + 2);
  const y0 = Math.max(0, Math.min(...mine.map((t) => t.y)) - 1);
  const y1 = Math.min(height, Math.max(...mine.map((t) => t.y)) + 2);
  const scale = Math.min(width / (x1 - x0), height / (y1 - y0));
  const viewW = width / scale;
  const viewH = height / scale;
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);
  return {
    scale,
    x: clamp((x0 + x1) / 2 - viewW / 2, width - viewW),
    y: clamp((y0 + y1) / 2 - viewH / 2, height - viewH),
  };
}
