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
  settleMoments,
  stepFloor,
  tileIndex,
  type DevFloor,
  type FloorConfig,
  type FloorInput,
  type FloorColonist,
  type GameState,
} from '@mule/engine';
import { pubSeconds } from './floor-time.js';
import type { AiSeat } from './seat.js';

/**
 * Development on the arcade floor, refereed for the sim (arcade C10): the DevFloor built at the phase's start and
 * stepped every DEV_STEER.tickMs with every seat's AI input, through the engine's stepFloor, pressOrder and applyReach
 * and a FloorConfig that prices the pub with game.ts's pubPayoutFor: the pieces the server's tick uses (HC-4).
 *
 * A tick, in RULE-1's order: each seat's input from its hand; stepFloor, which spends the presses that reached a door
 * or the wolves; settleMoments, which pays what the moments decided (the glint's prize, a bolted MULE); every other
 * press applied in pressOrder at the stepped position; the clock, which counts down from the start in every month.
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
  /** MULEs it bought at the corral this turn: one bought and not installed was paid for and lost (FM-hurry-margin). */
  bought: number;
  /**
   * Each MULE it bought and did not install, in order, and what met that MULE's own errand, from its purchase to the
   * install or the next purchase (FM-hurry-margin): `packLeading`, a pack met it while it led this MULE, the one excuse
   * for a MULE lost; `stepFailed`, its hand gave up this MULE's outfit or install on the floor (the button offered
   * something else), a MULE lost for that, not for time.
   */
  lostMules: { packLeading: boolean; stepFailed: boolean }[];
  /**
   * A wolf's bite cost it the pub (T-AC-5's one excuse, AM-26): at the tick the bite landed, its walk to the pub at the
   * bitten pace (floor-time.ts's pubSeconds, the AI's own estimate) was longer than the seconds left, and unbitten not
   * (biteCostPub).
   */
  biteCostPub: boolean;
  /**
   * Analyses and filters it set off for and the hurry for the pub then gave up on the way with no pack met on it: a walk
   * started without the hurry's margin in hand (FM-hurry-margin).
   */
  scoutsCut: number;
  /** Analyses of lake plots its hand gave up on the way (failed), and dropped before setting off as not fitting the clock. */
  lakeAnalyses: { failed: number; noTime: number };
  /** Presses the referee refused this turn (spec §4, as the server's tick counts them): a rule's RuleError. */
  refused: number;
}

/** What the moments came to in one development phase on the floor (arcade C4, the sim's report). */
export interface FloorMomentCounts {
  /** Packs met, and how each choice went: fought (won, lost) or run from (bitten on the way, or got away). */
  packs: number;
  fights: number;
  won: number;
  lost: number;
  runs: number;
  bitten: number;
  /** MULEs that bolted after a lost fight, and that their colonists caught. */
  bolted: number;
  caught: number;
  /** Pelts the store bought. */
  peltsSold: number;
  /** Glints lit, raced by at least one AI colonist, and won. */
  glints: number;
  raced: number;
  glintsWon: number;
  /** Scrambles called, AI colonists that raced one, and seats left without a MULE by one. */
  scrambles: number;
  scrambleRacers: number;
  leftOut: number;
}

const noMoments = (): FloorMomentCounts => ({ packs: 0, fights: 0, won: 0, lost: 0, runs: 0, bitten: 0, bolted: 0, caught: 0, peltsSold: 0, glints: 0, raced: 0, glintsWon: 0, scrambles: 0, scrambleRacers: 0, leftOut: 0 });

/** What one tick's step and settling had happen, counted from the floor before and after them. */
function countStep(n: FloorMomentCounts, before: DevFloor, after: DevFloor): void {
  const was = new Map(before.colonists.map((c): [string, FloorColonist] => [c.id, c]));
  for (const c of after.colonists) {
    const b = was.get(c.id)!;
    const e = c.encounter;
    if (!b.encounter && e) n.packs++;
    if (e && e.stage !== b.encounter?.stage && e.stage === 'fight') n.fights++;
    if (e && e.stage !== b.encounter?.stage && e.stage === 'chase') n.runs++;
    if (b.encounter && !e) {
      if (c.pelts > b.pelts) n.won++;
      if (c.bolt && !b.bolt) n.lost++;
      else if (c.stunnedUntilTick !== b.stunnedUntilTick) n.lost++;
      if (c.bitten && !b.bitten) n.bitten++;
    }
    if (c.bolt && !b.bolt) n.bolted++;
  }
  const g = after.moments.glint;
  if (g && g.sinceTick !== before.moments.glint?.sinceTick) n.glints++;
  // Before the presses, the tick's glint beats with a winner are the step's: the prize settleMoments paid.
  n.glintsWon += after.moments.beats.filter((x) => x.kind === 'glint' && x.who !== null).length;
  countScramble(n, before, after);
}

/** A scramble called, or emptied with seats left out, between two floors: by a step, or by a sale. */
function countScramble(n: FloorMomentCounts, before: DevFloor, after: DevFloor): void {
  const s = after.moments.scramble;
  if (s && !before.moments.scramble) n.scrambles++;
  if (s?.over === 'empty' && before.moments.scramble?.over !== 'empty') n.leftOut += s.leftOut.length;
}

/** What one development phase on the floor came to. */
export interface FloorPhase {
  turns: DevTurn[];
  moments: FloorMomentCounts;
}

/** The floor's config as the server's tick uses it: the live config objects, and the pub priced by game.ts. */
export function simFloorConfig(): FloorConfig {
  return { ...floorConfig(), pubPayout: pubPayoutFor };
}

/**
 * T-AC-5's one excuse (AM-26), for a colonist just bitten with `left` seconds on the clock: the bite cost it the pub,
 * its walk there at the bitten pace (floor-time.ts's pubSeconds, the AI's own estimate) longer than the time left, and
 * the same walk unbitten not. One late even unbitten was late by its own choices, and the bite cost it nothing.
 */
export function biteCostPub(state: GameState, cfg: FloorConfig, c: FloorColonist, left: number): boolean {
  return pubSeconds(state, cfg, c) > left && pubSeconds(state, cfg, { ...c, bitten: false }) <= left;
}

/** The analyses of lake plots in a hand's log for the month that failed on the way, and that it dropped for time. */
function lakeFailures(state: GameState, log: ReturnType<AiSeat['developLog']>): DevTurn['lakeAnalyses'] {
  const lake = (x: number, y: number) => state.tiles[tileIndex(state.width, x, y)]?.terrain === 'lake';
  const failed = log.filter((e) => !e.ok && e.action.type === 'analyse' && lake(e.action.x, e.action.y));
  const noTime = failed.filter((e) => e.why === 'no time').length;
  return { failed: failed.length - noTime, noTime };
}

/** Plays one development phase on the floor, yielding after every tick; returns each seat's turn. */
export function* playFloorPhase(state: GameState, seats: readonly AiSeat[]): Generator<void, FloorPhase, void> {
  const cfg = simFloorConfig();
  let floor: DevFloor = buildFloor(state, cfg);
  const ids = seats.map((s) => s.id);
  const turns = new Map(ids.map((id): [string, DevTurn] => [id, { month: state.month, id, pubAt: null, payout: null, quoted: null, installs: 0, bought: 0, lostMules: [], scoutsCut: 0, biteCostPub: false, lakeAnalyses: { failed: 0, noTime: 0 }, refused: 0 }]));
  // Whole ticks, so the clock never drifts in floating point.
  let run = 0;
  const done = (id: string) => player(state, id).doneDeveloping;
  const moments = noMoments();
  const raced = new Set<number>();
  // Each seat's MULEs bought this turn, the last the one whose errand is under way; and how much of its hand's log is read.
  const mules = new Map(ids.map((id): [string, { installed: boolean; packLeading: boolean; stepFailed: boolean }[]] => [id, []]));
  const read = new Map(ids.map((id): [string, number] => [id, 0]));
  for (;;) {
    // The seconds left as this tick ends, where its presses apply and the pub is priced, counted in whole ms as the
    // server's clock counts them (HC-4).
    const left = (DEVELOPMENT.fullSeconds * MS_PER_SECOND - (run + 1) * cfg.steer.tickMs) / MS_PER_SECOND;
    // AM-19: the tick this step makes, run + 1, runs only while it falls before the clock's end, as on the server.
    if ((run + 1) * cfg.steer.tickMs >= DEVELOPMENT.fullSeconds * MS_PER_SECOND || ids.every(done)) break;
    const inputs: Record<string, FloorInput> = {};
    for (const s of seats) if (!done(s.id)) inputs[s.id] = s.developSteer(state, floor, left, cfg);
    const spent = doorPresses(floor, state, inputs, cfg);
    const before = floor;
    floor = settleMoments(state, stepFloor(floor, state, inputs, cfg.steer.tickMs, cfg));
    countStep(moments, before, floor);
    for (const c of floor.colonists) {
      const was = before.colonists.find((x) => x.id === c.id)!;
      const errand = mules.get(c.id)?.at(-1);
      if (c.encounter && !was.encounter && c.lead !== null && !done(c.id) && errand) errand.packLeading = true;
      const bit = c.bitten && !was.bitten;
      if (bit && !done(c.id) && biteCostPub(state, cfg, c, left)) turns.get(c.id)!.biteCostPub = true;
    }
    for (const s of seats) {
      const racing = s.developRacing();
      if (racing !== null) raced.add(racing);
    }
    const pressing = ids.filter((id) => inputs[id]?.act && !spent.has(id));
    for (const id of pressOrder(floor, pressing)) {
      if (done(id)) continue;
      const turn = turns.get(id)!;
      const money = player(state, id).money;
      // As the server's stepTick: a press with nothing in reach is ignored (the button was dim); one the referee
      // refuses changes nothing and is counted for the seat.
      const reach = reachOf(floor, state, id, cfg, { secondsLeft: left });
      if (!reach.enabled) continue;
      try {
        const press = applyReach(state, floor, id, left, cfg);
        const pressed = floor;
        floor = press.floor;
        if (press.reach.kind === 'install') {
          turn.installs++;
          const errand = mules.get(id)!.at(-1);
          if (errand) errand.installed = true;
        }
        if (press.reach.kind === 'buy') {
          turn.bought++;
          mules.get(id)!.push({ installed: false, packLeading: false, stepFailed: false });
        }
        if (press.reach.kind === 'sell') moments.peltsSold += press.reach.pelts;
        if (press.reach.kind === 'catch') moments.caught++;
        if (press.reach.kind === 'grab') moments.glintsWon++;
        if (press.reach.kind === 'buy') countScramble(moments, pressed, floor);
        if (press.reach.kind === 'pub' && press.payout !== null) {
          turn.pubAt = DEVELOPMENT.fullSeconds - left;
          turn.payout = player(state, id).money - money;
          turn.quoted = press.reach.payout;
        }
      } catch (err) {
        // A press the rules refuse changes nothing.
        if (!(err instanceof RuleError)) throw err;
        turn.refused++;
      }
    }
    // An outfit or an install its hand gave up on the floor, logged this tick: the MULE whose errand is under way's.
    for (const s of seats) {
      const log = s.developLog();
      const errand = mules.get(s.id)!.at(-1);
      for (const e of log.slice(read.get(s.id)!)) {
        if (errand && !e.ok && !e.why?.startsWith('hurry') && (e.action.type === 'outfit' || e.action.type === 'install')) errand.stepFailed = true;
      }
      read.set(s.id, log.length);
    }
    run++;
    yield;
  }
  for (const s of seats) {
    const turn = turns.get(s.id)!;
    turn.lakeAnalyses = lakeFailures(state, s.developLog());
    turn.scoutsCut = s.developLog().filter((e) => e.why === 'hurry' && (e.action.type === 'analyse' || e.action.type === 'filter')).length;
    turn.lostMules = mules.get(s.id)!.filter((m) => !m.installed).map(({ packLeading, stepFailed }) => ({ packLeading, stepFailed }));
  }
  moments.raced = raced.size;
  moments.scrambleRacers = seats.reduce((n, s) => n + s.developScramblesRaced(), 0);
  return { turns: [...turns.values()], moments };
}
