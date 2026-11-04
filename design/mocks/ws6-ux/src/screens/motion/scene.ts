/**
 * The motion page's little worlds, stepped like the server steps the floor: positions change only on a frame (20 Hz,
 * DevFrame; the auction's 10 Hz tick), and the view glides between frames with a CSS transition. Pure functions of
 * time and input; the page's hooks call them.
 */
import { WALK } from '@mule/engine';
import type { MuleGood, Slot, Species } from '@mule/ui';
import { W, H } from '../../fixture';
import { ARCADE_TILES } from '../arcade/fixture';
import { DEFAULT_TUNABLES, ROOMS, type HallRoom } from '../arcade/sim';
import { facingOf, type Encounter, type Facing, type Motion } from './gait';

/** DevFrame's rate: one frame every 50 ms (spec §3, C8). */
export const FRAME_MS = 50;
/** The goods auction's server tick (WALK.tickMs). */
export const BOARD_TICK_MS = WALK.tickMs;

export const MAP = { w: W, h: H };

export interface Seat {
  id: string;
  name: string;
  slot: Slot;
  species: Species;
  /** The wire's condition pace: hunger × sickness (× the Zipwing perk). */
  pace: number;
  why: string;
  good: MuleGood | null;
  start: { x: number; y: number };
}

/** Six colonists, one per species, at different paces, each with a MULE. The first is yours (arrows / WASD). */
export const SEATS: Seat[] = [
  { id: 'lena', name: 'Lena', slot: 0, species: 'zipwing', pace: 1, why: 'fed', good: 'food', start: { x: 2.5, y: 6.5 } },
  { id: 'ossa', name: 'Ossa', slot: 1, species: 'bramblet', pace: 0.55, why: 'hungry', good: 'smithore', start: { x: 12.5, y: 4.5 } },
  { id: 'brix', name: 'Brix', slot: 2, species: 'gearling', pace: 1, why: 'fed', good: 'energy', start: { x: 9.5, y: 2.5 } },
  { id: 'kai', name: 'Kai', slot: 3, species: 'mollox', pace: 0.5, why: 'sick', good: 'water', start: { x: 8.5, y: 7.5 } },
  { id: 'vex', name: 'Vex', slot: 4, species: 'glimmer', pace: 0.8, why: 'a little hungry', good: 'crystite', start: { x: 5.5, y: 1.5 } },
  { id: 'nia', name: 'Nia', slot: 5, species: 'quibbit', pace: 1, why: 'fed', good: null, start: { x: 13.5, y: 7.5 } },
];

export interface Lead {
  x: number;
  y: number;
  facing: Facing;
  good: MuleGood | null;
}

/** One colonist as a DevFrame carries it, plus the mock's own wandering. */
export interface Mover {
  id: string;
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
  lead: Lead | null;
  target: { x: number; y: number } | null;
  wait: number;
}

export interface MapScene {
  t: number;
  rng: number;
  movers: Mover[];
}

/** A tiny seeded generator (mulberry32): the mock replays from its seed, as the engine would. */
export function rand(state: number): [number, number] {
  let t = (state + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, t];
}

const TERRAIN = new Map(ARCADE_TILES.map((t) => [`${t.x},${t.y}`, t.terrain]));
/** The ground under a point: DEV_STEER.terrain, which the client already has with the map. */
export function terrainAt(x: number, y: number): { name: string; factor: number } {
  const t = TERRAIN.get(`${Math.floor(x)},${Math.floor(y)}`);
  if (!t || t === 'store') return { name: t ?? 'plains', factor: 1 };
  return { name: t, factor: DEFAULT_TUNABLES.terrain[t] ?? 1 };
}

export function newMapScene(seats: Seat[], seed = 20261029): MapScene {
  return {
    t: 0,
    rng: seed,
    movers: seats.map((s) => ({ id: s.id, x: s.start.x, y: s.start.y, facing: 'right', moving: false, lead: { x: s.start.x - 0.55, y: s.start.y, facing: 'right', good: s.good }, target: null, wait: 0 })),
  };
}

export interface MapOptions {
  /** Every colonist walks, nobody pauses (the bench's "all walking"). */
  allWalk?: boolean;
  /** Nobody moves (the bench's "all idle"). */
  allIdle?: boolean;
  /** The first seat is steered by this direction; null hands it to the autopilot. */
  steer?: { x: number; y: number } | null;
}

/** The colonist's tiles per second: RULE-2 (DEV_STEER.mapTilesPerSecond × terrain × pace × lead). */
export function mapSpeed(seat: Seat, m: Pick<Mover, 'x' | 'y' | 'lead'>): number {
  return DEFAULT_TUNABLES.mapTilesPerSecond * terrainAt(m.x, m.y).factor * seat.pace * (m.lead ? DEFAULT_TUNABLES.leadPace : 1);
}

/** The MULE keeps its rope's length behind, walking only when the rope pulls (DEV_STEER.leadTiles). */
function follow(lead: Lead, x: number, y: number): Lead {
  const dx = x - lead.x;
  const dy = y - lead.y;
  const d = Math.hypot(dx, dy);
  const rope = DEFAULT_TUNABLES.leadTiles;
  if (d <= rope) return lead;
  const nx = x - (dx / d) * rope;
  const ny = y - (dy / d) * rope;
  return { ...lead, x: nx, y: ny, facing: facingOf(nx - lead.x, lead.facing) };
}

/** One DevFrame: every colonist moves for `dt` ms. */
export function stepMap(s: MapScene, seats: Seat[], dt: number, o: MapOptions = {}): MapScene {
  let rng = s.rng;
  const pick = () => {
    const [v, n] = rand(rng);
    rng = n;
    return v;
  };
  const movers = s.movers.map((m, i) => {
    const seat = seats[i]!;
    if (o.allIdle) return { ...m, moving: false };
    let dir = { x: 0, y: 0 };
    let { target, wait } = m;
    if (i === 0 && o.steer) {
      dir = o.steer;
      target = null;
    } else {
      if (wait > 0 && !o.allWalk) return { ...m, moving: false, wait: wait - dt };
      if (!target || Math.hypot(target.x - m.x, target.y - m.y) < 0.08) {
        target = { x: 0.6 + pick() * (MAP.w - 1.2), y: 0.6 + pick() * (MAP.h - 1.2) };
        if (!o.allWalk) return { ...m, moving: false, target, wait: 600 + pick() * 1400 };
      }
      const d = Math.hypot(target.x - m.x, target.y - m.y);
      dir = { x: (target.x - m.x) / d, y: (target.y - m.y) / d };
    }
    const len = Math.hypot(dir.x, dir.y);
    if (len < 1e-3) return { ...m, moving: false, target, wait };
    const v = mapSpeed(seat, m) * (dt / 1000);
    const x = Math.min(MAP.w - 0.3, Math.max(0.3, m.x + (dir.x / len) * v));
    const y = Math.min(MAP.h - 0.2, Math.max(0.4, m.y + (dir.y / len) * v));
    const moved = Math.hypot(x - m.x, y - m.y) > 1e-4;
    return { ...m, x, y, facing: facingOf(x - m.x, m.facing), moving: moved, target, wait, lead: m.lead && follow(m.lead, x, y) };
  });
  return { t: s.t + dt, rng, movers };
}

// --- The store hall ------------------------------------------------------------------------------------------------

const centre = (r: HallRoom) => ({ x: (ROOMS[r].x0 + ROOMS[r].x1) / 2, y: (ROOMS[r].y0 + ROOMS[r].y1) / 2 + 6 });
/** Your errand in the hall: in at the left door, the corral, the food outfitter, out at the right door. */
export const HALL_ROUTE: { at: { x: number; y: number }; room: HallRoom; dwell: number }[] = [
  { at: centre('doorL'), room: 'doorL', dwell: 600 },
  { at: centre('corral'), room: 'corral', dwell: 900 },
  { at: centre('food'), room: 'food', dwell: 900 },
  { at: centre('doorR'), room: 'doorR', dwell: 600 },
];
/** The hall in its own units (16 × 12, sim.ts HALL); positions here are % of it, as StoreInterior lays out its rooms. */
const HALL_UNITS = { w: 16, h: 12 };
const hallDist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(((b.x - a.x) / 100) * HALL_UNITS.w, ((b.y - a.y) / 100) * HALL_UNITS.h);
/** Door to corral in floorSeconds (AM-7, 3 s), × pace × lead. */
const HALL_SPEED = hallDist(centre('doorL'), centre('corral')) / DEFAULT_TUNABLES.floorSeconds;

export interface HallScene {
  t: number;
  leg: number;
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
  wait: number;
  lead: Lead | null;
}
export const newHall = (): HallScene => ({ t: 0, leg: 0, ...HALL_ROUTE[0]!.at, facing: 'right', moving: false, wait: 600, lead: { ...HALL_ROUTE[0]!.at, facing: 'right', good: null } });
export const hallSpeed = (pace: number, lead: boolean) => HALL_SPEED * pace * (lead ? DEFAULT_TUNABLES.leadPace : 1);

export function stepHall(s: HallScene, pace: number, dt: number): HallScene {
  if (s.wait > 0) return { ...s, t: s.t + dt, moving: false, wait: s.wait - dt };
  const nextLeg = (s.leg + 1) % HALL_ROUTE.length;
  const goal = HALL_ROUTE[nextLeg]!;
  const d = hallDist(s, goal.at);
  const step = hallSpeed(pace, !!s.lead) * (dt / 1000);
  if (d <= step) {
    // A new MULE at the corral, outfitted for Food at the outfitter; back at the left door the errand starts over.
    const good = goal.room === 'food' ? 'food' : goal.room === 'doorL' ? null : (s.lead?.good ?? null);
    const lead = goal.room === 'doorL' ? null : { ...(s.lead ?? { ...goal.at, facing: s.facing }), good };
    return { ...s, t: s.t + dt, ...goal.at, leg: nextLeg, moving: false, wait: goal.dwell, lead };
  }
  const k = step / d;
  const x = s.x + (goal.at.x - s.x) * k;
  const y = s.y + (goal.at.y - s.y) * k;
  // The rope in hall units is the map's (0.55 tiles), as % of the hall.
  const lead = s.lead && hallFollow(s.lead, x, y);
  return { ...s, t: s.t + dt, x, y, facing: facingOf(x - s.x, s.facing), moving: true, lead };
}
function hallFollow(lead: Lead, x: number, y: number): Lead {
  const rope = DEFAULT_TUNABLES.leadTiles * 0.9;
  const d = hallDist(lead, { x, y });
  if (d <= rope) return lead;
  const k = (d - rope) / d;
  const nx = lead.x + (x - lead.x) * k;
  return { ...lead, x: nx, y: lead.y + (y - lead.y) * k, facing: facingOf(nx - lead.x, lead.facing) };
}

// --- The goods auction's walk board --------------------------------------------------------------------------------

export const BOARD = { lo: 20, hi: 80 };
/** WALK: crossing the board's height takes crossSeconds at walking speed. */
export const BOARD_SPEED = (BOARD.hi - BOARD.lo) / WALK.crossSeconds;

export interface BoardMover {
  id: string;
  at: number;
  side: 'buyer' | 'seller';
  /** -1 down, 1 up, 0 standing. */
  dir: -1 | 0 | 1;
  hold: number;
}
export const newBoard = (): BoardMover[] => [
  { id: 'lena', at: 76, side: 'seller', dir: 0, hold: 400 },
  { id: 'ossa', at: 70, side: 'seller', dir: 0, hold: 900 },
  { id: 'brix', at: 24, side: 'buyer', dir: 0, hold: 200 },
  { id: 'kai', at: 30, side: 'buyer', dir: 0, hold: 1300 },
];

/** One auction tick: each walker walks toward the middle or back, stopping and starting as players do. */
export function stepBoard(ws: BoardMover[], t: number, dt: number): BoardMover[] {
  return ws.map((w, i) => {
    if (w.hold > 0) return { ...w, hold: w.hold - dt, dir: 0 };
    // A walk lasts 0.8 to 2 s, then a stand of 0.4 to 1.5 s; sellers come down, buyers go up, now and then back.
    const [r1] = rand(Math.floor(t / 97) * 31 + i * 7919);
    const toward: -1 | 1 = w.side === 'seller' ? -1 : 1;
    const dir: -1 | 1 = r1 < 0.2 ? (-toward as -1 | 1) : toward;
    const at = Math.min(BOARD.hi - 2, Math.max(BOARD.lo + 2, w.at + dir * BOARD_SPEED * (dt / 1000)));
    const [r2] = rand(Math.floor(t / 101) * 17 + i * 104729);
    const stop = r2 < 0.06;
    const [r3] = rand(Math.floor(t / 89) * 13 + i * 1299709);
    // Back to the start when the two sides meet, so the board keeps walking.
    const met = w.side === 'seller' ? at < 46 : at > 54;
    return met ? { ...w, at: w.side === 'seller' ? 76 - i * 3 : 24 + (i - 2) * 6, dir: 0, hold: 900 } : { ...w, at, dir: stop ? 0 : dir, hold: stop ? 400 + r3 * 1100 : 0 };
  });
}

// --- The wolves vignette: a scripted loop, run away, then a fight --------------------------------------------------

export type WolfPose = 'prowl' | 'tell' | 'lunge' | 'open' | 'hurt';
export interface WolvesFrame {
  phase: 'walk' | 'choose' | 'chase' | 'bitten' | 'limp' | 'fight' | 'won';
  caption: string;
  encounter: Encounter;
  c: { x: number; facing: Facing; moving: boolean; limp: boolean; motion: Motion };
  bites: number;
  strikes: number;
  wolves: { x: number; y: number; pose: WolfPose; facing: Facing }[];
  pelts: number;
}

export const WOLVES_LOOP = 15_000;
const lerp = (a: number, b: number, k: number) => a + (b - a) * Math.min(1, Math.max(0, k));

/**
 * The vignette at time t (ms), in a 12 × 3 strip of forest. 0–1.6 s walk in; choose; 2.6–4.8 s run (the wolf
 * catches up: a bite); a limp; 8.2 s a second pack: the fight, a jab per lunge, one bite, two strikes, won. The MULE
 * is the page's: it follows on its rope.
 */
/** Where the colonist is at s seconds into the loop (before 0: walking in from the left). */
function colonistAt(s: number): { x: number; facing: Facing } {
  if (s < 0) return { x: 1 + s * 2.5, facing: 'right' };
  if (s < 1.6) return { x: lerp(1, 5, s / 1.6), facing: 'right' };
  if (s < 2.6) return { x: 5, facing: 'right' };
  if (s < 4.8) return { x: lerp(5, 1.6, (s - 2.6) / 2.2), facing: 'left' };
  if (s < 5.3) return { x: 1.6, facing: 'left' };
  if (s < 7.6) return { x: lerp(1.6, 3.4, (s - 5.3) / 2.3), facing: 'right' };
  // Into the next pack's clearing.
  if (s < 8.2) return { x: lerp(3.4, 5.5, (s - 7.6) / 0.6), facing: 'right' };
  return { x: 5.5, facing: 'right' };
}

export function wolvesAt(tAbs: number): WolvesFrame {
  const loop = Math.floor(tAbs / WOLVES_LOOP);
  const t = tAbs % WOLVES_LOOP;
  const s = t / 1000;
  // Counters only grow across loops, so a new bite or strike always differs from the last one seen.
  const biteBase = loop * 2;
  const strikeBase = loop * 2;
  const at = colonistAt(s);
  let motion: Motion = 'walk';
  let moving = true;
  let limp = false;
  let encounter: Encounter = null;
  let wolves: WolvesFrame['wolves'] = [];
  let phase: WolvesFrame['phase'] = 'walk';
  let caption = 'Walking through the forest with a Food MULE';
  let bites = biteBase;
  let strikes = strikeBase;
  let pelts = 0;
  if (s < 1.6) {
    // walking in
  } else if (s < 2.6) {
    phase = 'choose';
    caption = 'Wolves! RUN or FIGHT? (encounter: choose)';
    [motion, moving, encounter] = ['idle', false, 'choose'];
    wolves = [{ x: lerp(12.5, 8.5, (s - 1.6) / 1), y: 1.6, pose: 'prowl', facing: 'left' }];
  } else if (s < 4.8) {
    phase = 'chase';
    caption = 'Running away (encounter: chase): a quicker stride, a glance back';
    const k = (s - 2.6) / 2.2;
    [motion, encounter] = ['run', 'chase'];
    wolves = [{ x: lerp(8.5, 2.5, k), y: 1.6, pose: k > 0.85 ? 'lunge' : 'prowl', facing: 'left' }];
  } else if (s < 5.3) {
    phase = 'bitten';
    caption = 'Caught: bitten (a flinch)';
    [motion, moving] = ['idle', false];
    bites = biteBase + 1;
    wolves = [{ x: 2.5, y: 1.6, pose: 'open', facing: 'left' }];
  } else if (s < 7.6) {
    phase = 'limp';
    caption = 'Bitten: a limp until the store or an own plot (half speed)';
    const k = (s - 5.3) / 2.3;
    [motion, limp] = ['hurt', true];
    bites = biteBase + 1;
    wolves = [{ x: lerp(2.5, 12.8, k), y: 1.6, pose: 'prowl', facing: 'right' }];
  } else if (s < 8.2) {
    phase = 'limp';
    caption = 'Still limping, into another pack';
    [motion, limp] = ['hurt', true];
    bites = biteBase + 1;
    wolves = [{ x: lerp(12.5, 7.6, (s - 7.6) / 0.6), y: 1.6, pose: 'prowl', facing: 'left' }];
  } else if (s < 13.8) {
    phase = 'fight';
    caption = 'FIGHT (encounter: fight): a jab on every lunge; dodge it, strike the open wolf';
    [motion, moving, encounter] = ['fight', false, 'fight'];
    const f = s - 8.2;
    // Every 1.6 s the wolf crouches (the tell, 0.8 s), lunges, then stands open; the second lunge bites.
    const beat = f % 1.6;
    const pose: WolfPose = beat < 0.8 ? 'tell' : beat < 1.0 ? 'lunge' : 'open';
    const wx = beat >= 0.8 && beat < 1.0 ? 6.8 : 7.6;
    bites = biteBase + 1 + (f > 2.45 ? 1 : 0);
    strikes = strikeBase + (f > 4.1 ? 1 : 0) + (f > 5.7 ? 1 : 0);
    wolves = [{ x: wx, y: 1.6, pose: f > 5.75 ? 'hurt' : pose, facing: 'left' }];
    if (f > 4.1) caption = 'Strikes land on the open wolf: two and it is beaten';
  } else {
    phase = 'won';
    caption = 'Won: +2 pelts to sell at the store';
    [motion, moving] = ['idle', false];
    bites = biteBase + 2;
    strikes = strikeBase + 2;
    pelts = 2;
    wolves = [{ x: lerp(7.6, 13, (s - 13.8) / 1.2), y: 1.6, pose: 'hurt', facing: 'right' }];
  }
  return { phase, caption, encounter, c: { x: at.x, facing: at.facing, moving, limp, motion }, bites, strikes, wolves, pelts };
}
