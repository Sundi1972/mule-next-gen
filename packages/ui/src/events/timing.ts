import { EVENT_ENTRY, STORY } from './catalogue';
import type { ShowEventView, ShowHit, ShowMode, ShowPhase } from './types';

/**
 * The show's timeline, in seconds on the caller's clock. Each event plays in its own segment, exactly as long as the
 * server said (playMs), back to back in the order they fired. Inside a segment the gallery's beats keep their
 * proportions: the phase's intro (first segment only), the announcement, the motion, the settle.
 */

/** The gallery's beats on the TV, in seconds: proportions only, scaled to fit each segment. */
export const EVENT_BEAT = { intro: 1.8, announce: 2.2, settle: 1.2 } as const;
/** A phone with no TV in the room: quicker cards, and the motion at 75% of the TV's share. */
export const EVENT_SOLO_BEAT = { intro: 1.1, announce: 1.4, settle: 0.8 } as const;
export const EVENT_SOLO_PACE = 0.75;

/** How long an event's motion plays in the gallery, at the TV's pace: a proportion, never a length on its own. */
export function playShare(ev: ShowEventView): number {
  const story = STORY[ev.key];
  if (story) return story.length;
  switch (EVENT_ENTRY[ev.key].motion) {
    case 'sweep':
      return 3.6;
    case 'spread':
      return 0.6 + ev.hits.length * 0.9;
    case 'source':
      return 0.8 + ev.hits.length * 0.35;
    case 'plot':
      return 1.8;
  }
}

/** One event's stretch of the show. */
export interface EventSegment {
  events: ShowEventView[];
  /** How fast its motion plays: the gallery's seconds times this are the segment's. */
  pace: number;
  /** 1-based, of `count`. */
  n: number;
  count: number;
  startAt: number;
  announceAt: number;
  playAt: number;
  settleAt: number;
  endAt: number;
}

/** The least a segment's beats are scaled by, so its pace stays above 0. */
const MIN_SCALE = 1e-3;

export function eventSegments(events: ShowEventView[], start = 0, mode: ShowMode = 'tv'): EventSegment[] {
  const beat = mode === 'tv' ? EVENT_BEAT : EVENT_SOLO_BEAT;
  const modePace = mode === 'tv' ? 1 : EVENT_SOLO_PACE;
  // Each end is the start plus every length so far, so the segments sum to the server's lengths exactly.
  let ms = 0;
  return events.map((ev, i) => {
    const startAt = start + ms / 1000;
    // A length below 0 counts as 0: a moment, never time running back.
    ms += Math.max(0, ev.playMs);
    const endAt = start + ms / 1000;
    const intro = i === 0 ? beat.intro : 0;
    const play = playShare(ev) * modePace;
    const k = (endAt - startAt) / (intro + beat.announce + play + beat.settle);
    const announceAt = startAt + intro * k;
    const playAt = announceAt + beat.announce * k;
    // The pace divides the clock in the layers (a story's seconds, a front's progress): never 0. A 0 ms segment's
    // hits still land at once, clamped to its settle.
    const pace = Math.max(k, MIN_SCALE) * modePace;
    return { events: [ev], pace, n: i + 1, count: events.length, startAt, announceAt, playAt, settleAt: playAt + play * k, endAt };
  });
}

/** The whole phase's show: its segments, when the intro ends, and when the last segment ends (the outro is the caller's). */
export interface EventScript {
  phase: ShowPhase;
  events: ShowEventView[];
  segments: EventSegment[];
  start: number;
  /** When the phase's intro ends and the first event is announced. */
  intro: number;
  end: number;
  mode: ShowMode;
}

export function eventScript(events: ShowEventView[], start = 0, mode: ShowMode = 'tv'): EventScript {
  const segments = eventSegments(events, start, mode);
  return {
    phase: events[0]?.phase ?? 'production',
    events,
    segments,
    start,
    intro: segments[0]?.announceAt ?? start,
    end: segments.at(-1)?.endAt ?? start,
    mode,
  };
}

export type EventStage = 'before' | 'intro' | 'announce' | 'play' | 'settle' | 'outro';

export function eventStageAt(s: EventScript, t: number): { stage: EventStage; seg: EventSegment | null } {
  if (t < s.start) return { stage: 'before', seg: null };
  if (t < s.intro) return { stage: 'intro', seg: null };
  const seg = s.segments.find((g) => t < g.endAt) ?? null;
  if (!seg) return { stage: 'outro', seg: null };
  return { stage: t < seg.playAt ? 'announce' : t < seg.settleAt ? 'play' : 'settle', seg };
}

/** How far a colony sweep has to travel to reach a plot: 0 at its edge, 1 at the far one. */
export function sweepShare(ev: ShowEventView, h: { x: number; y: number }, w: number, hgt: number): number {
  switch (ev.from ?? 'w') {
    case 'w':
      return (h.x + 0.5) / w;
    case 'e':
      return (w - h.x - 0.5) / w;
    case 'n':
      return (h.y + 0.5) / hgt;
    case 's':
      return (hgt - h.y - 0.5) / hgt;
  }
}

/** The storm's front, 0 at its edge to 1 off the far side, over its play. */
export const EVENT_FRONT = { lead: 0.3, cross: 2.8 } as const;
export const eventFrontAt = (seg: EventSegment, t: number) => (t - seg.playAt - EVENT_FRONT.lead * seg.pace) / (EVENT_FRONT.cross * seg.pace);

/** The map's size in plots, which a sweep's hits are timed across. */
export interface ShowGrid {
  width: number;
  height: number;
}
/**
 * When the event lands on a plot (or, with none, on its player): never after its segment's settle. Without motion,
 * everything lands at once.
 */
export function eventHitAt(seg: EventSegment, ev: ShowEventView, h: ShowHit | null, reduced: boolean, grid: ShowGrid): number {
  const p = seg.playAt;
  if (reduced) return Math.min(seg.settleAt, p + 0.2 * seg.pace);
  const nth = seg.events.indexOf(ev);
  const story = STORY[ev.key];
  const after = (() => {
    if (story) return story.lands + (h?.order ?? 0) * (story.step ?? 0.15);
    switch (EVENT_ENTRY[ev.key].motion) {
      case 'sweep':
        return h ? EVENT_FRONT.lead + sweepShare(ev, h, grid.width, grid.height) * EVENT_FRONT.cross : EVENT_FRONT.lead + EVENT_FRONT.cross / 2;
      case 'spread':
        return 0.4 + (h?.order ?? 0) * 0.9;
      case 'source':
        return 0.5 + (h?.order ?? 0) * 0.35;
      default:
        return 0.5 + nth * 0.5 + (h?.order ?? 0) * 0.15;
    }
  })();
  return Math.min(seg.settleAt, p + after * seg.pace);
}

export interface EventLandedHit {
  ev: ShowEventView;
  seg: EventSegment;
  hit: ShowHit;
  at: number;
}

/** Every hit that has landed by `t`, with its event and segment. */
export function eventLanded(s: EventScript, t: number, reduced: boolean, grid: ShowGrid): EventLandedHit[] {
  return s.segments.flatMap((seg) =>
    seg.events.flatMap((ev) => ev.hits.map((hit) => ({ ev, seg, hit, at: eventHitAt(seg, ev, hit, reduced, grid) })).filter((l) => t >= l.at)),
  );
}
