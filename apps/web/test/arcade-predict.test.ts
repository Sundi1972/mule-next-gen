import { applyReach, buildFloor, createGame, DEV_STEER, floorConfig, GLINT, speedOf, stepFloor, WOLVES, type DevFloor, type FloorConfig, type FloorInput, type GameState, type Terrain } from '@mule/engine';
import type { DevFrame, MuleView, TileView } from '@mule/protocol';
import { describe, expect, it } from 'vitest';
import { advanceTo, assayTick, boltedNow, holdUntil, markStale, phoneTick, predictWorld, receiveFrame, serverHolds, shownAt, startPrediction, steerFrom, steerStep, wolvesHold, type Prediction, type PredictWorld } from '../src/phone/arcade/predict';
import { msPerTick, pushFrame, startFrameLog } from '../src/phone/arcade/frames';
import { gateSteer, heldBack, quantise, startGate, type SteerGate } from '../src/phone/arcade/steer';

/**
 * T-AC-10 (arcade spec RULE-10, AM-7; S-2's harness in docs/research/2026-10-29-arcade-s2-feel.md is the reference): the
 * phone predicts its own colonist with the engine's own stepFloor, ahead of the server by half the round trip plus a
 * tick, every input stamped with the tick it applies at, and corrects to the server's frames. A pure loop the browser
 * cannot time: a server stepping the real floor, a network that holds every message for its latency, and the phone.
 */

const LAND: Record<string, Terrain> = { '.': 'plains', '^': 'mountains', s: 'swamp', '~': 'lake', f: 'forest', S: 'store' };

/** The store at 6·4 with plains each side, a swamp, mountains and a lake to walk past. */
const MAP = [
  '...............',
  '..f.....^^.....',
  '.....~~........',
  '.s....s........',
  '.s....S........',
  '....^^.....~...',
  '...............',
  '...............',
  '...............',
];

/** Lena, a Zipwing, steers; Kai, an AI seat, stands. */
function game(): GameState {
  const state = createGame({
    seed: 10,
    players: [
      { id: 'lena', name: 'Lena', isAi: false, species: 'zipwing' },
      { id: 'kai', name: 'Kai', isAi: true, species: 'mollox' },
    ],
  });
  const template = state.tiles[0]!;
  state.width = MAP[0]!.length;
  state.height = MAP.length;
  state.tiles = MAP.flatMap((row, y) => [...row].map((ch, x) => ({ ...template, x, y, terrain: LAND[ch]!, owner: null, outfit: null })));
  state.phase = 'development';
  return state;
}

/** What the phone has of that game: its tiles as the view sends them, and its own seat. */
function viewOf(state: GameState): Pick<MuleView, 'width' | 'height' | 'tiles'> {
  const tiles: TileView[] = state.tiles.map((t) => ({ x: t.x, y: t.y, terrain: t.terrain, peaks: t.peaks, owner: t.owner, outfit: t.outfit, pollution: t.pollution, filter: t.filter }));
  return { width: state.width, height: state.height, tiles };
}

const TICK = DEV_STEER.tickMs;
/** The wire rounds positions to 2 decimals (spec AM-13). */
const round = (v: number) => Math.round(v * 100) / 100;

function frameOf(floor: DevFloor): DevFrame {
  return {
    tick: floor.tick,
    at: floor.tick * TICK,
    colonists: floor.colonists.map((c) => ({ id: c.id, x: round(c.x), y: round(c.y), space: c.space, facing: c.facing, moving: c.moving, lead: c.lead && { good: c.lead.good, x: round(c.lead.x), y: round(c.lead.y) } })),
    beats: [],
  };
}

/**
 * Lena's stick over the turn, by the ms it is pushed: in at the store's left door, across its hall and out of the right
 * one, on over the plains, down past the lake, then back left and up past the swamp, a diagonal and a half push between.
 */
const STICK: [number, number, number][] = [
  [0, 0, 0],
  [300, 1, 0],
  [6_800, 0.7, 0.7],
  [7_600, 0, 1],
  [8_200, -1, 0.25],
  [9_900, -0.5, -0.875],
  [11_300, 0, 0],
];
const TURN_MS = 12_000;

interface Run {
  compared: number;
  corrected: number;
  snapped: number;
  /** The furthest the phone's copy stood from the server's at a frame's tick, in tiles. */
  worst: number;
  /** Ticks the phone ran ahead of the server's newest step, at the end. */
  ahead: number;
  /** Lena's frames that showed her in the hall. */
  inHall: number;
  /** The copy's tick and where it stood, at every phone step after its own view said it assays; and the assay's last tick. */
  trace: { tick: number; x: number; fixes: number }[];
  assayUntilTick: number | null;
  /** The tick the copy held her until, from her own view's assay end. */
  holdTick: number | null;
  /** Where the server holds her while she assays. */
  heldX: number | null;
}

interface TurnOptions {
  spike?: { fromMs: number; toMs: number; spikeMs: number };
  stick?: [number, number, number][];
  /** When the phone presses the button, an `act` with no tick: the server applies it at its next step. */
  pressAt?: number;
  /** Whether the phone holds its copy still for the assay its own view announces. */
  hold?: boolean;
  /** Real ms a tick takes as a share of tickMs: a table that plays its phases quicker (phaseScale) ticks quicker. */
  scale?: number;
}


/**
 * One scripted turn: the server steps every 50 ms, applying each of Lena's inputs from the tick it is stamped with (one
 * that arrives after its tick from the next), and sends a frame each tick; the phone steps its copy every 16 ms and
 * sends its stick on change. Every message takes `oneWayMs`, plus `spikeMs` for those in the spike window.
 */
function playTurn(oneWayMs: number, { spike, stick = STICK, pressAt, hold = true, scale = 1 }: TurnOptions = {}): Run {
  let state = game();
  const cfg = floorConfig();
  let floor = buildFloor(state, cfg);
  const world: PredictWorld = predictWorld(viewOf(state), { id: 'lena', carriedMule: null }, cfg);
  const base = { pace: floor.colonists[0]!.pace, bitten: false, pelts: 0 };
  const delay = (at: number) => oneWayMs + (spike && at >= spike.fromMs && at < spike.toMs ? spike.spikeMs : 0);

  const toPhone: { due: number; frame: DevFrame }[] = [];
  const toServer: { due: number; tick: number; x: number; y: number }[] = [];
  /** Your own seat's full view, when it carries the assay's end (server ms; the server's tick 0 is at 0 ms here). */
  const views: { due: number; assayUntil: number }[] = [];
  let acted: number | null = null;
  let pressed = false;
  /** Lena's inputs as the server has them, by the tick each applies from. */
  const held: { tick: number; x: number; y: number }[] = [];

  let p: Prediction = startPrediction();
  let gate: SteerGate = startGate();
  const run: Run = { compared: 0, corrected: 0, snapped: 0, worst: 0, ahead: 0, inHall: 0, trace: [], assayUntilTick: null, holdTick: null, heldX: null };
  let told = false;
  let log = startFrameLog();
  let nextServerAt = TICK * scale;

  for (let now = 0; now <= TURN_MS; now += 16) {
    // The server: every input that has arrived, then every tick that is due.
    for (const m of toServer.filter((m) => m.due <= now)) held.push(m);
    toServer.splice(0, toServer.length, ...toServer.filter((m) => m.due > now));
    while (nextServerAt <= now) {
      const mine = held.filter((h) => h.tick <= floor.tick).at(-1);
      const inputs: Record<string, FloorInput> = { lena: { x: mine?.x ?? 0, y: mine?.y ?? 0, act: false } };
      floor = stepFloor(floor, state, inputs, TICK, cfg);
      // An act that has arrived counts once, at the step after it, at the stepped position (RULE-1); its view goes
      // with the tick after (spec AM-21: an act is quiet).
      if (acted !== null && acted <= nextServerAt) {
        acted = null;
        state = structuredClone(state);
        floor = applyReach(state, floor, 'lena', 30, cfg).floor;
        const until = floor.colonists[0]!.assayUntilTick;
        run.assayUntilTick = until;
        run.heldX = floor.colonists[0]!.x;
        if (until !== null) views.push({ due: nextServerAt + TICK * scale + delay(nextServerAt), assayUntil: until * TICK * scale });
      }
      toPhone.push({ due: nextServerAt + delay(nextServerAt), frame: frameOf(floor) });
      nextServerAt += TICK * scale;
    }
    // The phone: the frames that have arrived, each at the ms it came as a socket hands it over, then its copy up to
    // its tick, then its stick.
    for (const m of toPhone.filter((m) => m.due <= now)) {
      const before = p.stats;
      p = receiveFrame(p, m.frame, m.due, world, base);
      log = pushFrame(log, m.frame, m.due);
      if (m.frame.colonists[0]!.space === 'hall') run.inHall++;
      run.compared += p.stats.compared - before.compared;
    }
    toPhone.splice(0, toPhone.length, ...toPhone.filter((m) => m.due > now));
    for (const v of views.filter((v) => v.due <= now)) {
      told = true;
      if (hold) p = holdUntil(p, assayTick(p, v.assayUntil, now, now, 2 * oneWayMs, msPerTick(log, TICK)));
      run.holdTick = p.hold;
    }
    views.splice(0, views.length, ...views.filter((v) => v.due > now));
    const target = phoneTick(p, now, 2 * oneWayMs, cfg, msPerTick(log, TICK));
    if (target !== null) p = advanceTo(p, target, world);
    if (told && p.me) run.trace.push({ tick: p.tick, x: p.me.x, fixes: p.stats.corrected + p.stats.snapped });
    if (pressAt !== undefined && !pressed && now >= pressAt) {
      pressed = true;
      acted = now + delay(now);
    }
    const [, sx, sy] = stick.filter(([at]) => at <= now).at(-1)!;
    const sent = gateSteer(gate, quantise(sx, sy), now);
    gate = sent.gate;
    if (sent.send && p.me) {
      p = steerFrom(p, sent.send);
      toServer.push({ due: now + delay(now), tick: p.tick, ...sent.send });
    }
  }
  run.corrected = p.stats.corrected;
  run.snapped = p.stats.snapped;
  run.worst = p.stats.worst;
  run.ahead = p.tick - floor.tick;
  return run;
}

describe('T-AC-10: the phone predicts its own colonist (RULE-10)', () => {
  it('T-AC-10: the phone\'s prediction stays within snapTiles of the server over a scripted turn at 100 ms simulated latency', () => {
    const run = playTurn(100);
    // Every frame of the turn was compared, and the walk went through the store's hall and out again.
    expect(run.compared).toBeGreaterThan(200);
    expect(run.inHall).toBeGreaterThan(20);
    // Every input landed on the tick it was stamped with: the copy never left the server's, beyond the wire's rounding.
    expect(run.worst).toBeLessThanOrEqual(DEV_STEER.snapTiles);
    expect(run).toMatchObject({ corrected: 0, snapped: 0 });
    // Ahead of the server by half the 200 ms round trip plus a tick, give or take the tick in flight.
    expect(run.ahead).toBeGreaterThanOrEqual(100 / TICK + 1);
    expect(run.ahead).toBeLessThanOrEqual(100 / TICK + 1 + 2 * (100 / TICK));
  });

  it('T-AC-10: a latency spike lands inputs after their tick: the copy eases back to the server within snapTiles, never snapping', () => {
    const run = playTurn(100, { spike: { fromMs: 6_600, toMs: 7_300, spikeMs: 80 } });
    expect(run.corrected).toBeGreaterThan(0);
    expect(run.snapped).toBe(0);
    expect(run.worst).toBeLessThanOrEqual(DEV_STEER.snapTiles);
  });

  it('T-AC-10: on a table that plays its phases twice as quick, the copy keeps the frames\' pace and needs no corrections', () => {
    // A tick every 25 ms of real time, the same 50 ms of game time each: the phone's tick runs at the frames' own pace.
    const run = playTurn(100, { scale: 0.5 });
    expect(run.compared).toBeGreaterThan(400);
    expect(run).toMatchObject({ corrected: 0, snapped: 0 });
    expect(run.worst).toBeLessThanOrEqual(DEV_STEER.snapTiles);
    // Ahead by half the round trip and a tick, counted in the quicker ticks.
    expect(run.ahead).toBeGreaterThanOrEqual(100 / (TICK / 2) + 1);
  });

  /** Lena walks left from the store's left door over the plains, pushing on, and presses ANALYSE a second in. */
  const ANALYSE_WALK: [number, number, number][] = [
    [0, 0, 0],
    [300, -1, 0],
  ];

  it('T-AC-10: a press to analyse: once her own view says she assays, the copy stands until assayUntil, then walks on', () => {
    const run = playTurn(100, { stick: ANALYSE_WALK, pressAt: 1_000 });
    const until = run.assayUntilTick!;
    expect(until).toBeGreaterThan(100);
    // From her view on, every tick before the assay's end stands where the server holds her: one place, whatever the stick.
    const held = run.trace.filter((t) => t.tick < until);
    expect(held.length).toBeGreaterThan(50);
    // The steps it took before the view came are put right by the next frames; after that it stands where the server
    // holds her, and no frame has anything more to put right.
    const settled = held.slice(Math.ceil((2 * 100 + DEV_STEER.correctMs) / 16));
    expect(new Set(settled.map((t) => t.x.toFixed(6))).size).toBe(1);
    expect(Math.abs(settled[0]!.x - run.heldX!)).toBeLessThanOrEqual(0.01);
    expect(settled.at(-1)!.fixes).toBe(settled[0]!.fixes);
    // The copy holds to the very tick the server does, and lets go on it: no frame after the assay puts it right.
    expect(run.holdTick).toBe(until);
    const after = run.trace.filter((t) => t.tick > until + 10);
    expect(after.at(-1)!.fixes).toBe(settled[0]!.fixes);
    // Then it walks on, left, as the stick still says.
    expect(after.at(-1)!.x).toBeLessThan(settled[0]!.x - 0.5);
    expect(run.snapped).toBeLessThanOrEqual(1);
  });

  it('T-AC-10 (negative): without the hold the copy walks on through the assay and every frame puts it back', () => {
    const run = playTurn(100, { stick: ANALYSE_WALK, pressAt: 1_000, hold: false });
    const held = run.trace.filter((t) => t.tick < run.assayUntilTick!);
    expect(held.at(-1)!.fixes - held[0]!.fixes).toBeGreaterThan(50);
    expect(Math.abs(held.at(-1)!.x - run.heldX!)).toBeGreaterThan(DEV_STEER.snapTiles / 2);
  });

  /** A phone that has stepped its copy to tick 40 walking left, from a first frame at tick 20. */
  function walking(): { p: Prediction; world: PredictWorld; base: { pace: number; bitten: boolean; pelts: number }; first: DevFrame } {
    const state = game();
    const cfg = floorConfig();
    const floor = buildFloor(state, cfg);
    const world = predictWorld(viewOf(state), { id: 'lena', carriedMule: null }, cfg);
    const base = { pace: floor.colonists[0]!.pace, bitten: false, pelts: 0 };
    const first = frameOf({ ...floor, tick: 20 });
    let p = receiveFrame(startPrediction(), first, 0, world, base);
    p = steerFrom(p, { x: -1, y: 0 });
    p = advanceTo(p, 40, world);
    return { p, world, base, first };
  }

  /** The server's frame at `tick`: Lena `dx` right and `dy` down of where the copy had her then, or of `frame` past the copy. */
  const at = (frame: DevFrame, tick: number, dx: number, p?: Prediction, dy = 0): DevFrame => {
    const mine = p?.past.find((e) => e.tick === tick)?.me;
    return { ...frame, tick, at: tick * TICK, colonists: frame.colonists.map((c, i) => (i === 0 ? { ...c, x: (mine?.x ?? c.x) + dx, y: (mine?.y ?? c.y) + dy } : c)) };
  };

  it('T-AC-10: within snapTiles the shown colonist eases to the server over correctMs', () => {
    const { p, world, base, first } = walking();
    const before = shownAt(p, 1_000, world.cfg)!;
    // The server has her 0.1 tiles right of and 0.06 below where the copy had her at tick 30.
    const corrected = receiveFrame(p, at(first, 30, 0.1, p, 0.06), 1_000, world, base);
    expect(corrected.stats).toMatchObject({ corrected: 1, snapped: 0 });
    // At once she still stands where she was shown; over correctMs she moves the 0.1 across and the 0.06 down; then she holds.
    const shown = (ms: number) => shownAt(corrected, 1_000 + ms, world.cfg)!;
    for (const [ms, share] of [[0, 0], [DEV_STEER.correctMs / 2, 0.5], [DEV_STEER.correctMs, 1], [3 * DEV_STEER.correctMs, 1]] as const) {
      expect(shown(ms).x).toBeCloseTo(before.x + 0.1 * share, 6);
      expect(shown(ms).y).toBeCloseTo(before.y + 0.06 * share, 6);
    }
  });

  it('T-AC-10: a copy behind the frame, as a tab back from the background has, snaps to it and steps on from the frame\'s tick', () => {
    const { p, world, base, first } = walking();
    const ahead = at(first, 60, -1.5);
    const framed = ahead.colonists[0]!.x;
    const caught = receiveFrame(p, ahead, 3_000, world, base);
    expect(caught.stats).toMatchObject({ corrected: 0, snapped: 1 });
    expect(caught.tick).toBe(60);
    expect(shownAt(caught, 3_000, world.cfg)!.x).toBeCloseTo(framed, 6);
    // One tick on is one step left of where the frame has her.
    const next = advanceTo(caught, 61, world);
    expect(next.tick).toBe(61);
    expect(next.me!.x).toBeLessThan(framed);
    expect(next.me!.x).toBeGreaterThan(framed - 0.5);
  });

  it('T-AC-10 (negative): beyond snapTiles it snaps, at once', () => {
    const { p, world, base, first } = walking();
    const before = shownAt(p, 1_000, world.cfg)!;
    const off = DEV_STEER.snapTiles + 0.05;
    const snapped = receiveFrame(p, at(first, 30, off, p), 1_000, world, base);
    expect(snapped.stats).toMatchObject({ corrected: 0, snapped: 1 });
    // No ease: the very same moment shows her where the server's frame and her own inputs since put her.
    expect(shownAt(snapped, 1_000, world.cfg)!.x).toBeCloseTo(before.x + off, 6);
  });

  it('T-AC-10 (negative): no frame for more than staleMs shows "reconnecting" and stops predicting, until a frame comes', () => {
    const { p, world, base, first } = walking();
    const cfg = world.cfg;
    // A frame at 1 s with her where she started, then silence; the copy runs on, walking.
    const live = advanceTo(receiveFrame(p, at(first, 40, 0), 1_000, world, base), 50, world);
    expect(markStale(live, 1_000 + DEV_STEER.staleMs, cfg).status).toBe('live');
    const stale = markStale(live, 1_000 + DEV_STEER.staleMs + 1, cfg);
    expect(stale.status).toBe('reconnecting');
    // It stops predicting: no tick to run to, and asked to run on it stays where it is.
    expect(phoneTick(stale, 1_000 + DEV_STEER.staleMs + 1, 0, cfg)).toBeNull();
    expect(advanceTo(stale, 100, world).tick).toBe(stale.tick);
    // She stands where the last frame had her, not where the copy ran on to.
    expect(shownAt(live, 1_000, cfg)!.x).toBeLessThan(first.colonists[0]!.x - 0.5);
    expect(shownAt(stale, 1_000 + DEV_STEER.staleMs + 1, cfg)!.x).toBeCloseTo(first.colonists[0]!.x, 6);
    // The next frame takes her back, live, from where it says.
    const back = receiveFrame(stale, at(first, 80, 0.5), 5_000, world, base);
    expect(back.status).toBe('live');
    expect(shownAt(back, 5_000, cfg)!.x).toBeCloseTo(first.colonists[0]!.x + 0.5, 6);
  });

  const LEFT = { x: -1, y: 0 };
  const STAND = { x: 0, y: 0 };

  /** Lena live from a frame at tick 20, her stick held left and sent, the copy stepped on to tick 30. */
  function heldLeft() {
    const { world, base, first } = walking();
    const sent = steerStep(receiveFrame(startPrediction(), first, 0, world, base), startGate(), LEFT, 0, true);
    expect(sent.send).toEqual({ ...LEFT, tick: 20 });
    return { world, base, first, p: advanceTo(sent.p, 30, world), gate: sent.gate };
  }

  it('T-AC-10 (negative): a dropped socket lets go of her stick on the server; back live, a stick still held is sent again and the copy stands until it is', () => {
    const { world, base, first, p: walked, gate: held } = heldLeft();
    const closed = steerStep(walked, held, LEFT, 500, false);
    expect(closed.send).toBeNull();
    const stale = markStale(closed.p, 500 + DEV_STEER.staleMs + 1, world.cfg);
    expect(stale.status).toBe('reconnecting');
    // Back on a new socket: the first frame has her where the server stood her once it let go.
    const back = at(first, 80, -0.5);
    const standing = back.colonists[0]!.x;
    const live = advanceTo(receiveFrame(stale, back, 5_000, world, base), 85, world);
    expect(live.status).toBe('live');
    expect(live.me!.x).toBeCloseTo(standing, 6);
    // The stick is still held: it goes again, stamped with the copy's tick, and the copy walks with it.
    const again = steerStep(live, closed.gate, LEFT, 5_000, true);
    expect(again.send).toEqual({ ...LEFT, tick: 85 });
    expect(advanceTo(again.p, 90, world).me!.x).toBeLessThan(standing - 0.1);
  });

  it('T-AC-10 (negative): a stick let go while the socket was down: back live, the copy stands', () => {
    const { world, base, first, p: walked, gate: held } = heldLeft();
    const closed = steerStep(walked, held, LEFT, 500, false);
    const back = at(first, 80, -0.5);
    const live = advanceTo(receiveFrame(markStale(closed.p, 500 + DEV_STEER.staleMs + 1, world.cfg), back, 5_000, world, base), 85, world);
    const released = steerStep(live, closed.gate, STAND, 5_000, true);
    expect(advanceTo(released.p, 95, world).me!.x).toBeCloseTo(back.colonists[0]!.x, 6);
  });

  it('T-AC-10 (negative): a socket that drops and is back before the frames go stale: the copy stands while it is down, and a held stick goes again', () => {
    const { world, p: walked, gate: held } = heldLeft();
    const closed = steerStep(walked, held, LEFT, 500, false);
    expect(closed.p.status).toBe('live');
    const down = advanceTo(closed.p, 40, world);
    expect(down.me!.x).toBeCloseTo(walked.me!.x, 6);
    const again = steerStep(down, closed.gate, LEFT, 700, true);
    expect(again.send).toEqual({ ...LEFT, tick: 40 });
  });
});

describe('C11: the stick on the wire (HC-5, spec §3)', () => {
  it('C11: each component is quantised to 1/8 and the vector is never longer than 1', () => {
    expect(quantise(0.3, -0.06)).toEqual({ x: 0.25, y: 0 });
    expect(quantise(1, 1)).toEqual({ x: 0.625, y: 0.625 });
    for (const [x, y] of [[0.99, 0.99], [-1, 0.7], [0.2, -1], [0.71, 0.71]] as const) {
      const q = quantise(x, y);
      expect(Math.hypot(q.x, q.y)).toBeLessThanOrEqual(1);
      expect([q.x * 8, q.y * 8].every(Number.isInteger)).toBe(true);
    }
  });

  it('C11: the stick is sent on change only, at most steerMaxPerSecond, the last change never lost', () => {
    let gate = startGate();
    const sent: { at: number; x: number; y: number }[] = [];
    // A thumb that wobbles every 10 ms for a second, then rests.
    for (let now = 0; now <= 1_500; now += 10) {
      const want = now < 1_000 ? quantise(Math.sin(now / 37), Math.cos(now / 53)) : quantise(0, 0);
      const r = gateSteer(gate, want, now);
      gate = r.gate;
      if (r.send) sent.push({ at: now, ...r.send });
    }
    const perSecond = (from: number) => sent.filter((s) => s.at >= from && s.at < from + 1_000).length;
    for (let from = 0; from <= 500; from += 10) expect(perSecond(from)).toBeLessThanOrEqual(DEV_STEER.steerMaxPerSecond);
    expect(sent.at(-1)).toMatchObject({ x: 0, y: 0 });
    // Resting sends nothing more.
    const rest = gateSteer(gate, quantise(0, 0), 5_000);
    expect(rest.send).toBeNull();
  });

  it('C11: a change the gate holds back says when it may go, so a timer can send it without an animation frame', () => {
    const step = 1_000 / DEV_STEER.steerMaxPerSecond;
    const walking = gateSteer(startGate(), { x: -1, y: 0 }, 1_000).gate;
    // Let go 30 ms after the walk was sent: held back until a step after the send, then it goes.
    expect(gateSteer(walking, { x: 0, y: 0 }, 1_030).send).toBeNull();
    expect(heldBack(walking, { x: 0, y: 0 }, 1_030)).toBe(step - 30);
    expect(gateSteer(walking, { x: 0, y: 0 }, 1_000 + step).send).toEqual({ x: 0, y: 0 });
    // Nothing held back: the server has what the stick wants, or the change may go now.
    expect(heldBack(walking, { x: -1, y: 0 }, 1_030)).toBeNull();
    expect(heldBack(walking, { x: 0, y: 0 }, 1_000 + step)).toBe(0);
  });
});

/** Lena on a map of forest round the store, the wolves certain every tick and a glint due from the first. */
function wolfLand(): { state: GameState; cfg: FloorConfig } {
  const state = game();
  state.tiles = state.tiles.map((t) => (t.terrain === 'store' ? t : { ...t, terrain: 'forest' }));
  const cfg = { ...floorConfig(), wolves: { ...WOLVES, on: true, chancePerSecond: 1_000, cooldownSeconds: 0 }, glint: { ...GLINT, on: true, firstAfterSeconds: 0, meanGapSeconds: 1 } };
  return { state, cfg };
}

/** The copy stepped on to `tick`, catchUpTicks at a call as the screen's frames do. */
function upTo(p: Prediction, tick: number, world: PredictWorld): Prediction {
  while (p.tick < tick) p = advanceTo(p, tick, world);
  return p;
}

/** A frame with Lena alone at x, y on the map. */
const lenaAt = (tick: number, x: number, y: number): DevFrame => ({ tick, at: tick * TICK, colonists: [{ id: 'lena', x, y, space: 'map', facing: 'right', moving: false, lead: null }], beats: [] });

describe('C11: the moments are the server\'s, never the phone\'s copy (RULE-4, RULE-5, RULE-6, RULE-10)', () => {
  it('C11: on forest with a pack certain each tick and a glint due, the server\'s floor meets both; the phone\'s copy steps with neither', () => {
    const { state, cfg } = wolfLand();
    // Positive control: the engine's own floor on this land and config meets wolves at once and lights a glint.
    let floor = buildFloor(state, cfg);
    floor = { ...floor, colonists: floor.colonists.map((c) => (c.id === 'lena' ? { ...c, x: 2.5, y: 2.5 } : c)) };
    let glints = 0;
    for (let i = 0; i < 200; i++) {
      floor = stepFloor(floor, state, { lena: { x: 1, y: 0, act: false } }, TICK, cfg);
      if (floor.moments.glint) glints++;
    }
    expect(floor.colonists[0]!.encounter ?? glints).toBeTruthy();
    expect(glints).toBeGreaterThan(0);

    const world = predictWorld(viewOf(state), { id: 'lena', carriedMule: null }, cfg);
    expect([world.cfg.wolves.on, world.cfg.glint.on, world.cfg.scramble.on]).toEqual([false, false, false]);
    const base = { pace: 1, bitten: false, pelts: 0 };
    let p = steerFrom(receiveFrame(startPrediction(), lenaAt(0, 2.5, 2.5), 0, world, base), { x: 1, y: 0 });
    p = upTo(p, 200, world);
    expect(p.tick).toBe(200);
    expect(p.past.every((e) => e.me.encounter === null)).toBe(true);
    expect(p.me!.encounter).toBeNull();
    // It walked the whole way, at forest's speed: nothing stopped it to choose run or fight.
    expect(p.me!.x).toBeGreaterThan(2.5 + 0.9 * 200 * (TICK / 1_000) * speedOf(p.me!, world.state, world.cfg));
  });

  /** Lena's copy live on forest at 2.5·2.5 at tick 40, her stick pushed right. */
  function onWolfLand() {
    const { state, cfg } = wolfLand();
    const world = predictWorld(viewOf(state), { id: 'lena', carriedMule: null }, cfg);
    const base = { pace: 1, bitten: false, pelts: 0 };
    const p = steerFrom(receiveFrame(startPrediction(), lenaAt(40, 2.5, 2.5), 2_000, world, base), { x: 1, y: 0 });
    return { world, base, p };
  }

  it('C11: while a pack has her, the copy never runs ahead on her stick: it stands where each frame puts her, and no frame counts as a correction', () => {
    const { world, base, p } = onWolfLand();
    let held = wolvesHold(p, true, base, null, 2_000, world.cfg);
    held = upTo(held, 60, world);
    expect(held.tick).toBe(60);
    expect(held.me!.x).toBe(2.5);
    // The chase moves her on the server's terms: the next frame has her further on, and the copy stands there.
    held = receiveFrame(held, lenaAt(50, 3.1, 2.4), 2_500, world, base);
    held = upTo(held, 70, world);
    expect([held.me!.x, held.me!.y]).toEqual([3.1, 2.4]);
    expect(held.stats).toMatchObject({ corrected: 0, snapped: 0 });
    expect(shownAt(held, 2_500, world.cfg)!.x).toBe(3.1);
  });

  it('C11 (negative): without the hold the copy walks ahead of the frames on her stick while the server holds her choosing', () => {
    const { world, p } = onWolfLand();
    const ahead = upTo(p, 60, world);
    expect(ahead.me!.x).toBeGreaterThan(2.5 + 0.2);
  });

  it('C11: let go bitten, the copy walks on from the frames\' last place at the bitten pace; let go unbitten, at full pace; the shown colonist eases from where the frames drew it', () => {
    const { world, base, p } = onWolfLand();
    const held = receiveFrame(upTo(wolvesHold(p, true, base, null, 2_000, world.cfg), 60, world), lenaAt(55, 3, 2.5), 2_750, world, base);
    const walked = (bitten: boolean) => {
      const free = wolvesHold(held, false, { ...base, bitten }, { x: 2.9, y: 2.5, space: 'map' }, 3_000, world.cfg);
      expect(free.wolves).toBe(false);
      expect(free.me!.bitten).toBe(bitten);
      expect(shownAt(free, 3_000, world.cfg)!.x).toBeCloseTo(2.9, 6);
      const on = upTo(free, 70, world);
      return { dx: on.me!.x - 3, speed: speedOf(free.me!, world.state, world.cfg) };
    };
    const limping = walked(true);
    const well = walked(false);
    expect(limping.dx).toBeCloseTo(10 * (TICK / 1_000) * limping.speed, 6);
    expect(limping.speed).toBeCloseTo(well.speed * WOLVES.bittenPace, 6);
    expect(well.dx).toBeGreaterThan(limping.dx);
  });
});

describe('C11: a lost fight, as the frames say: the stun holds the copy, a bolted MULE leaves it free (RULE-4)', () => {
  const frameWith = (moments: Partial<NonNullable<DevFrame['moments']>>): Pick<DevFrame, 'moments'> => ({ moments: { packs: [], glint: null, scramble: null, bolted: [], stunned: [], ...moments } });

  it('C11: the server holds her while the frame has a pack round her or a stun on her, and not otherwise', () => {
    const lenas = { who: 'lena', stage: 'choose' as const, sinceTick: 1, centre: { x: 1, y: 1 }, strikes: 0, bites: 0, wolves: [] };
    expect(serverHolds('lena', frameWith({ packs: [lenas] }))).toBe(true);
    expect(serverHolds('lena', frameWith({ packs: [{ ...lenas, who: 'kai' }] }))).toBe(false);
    expect(serverHolds('lena', frameWith({ stunned: [{ who: 'lena', untilTick: 90 }] }))).toBe(true);
    expect(serverHolds('lena', frameWith({ stunned: [{ who: 'kai', untilTick: 90 }] }))).toBe(false);
    expect(serverHolds('lena', {})).toBe(false);
    expect(serverHolds('lena', undefined)).toBe(false);
  });

  /** Lena leading a Food MULE on plains, live at tick 40, her stick pushed right. */
  function leading() {
    const state = game();
    state.players = state.players.map((p) => (p.id === 'lena' ? { ...p, carriedMule: 'food' } : p));
    const cfg = floorConfig();
    const world = predictWorld(viewOf(state), { id: 'lena', carriedMule: 'food' }, cfg);
    const base = { pace: 1, bitten: false, pelts: 0, bolted: false };
    const f: DevFrame = { tick: 40, at: 40 * TICK, colonists: [{ id: 'lena', x: 2.5, y: 7.5, space: 'map', facing: 'right', moving: false, lead: { good: 'food', x: 2, y: 7.5 } }], beats: [] };
    const p = steerFrom(receiveFrame(startPrediction(), f, 2_000, world, base), { x: 1, y: 0 });
    return { world, p };
  }

  it('C11: her MULE bolted, the copy walks at full pace and leaves the MULE where it stands; caught, at the lead\'s pace again', () => {
    const { world, p } = leading();
    const led = upTo(p, 60, world);
    const bolted = upTo(boltedNow(p, true, null), 60, world);
    expect(bolted.me!.lead).toEqual({ good: 'food', x: 2, y: 7.5 });
    expect(bolted.me!.x - 2.5).toBeCloseTo((led.me!.x - 2.5) / DEV_STEER.leadPace, 6);
    const caught = upTo(boltedNow(bolted, false, null), 80, world);
    expect(caught.me!.x - bolted.me!.x).toBeCloseTo(led.me!.x - 2.5, 6);
    // Unchanged, the copy is the same copy.
    expect(boltedNow(p, false, null)).toBe(p);
  });

  it('C11: caught, the copy leads the MULE from where the frames have it, not from where it bolted', () => {
    const { world, p } = leading();
    const bolted = upTo(boltedNow(p, true, { good: 'food', x: 6, y: 7.2 }), 50, world);
    const caught = boltedNow(bolted, false, { good: 'food', x: bolted.me!.x - 0.4, y: 7.5 });
    expect(caught.me!.lead).toEqual({ good: 'food', x: bolted.me!.x - 0.4, y: 7.5 });
    expect(upTo(caught, 60, world).me!.lead!.x).toBeLessThan(upTo(caught, 60, world).me!.x);
  });
});
