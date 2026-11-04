import type { DEV_STEER } from '@mule/engine';
import type { DevFrame } from '@mule/protocol';

/**
 * Everyone else's colonists from the frames (arcade spec RULE-10): drawn DEV_STEER.interpolateMs behind the newest
 * frame, interpolated between the two frames either side, never ahead of the newest. Pure: the screens keep the log in
 * a ref, push each frame as it comes and read positions from their animation frame.
 */

export interface FrameLog {
  /** The latest frames, oldest first, each with the device time it came at. */
  readonly frames: readonly { frame: DevFrame; recvMs: number }[];
}

/** A colonist as a frame carries it. */
export type Drawn = DevFrame['colonists'][number];

/** One wolf of a pack, as a frame carries it. */
export interface FrameWolf {
  x: number;
  y: number;
  state: 'prowl' | 'tell' | 'lunge' | 'open' | 'hurt';
  /** Where its colonist stood when it crouched: set while it crouches (`tell`) and lunges, null otherwise. */
  target: { x: number; y: number } | null;
}

/** The pack a colonist met, and the stage of it. */
export interface FramePack {
  who: string;
  stage: 'choose' | 'chase' | 'fight';
  wolves: FrameWolf[];
}

/**
 * The moments on a frame (DevFrame.moments, arcade spec AM-28): the packs met, the glint lit and the corral scramble.
 * Declared here until the protocol carries it; the frame omits it while nothing is on.
 */
export interface FrameMoments {
  packs: FramePack[];
  /** The lit glint's tile, in whole tiles: drawn at the tile's middle. */
  glint: { x: number; y: number; untilTick: number } | null;
  /**
   * From its call to the turn's end: `over` set once it ends, and then `leftOut`, the needers still without a MULE,
   * however it ended.
   */
  scramble: { untilTick: number; needers: string[]; got: string[]; over: 'empty' | 'time' | 'everyone' | null; leftOut: string[] } | null;
}

/** A frame's moments; none while nothing is on. */
export const momentsOf = (frame: DevFrame): FrameMoments | null => (frame as DevFrame & { moments?: FrameMoments }).moments ?? null;

/** Frames kept: a second's worth at 20 a second, more than interpolateMs ever reaches back. */
const KEPT = 20;

export function startFrameLog(): FrameLog {
  return { frames: [] };
}

/** Adds a frame; one no newer than the newest (late, or a repeat) is dropped. */
export function pushFrame(log: FrameLog, frame: DevFrame, recvMs: number): FrameLog {
  const newest = log.frames.at(-1);
  if (newest && frame.tick <= newest.frame.tick) return log;
  return { frames: [...log.frames, { frame, recvMs }].slice(-KEPT) };
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

function between(a: Drawn, b: Drawn, k: number): Drawn {
  // Through a door the two frames are in different spaces: the older stands until the newer is due.
  if (a.space !== b.space) return k < 1 ? a : b;
  const lead = a.lead && b.lead ? { good: b.lead.good, x: lerp(a.lead.x, b.lead.x, k), y: lerp(a.lead.y, b.lead.y, k) } : k < 1 ? a.lead : b.lead;
  return { ...b, x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), lead, facing: k < 1 ? a.facing : b.facing, moving: a.moving || b.moving };
}

/**
 * The two kept frames either side of the instant interpolateMs before now, on the frames' own clock (the newest frame's
 * `at` plus the time since it came), and how far between them it lies. Before the oldest frame kept, the oldest alone;
 * after the newest, the newest alone. Null before any frame.
 */
function instantOf(log: FrameLog, nowMs: number, cfg: Pick<typeof DEV_STEER, 'interpolateMs'>): { a: DevFrame; b: DevFrame; k: number } | null {
  const newest = log.frames.at(-1);
  if (!newest) return null;
  const at = newest.frame.at + Math.max(0, nowMs - newest.recvMs) - cfg.interpolateMs;
  const after = log.frames.findIndex((f) => f.frame.at > at);
  if (after === -1 || after === 0) {
    const only = log.frames[after === 0 ? 0 : log.frames.length - 1]!.frame;
    return { a: only, b: only, k: 1 };
  }
  const a = log.frames[after - 1]!.frame;
  const b = log.frames[after]!.frame;
  return { a, b, k: (at - a.at) / (b.at - a.at) };
}

/** Every colonist where the frames had it interpolateMs before now (instantOf). */
export function othersAt(log: FrameLog, nowMs: number, cfg: Pick<typeof DEV_STEER, 'interpolateMs'>): Map<string, Drawn> {
  const drawn = new Map<string, Drawn>();
  const i = instantOf(log, nowMs, cfg);
  if (!i) return drawn;
  for (const c of i.b.colonists) {
    const was = i.a === i.b ? undefined : i.a.colonists.find((o) => o.id === c.id);
    drawn.set(c.id, was ? between(was, c, i.k) : c);
  }
  return drawn;
}

/**
 * What a frame's moments leave a screen to work out for itself, from the frames as they come: when each pack's stage
 * began, where its colonist stood then (a fight stays round that spot), and a fight's strikes and bites, counted from
 * its wolves turning hurt (from a lunge, a bite; otherwise, a strike).
 */
export interface PackMark {
  stage: FramePack['stage'];
  sinceTick: number;
  centre: { x: number; y: number };
  strikes: number;
  bites: number;
}

export type PackMarks = ReadonlyMap<string, PackMark>;

/** The marks after `frame`, which came after `before` (null for the first); a frame no newer changes nothing. A pack gone takes its mark with it. */
export function markPacks(marks: PackMarks, frame: DevFrame, before: DevFrame | null): PackMarks {
  if (before && frame.tick <= before.tick) return marks;
  const packs = momentsOf(frame)?.packs ?? [];
  const old = before ? (momentsOf(before)?.packs ?? []) : [];
  const next = new Map<string, PackMark>();
  for (const p of packs) {
    const was = marks.get(p.who);
    if (!was || was.stage !== p.stage) {
      const c = frame.colonists.find((k) => k.id === p.who);
      next.set(p.who, { stage: p.stage, sinceTick: frame.tick, centre: c ? { x: c.x, y: c.y } : { x: 0, y: 0 }, strikes: 0, bites: 0 });
      continue;
    }
    const prev = old.find((q) => q.who === p.who);
    let { strikes, bites } = was;
    if (prev && prev.wolves.length === p.wolves.length && p.stage === 'fight')
      p.wolves.forEach((w, j) => {
        const from = prev.wolves[j]!.state;
        if (w.state !== 'hurt' || from === 'hurt') return;
        if (from === 'lunge') bites++;
        else strikes++;
      });
    next.set(p.who, { ...was, strikes, bites });
  }
  return next;
}

/** The moments as a screen draws them now, at the instant everyone else is drawn at. */
export interface MomentsNow {
  /** The packs with their wolves interpolated, the glint while it is still lit, the scramble. */
  moments: FrameMoments;
  /** The frames' tick at that instant, with its fraction. */
  tick: number;
  /** The colonists closing on the lit glint between the two frames: the race as the table sees it. */
  racers: string[];
}

/** What every screen draws of the moments now; null while no frame carries any. */
export function momentsAt(log: FrameLog, nowMs: number, cfg: Pick<typeof DEV_STEER, 'interpolateMs'>): MomentsNow | null {
  const i = instantOf(log, nowMs, cfg);
  const mb = i && momentsOf(i.b);
  if (!i || !mb) return null;
  const { a, b, k } = i;
  const ma = momentsOf(a);
  const tick = a.tick + (b.tick - a.tick) * k;
  const packs = mb.packs.map((p) => {
    const was = ma?.packs.find((q) => q.who === p.who);
    if (!was || was.wolves.length !== p.wolves.length) return p;
    return { ...p, wolves: p.wolves.map((w, j) => ({ ...w, x: lerp(was.wolves[j]!.x, w.x, k), y: lerp(was.wolves[j]!.y, w.y, k) })) };
  });
  const glint = mb.glint && tick < mb.glint.untilTick ? mb.glint : null;
  const racers = glint && a !== b ? b.colonists.filter((c) => closing(a.colonists.find((o) => o.id === c.id), c, glint)).map((c) => c.id) : [];
  return { moments: { ...mb, packs, glint }, tick, racers };
}

/** Moving nearer the glint's middle on the map between two frames. */
function closing(was: Drawn | undefined, now: Drawn, g: { x: number; y: number }): boolean {
  if (!was || was.space !== 'map' || now.space !== 'map') return false;
  const d = (c: Drawn) => Math.hypot(c.x - (g.x + 0.5), c.y - (g.y + 0.5));
  return d(now) < d(was) - CLOSING_TILES;
}

/** Less than this nearer is standing still, as the wire rounds. */
const CLOSING_TILES = 0.005;

/** Real ms between the server's ticks, from when the kept frames came; `fallback` (DEV_STEER.tickMs) until two have. */
export function msPerTick(log: FrameLog, fallback: number): number {
  const first = log.frames[0];
  const last = log.frames.at(-1);
  if (!first || !last || last.frame.tick === first.frame.tick) return fallback;
  return (last.recvMs - first.recvMs) / (last.frame.tick - first.frame.tick);
}
