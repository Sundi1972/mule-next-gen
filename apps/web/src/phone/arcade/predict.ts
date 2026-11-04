import { stepFloor, type FloorColonist, type FloorConfig, type FloorLead, type GameState, type Space } from '@mule/engine';
import type { DevFrame, MuleView, MyView } from '@mule/protocol';
import type { Stick } from './steer';

/**
 * Your own colonist on your phone (arcade spec RULE-10, AM-7). The phone runs its own copy of its colonist ahead of the
 * server, by half the round trip plus one tick, stepping it with the engine's own stepFloor at the one tick (HC-4), so
 * the copy and the server's agree as long as each input reaches the server by the tick it is stamped with. On each
 * frame it compares its copy at the frame's tick: within DEV_STEER.snapTiles the colonist eases to the server's over
 * correctMs; beyond, it snaps. No frame for staleMs and it stops predicting until the next. Pure: the screen keeps the
 * Prediction in a ref and calls these from its animation frame.
 *
 * An input applies at a tick: the stick the server and the copy step with from tick t to t + 1 is the latest one
 * stamped t or earlier. The phone stamps an input with the tick its copy stands at when it is sent.
 */

/** What the copy steps on: the map and your MULE as the view has them, and the config the server steps with. */
export interface PredictWorld {
  state: GameState;
  cfg: FloorConfig;
  id: string;
}

/**
 * The view's map and your seat as the GameState stepFloor reads. A step with no press reads only the tiles (terrain at
 * x, y), the map's width and the seat's carriedMule (its lead): reachOf, and so the rest of the game, is read only by a
 * press, and the phone never predicts a press (its words and its effect are the server's).
 */
export function predictWorld(view: Pick<MuleView, 'width' | 'height' | 'tiles'>, me: Pick<MyView, 'id' | 'carriedMule'>, cfg: FloorConfig): PredictWorld {
  const state = { width: view.width, height: view.height, tiles: view.tiles, players: [{ id: me.id, carriedMule: me.carriedMule, isAi: false }] } as unknown as GameState;
  return { state, cfg, id: me.id };
}

/** Your colonist as a frame carries it. */
export type FramedColonist = DevFrame['colonists'][number];

/** What a frame does not carry of your colonist, from your view (ColonistView). */
export interface ColonistBase {
  pace: number;
  bitten: boolean;
  pelts: number;
}

interface Input extends Stick {
  tick: number;
}

export interface Prediction {
  /** Waiting for a first frame; live; or reconnecting, no frame for staleMs. */
  readonly status: 'waiting' | 'live' | 'reconnecting';
  /** The tick the copy stands at. */
  readonly tick: number;
  /** The copy at `tick`; null until the first frame. */
  readonly me: FloorColonist | null;
  /** The copy at each recent tick, oldest first, `tick` last: what a frame's tick is compared with. */
  readonly past: readonly { tick: number; me: FloorColonist }[];
  /** The stick from each tick on, oldest first. */
  readonly inputs: readonly Input[];
  /** How far the shown colonist stood from the copy when the copy was last corrected, easing to nothing over correctMs. */
  readonly ease: { dx: number; dy: number; fromMs: number } | null;
  /** The newest frame's tick, when it came, and your colonist in it. */
  readonly frame: { tick: number; recvMs: number; me: FramedColonist } | null;
  /**
   * Assaying until this tick, as your own view said (ColonistView.assayUntil): the copy stands still on every step that
   * starts before it, whatever the stick, as the server holds it. Null when not assaying.
   */
  readonly hold: number | null;
  /** Frames compared with the copy, corrections eased, snaps, and the furthest apart a compare found them, in tiles. */
  readonly stats: { compared: number; corrected: number; snapped: number; worst: number };
}

export function startPrediction(): Prediction {
  return { status: 'waiting', tick: 0, me: null, past: [], inputs: [], ease: null, frame: null, hold: null, stats: { compared: 0, corrected: 0, snapped: 0, worst: 0 } };
}

/** The wire rounds positions to 2 decimals (spec AM-13): a copy this close on each axis agrees with its frame. */
const WIRE_TILES = 0.01;

/** Ticks of the copy kept for comparing: as far back as a frame can be and still not be stale, twice over. */
const kept = (cfg: FloorConfig) => 2 * Math.ceil(cfg.steer.staleMs / cfg.steer.tickMs);

const stale = (p: Prediction, nowMs: number, cfg: FloorConfig) => !p.frame || nowMs - p.frame.recvMs > cfg.steer.staleMs;

/**
 * The tick the copy should stand at now: the newest frame's tick, the ticks since it came, the round trip (half for
 * the frame's way here, half for the input's way there), and one tick. Null while there is nothing to predict from.
 */
export function phoneTick(p: Prediction, nowMs: number, rttMs: number, cfg: FloorConfig, _msPerTick: number = cfg.steer.tickMs): number | null {
  if (p.status !== 'live' || stale(p, nowMs, cfg)) return null;
  return p.frame!.tick + Math.floor((nowMs - p.frame!.recvMs + rttMs) / cfg.steer.tickMs) + 1;
}

/** No frame for staleMs: reconnecting, and no prediction until the next frame. */
export function markStale(p: Prediction, nowMs: number, cfg: FloorConfig): Prediction {
  return p.status === 'live' && stale(p, nowMs, cfg) ? { ...p, status: 'reconnecting', ease: null } : p;
}

const stickAt = (inputs: readonly Input[], tick: number): Stick => inputs.filter((i) => i.tick <= tick).at(-1) ?? { x: 0, y: 0 };

function stepMe(me: FloorColonist, tick: number, stick: Stick, world: PredictWorld, hold: number | null): FloorColonist {
  // stepFloor holds an assaying colonist still itself, as on the server.
  const held = hold !== null && tick < hold ? { ...me, assayUntilTick: hold } : me;
  const next = stepFloor({ tick, colonists: [held] }, world.state, { [world.id]: { x: stick.x, y: stick.y, act: false } }, world.cfg.steer.tickMs, world.cfg);
  return next.colonists[0]!;
}

/** The copy stepped on from (tick, me) to `to`, each step with its tick's stick, and the past those steps add. */
function replay(from: { tick: number; me: FloorColonist }, to: number, inputs: readonly Input[], world: PredictWorld, hold: number | null) {
  let { tick, me } = from;
  const added: { tick: number; me: FloorColonist }[] = [];
  while (tick < to) {
    me = stepMe(me, tick, stickAt(inputs, tick), world, hold);
    tick++;
    added.push({ tick, me });
  }
  return { tick, me, added };
}

/** Keeps `kept` ticks of the past, and the inputs that can still be stepped with: the last before the past, and later. */
function trim(p: Prediction, cfg: FloorConfig): Prediction {
  const past = p.past.slice(-kept(cfg));
  const oldest = past[0]?.tick ?? p.tick;
  const before = p.inputs.filter((i) => i.tick <= oldest).at(-1);
  return { ...p, past, inputs: [...(before ? [before] : []), ...p.inputs.filter((i) => i.tick > oldest)] };
}

/**
 * Steps the copy on to `tick`, never back, and at most catchUpTicks at a call (a later call runs the rest; a copy
 * left far behind is put right by the next frame). Nothing while not live.
 */
export function advanceTo(p: Prediction, tick: number, world: PredictWorld): Prediction {
  if (p.status !== 'live' || !p.me || tick <= p.tick) return p;
  const to = Math.min(tick, p.tick + world.cfg.steer.catchUpTicks);
  const run = replay({ tick: p.tick, me: p.me }, to, p.inputs, world, p.hold);
  return trim({ ...p, tick: run.tick, me: run.me, past: [...p.past, ...run.added] }, world.cfg);
}

/** The stick from the copy's tick on: the phone sends it stamped with that tick, so the server steps with it from there too. */
export function steerFrom(p: Prediction, stick: Stick): Prediction {
  return { ...p, inputs: [...p.inputs.filter((i) => i.tick < p.tick), { tick: p.tick, x: stick.x, y: stick.y }] };
}

/** Your colonist as the frame has it, with what the view says of it besides, and the copy's own where a frame has none. */
function fromFrame(c: FramedColonist, base: ColonistBase, id: string): FloorColonist {
  const lead: FloorLead | null = c.lead && { good: c.lead.good, x: c.lead.x, y: c.lead.y };
  return { id, space: c.space, x: c.x, y: c.y, facing: c.facing, moving: c.moving, lead, pace: base.pace, bot: false, bitten: base.bitten, encounter: null, pelts: base.pelts, assayUntilTick: null };
}

/**
 * A frame from the server. The first after waiting or reconnecting starts the copy where it says. Later ones are
 * compared with the copy at their tick: apart by no more than the wire's rounding, the copy stands; otherwise it starts
 * again from the frame at that tick and steps on with its own inputs, the shown colonist easing there when the two were
 * within snapTiles, snapping when further apart or in different spaces. A copy behind the frame snaps to it.
 */
export function receiveFrame(p: Prediction, frame: DevFrame, nowMs: number, world: PredictWorld, base: ColonistBase): Prediction {
  const server = frame.colonists.find((c) => c.id === world.id);
  if (!server || (p.frame && frame.tick <= p.frame.tick && p.status === 'live')) return p;
  const framed = { tick: frame.tick, recvMs: nowMs, me: server };
  const fresh = fromFrame(server, base, world.id);
  if (p.status !== 'live' || !p.me) return { ...p, status: 'live', tick: frame.tick, me: fresh, past: [{ tick: frame.tick, me: fresh }], ease: null, frame: framed };
  const mine = p.past.find((e) => e.tick === frame.tick)?.me;
  if (!mine) {
    if (frame.tick < p.tick) return { ...p, frame: framed };
    return trim({ ...p, tick: frame.tick, me: fresh, past: [...p.past, { tick: frame.tick, me: fresh }], ease: null, frame: framed, stats: { ...p.stats, snapped: p.stats.snapped + 1 } }, world.cfg);
  }
  const apart = mine.space !== server.space ? Infinity : Math.hypot(mine.x - server.x, mine.y - server.y);
  const compared = { ...p.stats, compared: p.stats.compared + 1, worst: Math.max(p.stats.worst, apart) };
  if (Math.abs(mine.x - server.x) <= WIRE_TILES && Math.abs(mine.y - server.y) <= WIRE_TILES && mine.space === server.space) return { ...p, frame: framed, stats: compared };
  const shown = shownAt(p, nowMs, world.cfg)!;
  const run = replay({ tick: frame.tick, me: { ...fresh, lead: fresh.lead ?? mine.lead } }, p.tick, p.inputs, world, p.hold);
  const past = [...p.past.filter((e) => e.tick < frame.tick), { tick: frame.tick, me: fresh }, ...run.added];
  const snap = apart > world.cfg.steer.snapTiles || shown.space !== run.me.space;
  const ease = snap ? null : { dx: shown.x - run.me.x, dy: shown.y - run.me.y, fromMs: nowMs };
  const stats = snap ? { ...compared, snapped: compared.snapped + 1 } : { ...compared, corrected: compared.corrected + 1 };
  return trim({ ...p, me: run.me, past, ease, frame: framed, stats }, world.cfg);
}

/**
 * The tick the server's clock reaches `assayUntilMs` at (ColonistView.assayUntil, server epoch ms): the server's tick
 * now, from the newest frame and the half round trip it took, plus the ms still to go at `msPerTick` of real time (the
 * frames' own pace, which a table's phase scale may set quicker than tickMs). Null before a frame.
 */
export function assayTick(p: Prediction, assayUntilMs: number, nowMs: number, serverNowMs: number, rttMs: number, msPerTick: number): number | null {
  if (!p.frame) return null;
  return p.frame.tick + Math.ceil((nowMs - p.frame.recvMs + rttMs / 2 + (assayUntilMs - serverNowMs)) / msPerTick);
}

/**
 * Your own view says you assay until `tick`: the copy stands from now until then. Steps it took since the press, before
 * the view came, are the frames' to put right, as any other. A tick the copy has already passed, or null, holds nothing.
 */
export function holdUntil(p: Prediction, tick: number | null): Prediction {
  const hold = tick !== null && tick > p.tick ? tick : null;
  return hold === p.hold ? p : { ...p, hold };
}

/** Your colonist as the screen draws it. */
export interface Shown {
  x: number;
  y: number;
  space: Space;
  facing: 'left' | 'right';
  moving: boolean;
  lead: FloorLead | null;
}

/**
 * Where your colonist shows now: the copy, plus what is left of a correction's ease; while not live, where the last
 * frame had it, standing. Null before any frame.
 */
export function shownAt(p: Prediction, nowMs: number, cfg: FloorConfig): Shown | null {
  if (p.status !== 'live' || !p.me) {
    const c = p.frame?.me;
    return c ? { x: c.x, y: c.y, space: c.space, facing: c.facing, moving: false, lead: c.lead } : null;
  }
  const { me, ease } = p;
  const left = ease ? Math.max(0, 1 - (nowMs - ease.fromMs) / cfg.steer.correctMs) : 0;
  const dx = ease ? ease.dx * left : 0;
  const dy = ease ? ease.dy * left : 0;
  return { x: me.x + dx, y: me.y + dy, space: me.space, facing: me.facing, moving: me.moving, lead: me.lead && { ...me.lead, x: me.lead.x + dx, y: me.lead.y + dy } };
}

