import { Button, cx, HoloMap, TERRAIN_NAME, type MapTile } from '@mule/ui';
import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { baseTiles, MAP_H, MAP_W, ME, seat } from '../../data';
import { LandShell } from './LandShell';

/**
 * Map zoom on the phone, in development and the land grant. A double-tap on the
 * map, or the corner button, toggles between the whole colony and your own land.
 * A single tap still only selects a plot: nothing is sent to the server, nobody
 * walks. With no plots of your own there is nothing to zoom to, so the button is
 * hidden and a double-tap does nothing.
 */

export type ZoomPhase = 'develop' | 'grant';

/** Two taps this close in time and space are a double-tap. */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP = 24;

/** Your plots plus a ring of one plot around them, grown to the map's shape and kept inside it. */
export function zoomBox(tiles: MapTile[], width: number, height: number, slot: number) {
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

/** The map, fitted to the main area, with the zoom applied and the corner button over it. */
function ZoomableMap({ tiles, startZoomed, cursor, onTile, selected }: { tiles: MapTile[]; startZoomed: boolean; cursor?: { x: number; y: number }; onTile?: (t: MapTile) => void; selected?: { x: number; y: number } | null }) {
  const box = zoomBox(tiles, MAP_W, MAP_H, ME);
  const [zoomed, setZoomed] = useState(startZoomed && box !== null);
  const last = useRef<{ t: number; x: number; y: number } | null>(null);

  const onPointerUp = (e: PointerEvent) => {
    const prev = last.current;
    const near = prev && e.timeStamp - prev.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < DOUBLE_TAP_SLOP;
    if (near) {
      last.current = null;
      if (box) setZoomed((z) => !z);
    } else {
      last.current = { t: e.timeStamp, x: e.clientX, y: e.clientY };
    }
  };

  const on = zoomed && box;
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center [container-type:size]">
      <div className="relative overflow-hidden rounded-panel" style={{ width: `min(100cqw, calc(100cqh * ${MAP_W} / ${MAP_H}))` }} data-testid="map-viewport">
        <div
          className="origin-top-left touch-manipulation transition-transform duration-300 ease-out"
          style={on ? { transform: `scale(${box.scale}) translate(${(-box.x / MAP_W) * 100}%, ${(-box.y / MAP_H) * 100}%)` } : undefined}
          onPointerUp={onPointerUp}
          data-testid="map"
          data-zoomed={on ? 'yes' : 'no'}
        >
          <HoloMap width={MAP_W} height={MAP_H} tiles={tiles} focusSlot={ME} {...(cursor ? { cursor } : {})} {...(onTile ? { onTile } : {})} selected={selected ?? null} />
        </div>
        {box && (
          <button
            type="button"
            onClick={() => setZoomed((z) => !z)}
            aria-pressed={zoomed}
            aria-label={zoomed ? 'Show the whole colony' : 'Zoom to your land'}
            className="absolute right-1.5 top-1.5 flex size-11 items-center justify-center rounded-control border border-holo-line bg-panel/85 text-ink shadow-glow backdrop-blur-sm hover:border-holo"
            data-testid="zoom-button"
          >
            <ZoomGlyph zoomed={zoomed} />
          </button>
        )}
      </div>
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-snug text-ink-3">{children}</p>;
}

/** Development with zoom. `noPlots` is the start of the game: nothing of your own yet. */
export function PhoneDevelopZoom({ zoomed, noPlots = false }: { zoomed: boolean; noPlots?: boolean }) {
  const tiles = noPlots ? baseTiles().map((t) => (t.owner === ME ? { ...t, owner: null } : t)) : baseTiles();
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(noPlots ? null : { x: 9, y: 2 });
  const tile = selected ? tiles.find((t) => t.x === selected.x && t.y === selected.y) : undefined;
  const me = seat(ME);
  return (
    <LandShell
      month={noPlots ? 1 : 4}
      phase="Development"
      seconds={34}
      me={me}
      money={me.money}
      fill
      rail={
        <>
          {tile ? (
            <div className="flex flex-col gap-1 rounded-panel border border-holo-line bg-panel p-2.5" data-testid="selected-plot">
              <span className="label-caps">Plot {tile.x + 1}·{tile.y + 1}</span>
              <span className="font-display text-lg font-semibold">{TERRAIN_NAME[tile.terrain]}</span>
              <span className="text-sm text-ink-2">{tile.owner === ME ? (tile.good ? 'Yours · working' : 'Yours · waiting for a MULE') : tile.owner === null ? 'Free' : 'Taken'}</span>
            </div>
          ) : (
            <span className="text-sm text-ink-2">Tap a plot to see it.</span>
          )}
          <Hint>{noPlots ? 'No land yet. Claim a plot in the land grant, then you can zoom to it.' : 'Double-tap the map, or tap the corner button, to zoom to your land and back.'}</Hint>
          <Button size="md" disabled={!tile || tile.owner !== ME} data-testid="install">
            Install MULE here
          </Button>
        </>
      }
      footer={
        <Button size="md" variant="ghost" className="w-full" data-testid="pub">
          Pub · end turn
        </Button>
      }
    >
      <ZoomableMap tiles={tiles} startZoomed={zoomed} onTile={(t) => setSelected({ x: t.x, y: t.y })} selected={selected} />
    </LandShell>
  );
}

/** The land grant with zoom: the cursor sweeps; you claim with the button, so the map takes no taps. */
export function PhoneGrantZoom({ zoomed }: { zoomed: boolean }) {
  const me = seat(ME);
  const cursor = { x: 11, y: 2 };
  const tiles = baseTiles();
  const lit = tiles.find((t) => t.x === cursor.x && t.y === cursor.y)!;
  return (
    <LandShell
      month={4}
      phase="Land grant"
      seconds={41}
      me={me}
      money={me.money}
      fill
      rail={
        <>
          <span className="label-caps">Lit now</span>
          <span className="font-display text-xl font-semibold">
            {TERRAIN_NAME[lit.terrain]} <span className="font-mono text-base text-ink-3">{cursor.x + 1}·{cursor.y + 1}</span>
          </span>
          <Hint>Double-tap the map to zoom to your land; the cursor keeps sweeping the whole colony.</Hint>
        </>
      }
      footer={
        <button type="button" className={cx('flex h-24 flex-col items-center justify-center gap-0.5 rounded-sheet bg-holo font-display text-on-holo shadow-glow')} data-testid="claim">
          <span className="text-4xl font-bold tracking-wide">CLAIM</span>
          <span className="font-mono text-xs font-bold">1 OF 2 CLAIMS LEFT</span>
        </button>
      }
    >
      <ZoomableMap tiles={tiles} startZoomed={zoomed} cursor={cursor} />
    </LandShell>
  );
}
