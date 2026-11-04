import { buildFloor, createGame, DEV_STEER, floorConfig, stepFloor, type DevFloor, type FloorInput, type GameState, type Terrain } from '@mule/engine';
import type { DevFrame, MuleView, TileView } from '@mule/protocol';
import { describe, expect, it } from 'vitest';
import { advanceTo, markStale, phoneTick, predictWorld, receiveFrame, shownAt, startPrediction, steerFrom, type Prediction, type PredictWorld } from '../src/phone/arcade/predict';
import { gateSteer, quantise, startGate, type SteerGate } from '../src/phone/arcade/steer';

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
}

/**
 * One scripted turn: the server steps every 50 ms, applying each of Lena's inputs from the tick it is stamped with (one
 * that arrives after its tick from the next), and sends a frame each tick; the phone steps its copy every 16 ms and
 * sends its stick on change. Every message takes `oneWayMs`, plus `spikeMs` for those in the spike window.
 */
function playTurn(oneWayMs: number, spike: { fromMs: number; toMs: number; spikeMs: number } | null = null): Run {
  const state = game();
  const cfg = floorConfig();
  let floor = buildFloor(state, cfg);
  const world: PredictWorld = predictWorld(viewOf(state), { id: 'lena', carriedMule: null }, cfg);
  const base = { pace: floor.colonists[0]!.pace, bitten: false, pelts: 0 };
  const delay = (at: number) => oneWayMs + (spike && at >= spike.fromMs && at < spike.toMs ? spike.spikeMs : 0);

  const toPhone: { due: number; frame: DevFrame }[] = [];
  const toServer: { due: number; tick: number; x: number; y: number }[] = [];
  /** Lena's inputs as the server has them, by the tick each applies from. */
  const held: { tick: number; x: number; y: number }[] = [];

  let p: Prediction = startPrediction();
  let gate: SteerGate = startGate();
  const run: Run = { compared: 0, corrected: 0, snapped: 0, worst: 0, ahead: 0, inHall: 0 };
  let nextServerAt = TICK;

  for (let now = 0; now <= TURN_MS; now += 16) {
    // The server: every input that has arrived, then every tick that is due.
    for (const m of toServer.filter((m) => m.due <= now)) held.push(m);
    toServer.splice(0, toServer.length, ...toServer.filter((m) => m.due > now));
    while (nextServerAt <= now) {
      const mine = held.filter((h) => h.tick <= floor.tick).at(-1);
      const inputs: Record<string, FloorInput> = { lena: { x: mine?.x ?? 0, y: mine?.y ?? 0, act: false } };
      floor = stepFloor(floor, state, inputs, TICK, cfg);
      toPhone.push({ due: nextServerAt + delay(nextServerAt), frame: frameOf(floor) });
      nextServerAt += TICK;
    }
    // The phone: the frames that have arrived, then its copy up to its tick, then its stick.
    for (const m of toPhone.filter((m) => m.due <= now)) {
      const before = p.stats;
      p = receiveFrame(p, m.frame, now, world, base);
      if (m.frame.colonists[0]!.space === 'hall') run.inHall++;
      run.compared += p.stats.compared - before.compared;
    }
    toPhone.splice(0, toPhone.length, ...toPhone.filter((m) => m.due > now));
    const target = phoneTick(p, now, 2 * oneWayMs, cfg);
    if (target !== null) p = advanceTo(p, target, world);
    const [, sx, sy] = STICK.filter(([at]) => at <= now).at(-1)!;
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
    const run = playTurn(100, { fromMs: 6_600, toMs: 7_300, spikeMs: 80 });
    expect(run.corrected).toBeGreaterThan(0);
    expect(run.snapped).toBe(0);
    expect(run.worst).toBeLessThanOrEqual(DEV_STEER.snapTiles);
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

  /** The server's frame at `tick`: Lena `dx` to the right of where the copy had her then, or of `frame` past the copy. */
  const at = (frame: DevFrame, tick: number, dx: number, p?: Prediction): DevFrame => {
    const mine = p?.past.find((e) => e.tick === tick)?.me;
    return { ...frame, tick, at: tick * TICK, colonists: frame.colonists.map((c, i) => (i === 0 ? { ...c, x: (mine?.x ?? c.x) + dx } : c)) };
  };

  it('T-AC-10: within snapTiles the shown colonist eases to the server over correctMs', () => {
    const { p, world, base, first } = walking();
    const before = shownAt(p, 1_000, world.cfg)!;
    // The server has her 0.1 tiles to the right of where the copy had her at tick 30.
    const corrected = receiveFrame(p, at(first, 30, 0.1, p), 1_000, world, base);
    expect(corrected.stats).toMatchObject({ corrected: 1, snapped: 0 });
    // At once she still stands where she was shown; over correctMs she moves the 0.1 across; then she holds.
    expect(shownAt(corrected, 1_000, world.cfg)!.x).toBeCloseTo(before.x, 6);
    expect(shownAt(corrected, 1_000 + DEV_STEER.correctMs / 2, world.cfg)!.x).toBeCloseTo(before.x + 0.05, 6);
    expect(shownAt(corrected, 1_000 + DEV_STEER.correctMs, world.cfg)!.x).toBeCloseTo(before.x + 0.1, 6);
    expect(shownAt(corrected, 1_000 + 3 * DEV_STEER.correctMs, world.cfg)!.x).toBeCloseTo(before.x + 0.1, 6);
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
});
