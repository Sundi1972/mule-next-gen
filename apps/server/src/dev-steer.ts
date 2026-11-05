/*
 * Steered development (arcade spec C6, RULE-1): each seat's inputs buffered by tick, one tick of the floor and the
 * presses it reaches, and the frame and colonist views it sends. MuleGame keeps the timer and the clock; nothing here
 * reads the time.
 */
import {
  applyReach,
  DEV_STEER,
  doorPresses,
  floorConfig,
  IDLE_INPUT,
  pressOrder,
  pubPayoutFor,
  reachOf,
  RuleError,
  settleMoments,
  stepFloor,
  tileIndex,
  type DevFloor,
  type FloorColonist,
  type FloorConfig,
  type FloorInput,
  type GameState,
  type Reach,
} from '@mule/engine';
import type { ColonistView, DevFrame, FrameMoments } from '@mule/protocol';

/** Positions on the wire keep 2 decimals: a frame of 420–606 B instead of 804 (S-1, AM-13). */
const WIRE_DECIMALS = 100; // literal-ok: 10^2, the wire's 2 decimals, not balance

export const onWire = (n: number): number => Math.round(n * WIRE_DECIMALS) / WIRE_DECIMALS;

/**
 * The floor config the server steps with: the live config objects, the store's hall, and game.ts's pub payout. With
 * `forceWolves` (a per-game test option), wolves are on and every tick's roll on wolf land brings a pack, so the first
 * colonist out meets one at once; the cooldown and every other WOLVES value stay as they are.
 */
export function steerConfig(options: { forceWolves?: boolean } = {}): FloorConfig {
  const cfg = floorConfig();
  const wolves = options.forceWolves ? { ...cfg.wolves, on: true, chancePerSecond: Number.POSITIVE_INFINITY } : cfg.wolves;
  return { ...cfg, wolves, pubPayout: pubPayoutFor };
}

interface Stamped {
  tick: number;
  x: number;
  y: number;
}

/**
 * Each seat's stick and button between ticks (RULE-1 step 1, RULE-10). A steer is latest-wins; one stamped with a
 * tick still to come waits for it, one stamped with a tick gone or unstamped applies at the next. A press counts once,
 * at the next tick. A flood therefore costs a seat its own older steers, never the tick its rate.
 */
export class SteerInputs {
  private readonly stick = new Map<string, { x: number; y: number }>();
  /** Steers stamped for later ticks, by tick, rising; a later steer supersedes any stamped at or after its tick. */
  private readonly waiting = new Map<string, Stamped[]>();
  private readonly pressed = new Set<string>();

  /**
   * A steer that reached the server while the floor stands at `tick`. A stamp further ahead than catchUpTicks counts
   * as that far ahead, so a phone's clock cannot make the server hold more than that many of its steers.
   */
  steer(seat: string, x: number, y: number, stamp: number | undefined, tick: number, cfg: FloorConfig): void {
    const at = stamp === undefined || stamp <= tick ? tick : Math.min(stamp, tick + cfg.steer.catchUpTicks);
    // The newest steer wins over any sent before it for its tick or a later one.
    const kept = (this.waiting.get(seat) ?? []).filter((s) => s.tick < at);
    if (at === tick) this.stick.set(seat, { x, y });
    else kept.push({ tick: at, x, y });
    this.waiting.set(seat, kept);
  }

  press(seat: string): void {
    this.pressed.add(seat);
  }

  /** A phone that dropped: its stick lets go at once, and nothing it sent before still waits. */
  drop(seat: string): void {
    this.stick.delete(seat);
    this.waiting.delete(seat);
    this.pressed.delete(seat);
  }

  /** The seat's input for the step from `tick`, taking its press. */
  take(seat: string, tick: number): FloorInput {
    const due = (this.waiting.get(seat) ?? []).filter((s) => s.tick <= tick);
    if (due.length > 0) {
      const last = due.at(-1)!;
      this.stick.set(seat, { x: last.x, y: last.y });
      this.waiting.set(seat, this.waiting.get(seat)!.filter((s) => s.tick > tick));
    }
    const act = this.pressed.delete(seat);
    return { ...(this.stick.get(seat) ?? IDLE_INPUT), act };
  }
}

/** One press the tick applied: the seat, what its reach was, and what the rule paid. A refused one has its message. */
export interface TickPress {
  seat: string;
  reach: Reach;
  payout: number | null;
  refused: string | null;
}

/**
 * RULE-1's steps 3 and 4, as the floor's own tests run them: the step, then every press the step did not spend, at
 * the stepped position in pressOrder, each on the floor the press before it left. A press with nothing in reach is
 * ignored; one its rule refuses with a RuleError changes nothing and is reported with its message.
 * Mutates `state` as the rules do.
 */
export function stepTick(
  floor: DevFloor,
  state: GameState,
  inputs: Readonly<Record<string, FloorInput>>,
  cfg: FloorConfig,
  secondsLeft: number,
): { floor: DevFloor; presses: TickPress[] } {
  const spent = doorPresses(floor, state, inputs, cfg);
  const stepped = settleMoments(state, stepFloor(floor, state, inputs, cfg.steer.tickMs, cfg));
  const pressing = pressOrder(stepped, Object.keys(inputs).filter((seat) => inputs[seat]!.act && !spent.has(seat)));
  const presses: TickPress[] = [];
  let after = stepped;
  for (const seat of pressing) {
    const reach = reachOf(after, state, seat, cfg, { secondsLeft });
    // A press with nothing in reach is ignored: the button was dim (RULE-1's unknowns).
    if (!reach.enabled) continue;
    try {
      const press = applyReach(state, after, seat, secondsLeft, cfg);
      presses.push({ seat, reach: press.reach, payout: press.payout, refused: null });
      after = press.floor;
    } catch (err) {
      if (!(err instanceof RuleError)) throw err;
      presses.push({ seat, reach, payout: null, refused: err.message });
    }
  }
  return { floor: after, presses };
}

/** One colonist's place on the wire, rounded. */
function placed(c: FloorColonist) {
  return {
    id: c.id,
    x: onWire(c.x),
    y: onWire(c.y),
    space: c.space,
    facing: c.facing,
    moving: c.moving,
    lead: c.lead && { good: c.lead.good, x: onWire(c.lead.x), y: onWire(c.lead.y) },
  };
}

/** A point on the wire, rounded. */
const point = (p: { x: number; y: number }) => ({ x: onWire(p.x), y: onWire(p.y) });

/**
 * The moments' state for the frame (AM-28), straight from the floor, positions rounded (AM-15): each pack met, the
 * glint, the turn's scramble from its call to the turn's end, the MULEs bolted and not caught, and the colonists
 * stunned. Null while none is on.
 */
function frameMoments(floor: DevFloor): FrameMoments | null {
  const packs = floor.colonists.flatMap((c) => {
    const e = c.encounter;
    if (!e) return [];
    const wolves = e.wolves.map((w) => ({ ...point(w), state: w.state, target: w.target && point(w.target) }));
    return [{ who: c.id, stage: e.stage, sinceTick: e.sinceTick, centre: point(e.centre), strikes: e.strikes, bites: e.bites, wolves }];
  });
  const g = floor.moments.glint;
  const s = floor.moments.scramble;
  const bolted = floor.colonists.filter((c) => c.bolt).map((c) => c.id);
  // The floor clears a stun on the tick it ends, so one still on a colonist is on.
  const stunned = floor.colonists.flatMap((c) => (c.stunnedUntilTick === undefined ? [] : [{ who: c.id, untilTick: c.stunnedUntilTick }]));
  if (packs.length === 0 && !g && !s && bolted.length === 0 && stunned.length === 0) return null;
  return {
    packs,
    glint: g && { x: g.x, y: g.y, untilTick: g.untilTick },
    scramble: s && { untilTick: s.untilTick, needers: [...s.needers], got: [...s.got], over: s.over, leftOut: [...s.leftOut] },
    bolted,
    stunned,
  };
}

/**
 * The tick's frame for every screen (C8): each colonist's place, rounded where it is built (AM-15), the beats, and the
 * moments' state, absent while none is on (AM-28).
 */
export function devFrame(floor: DevFloor, beats: readonly string[] = []): DevFrame {
  const moments = frameMoments(floor);
  return { tick: floor.tick, at: floor.tick * DEV_STEER.tickMs, colonists: floor.colonists.map(placed), beats: [...beats], ...(moments && { moments }) };
}

/**
 * A colonist as every screen sees it in steered development: its place (rounded as on the wire), with v1's fields
 * filled from it, `at` the tile under it or the store, no walk, and the assay's end in the server's epoch ms. `bitten`
 * goes only while true.
 */
export function steeredColonistView(state: GameState, floor: DevFloor, seat: string, assayEndsAt: (tick: number) => number): ColonistView | null {
  const c = floor.colonists.find((k) => k.id === seat);
  if (!c) return null;
  const { id: _id, ...where } = placed(c);
  return {
    at: c.space === 'hall' ? 'store' : tileIndex(state.width, Math.floor(c.x), Math.floor(c.y)),
    walk: null,
    assayUntil: c.assayUntilTick === null ? null : assayEndsAt(c.assayUntilTick),
    ...where,
    pace: c.pace,
    pelts: c.pelts,
    encounter: c.encounter?.stage ?? null,
    ...(c.bitten ? { bitten: true } : {}),
  };
}

/** What a development phase did, for its log line (spec §4). */
export interface SteerStats {
  ticks: number;
  catchUp: number;
  resyncs: number;
  frames: number;
  acts: number;
  refused: number;
}

export const noStats = (): SteerStats => ({ ticks: 0, catchUp: 0, resyncs: 0, frames: 0, acts: 0, refused: 0 });

/** A steered development: the floor, the inputs, where its ticks start on the server's clock, and its counts. */
export interface Steering {
  floor: DevFloor;
  readonly inputs: SteerInputs;
  readonly cfg: FloorConfig;
  /** The server's epoch ms that tick 0 stands at; a resync moves it on. */
  origin: number;
  /** The server's epoch ms the last tick stood for (tick 0's at the start): views price the button there, as the tick compared it. */
  at: number;
  /** The reach words each seat's view last showed, to send a seat its view when they change (AM-11). */
  readonly words: Map<string, string>;
  readonly stats: SteerStats;
}
