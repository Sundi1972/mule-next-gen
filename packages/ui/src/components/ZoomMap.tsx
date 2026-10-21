/** Map zoom on the phone: a double-tap or the corner button frames a player's own land. See spec C11, RULE-4. */

import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import type { MapTile } from './HoloMap';
import type { Slot } from './tokens';

/** A zoomed view in plot units: its top-left corner, and how far it is magnified. */
export interface ZoomBox {
  scale: number;
  x: number;
  y: number;
}

/** The most a zoom magnifies: past this the map's strokes and the cursor ring swell into thick frames (AM-12). */
export const MAX_ZOOM = 3;

/** Two pointer-ups this close in time and space are a double-tap. */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP = 24;

/** Your plots plus a ring of one plot around them, grown to the map's shape, at most MAX_ZOOM, kept inside the map; null if you own none. */
export function zoomBox(tiles: MapTile[], width: number, height: number, slot: Slot): ZoomBox | null {
  const mine = tiles.filter((t) => t.owner === slot);
  if (mine.length === 0) return null;
  const x0 = Math.max(0, Math.min(...mine.map((t) => t.x)) - 1);
  const x1 = Math.min(width, Math.max(...mine.map((t) => t.x)) + 2);
  const y0 = Math.max(0, Math.min(...mine.map((t) => t.y)) - 1);
  const y1 = Math.min(height, Math.max(...mine.map((t) => t.y)) + 2);
  const scale = Math.min(MAX_ZOOM, width / (x1 - x0), height / (y1 - y0));
  const viewW = width / scale;
  const viewH = height / scale;
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);
  return {
    scale,
    x: clamp((x0 + x1) / 2 - viewW / 2, width - viewW),
    y: clamp((y0 + y1) / 2 - viewH / 2, height - viewH),
  };
}

export interface ZoomMapProps {
  width: number;
  height: number;
  tiles: MapTile[];
  /** Whose land the zoom frames. */
  slot: Slot;
  /** The map, drawn at the viewport's full width. */
  children: ReactNode;
  /** Set both to keep the zoom outside, e.g. across a screen that unmounts the map; otherwise it is kept here. */
  zoomed?: boolean;
  onZoomedChange?(zoomed: boolean): void;
}

/**
 * Wraps a map so a double-tap on it, or the corner button, toggles between the whole colony and your own land.
 * Taps still reach the map at once; with no land of your own there is no button and a double-tap does nothing.
 */
export function ZoomMap({ width, height, tiles, slot, children, zoomed: held, onZoomedChange }: ZoomMapProps) {
  const box = zoomBox(tiles, width, height, slot);
  const [kept, setKept] = useState(false);
  const zoomed = (held ?? kept) && box !== null;
  const toggle = () => {
    setKept(!zoomed);
    onZoomedChange?.(!zoomed);
  };
  const last = useRef<{ t: number; x: number; y: number } | null>(null);

  const onPointerUp = (e: PointerEvent) => {
    const prev = last.current;
    const near = prev && e.timeStamp - prev.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < DOUBLE_TAP_SLOP;
    if (near) {
      last.current = null;
      if (box) toggle();
    } else {
      last.current = { t: e.timeStamp, x: e.clientX, y: e.clientY };
    }
  };

  const on = zoomed && box;
  return (
    <div className="relative touch-manipulation overflow-hidden rounded-panel" data-testid="map-viewport">
      <div
        className="origin-top-left transition-transform duration-300 ease-out"
        style={on ? { transform: `scale(${on.scale}) translate(${(-on.x / width) * 100}%, ${(-on.y / height) * 100}%)` } : undefined}
        onPointerUp={onPointerUp}
        data-testid="map"
        data-zoomed={on ? 'yes' : 'no'}
      >
        {children}
      </div>
      {box && (
        <button
          type="button"
          onClick={toggle}
          aria-pressed={zoomed}
          aria-label={zoomed ? 'Show the whole colony' : 'Zoom to your land'}
          className="absolute right-1.5 top-1.5 flex size-11 items-center justify-center rounded-control border border-holo-line bg-panel/85 text-ink shadow-glow backdrop-blur-sm hover:border-holo"
          data-testid="zoom-button"
        >
          <ZoomGlyph zoomed={zoomed} />
        </button>
      )}
    </div>
  );
}

function ZoomGlyph({ zoomed }: { zoomed: boolean }) {
  // DS-GAP: @mule/ui has no icon set; this magnifier is drawn inline until it has one.
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 L21 21" />
      <path d="M7.5 10.5 H13.5" />
      {!zoomed && <path d="M10.5 7.5 V13.5" />}
    </svg>
  );
}
