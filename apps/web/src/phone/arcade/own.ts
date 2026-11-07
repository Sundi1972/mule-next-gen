import type { FloorConfig } from '@mule/engine';
import type { DevFrame } from '@mule/protocol';
import { msPerTick, othersAt, pushFrame, startFrameLog, type Drawn, type FrameLog } from './frames';
import {
  advanceTo,
  assayTick,
  boltedNow,
  holdUntil,
  markStale,
  phoneTick,
  receiveFrame,
  serverHolds,
  shownAt,
  startPrediction,
  wolvesHold,
  type ColonistBase,
  type Prediction,
  type PredictWorld,
  type Shown,
} from './predict';

/**
 * The phone's own loop, pure (arcade spec RULE-10): each frame in, then each animation frame your colonist out. PhoneLive
 * keeps an Own in a ref and steers from its prediction; everyone else is drawn from its frames.
 */

export interface Own {
  p: Prediction;
  log: FrameLog;
  /** The assay end (server ms) the copy already holds for, so each view's is applied once. */
  assaying: number | null;
}

export const startOwn = (): Own => ({ p: startPrediction(), log: startFrameLog(), assaying: null });

/** What the loop steps with: the copy's world, what your view says of your colonist, and the assay it announces. */
export interface OwnWorld {
  world: PredictWorld;
  base: ColonistBase;
  id: string;
  cfg: FloorConfig;
  /** Your view's ColonistView.assayUntil, server ms; null when not assaying. */
  assayUntil: number | null;
}

const isBolted = (frame: DevFrame | undefined, id: string) => !!frame?.moments?.bolted.includes(id);

/** A frame from the server: kept for drawing, and compared with the copy, which starts free of a MULE the frame says bolted. */
export function ownFrame(o: Own, frame: DevFrame, at: number, w: OwnWorld): Own {
  return { ...o, log: pushFrame(o.log, frame, at), p: receiveFrame(o.p, frame, at, w.world, { ...w.base, bolted: isBolted(frame, w.id) }) };
}

const shownOf = ({ id: _id, ...at }: Drawn): Shown => at;

/**
 * One animation frame at `now`: the copy stale or live, held for an assay, held while the newest frame has a pack or a
 * stun on you (and then you are drawn where the frames have you, as everyone else), free of a MULE the frame says
 * bolted, and stepped on to the phone's tick. Returns your colonist as drawn, and everyone else from the frames (null
 * before the first).
 */
export function ownTick(o: Own, now: number, w: OwnWorld, clock: { rttMs: number; serverNow: number }): { own: Own; me: Shown | null; others: Map<string, Drawn> | null } {
  const { cfg, id } = w;
  let { p, assaying } = o;
  p = markStale(p, now, cfg);
  const pace = msPerTick(o.log, cfg.steer.tickMs);
  if (w.assayUntil !== assaying && (w.assayUntil === null || p.frame)) {
    assaying = w.assayUntil;
    p = holdUntil(p, w.assayUntil === null ? null : assayTick(p, w.assayUntil, now, clock.serverNow, clock.rttMs, pace));
  }
  const newest = o.log.frames.at(-1)?.frame;
  const drawn = newest ? othersAt(o.log, now, cfg.steer) : null;
  const framedMe = drawn?.get(id) ?? null;
  drawn?.delete(id);
  p = wolvesHold(p, serverHolds(id, newest), w.base, framedMe, now, cfg);
  p = boltedNow(p, isBolted(newest, id), newest?.colonists.find((c) => c.id === id)?.lead ?? null);
  // At the frames' own pace, so a table that plays its phases quicker needs no corrections.
  const target = phoneTick(p, now, clock.rttMs, cfg, pace);
  if (target !== null) p = advanceTo(p, target, w.world);
  const me = p.wolves && framedMe ? shownOf(framedMe) : shownAt(p, now, cfg);
  return { own: { ...o, p, assaying }, me, others: drawn };
}
