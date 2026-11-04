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

/** The newest frame, or null before the first. */
export const newestFrame = (log: FrameLog): DevFrame | null => log.frames.at(-1)?.frame ?? null;

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

function between(a: Drawn, b: Drawn, k: number): Drawn {
  // Through a door the two frames are in different spaces: the older stands until the newer is due.
  if (a.space !== b.space) return k < 1 ? a : b;
  const lead = a.lead && b.lead ? { good: b.lead.good, x: lerp(a.lead.x, b.lead.x, k), y: lerp(a.lead.y, b.lead.y, k) } : k < 1 ? a.lead : b.lead;
  return { ...b, x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), lead, facing: k < 1 ? a.facing : b.facing, moving: a.moving || b.moving };
}

/**
 * Every colonist where the frames had it interpolateMs before now, on the frames' own clock: the newest frame's `at`
 * plus the time since it came. Before the oldest frame kept, the oldest; after the newest, the newest.
 */
export function othersAt(log: FrameLog, nowMs: number, cfg: Pick<typeof DEV_STEER, 'interpolateMs'>): Map<string, Drawn> {
  const drawn = new Map<string, Drawn>();
  const newest = log.frames.at(-1);
  if (!newest) return drawn;
  const at = newest.frame.at + Math.max(0, nowMs - newest.recvMs) - cfg.interpolateMs;
  const after = log.frames.findIndex((f) => f.frame.at > at);
  if (after === -1 || after === 0) {
    for (const c of log.frames[after === 0 ? 0 : log.frames.length - 1]!.frame.colonists) drawn.set(c.id, c);
    return drawn;
  }
  const a = log.frames[after - 1]!.frame;
  const b = log.frames[after]!.frame;
  const k = (at - a.at) / (b.at - a.at);
  for (const c of b.colonists) {
    const was = a.colonists.find((o) => o.id === c.id);
    drawn.set(c.id, was ? between(was, c, k) : c);
  }
  return drawn;
}

/** Real ms between the server's ticks, from when the kept frames came; `fallback` (DEV_STEER.tickMs) until two have. */
export function msPerTick(log: FrameLog, fallback: number): number {
  const first = log.frames[0];
  const last = log.frames.at(-1);
  if (!first || !last || last.frame.tick === first.frame.tick) return fallback;
  return (last.recvMs - first.recvMs) / (last.frame.tick - first.frame.tick);
}
