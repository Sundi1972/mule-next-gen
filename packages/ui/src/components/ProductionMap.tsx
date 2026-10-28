import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { eventHitAt, EventLivingMap, EventShow, type EventSegment, type ShowEventView, type ShowMode, type ShowPlayer } from '../events';
import { useShow } from '../events/frame';
import { GoodIcon } from './GoodIcon';
import type { MapTile } from './HoloMap';
import { cx, SLOT_COLOR, type Good, type Slot } from './tokens';

/**
 * The production show: plots fill with one bar per unit in their owner's colour, badges say why, every event of the
 * month plays over the map in the order it fired (the Living weather module), then every plot's goods fly home to the
 * element marked `data-fly-target=<owner>`. A pure function of the clock `t`.
 */

/** The old per-kind look of an event: kept for the view's `kind`; the show draws by the event's key. */
export type EventKind = 'storm' | 'drought' | 'flare' | 'comet' | 'flood' | 'quake' | 'blight' | 'fire' | 'bounty';
export type ShowReason = 'cluster' | 'species' | 'trait' | 'pollution' | 'noEnergy' | 'noWater';

export interface ShowLine {
  x: number;
  y: number;
  owner: string;
  good: Good;
  /** Units before the events. */
  made: number;
  parts: { why: ShowReason; delta: number }[];
}

export interface ShowData {
  /** In reading order, the order they fill. */
  lines: ShowLine[];
  /** In the order they fired; each plays for its `playMs`. */
  events: ShowEventView[];
  /** How long the phase runs, in ms: the whole timeline plays over it. */
  lengthMs: number;
  /** How long the phase's intro plays before the first event, in ms: 0 in a quiet month. */
  introMs: number;
}

/** The lengths the server sent, all the timeline reads of a show. */
interface Lengths {
  events: readonly Pick<ShowEventView, 'playMs'>[];
  introMs: number;
}
const QUIET: Lengths = { events: [], introMs: 0 };

// --- The timeline, in show seconds: 0 at the phase's start, its end at the phase's scheduled end ---

/** A quiet month's timeline. With events, the window from `eventAt` grows to their length and everything after it moves. */
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

/** How long the events play, in seconds: the server's intro and lengths back to back, never shorter than a quiet month's window. */
export function eventWindow({ events, introMs }: Lengths = QUIET): number {
  const ms = events.reduce((n, e) => n + Math.max(0, e.playMs), Math.max(0, introMs));
  return Math.max(SHOW.flyStart - SHOW.eventAt, ms / 1000);
}

/** How much later than a quiet month the goods fly and the show ends. */
const later = (show: Lengths) => eventWindow(show) - (SHOW.flyStart - SHOW.eventAt);

export const fillAt = (i: number) => SHOW.fillStart + i * SHOW.fillStep;
export const flyAt = (i: number, show: Lengths = QUIET) => SHOW.flyStart + later(show) + i * SHOW.flyStep;
/** When the show ends: the phase's scheduled end. */
export const showEnd = (show: Lengths = QUIET) => SHOW.end + later(show);

/**
 * Where the show is, from how much of the phase's scheduled length has passed on the server's clock. The server's
 * length is the same timeline in ms (times the phase scale), so the share passed maps straight onto it.
 */
export function showTime(phaseEndsAt: number | null, serverNow: number, lengthMs: number, show: Lengths = QUIET): number {
  const end = showEnd(show);
  if (phaseEndsAt === null || lengthMs <= 0) return end;
  const done = 1 - (phaseEndsAt - serverNow) / lengthMs;
  return Math.min(end, Math.max(0, done * end));
}

/** How often a screen redraws the show: 40 ms over a 15 s phase, more often over a shorter one, so a short-lived badge still gets drawn. */
export const frameMs = (lengthMs: number) => Math.min(40, Math.max(16, lengthMs / 375));

/** Each event's hit on one plot, in fired order. */
function hitsOn(events: ShowEventView[], line: { x: number; y: number }) {
  return events.flatMap((ev) => ev.hits.filter((h) => h.x === line.x && h.y === line.y).map((h) => ({ ev, h })));
}

/** What a plot makes once every event has reached it: each delta in turn, never below 0. */
export function finalUnits(line: ShowLine, events: ShowEventView[]): number {
  return hitsOn(events, line).reduce((n, { h }) => Math.max(0, n + h.delta), line.made);
}

/** What has flown home to one player by `t`, per good. */
export function landed(show: ShowData, t: number, owner: string): Partial<Record<Good, number>> {
  const out: Partial<Record<Good, number>> = {};
  show.lines.forEach((l, i) => {
    if (l.owner !== owner || t < flyAt(i, show) + SHOW.flight) return;
    const n = finalUnits(l, show.events);
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
  return show.lines.some((l, i) => {
    const at = flyAt(i, show) + SHOW.flight;
    return l.owner === owner && t >= at && t < at + 0.25;
  });
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
function useTargets(map: RefObject<HTMLDivElement>, t: number, flyStart: number): Geometry | null {
  const root = useContext(RootContext);
  const [geom, setGeom] = useState<Geometry | null>(null);
  const near = t >= flyStart - 1;
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
  /** Who is who, for the events' words and spotlights. Without it, each owner in `slots` by id. */
  players?: ShowPlayer[];
  /** On a phone: only this player's plots fill; the others stay faded. */
  only?: string;
  tv?: boolean;
  /** Reduced motion: no camera and no sweeping motion; every result is still shown. */
  reduced?: boolean;
  /** The events' pace: the TV's, or a phone's with no TV in the room. */
  mode?: ShowMode;
  className?: string;
}

/** How long before the goods fly the bars leave the map's camera frame, so they can fly past its edge. */
const HANDOFF = 0.2;

export function ProductionMap({ width, height, tiles, production, t, slots, players, only, tv = false, reduced = false, mode = 'tv', className }: ProductionMapProps) {
  const map = useRef<HTMLDivElement>(null);
  const { events } = production;
  const flyStart = flyAt(0, production);
  const geom = useTargets(map, t, flyStart);
  const focus = only !== undefined ? slots[only] : undefined;
  const cast = useMemo(() => players ?? Object.entries(slots).map(([id, slot]) => ({ id, slot, name: id })), [players, slots]);
  const bars = production.lines.map(
    (l, i) =>
      (only === undefined || l.owner === only) && (
        <PlotBars
          key={`${l.x},${l.y}`}
          line={l}
          index={i}
          t={t}
          flyAt={flyAt(i, production)}
          tv={tv}
          colour={SLOT_COLOR[slots[l.owner] ?? 0]}
          target={geom?.to[l.owner]}
          size={geom?.size}
        />
      ),
  );
  // While events play the bars sit in the map's frame, under the stories and moving with the camera; the frame clips,
  // so they leave it just before they fly.
  const framed = events.length > 0 && t < flyStart - HANDOFF;

  return (
    <div ref={map} className={cx('relative', className)} data-testid="map-show">
      {/* The bars render inside the show, so they read the very script the module draws the events with. */}
      <EventShow events={events} introMs={production.introMs} t={t} start={SHOW.eventAt} mode={mode} reduced={reduced} width={width} height={height} tiles={tiles} players={cast}>
        <EventLivingMap size={tv ? 'tv' : 'phone'} {...(focus !== undefined ? { focusSlot: focus } : {})} {...(framed ? { bars } : {})} />
        {!framed && <div className="pointer-events-none absolute inset-0">{bars}</div>}
      </EventShow>
    </div>
  );
}

type Grid = { width: number; height: number };

/** One event reaching a plot: when, and its units before and after. */
interface Strike {
  at: number;
  delta: number;
  before: number;
  after: number;
}

/** RULE-2: from `made`, each event's delta in fired order as it lands, never below 0 (a delta of 0 still reaches it). */
function strikesOn(segments: EventSegment[], line: ShowLine, reduced: boolean, grid: Grid): Strike[] {
  let units = line.made;
  return segments.flatMap((seg) =>
    seg.events.flatMap((ev) =>
      ev.hits
        .filter((h) => h.x === line.x && h.y === line.y)
        .map((h) => {
          const before = units;
          units = Math.max(0, units + h.delta);
          return { at: eventHitAt(seg, ev, h, reduced, grid), delta: h.delta, before, after: units };
        }),
    ),
  );
}

function PlotBars({
  line,
  index,
  t,
  flyAt: flyStart,
  tv,
  colour,
  target,
  size,
}: {
  line: ShowLine;
  index: number;
  t: number;
  flyAt: number;
  tv: boolean;
  colour: string;
  target: { x: number; y: number } | undefined;
  size: { w: number; h: number } | undefined;
}) {
  const { s, reduced, grid } = useShow();
  const strikes = strikesOn(s.segments, line, reduced, grid);
  const filled = t >= fillAt(index);
  // Once the bars have grown in, they stop animating: moving them out of the map's frame must not grow them again.
  const grown = t >= fillAt(index) + 0.6;
  const struck = strikes.filter((s) => t >= s.at);
  const last = struck.at(-1);
  const units = last ? last.after : line.made;
  const lost = last ? last.before - last.after : 0;
  const struckAgo = last ? t - last.at : 0;
  const flying = t >= flyStart;
  const gone = t >= flyStart + SHOW.flight;
  const from = size ? { x: ((line.x + 0.5) / grid.width) * size.w, y: ((line.y + 0.5) / grid.height) * size.h } : null;
  const fly = flying && target && from ? `translate(${target.x - from.x}px, ${target.y - from.y}px) scale(0.35)` : 'none';
  // On the phone a bar is outlined so a one-unit plot doesn't blend into its border.
  const bar = tv ? 'h-3.5 w-1.5' : 'h-3 w-1.5 ring-1 ring-void/70';
  const chip = tv ? 'px-1 py-0.5 text-[11px]' : 'px-0.5 text-[9px]';
  // An event's chip on the plot (the module's marks): the TV keeps two reasons beside it; the phone has room for one
  // badge, and the event's wins.
  const chipped = struck.some((x) => x.delta !== 0);
  const reasons = line.parts.slice(0, tv ? 2 : chipped ? 0 : 1);

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
        </span>
      )}
      {/* One bar per unit, at most eight; they fly home together. */}
      <span
        className={cx('flex w-fit flex-wrap-reverse items-end', tv ? 'max-w-[44px] gap-[3px]' : 'max-w-[30px] gap-px', gone && 'opacity-0')}
        style={{ transform: fly, transition: flying ? `transform ${SHOW.flight}s cubic-bezier(0.55, 0, 0.75, 0.2), opacity 0.15s ${SHOW.flight - 0.1}s` : 'none', transformOrigin: 'center' }}
      >
        {filled &&
          Array.from({ length: Math.min(units, 8) }, (_, k) => (
            <span key={k} data-bar="unit" className={cx('rounded-[2px] shadow-chip', !grown && 'animate-[show-bar-in_0.25s_ease-out_both]', bar)} style={{ background: colour, animationDelay: `${k * 0.04}s` }} />
          ))}
        {/* What the last event took, falling away in grey: never with reduced motion. */}
        {filled &&
          !reduced &&
          lost > 0 &&
          struckAgo < 0.9 &&
          Array.from({ length: Math.min(lost, 8) }, (_, k) => (
            <span key={`lost-${k}`} data-bar="lost" className={cx('rounded-[2px] bg-ink-3', bar)} style={{ transform: `translateY(${struckAgo * (tv ? 40 : 20)}px)`, opacity: 1 - struckAgo / 0.9 }} />
          ))}
      </span>
    </div>
  );
}

// --- The event card -----------------------------------------------------------------

/** The month's event in words, from when the show calls it up. */
export function EventCard({ ev, t, tv = false }: { ev: Pick<ShowEventView, 'title' | 'line' | 'sign'> | null; t: number; tv?: boolean }) {
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
