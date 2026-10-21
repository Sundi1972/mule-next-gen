import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { GoodIcon } from './GoodIcon';
import { HoloMap, type MapTile } from './HoloMap';
import { cx, SLOT_COLOR, type Good, type Slot } from './tokens';

/**
 * The production show: plots fill with one bar per unit in their owner's colour,
 * badges say why, the month's event plays over the map, then every plot's goods
 * fly home to the element marked `data-fly-target=<owner>`. A pure function of the clock `t`.
 */

/** How each event plays on the map; every kind has its own layer below. */
export type EventKind = 'storm' | 'drought' | 'flare' | 'comet' | 'flood' | 'quake' | 'blight' | 'fire' | 'bounty';
export type ShowReason = 'cluster' | 'species' | 'trait' | 'pollution' | 'noEnergy' | 'noWater';

export interface ShowLine {
  x: number;
  y: number;
  owner: string;
  good: Good;
  /** Units before the event. */
  made: number;
  parts: { why: ShowReason; delta: number }[];
}

export interface ShowEvent {
  kind: EventKind;
  title: string;
  line: string;
  sign: 'good' | 'bad' | 'mixed';
  origin: { x: number; y: number };
  from?: 'n' | 'e' | 's' | 'w';
  hits: { x: number; y: number; order: number; delta: number }[];
}

export interface ShowData {
  /** In reading order, the order they fill. */
  lines: ShowLine[];
  events: ShowEvent[];
  /** How long the phase runs, in ms: the whole timeline plays over it. */
  lengthMs: number;
}

type Hit = ShowEvent['hits'][number];

// --- The timeline, in show seconds: 0 at the phase's start, SHOW.end at its scheduled end ---

export const SHOW = {
  fillStart: 0.6,
  fillStep: 0.12,
  cardAt: 4.0,
  eventAt: 4.8,
  flyStart: 9.6,
  flyStep: 0.09,
  flight: 0.9,
  end: 15,
} as const;

export const fillAt = (i: number) => SHOW.fillStart + i * SHOW.fillStep;
export const flyAt = (i: number) => SHOW.flyStart + i * SHOW.flyStep;

/** Where the show is, from how much of the phase's scheduled length has passed on the server's clock. */
export function showTime(phaseEndsAt: number | null, serverNow: number, lengthMs: number): number {
  if (phaseEndsAt === null || lengthMs <= 0) return SHOW.end;
  const done = 1 - (phaseEndsAt - serverNow) / lengthMs;
  return Math.min(SHOW.end, Math.max(0, done * SHOW.end));
}

/** How often a screen redraws the show: 40 ms over a 15 s phase, more often over a shorter one, so a short-lived badge still gets drawn. */
export const frameMs = (lengthMs: number) => Math.min(40, Math.max(16, lengthMs / 375));

/** The latest a hit may land, so a plot's goods never fly before the event has reached it. */
const LAST_HIT = SHOW.flyStart - 0.5;

/** How far a sweep has to travel to reach a plot, 0 at its edge to 1 at the far one. */
function sweep(ev: ShowEvent, hit: Hit, width: number, height: number): number {
  switch (ev.from ?? 'w') {
    case 'w':
      return hit.x / width;
    case 'e':
      return (width - 1 - hit.x) / width;
    case 'n':
      return hit.y / height;
    case 's':
      return (height - 1 - hit.y) / height;
  }
}

/** When the event reaches a plot: a storm as its front passes, a drought by distance, a quake all at once, the rest in order. */
export function hitAt(ev: ShowEvent, hit: Hit, width: number, height: number): number {
  const at: Record<EventKind, () => number> = {
    storm: () => 0.3 + sweep(ev, hit, width, height) * 3.2,
    quake: () => 0.9,
    flare: () => 0.5 + hit.order * 0.15,
    comet: () => 1.8 + hit.order * 0.25,
    drought: () => 0.5 + Math.hypot(hit.x - ev.origin.x, hit.y - ev.origin.y) * 0.3,
    flood: () => 0.6 + hit.order * 0.6,
    bounty: () => 0.6 + hit.order * 0.4,
    blight: () => 0.4 + hit.order * 1.1,
    fire: () => 0.4 + hit.order * 1.1,
  };
  return Math.min(LAST_HIT, SHOW.eventAt + at[ev.kind]());
}

const hitOn = (ev: ShowEvent | null, line: { x: number; y: number }) => ev?.hits.find((h) => h.x === line.x && h.y === line.y);

/** What a plot makes once the event has hit it. */
export function finalUnits(line: ShowLine, ev: ShowEvent | null): number {
  const hit = hitOn(ev, line);
  return hit ? Math.max(0, line.made + hit.delta) : line.made;
}

/** What has flown home to one player by `t`, per good. */
export function landed(show: ShowData, t: number, owner: string): Partial<Record<Good, number>> {
  const ev = show.events[0] ?? null;
  const out: Partial<Record<Good, number>> = {};
  show.lines.forEach((l, i) => {
    if (l.owner !== owner || t < flyAt(i) + SHOW.flight) return;
    const n = finalUnits(l, ev);
    if (n > 0) out[l.good] = (out[l.good] ?? 0) + n;
  });
  return out;
}

/** One player's whole harvest from the show, per good. */
export function harvest(show: ShowData, owner: string): Partial<Record<Good, number>> {
  return landed(show, Infinity, owner);
}

/** True for a short moment after any of the player's plots lands, to light up where it landed. */
export function landing(show: ShowData, t: number, owner: string): boolean {
  return show.lines.some((l, i) => l.owner === owner && t >= flyAt(i) + SHOW.flight && t < flyAt(i) + SHOW.flight + 0.25);
}

// --- Where the goods fly to -------------------------------------------------------

const RootContext = createContext<RefObject<HTMLDivElement> | null>(null);

/** The box the show looks in for `data-fly-target` elements. */
export function ShowRoot({ children, className, style, ...rest }: { children: ReactNode; className?: string; style?: CSSProperties; 'data-phase'?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <RootContext.Provider value={ref}>
      <div ref={ref} className={cx('relative', className)} style={style} {...rest}>
        {children}
      </div>
    </RootContext.Provider>
  );
}

type Geometry = { size: { w: number; h: number }; to: Record<string, { x: number; y: number }> };

/** Each player's fly target, in the map's own (unscaled) pixels from its top-left corner. */
function useTargets(map: RefObject<HTMLDivElement>, t: number): Geometry | null {
  const root = useContext(RootContext);
  const [geom, setGeom] = useState<Geometry | null>(null);
  const near = t >= SHOW.flyStart - 1;
  useLayoutEffect(() => {
    if (!near || !map.current || !root?.current) return;
    const m = map.current.getBoundingClientRect();
    // A scaled TV frame: measure in screen pixels, move in the map's own.
    const scale = m.width / map.current.offsetWidth || 1;
    const to: Geometry['to'] = {};
    root.current.querySelectorAll<HTMLElement>('[data-fly-target]').forEach((el) => {
      const r = el.getBoundingClientRect();
      to[el.dataset.flyTarget!] = { x: (r.left + r.width / 2 - m.left) / scale, y: (r.top + r.height / 2 - m.top) / scale };
    });
    setGeom({ size: { w: map.current.offsetWidth, h: map.current.offsetHeight }, to });
  }, [near]);
  return geom;
}

// --- The map with the show over it ----------------------------------------------

const signed = (n: number) => (n > 0 ? `+${n}` : `−${-n}`);

const REASON_BADGE: Record<ShowReason, { text: (d: number) => string; tone: (d: number) => string; icon?: Good }> = {
  cluster: { text: signed, tone: (d) => (d > 0 ? 'bg-ok text-on-holo' : 'bg-warn text-void') },
  species: { text: signed, tone: (d) => (d > 0 ? 'bg-ok text-on-holo' : 'bg-warn text-void') },
  trait: { text: signed, tone: (d) => (d > 0 ? 'bg-ok text-on-holo' : 'bg-warn text-void') },
  pollution: { text: signed, tone: () => 'bg-warn text-void' },
  noWater: { text: () => '½', tone: () => 'bg-alert text-white', icon: 'water' },
  noEnergy: { text: () => '½', tone: () => 'bg-alert text-white', icon: 'energy' },
};

export interface ProductionMapProps {
  width: number;
  height: number;
  tiles: MapTile[];
  production: ShowData;
  /** Seconds since the phase started. */
  t: number;
  /** Each owner's colour slot. */
  slots: Record<string, Slot>;
  /** On a phone: only this player's plots fill; the others stay faded. */
  only?: string;
  tv?: boolean;
  className?: string;
}

export function ProductionMap({ width, height, tiles, production, t, slots, only, tv = false, className }: ProductionMapProps) {
  const map = useRef<HTMLDivElement>(null);
  const geom = useTargets(map, t);
  const ev = production.events[0] ?? null;
  const focus = only !== undefined ? slots[only] : undefined;
  const since = t - SHOW.eventAt;
  const quaking = ev?.kind === 'quake' && since > 0.6 && since < 2.4;
  const shake = quaking ? `translate(${Math.sin(t * 70) * (tv ? 4 : 2)}px, ${Math.cos(t * 55) * (tv ? 2 : 1)}px)` : undefined;
  const grid = { width, height };
  // The show redraws every frame; the painted map under it only when the map changes.
  const land = useMemo(
    () => <HoloMap width={width} height={height} tiles={tiles} density={tv ? 'tv' : 'phone'} hideGround {...(focus !== undefined ? { focusSlot: focus } : {})} className="w-full" />,
    [width, height, tiles, tv, focus],
  );

  return (
    <div ref={map} className={cx('relative', className)} style={{ transform: shake }} data-testid="map-show">
      {land}
      {/* Event layers sit over the land, under the bars. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-panel" {...(ev ? { 'data-event': ev.kind } : {})}>
        {ev && <EventLayer ev={ev} t={t} tv={tv} grid={grid} />}
      </div>
      {production.lines.map(
        (l, i) =>
          (only === undefined || l.owner === only) && (
            <PlotBars
              key={`${l.x},${l.y}`}
              line={l}
              index={i}
              t={t}
              ev={ev}
              tv={tv}
              grid={grid}
              colour={SLOT_COLOR[slots[l.owner] ?? 0]}
              target={geom?.to[l.owner]}
              size={geom?.size}
            />
          ),
      )}
    </div>
  );
}

type Grid = { width: number; height: number };

function PlotBars({
  line,
  index,
  t,
  ev,
  tv,
  grid,
  colour,
  target,
  size,
}: {
  line: ShowLine;
  index: number;
  t: number;
  ev: ShowEvent | null;
  tv: boolean;
  grid: Grid;
  colour: string;
  target: { x: number; y: number } | undefined;
  size: { w: number; h: number } | undefined;
}) {
  const filled = t >= fillAt(index);
  const hit = hitOn(ev, line);
  const struckAt = hit && ev ? hitAt(ev, hit, grid.width, grid.height) : Infinity;
  const struck = t >= struckAt;
  const units = struck ? finalUnits(line, ev) : line.made;
  const lost = struck ? line.made - units : 0;
  const struckAgo = struck ? t - struckAt : 0;
  const flying = t >= flyAt(index);
  const gone = t >= flyAt(index) + SHOW.flight;
  const from = size ? { x: ((line.x + 0.5) / grid.width) * size.w, y: ((line.y + 0.5) / grid.height) * size.h } : null;
  const fly = flying && target && from ? `translate(${target.x - from.x}px, ${target.y - from.y}px) scale(0.35)` : 'none';
  // On the phone a bar is outlined so a one-unit plot doesn't blend into its border.
  const bar = tv ? 'h-3.5 w-1.5' : 'h-3 w-1.5 ring-1 ring-void/70';
  const chip = tv ? 'px-1 py-0.5 text-[11px]' : 'px-0.5 text-[9px]';
  const eventBadge = struck && hit!.delta !== 0;
  // The TV has room for two reasons beside the event's badge; the phone for one badge, and the event's wins.
  const reasons = line.parts.slice(0, tv ? 2 : eventBadge ? 0 : 1);

  return (
    <div
      className={cx('pointer-events-none absolute flex flex-col justify-end', tv ? 'p-1' : 'p-0.5')}
      style={{ left: `${(line.x / grid.width) * 100}%`, top: `${(line.y / grid.height) * 100}%`, width: `${100 / grid.width}%`, height: `${100 / grid.height}%` }}
      data-testid={`plot-${line.x}-${line.y}`}
    >
      {filled && !flying && (
        <span className={cx('absolute flex flex-col items-end', tv ? 'right-1 top-1 gap-0.5' : 'right-0.5 top-0.5 gap-px')}>
          {reasons.map((p) => {
            const b = REASON_BADGE[p.why];
            return (
              <span key={p.why} data-badge="reason" className={cx('flex items-center rounded-chip font-mono font-bold leading-none shadow-chip animate-[show-badge-in_0.3s_ease-out]', b.tone(p.delta), tv ? 'gap-0.5' : '', chip)}>
                {b.icon && <GoodIcon good={b.icon} size={tv ? 10 : 6} />}
                {b.text(p.delta)}
              </span>
            );
          })}
          {eventBadge && (
            <span
              data-badge="event"
              className={cx('rounded-chip font-mono font-bold leading-none shadow-chip animate-[show-badge-in_0.3s_ease-out]', hit!.delta > 0 ? 'bg-ok text-on-holo' : 'bg-alert text-white', chip)}
              data-testid={`hit-${line.x}-${line.y}`}
            >
              {signed(hit!.delta)}
            </span>
          )}
        </span>
      )}
      {/* One bar per unit, at most eight; they fly home together. */}
      <span
        className={cx('flex w-fit flex-wrap-reverse items-end', tv ? 'max-w-[44px] gap-[3px]' : 'max-w-[30px] gap-px', gone && 'opacity-0')}
        style={{ transform: fly, transition: flying ? `transform ${SHOW.flight}s cubic-bezier(0.55, 0, 0.75, 0.2), opacity 0.15s ${SHOW.flight - 0.1}s` : 'none', transformOrigin: 'center' }}
      >
        {filled &&
          Array.from({ length: Math.min(units, 8) }, (_, k) => (
            <span key={k} data-bar="unit" className={cx('rounded-[2px] shadow-chip animate-[show-bar-in_0.25s_ease-out_both]', bar)} style={{ background: colour, animationDelay: `${k * 0.04}s` }} />
          ))}
        {/* What the event took, falling away in grey. */}
        {filled &&
          lost > 0 &&
          struckAgo < 0.9 &&
          Array.from({ length: Math.min(lost, 8) }, (_, k) => (
            <span key={`lost-${k}`} data-bar="lost" className={cx('rounded-[2px] bg-ink-3', bar)} style={{ transform: `translateY(${struckAgo * (tv ? 40 : 20)}px)`, opacity: 1 - struckAgo / 0.9 }} />
          ))}
      </span>
    </div>
  );
}

// --- One animation per event kind ---------------------------------------------------

type LayerProps = { ev: ShowEvent; t: number; since: number; tv: boolean; grid: Grid; at: (h: Hit) => number; cell: (x: number, y: number) => CSSProperties };

const LAYERS: Record<EventKind, (p: LayerProps) => ReactNode> = {
  storm: StormLayer,
  quake: QuakeLayer,
  drought: DroughtLayer,
  flare: FlareLayer,
  comet: CometLayer,
  flood: FloodLayer,
  fire: FireLayer,
  bounty: BountyLayer,
  blight: BlightLayer,
};

function EventLayer({ ev, t, tv, grid }: { ev: ShowEvent; t: number; tv: boolean; grid: Grid }) {
  const since = t - SHOW.eventAt;
  if (since < 0 || t >= SHOW.flyStart) return null;
  const Layer = LAYERS[ev.kind];
  const cell = (x: number, y: number): CSSProperties => ({ left: `${(x / grid.width) * 100}%`, top: `${(y / grid.height) * 100}%`, width: `${100 / grid.width}%`, height: `${100 / grid.height}%` });
  return <Layer ev={ev} t={t} since={since} tv={tv} grid={grid} at={(h) => hitAt(ev, h, grid.width, grid.height)} cell={cell} />;
}

/** Where a storm's front stands, as CSS for a band crossing from its edge. */
const STORM_EDGE: Record<NonNullable<ShowEvent['from']>, { side: 'left' | 'right' | 'top' | 'bottom'; span: 'width' | 'height'; angle: number }> = {
  w: { side: 'left', span: 'width', angle: 90 },
  e: { side: 'right', span: 'width', angle: 270 },
  n: { side: 'top', span: 'height', angle: 180 },
  s: { side: 'bottom', span: 'height', angle: 0 },
};

function StormLayer({ ev, t, since, at, cell }: LayerProps) {
  // A wall of dust blows in from its edge and out the far side, over about 3.6 s.
  const p = Math.min(1, since / 3.6);
  const front = -45 + p * 145;
  const edge = STORM_EDGE[ev.from ?? 'w'];
  const band = (offset: number, span: string): CSSProperties =>
    edge.span === 'width' ? { top: 0, bottom: 0, [edge.side]: `${offset}%`, width: span } : { left: 0, right: 0, [edge.side]: `${offset}%`, height: span };
  return (
    <>
      <div className="absolute inset-0 bg-warn/15" style={{ opacity: p >= 1 ? 0 : Math.min(1, since * 2) }} />
      <div
        className="absolute"
        style={{
          ...band(front, '45%'),
          background: `linear-gradient(${edge.angle}deg, transparent, color-mix(in srgb, var(--color-warn) 75%, transparent) 35%, color-mix(in srgb, var(--color-warn) 60%, transparent) 70%, transparent)`,
          filter: 'blur(6px)',
          opacity: p >= 1 ? 0 : 1,
        }}
        data-testid="storm-front"
      />
      {/* Streaks of blown sand, racing ahead of the front. */}
      <div
        className="absolute animate-[show-dust-drift_0.5s_linear_infinite]"
        style={{
          ...band(front - 5, '55%'),
          background: `repeating-linear-gradient(${edge.angle + 10}deg, transparent 0 14px, color-mix(in srgb, var(--color-warn) 55%, white) 14px 16px, transparent 16px 30px)`,
          maskImage: `linear-gradient(${edge.angle}deg, transparent, black 30%, black 70%, transparent)`,
          opacity: p >= 1 ? 0 : 0.7,
        }}
      />
      {ev.hits.map((h) => t >= at(h) && <div key={`${h.x},${h.y}`} className="absolute bg-void/35" style={cell(h.x, h.y)} />)}
    </>
  );
}

function QuakeLayer({ ev, since, tv, grid, cell }: LayerProps) {
  // Rings run out from the centre; the centre flashes and cracks.
  const o = ev.origin;
  const rings = [0, 0.35, 0.7].map((d) => since - d).filter((s) => s > 0 && s < 1.8);
  return (
    <>
      {rings.map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full border-alert"
          style={{
            left: `${((o.x + 0.5) / grid.width) * 100}%`,
            top: `${((o.y + 0.5) / grid.height) * 100}%`,
            width: `${s * 70}%`,
            aspectRatio: '1',
            transform: 'translate(-50%, -50%)',
            borderWidth: tv ? 4 : 2,
            opacity: 1 - s / 1.8,
          }}
        />
      ))}
      {since > 0.9 && (
        <div className="absolute animate-[show-crack-flash_0.5s_ease-out_3] bg-alert/45" style={cell(o.x, o.y)} data-testid="quake-hit">
          <svg viewBox="0 0 10 10" className="h-full w-full" aria-hidden>
            <path d="M1 2 L4 4 L3 6 L6 7 L5 9 M4 4 L7 3 L9 1" fill="none" stroke="var(--color-void)" strokeWidth="0.6" />
          </svg>
        </div>
      )}
    </>
  );
}

function DroughtLayer({ ev, t, since, at, cell }: LayerProps) {
  // The land bleaches and shimmers; each plot it reaches cracks.
  return (
    <>
      <div
        className="absolute inset-0 animate-[show-shimmer_0.8s_ease-in-out_infinite_alternate]"
        style={{ background: 'radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--color-warn) 55%, transparent), color-mix(in srgb, var(--color-warn) 30%, transparent) 75%)', opacity: Math.min(1, since * 1.5) }}
      />
      {ev.hits.map((h) => t >= at(h) && <Cracks key={`${h.x},${h.y}`} style={cell(h.x, h.y)} />)}
    </>
  );
}

function FlareLayer({ ev, t, since, at, cell }: LayerProps) {
  // A white flash from the sky, then each plant it reaches glows hot.
  return (
    <>
      <div className="absolute inset-0 bg-white" style={{ opacity: Math.max(0, 0.7 - since * 1.2) }} />
      {ev.hits.map(
        (h) =>
          t >= at(h) && (
            <div
              key={`${h.x},${h.y}`}
              className="absolute animate-[pulse-glow_1s_ease-in-out_infinite] rounded-[14%]"
              style={{ ...cell(h.x, h.y), background: 'radial-gradient(circle, color-mix(in srgb, var(--color-g-energy) 70%, white) 0 25%, transparent 70%)' }}
            />
          ),
      )}
    </>
  );
}

function CometLayer({ ev, t, since, at, cell }: LayerProps) {
  // A comet crosses the sky corner to corner; ice from its tail sparkles down on the plots it feeds.
  const p = Math.min(1, since / 1.6);
  return (
    <>
      {p < 1 && (
        <div
          className="absolute h-[3%] w-[45%] rounded-full"
          style={{ left: `${-40 + p * 140}%`, top: `${-10 + p * 70}%`, transform: 'rotate(25deg)', background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-holo) 60%, white) 80%, white)', filter: 'blur(1px)' }}
          data-testid="comet"
        />
      )}
      {ev.hits.map((h) => t >= at(h) - 0.3 && <Sparkles key={`${h.x},${h.y}`} style={cell(h.x, h.y)} colour="var(--color-g-water)" />)}
    </>
  );
}

function FloodLayer({ ev, t, at, cell }: LayerProps) {
  // Water rises over each plot in the order the river reaches it.
  return (
    <>
      {ev.hits.map((h) => {
        const s = t - at(h) + 0.5;
        if (s < 0) return null;
        return (
          <div key={`${h.x},${h.y}`} className="absolute overflow-hidden" style={cell(h.x, h.y)} data-testid={`flood-${h.x}-${h.y}`}>
            <div
              className="absolute inset-x-0 bottom-0 animate-[show-dust-drift_1.2s_linear_infinite]"
              style={{
                height: `${Math.min(85, s * 90)}%`,
                background: 'repeating-linear-gradient(170deg, color-mix(in srgb, var(--color-g-water) 70%, transparent) 0 6px, color-mix(in srgb, var(--color-g-water) 50%, transparent) 6px 10px)',
              }}
            />
          </div>
        );
      })}
    </>
  );
}

function FireLayer({ ev, t, at, cell }: LayerProps) {
  // Flames take one plot, then jump to the next; burnt plots stay dark.
  return (
    <>
      {ev.hits.map((h) => {
        const s = t - at(h) + 0.4;
        if (s < 0) return null;
        return (
          <div key={`${h.x},${h.y}`} className="absolute" style={cell(h.x, h.y)} data-testid={`fire-${h.x}-${h.y}`}>
            <div className="absolute inset-0 rounded-[14%] bg-void" style={{ opacity: Math.min(0.55, s * 0.4) }} />
            {s < 1.6 && (
              <div
                className="absolute inset-[8%] animate-[show-flicker_0.18s_ease-in-out_infinite_alternate] rounded-[40%_40%_20%_20%]"
                style={{ background: 'radial-gradient(circle at 50% 80%, color-mix(in srgb, var(--color-warn) 90%, white) 0 20%, var(--color-alert) 45%, transparent 75%)' }}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

function BountyLayer({ ev, t, at, cell }: LayerProps) {
  // A golden glow wells up on each lucky plot, with a few sparkles.
  return (
    <>
      {ev.hits.map(
        (h) =>
          t >= at(h) - 0.3 && (
            <div key={`${h.x},${h.y}`} className="absolute" style={cell(h.x, h.y)}>
              <div className="absolute inset-0 animate-[pulse-glow_1.2s_ease-in-out_infinite] rounded-[14%]" style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--color-warn) 55%, transparent), transparent 70%)' }} />
              <Sparkles style={{ inset: 0 }} colour="var(--color-warn)" />
            </div>
          ),
      )}
    </>
  );
}

function BlightLayer({ ev, t, tv, grid, at, cell }: LayerProps) {
  // Brown spots grow on each plot in the order the pests reach it, with a trail between them.
  const hits = [...ev.hits].sort((a, b) => a.order - b.order);
  return (
    <>
      {hits.map((h, i) => {
        const s = t - (at(h) - 0.4);
        if (s < 0) return null;
        const prev = hits[i - 1];
        return (
          <div key={`${h.x},${h.y}`}>
            {prev && (
              <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${grid.width} ${grid.height}`} preserveAspectRatio="none" aria-hidden>
                <line
                  x1={prev.x + 0.5}
                  y1={prev.y + 0.5}
                  x2={prev.x + 0.5 + (h.x - prev.x) * Math.min(1, s / 0.4)}
                  y2={prev.y + 0.5 + (h.y - prev.y) * Math.min(1, s / 0.4)}
                  stroke="color-mix(in srgb, var(--color-g-food) 45%, var(--color-warn))"
                  strokeWidth={tv ? 0.08 : 0.06}
                  strokeDasharray="0.12 0.12"
                />
              </svg>
            )}
            <div
              className="absolute"
              style={{
                ...cell(h.x, h.y),
                background: `radial-gradient(circle at 38% 42%, color-mix(in srgb, var(--color-warn) 65%, var(--color-void)) 0 ${Math.min(34, s * 50)}%, transparent ${Math.min(62, s * 80)}%), radial-gradient(circle at 72% 68%, color-mix(in srgb, var(--color-warn) 55%, var(--color-void)) 0 ${Math.min(24, s * 35)}%, transparent ${Math.min(46, s * 60)}%)`,
              }}
              data-testid={`blight-${h.x}-${h.y}`}
            >
              {/* The swarm itself: a few dark specks crawling while it eats. */}
              {s < 2.2 &&
                [18, 34, 52, 66, 80].map((left, k) => (
                  <span
                    key={k}
                    aria-hidden
                    className="absolute size-[7%] rounded-full bg-void animate-[show-crawl_0.5s_ease-in-out_infinite_alternate]"
                    style={{ left: `${left}%`, top: `${30 + ((k * 23) % 45)}%`, animationDelay: `${k * 0.1}s` }}
                  />
                ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function Cracks({ style }: { style: CSSProperties }) {
  return (
    <svg className="absolute animate-[show-badge-in_0.4s_ease-out]" style={style} viewBox="0 0 10 10" aria-hidden>
      <path d="M1 3 L3 4 L4 2 L6 4 L9 3 M3 4 L3 7 L5 8 L7 6 L9 8 M6 4 L7 6" fill="none" stroke="color-mix(in srgb, var(--color-warn) 60%, var(--color-void))" strokeWidth="0.45" />
    </svg>
  );
}

const SPARKS = [
  [22, 28],
  [64, 20],
  [44, 56],
  [76, 62],
  [30, 74],
] as const;

function Sparkles({ style, colour }: { style: CSSProperties; colour: string }) {
  return (
    <div className="absolute" style={style} aria-hidden>
      {SPARKS.map(([l, tp], k) => (
        <span key={k} className="absolute size-[9%] rotate-45 animate-[show-twinkle_0.7s_ease-in-out_infinite_alternate]" style={{ left: `${l}%`, top: `${tp}%`, background: colour, animationDelay: `${k * 0.13}s` }} />
      ))}
    </div>
  );
}

// --- The event card -----------------------------------------------------------------

/** The month's event in words, from when the show calls it up. */
export function EventCard({ ev, t, tv = false }: { ev: ShowEvent | null; t: number; tv?: boolean }) {
  if (!ev || t < SHOW.cardAt) return null;
  const good = ev.sign === 'good';
  return (
    <div
      className={cx('flex flex-col gap-1 rounded-panel border-2 animate-[show-card-in_0.4s_ease-out]', good ? 'border-ok bg-holo-soft shadow-glow' : 'border-alert bg-alert-bg shadow-glow-alert', tv ? 'p-5' : 'px-2.5 py-2')}
      data-testid="event-card"
    >
      <span className={cx('label-caps', good ? 'text-ok!' : 'text-alert-ink!', tv ? 'text-base!' : '')}>{good ? 'Good news' : 'Event'}</span>
      <span className={cx('font-display font-bold leading-none', good ? 'text-ok' : 'text-alert-ink', tv ? 'text-5xl' : 'text-xl')}>{ev.title}!</span>
      <span className={cx('leading-snug', tv ? 'text-2xl' : 'text-xs')}>{ev.line}</span>
    </div>
  );
}
