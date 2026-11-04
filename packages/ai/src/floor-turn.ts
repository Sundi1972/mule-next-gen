import {
  applyReach,
  buildFloor,
  DEVELOPMENT,
  doorPresses,
  floorConfig,
  MS_PER_SECOND,
  player,
  pressOrder,
  pubPayoutFor,
  reachOf,
  RuleError,
  stepFloor,
  type DevFloor,
  type FloorConfig,
  type FloorInput,
  type GameState,
  type ReachKind,
} from '@mule/engine';
import type { AiSeat } from './seat.js';

/**
 * Development on the arcade floor, refereed for the sim (arcade C10): the DevFloor built at the phase's start and
 * stepped every DEV_STEER.tickMs with every seat's AI input, through the engine's stepFloor, pressOrder and applyReach
 * and a FloorConfig that prices the pub with game.ts's pubPayoutFor: the pieces the server's tick uses (HC-4).
 *
 * A tick, in RULE-1's order: each seat's input from its hand; stepFloor, which spends the presses that reached a door;
 * every other press applied in pressOrder at the stepped position; the clock. In month 1 the clock stands until every
 * seat is in (DEV_STEER.month1WaitsForFirstMule, AM-3): a seat already in may not start another MULE, analysis or
 * filter meanwhile, as the server refuses them. The host's Continue has no AI-only stand-in but time:
 * DEV_STEER.simHostContinueSeconds of standing start the clock anyway.
 */

/** One seat's development turn on the floor, for the sim's report and the tests. */
export interface DevTurn {
  month: number;
  id: string;
  /** Seconds the clock had run when the seat pressed PUB; null when it never got there. */
  pubAt: number | null;
  /** What the pub paid, read from the seat's money; and what the button said it would pay. */
  payout: number | null;
  quoted: number | null;
  /** MULEs it installed this turn. */
  installs: number;
  /** Presses the referee refused this turn (spec §4, as the server's tick counts them): held while month 1's clock waits, or a rule's RuleError. */
  refused: number;
}

/** What one development phase on the floor came to. */
export interface FloorPhase {
  turns: DevTurn[];
  /** Seconds month 1's clock stood waiting for first MULEs; null in a month whose clock never waits. */
  waited: number | null;
  /** Whether the stand-in for the host's Continue started the waiting clock. */
  continued: boolean;
}

/** A press a seat already in may not make while month 1's clock waits (the server's WAIT_REFUSES). */
const HELD: ReadonlySet<ReachKind> = new Set(['buy', 'install', 'analyse', 'filter']);

/** The server's "in" for month 1's clock: a MULE installed this turn, at the pub, or no land to put one on. */
export function isIn(state: GameState, id: string): boolean {
  const p = player(state, id);
  return p.installedThisTurn || p.doneDeveloping || !state.tiles.some((t) => t.owner === id);
}

/** The floor's config as the server's tick uses it: the live config objects, and the pub priced by game.ts. */
export function simFloorConfig(): FloorConfig {
  return { ...floorConfig(), pubPayout: pubPayoutFor };
}

/** Plays one development phase on the floor, yielding after every tick; returns each seat's turn. */
export function* playFloorPhase(state: GameState, seats: readonly AiSeat[]): Generator<void, FloorPhase, void> {
  const cfg = simFloorConfig();
  const tickSeconds = cfg.steer.tickMs / MS_PER_SECOND;
  let floor: DevFloor = buildFloor(state, cfg);
  const ids = seats.map((s) => s.id);
  const turns = new Map(ids.map((id): [string, DevTurn] => [id, { month: state.month, id, pubAt: null, payout: null, quoted: null, installs: 0, refused: 0 }]));
  let waiting = state.month === 1 && cfg.steer.month1WaitsForFirstMule;
  // Whole ticks, so the clock never drifts in floating point: stood waiting, and run.
  let stood = 0;
  let run = 0;
  let continued = false;
  const done = (id: string) => player(state, id).doneDeveloping;
  for (;;) {
    if (waiting && ids.every((id) => isIn(state, id))) waiting = false;
    if (waiting && stood * tickSeconds >= cfg.steer.simHostContinueSeconds) {
      waiting = false;
      continued = true;
    }
    // The seconds left as this tick ends, where its presses apply and the pub is priced, counted in whole ms as the
    // server's clock counts them (HC-4); all of them while month 1's clock waits.
    const left = waiting ? DEVELOPMENT.fullSeconds : (DEVELOPMENT.fullSeconds * MS_PER_SECOND - (run + 1) * cfg.steer.tickMs) / MS_PER_SECOND;
    // AM-19: the tick this step makes, run + 1, runs only while it falls before the clock's end, as on the server.
    if ((run + 1) * cfg.steer.tickMs >= DEVELOPMENT.fullSeconds * MS_PER_SECOND || ids.every(done)) break;
    const inputs: Record<string, FloorInput> = {};
    for (const s of seats) if (!done(s.id)) inputs[s.id] = s.developSteer(state, floor, left, cfg, waiting && isIn(state, s.id));
    const spent = doorPresses(floor, state, inputs, cfg);
    floor = stepFloor(floor, state, inputs, cfg.steer.tickMs, cfg);
    const pressing = ids.filter((id) => inputs[id]?.act && !spent.has(id));
    for (const id of pressOrder(floor, pressing)) {
      if (done(id)) continue;
      const turn = turns.get(id)!;
      const money = player(state, id).money;
      // As the server's stepTick: a press with nothing in reach is ignored (the button was dim); one the referee
      // refuses changes nothing and is counted for the seat.
      const reach = reachOf(floor, state, id, cfg, { secondsLeft: left });
      if (!reach.enabled) continue;
      // The server refuses these to a seat already in while the clock waits.
      if (waiting && isIn(state, id) && HELD.has(reach.kind)) {
        turn.refused++;
        continue;
      }
      try {
        const press = applyReach(state, floor, id, left, cfg);
        floor = press.floor;
        if (press.reach.kind === 'install') turn.installs++;
        if (press.reach.kind === 'pub' && press.payout !== null) {
          turn.pubAt = DEVELOPMENT.fullSeconds - left;
          turn.payout = player(state, id).money - money;
          turn.quoted = press.reach.payout;
        }
      } catch (err) {
        // A press the rules refuse changes nothing (SELL: the store buys no pelts before PR-8).
        if (!(err instanceof RuleError)) throw err;
        turn.refused++;
      }
    }
    if (waiting) stood++;
    else run++;
    yield;
  }
  const waits = state.month === 1 && cfg.steer.month1WaitsForFirstMule;
  return { turns: [...turns.values()], waited: waits ? stood * tickSeconds : null, continued };
}
