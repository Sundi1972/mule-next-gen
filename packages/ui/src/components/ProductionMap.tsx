import { PRODUCTION_SHOW } from '@mule/engine';
import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import {
  EventBoundary,
  EventLivingMap,
  EventShow,
  eventSegments,
  plotStrikes,
  plotUnitsAt,
  useEnclosingEventShow,
  useEventShow,
  type EventShowProps,
  type ShowEventView,
  type ShowMode,
  type ShowPlayer,
} from '../events';
import { GoodIcon } from './GoodIcon';
import { HoloMap, type MapTile } from './HoloMap';
import { cx, SLOT_COLOR, type Good, type Slot } from './tokens';

/**
 * The production show in Heiko's order C (ws6-ux spec AM-19, RULE-3): good by good, every player's plots of that good
 * light and count up at once while the rest wait dark; then every bonus lands at once; then every loss at once; then
 * the month's events play over the map (the Living weather module); then each plot's goods fly as one chip into its
 * owner's silo, the element marked `data-fly-target=<owner>`. A pure function of the clock `t`.
 */

/** Why a plot's output moved from its base. The view may carry reasons this list lacks: they still show by sign. */
export type ShowReason = 'cluster' | 'species' | 'trait' | 'pollution' | 'noEnergy' | 'energyOff' | 'noWater' | 'special' | 'floor' | (string & {});

export interface ShowLine {
  x: number;
  y: number;
  owner: string;
  good: Good;
  /** What the plot makes before any bonus or loss; without it, made less every part. */
  base?: number;
  /** Units before the events: base plus every part. */
  made: number;
  parts: { why: ShowReason; delta: number }[];
}

/** Who has tapped Speed up, and the show second the rest went fast at (null until every person asked). */
export interface ShowHurry {
  asked: string[];
  from: number | null;
}

export interface ShowData {
  /** In reading order. */
  lines: ShowLine[];
  /** In the order they fired; each plays for its `playMs`. */
  events: ShowEventView[];
  /** How long the phase runs, in ms at full pace: the server's productionShowMs. */
  lengthMs: number;
  /** How long the events' intro plays before the first event, in ms: 0 in a quiet month. */
  introMs: number;
  hurry?: ShowHurry | null;
}

/** RULE-3's lengths in seconds, from the engine's PRODUCTION_SHOW: the same numbers the server sets the phase by. */
export const SHOW = {
  intro: PRODUCTION_SHOW.introMs / 1000,
  goodBeat: PRODUCTION_SHOW.goodBeatMs / 1000,
  unitStep: PRODUCTION_SHOW.unitStepMs / 1000,
  allAtOnce: PRODUCTION_SHOW.allAtOnceMs / 1000,
  gap: PRODUCTION_SHOW.gapMs / 1000,
  flights: PRODUCTION_SHOW.flightsMs / 1000,
  flightEase: PRODUCTION_SHOW.flightEase,
  flight: PRODUCTION_SHOW.flightMs / 1000,
  hold: PRODUCTION_SHOW.holdMs / 1000,
  fast: PRODUCTION_SHOW.fast,
  order: PRODUCTION_SHOW.order as readonly Good[],
} as const;

export const baseOf = (l: ShowLine) => l.base ?? l.made - l.parts.reduce((n, p) => n + p.delta, 0);

/** The show's act times, in show seconds. */
export interface ShowTimes {
  /** The goods made, in harvest order, and when each one's turn starts. */
  goods: Good[];
  goodAt: Partial<Record<Good, number>>;
  bonusAt: number;
  lossAt: number;
  /** When the month's events start, or null in a quiet month. */
  eventsAt: number | null;
  flightAt: number;
  /** When line i (its index in `lines`) takes off for its silo. */
  flyAt: (i: number) => number;
  holdAt: number;
  end: number;
}

const TIMES = new WeakMap<object, ShowTimes>();

/**
 * RULE-3 for one month. The engine's productionShow is the same formula over the same values, and the server's
 * length comes from it; T-AC-14 pins the two together (the design system takes data from the engine, never rules).
 */
export function showTimes(show: Pick<ShowData, 'lines' | 'events' | 'introMs'>): ShowTimes {
  const cached = TIMES.get(show);
  if (cached) return cached;
  const goods = SHOW.order.filter((g) => show.lines.some((l) => l.good === g));
  const goodAt = Object.fromEntries(goods.map((g, i) => [g, SHOW.intro + i * SHOW.goodBeat])) as Partial<Record<Good, number>>;
  const bonusAt = SHOW.intro + goods.length * SHOW.goodBeat + SHOW.gap;
  const lossAt = bonusAt + SHOW.allAtOnce;
  const lossEnd = lossAt + SHOW.allAtOnce;
  const eventsMs = show.events.length > 0 ? show.events.reduce((n, e) => n + Math.max(0, e.playMs), Math.max(0, show.introMs)) : 0;
  const eventsAt = eventsMs > 0 ? lossEnd + SHOW.gap : null;
  const flightAt = (eventsAt !== null ? eventsAt + eventsMs / 1000 : lossEnd) + SHOW.gap;
  // The goods take off in harvest order: good by good, each good's plots in reading order.
  const order = goods.flatMap((g) => show.lines.flatMap((l, i) => (l.good === g ? [i] : [])));
  const rank = new Map(order.map((i, k) => [i, k]));
  const n = order.length;
  const flyAt = (i: number) => flightAt + (n <= 1 ? 0 : SHOW.flights * Math.pow((rank.get(i) ?? 0) / (n - 1), SHOW.flightEase));
  const holdAt = flightAt + SHOW.flights + SHOW.flight;
  const times = { goods, goodAt, bonusAt, lossAt, eventsAt, flightAt, flyAt, holdAt, end: holdAt + SHOW.hold };
  TIMES.set(show, times);
  return times;
}

/** When a line's good takes its turn: the line lights and its base starts counting up. */
export const fillAt = (line: Pick<ShowLine, 'good'>, show: Pick<ShowData, 'lines' | 'events' | 'introMs'>) => showTimes(show).goodAt[line.good] ?? SHOW.intro;
/** When line i's goods take off for its owner's silo. */
export const flyAt = (i: number, show: Pick<ShowData, 'lines' | 'events' | 'introMs'>) => showTimes(show).flyAt(i);
/** When the show ends: the phase's scheduled end. */
export const showEnd = (show: Pick<ShowData, 'lines' | 'events' | 'introMs'>) => showTimes(show).end;

/**
 * Where the show is, from the server's clock: the share of the phase left, played back from the show's end. Once
 * every person has asked to speed up (`hurry.from`), the server ends the phase sooner and the rest plays SHOW.fast
 * times faster, so the same time left is that many times more show.
 */
export function showTime(phaseEndsAt: number | null, serverNow: number, lengthMs: number, show: Pick<ShowData, 'lines' | 'events' | 'introMs' | 'hurry'>): number {
  const end = showEnd(show);
  if (phaseEndsAt === null || lengthMs <= 0) return end;
  const rate = show.hurry?.from != null ? SHOW.fast : 1;
  const t = end - ((phaseEndsAt - serverNow) * rate * end) / lengthMs;
  return Math.min(end, Math.max(0, t));
}

/** How often a screen redraws the show: 40 ms over a 15 s phase, more often over a shorter one, so a short-lived badge still gets drawn. */
export const frameMs = (lengthMs: number) => Math.min(40, Math.max(16, lengthMs / 375));

/** Any grid: once every event has landed, when each one did no longer matters. */
const ANY_GRID = { width: 1, height: 1 };

/**
 * What a plot makes once every event has reached it: RULE-2 (plotUnitsAt) after the last of them. It goes through the
 * event catalogue (each event's motion), so a key the catalogue lacks would throw; unreachable today, since the view's
 * keys are a typed union the catalogue covers.
 */
export function finalUnits(line: ShowLine, events: ShowEventView[]): number {
  return plotUnitsAt(eventSegments({ events, introMs: 0 }), line, Infinity, false, ANY_GRID);
}

/** The production show's props for <EventShow>: the map's and every rail's beside it, so they play one script. */
export function productionShowProps(
  production: Pick<ShowData, 'lines' | 'events' | 'introMs'>,
  t: number,
  { reduced, mode, players, tiles, width, height }: { reduced: boolean; mode: ShowMode; players: ShowPlayer[]; tiles: MapTile[]; width: number; height: number },
): Omit<EventShowProps, 'children'> {
  const times = showTimes(production);
  return { events: production.events, introMs: production.introMs, t, start: times.eventsAt ?? times.flightAt, mode, reduced, width, height, tiles, players };
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

/** The act the show is in at `t`, for the rails. */
export type ShowAct = 'intro' | 'harvest' | 'bonus' | 'loss' | 'events' | 'flight' | 'hold';
export function showActAt(show: Pick<ShowData, 'lines' | 'events' | 'introMs'>, t: number): ShowAct {
  const s = showTimes(show);
  if (t >= s.holdAt) return 'hold';
  if (t >= s.flightAt - 0.2) return 'flight';
  if (s.eventsAt !== null && t >= s.eventsAt) return 'events';
  if (t >= s.lossAt - 0.2) return 'loss';
  if (t >= s.bonusAt - 0.2) return 'bonus';
  if (t >= SHOW.intro) return 'harvest';
  return 'intro';
}

/** The good whose plots are filling at `t`, during the harvest. */
export function goodAt(show: Pick<ShowData, 'lines' | 'events' | 'introMs'>, t: number): Good | null {
  const s = showTimes(show);
  return [...s.goods].reverse().find((g) => t >= s.goodAt[g]!) ?? null;
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
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
/** A cut for a missing good reads as its share, not a number: half without Water, a fifth for a plot turned off (AM-17). */
const CUTS: Partial<Record<ShowReason, string>> = { noWater: '½', noEnergy: '½', energyOff: '⅕' };
const HALF_ICON: Partial<Record<ShowReason, Good>> = { noWater: 'water', noEnergy: 'energy', energyOff: 'energy' };

/** A part's badge: green for a bonus; amber for a loss; red with the missing good for a cut. */
function badgeTone(why: ShowReason, delta: number): string {
  if (CUTS[why]) return 'bg-alert text-white';
  return delta > 0 ? 'bg-ok text-on-holo' : 'bg-warn text-void';
}

/**
 * The show props (`players`, `reduced`, `mode`) feed only the map's own show: inside an enclosing <EventShow> they are
 * ignored, and the enclosing show's script, players, motion and pace play instead.
 */
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
  /** A phone with a TV in the room: the map plays no event, and marks only the `only` player's plots. */
  light?: boolean;
  /** A phone alone: the whole map is the tap target; called with the show time to jump to. */
  onSkip?: (to: number) => void;
  className?: string;
}

/** How long before the goods fly the bars leave the map's camera frame, so they can fly past its edge. */
const HANDOFF = 0.2;

/** Inside an <EventShow>, the map's events play that show's script; alone, it plays its own from these props. */
export function ProductionMap({ width, height, tiles, production, t, slots, players, only, tv = false, reduced = false, mode = 'tv', light = false, onSkip, className }: ProductionMapProps) {
  const map = useRef<HTMLDivElement>(null);
  const enclosing = useEnclosingEventShow();
  const { events } = production;
  const times = showTimes(production);
  const geom = useTargets(map, t, times.flightAt);
  const focus = only !== undefined ? slots[only] : undefined;
  const cast = useMemo(() => players ?? Object.entries(slots).map(([id, slot]) => ({ id, slot, name: id })), [players, slots]);
  const mine = (l: ShowLine) => only === undefined || l.owner === only;
  // The bonuses and the losses dim the map a little, so the plots they land on stand out.
  const dimmed = t >= times.bonusAt - 0.2 && t < times.lossAt + SHOW.allAtOnce;
  const bars = (
    <>
      <div className={cx('pointer-events-none absolute inset-0 bg-void transition-opacity duration-300', dimmed ? 'opacity-30' : 'opacity-0')} data-testid="show-dim" />
      <ClusterLinks production={production} t={t} only={only} />
      {production.lines.map(
        (l, i) =>
          mine(l) && <PlotBars key={`${l.x},${l.y}`} line={l} t={t} times={times} flyAt={times.flyAt(i)} tv={tv} colour={SLOT_COLOR[slots[l.owner] ?? 0]} />,
      )}
    </>
  );
  // While events play the bars sit in the map's frame, under the stories and moving with the camera; the frame clips,
  // so they leave it just before they fly.
  const framed = events.length > 0 && t < times.flightAt - HANDOFF;

  const show = (
    <>
      {/* A show that throws leaves the plain map and its bars, drawn from the view (§4). */}
      <EventBoundary
        fallback={
          <>
            <HoloMap width={width} height={height} tiles={tiles} density={tv ? 'tv' : 'phone'} hideGround {...(focus !== undefined ? { focusSlot: focus } : {})} className="w-full" />
            {framed && <div className="pointer-events-none absolute inset-0">{bars}</div>}
          </>
        }
      >
        <EventLivingMap size={tv ? 'tv' : 'phone'} light={light} {...(focus !== undefined ? { focusSlot: focus } : {})} {...(framed ? { bars } : {})} {...(onSkip ? { onSkip } : {})} />
      </EventBoundary>
      {!framed && <div className="pointer-events-none absolute inset-0">{bars}</div>}
      {production.lines.map(
        (l, i) => mine(l) && <Flight key={`f${l.x},${l.y}`} line={l} t={t} at={times.flyAt(i)} tv={tv} geom={geom} colour={SLOT_COLOR[slots[l.owner] ?? 0]} units={finalUnits(l, events)} grid={{ width, height }} />,
      )}
    </>
  );

  return (
    <div ref={map} className={cx('relative', className)} data-testid="map-show">
      {/* The bars render inside the show, so they read the very script the module draws the events with: the screen's,
          when the screen plays one around the map, so the whole screen plays one script. */}
      {enclosing ? show : <EventShow {...productionShowProps(production, t, { reduced, mode, players: cast, tiles, width, height })}>{show}</EventShow>}
    </div>
  );
}

/** While the bonuses land, a green line joins each plot with a cluster bonus to its own neighbours of the same good. */
function ClusterLinks({ production, t, only }: { production: ShowData; t: number; only: string | undefined }) {
  const { grid } = useEventShow();
  const { bonusAt } = showTimes(production);
  if (t < bonusAt - 0.15 || t >= bonusAt + SHOW.allAtOnce) return null;
  const k = clamp01((t - (bonusAt - 0.15)) / 0.25);
  const fade = 1 - clamp01((t - bonusAt - SHOW.allAtOnce + 0.5) / 0.4);
  const linked = production.lines.filter((l) => (only === undefined || l.owner === only) && l.parts.some((p) => p.why === 'cluster' && p.delta > 0));
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${grid.width} ${grid.height}`} preserveAspectRatio="none" data-testid="cluster-links">
      {linked.flatMap((l) =>
        production.lines
          .filter((o) => o !== l && o.owner === l.owner && o.good === l.good && Math.abs(o.x - l.x) + Math.abs(o.y - l.y) === 1)
          .map((o) => (
            <line
              key={`${l.x},${l.y}-${o.x},${o.y}`}
              x1={l.x + 0.5}
              y1={l.y + 0.5}
              x2={l.x + 0.5 + (o.x - l.x) * k}
              y2={l.y + 0.5 + (o.y - l.y) * k}
              stroke="var(--color-ok)"
              strokeWidth={5}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              opacity={0.9 * fade}
            />
          )),
      )}
    </svg>
  );
}

function PlotBars({ line, t, times, flyAt: flyStart, tv, colour }: { line: ShowLine; t: number; times: ShowTimes; flyAt: number; tv: boolean; colour: string }) {
  const { s, reduced, grid } = useEventShow();
  const strikes = plotStrikes(s.segments, line, reduced, grid);
  const base = baseOf(line);
  const from = times.goodAt[line.good] ?? SHOW.intro;
  // The floor that lifts a plot back to 0 is no bonus: it softens the losses, so it lands with them.
  const bonus = (p: ShowLine['parts'][number]) => p.delta > 0 && p.why !== 'floor';
  const landsAt = (p: ShowLine['parts'][number]) => (bonus(p) ? times.bonusAt : times.lossAt);
  const landed = line.parts.filter((p) => t >= landsAt(p));
  const struck = strikes.filter((x) => t >= x.at);
  const last = struck.at(-1);
  const counted = t < from ? 0 : Math.min(base, Math.floor((t - from) / SHOW.unitStep) + 1);
  const units = last ? last.after : Math.max(0, counted + landed.reduce((n, p) => n + p.delta, 0));
  const flying = t >= flyStart;
  const waiting = t < from;
  const making = !waiting && t < from + base * SHOW.unitStep + 0.35;
  // A part stays lit for its whole beat: green while the bonuses land, red while the losses do.
  const lighting = line.parts.find((p) => t >= landsAt(p) - 0.1 && t < landsAt(p) + SHOW.allAtOnce - 0.2);
  const ring = lighting ? (bonus(lighting) ? 'var(--color-ok)' : 'var(--color-alert)') : making ? colour : null;
  // What a loss or the last event took, falling away in grey: never with reduced motion.
  const lossAt = line.parts.some((p) => p.delta < 0) ? times.lossAt : null;
  const lost = -line.parts.filter((p) => !bonus(p)).reduce((n, p) => n + p.delta, 0);
  const fromEvent = last && last.before > last.after ? { n: last.before - last.after, ago: t - last.at } : null;
  const fromLoss = lossAt !== null && t >= lossAt && lost > 0 ? { n: lost, ago: t - lossAt } : null;
  const falling = (fromEvent && fromEvent.ago < 0.9 ? fromEvent : fromLoss && fromLoss.ago < 0.9 && !last ? fromLoss : null) ?? null;
  // A bonus unit glows green as it arrives.
  const gained = t >= times.bonusAt && t < times.bonusAt + SHOW.allAtOnce && !last ? line.parts.filter(bonus).reduce((n, p) => n + p.delta, 0) : 0;
  // On the phone a bar is outlined so a one-unit plot doesn't blend into its border.
  const bar = tv ? 'h-3.5 w-1.5' : 'h-3 w-1.5 ring-1 ring-void/70';
  const chip = tv ? 'px-1 py-0.5 text-[11px]' : 'px-0.5 text-[9px]';
  // An event's chip on the plot (the module's marks): the TV keeps three parts beside it; the phone has room for one
  // badge, the biggest, and the event's wins.
  const chipped = struck.some((x) => x.delta !== 0);
  // The floor gets no badge: the losses' badges say why the plot made less.
  const reasons = landed.filter((p) => p.why !== 'floor');
  const shown = tv ? reasons.slice(0, 3) : chipped ? [] : [...reasons].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 1);
  const state = waiting ? 'waiting' : flying ? 'flown' : making ? 'harvest' : 'done';

  return (
    <div
      className={cx('pointer-events-none absolute flex flex-col justify-end', tv ? 'p-1' : 'p-0.5')}
      style={{ left: `${(line.x / grid.width) * 100}%`, top: `${(line.y / grid.height) * 100}%`, width: `${100 / grid.width}%`, height: `${100 / grid.height}%` }}
      data-testid={`plot-${line.x}-${line.y}`}
      data-state={state}
    >
      {/* Until its good's turn a plot waits in the dark, so the table sees one good after the next. */}
      {waiting && <span className="absolute inset-0 rounded-[4px] bg-void/65" />}
      {ring && !flying && <span className="absolute inset-0 rounded-[4px]" style={{ boxShadow: `0 0 0 ${tv ? 3 : 2}px ${ring}, 0 0 ${tv ? 18 : 10}px ${ring}` }} data-testid="spotlight" />}
      {!waiting && !flying && (
        <span className={cx('absolute flex flex-col items-end', tv ? 'right-1 top-1 gap-0.5' : 'right-0.5 top-0.5 gap-px')}>
          {shown.map((p, i) => (
            <span
              key={`${p.why}-${i}`}
              data-badge="reason"
              data-why={p.why}
              className={cx('flex items-center rounded-chip font-mono font-bold leading-none shadow-chip animate-[show-badge-in_0.3s_ease-out]', badgeTone(p.why, p.delta), tv ? 'gap-0.5' : '', chip)}
            >
              {HALF_ICON[p.why] && <GoodIcon good={HALF_ICON[p.why]!} size={tv ? 10 : 6} />}
              {CUTS[p.why] ?? signed(p.delta)}
            </span>
          ))}
        </span>
      )}
      {/* The count, bottom right: the number the table reads from the couch. */}
      {units > 0 && !flying && (
        <span data-num data-testid="units" className={cx('absolute bottom-0.5 right-0.5 rounded-chip bg-void/85 font-mono font-bold leading-none text-ink', tv ? 'px-1.5 py-0.5 text-lg' : 'px-0.5 text-[11px]')}>
          {units}
        </span>
      )}
      {/* One bar per unit, at most eight, each rising as it is counted. */}
      {!flying && (
        <span className={cx('flex w-fit flex-wrap-reverse items-end', tv ? 'max-w-[44px] gap-[3px]' : 'max-w-[30px] gap-px')}>
          {Array.from({ length: Math.min(units, 8) }, (_, k) => {
            const rise = k < base ? clamp01((t - from - k * SHOW.unitStep) / 0.18) : 1;
            const fresh = gained > 0 && k >= units - gained;
            return (
              <span
                key={k}
                data-bar="unit"
                className={cx('rounded-[2px] shadow-chip', bar)}
                style={{ background: colour, transform: `scaleY(${reduced ? 1 : rise})`, transformOrigin: 'bottom', ...(fresh ? { boxShadow: '0 0 0 2px var(--color-ok), 0 0 8px var(--color-ok)' } : {}) }}
              />
            );
          })}
          {!reduced &&
            falling &&
            Array.from({ length: Math.min(falling.n, 8) }, (_, k) => (
              <span key={`lost-${k}`} data-bar="lost" className={cx('rounded-[2px] bg-ink-3', bar)} style={{ transform: `translateY(${falling.ago * (tv ? 40 : 20)}px)`, opacity: 1 - falling.ago / 0.9 }} />
            ))}
        </span>
      )}
    </div>
  );
}

/**
 * One plot's goods in the air: a chip with the count and the good, arcing up and over into the owner's silo. Until the
 * silos are measured (the first frame, or a render with no layout) it rises from its plot.
 */
function Flight({ line, t, at, tv, geom, colour, units, grid }: { line: ShowLine; t: number; at: number; tv: boolean; geom: Geometry | null; colour: string; units: number; grid: { width: number; height: number } }) {
  const p = (t - at) / SHOW.flight;
  const to = geom?.to[line.owner];
  if (p < 0 || p >= 1 || units === 0) return null;
  const lift = (tv ? 90 : 40) * 4 * p * (1 - p);
  const e = p * p * (3 - 2 * p);
  const place: CSSProperties =
    geom && to
      ? (() => {
          const from = { x: ((line.x + 0.5) / grid.width) * geom.size.w, y: ((line.y + 0.5) / grid.height) * geom.size.h };
          return { left: from.x + (to.x - from.x) * e, top: from.y + (to.y - from.y) * e - lift };
        })()
      : { left: `${((line.x + 0.5) / grid.width) * 100}%`, top: `calc(${((line.y + 0.5) / grid.height) * 100}% - ${lift}px)` };
  return (
    <span
      className={cx('pointer-events-none absolute z-20 flex items-center rounded-chip border-2 bg-panel font-mono font-bold text-ink shadow-chip', tv ? 'gap-1 px-1.5 py-0.5 text-base' : 'gap-0.5 px-1 text-[10px]')}
      style={{ ...place, transform: `translate(-50%, -50%) scale(${1 - 0.35 * p})`, borderColor: colour }}
      data-testid="flying-goods"
    >
      +{units}
      <GoodIcon good={line.good} size={tv ? 18 : 11} />
    </span>
  );
}
