import type { DEV_STEER } from '@mule/engine';
import type { DevFrame, FrameMoments } from '@mule/protocol';

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

/** A frame's moments; none while nothing is on. */
export const momentsOf = (frame: DevFrame): FrameMoments | null => frame.moments ?? null;

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
 * The moments as a screen draws them, at the instant everyone else is drawn at: the frame's, with the packs' wolves
 * interpolated and the glint only while still lit.
 */
export interface DrawnMoments extends FrameMoments {
  /** The frames' tick at that instant, with its fraction. */
  tick: number;
  /** The colonists closing on the lit glint between the two frames: the race as the table sees it. */
  racers: string[];
  /** Each bolted MULE, where it runs: its colonist's lead, in map tiles even while its colonist is in the hall. */
  loose: { who: string; x: number; y: number; good: NonNullable<Drawn['lead']>['good']; facing: Drawn['facing'] }[];
}

/** What every screen draws of the moments now; null while no frame carries any. */
export function momentsAt(log: FrameLog, nowMs: number, cfg: Pick<typeof DEV_STEER, 'interpolateMs'>): DrawnMoments | null {
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
  const loose = mb.bolted.flatMap((who) => {
    const now = b.colonists.find((c) => c.id === who);
    const was = a.colonists.find((c) => c.id === who);
    if (!now?.lead) return [];
    const from = was?.lead ?? now.lead;
    return [{ who, x: lerp(from.x, now.lead.x, k), y: lerp(from.y, now.lead.y, k), good: now.lead.good, facing: lastRan(log, who) }];
  });
  return { ...mb, packs, glint, tick, racers, loose };
}

/** The way a seat's lead last moved across the kept frames; right when it has not. */
function lastRan(log: FrameLog, who: string): Drawn['facing'] {
  const xs = log.frames.map((f) => f.frame.colonists.find((c) => c.id === who)?.lead?.x);
  for (let i = xs.length - 1; i > 0; i--) {
    const [a, b] = [xs[i - 1], xs[i]];
    if (a !== undefined && b !== undefined && a !== b) return b > a ? 'right' : 'left';
  }
  return 'right';
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
