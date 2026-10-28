import { DEV_WALK, DEVELOPMENT, MULE, SPECIES_PERK, type Species, type Terrain } from '@mule/engine';
import type { TileView } from '@mule/protocol';

/**
 * Arcade development, slice 1: the functional core. Pure and seeded: `step(world, inputs, dtMs, tunables)` returns the
 * next world and reads no clock, no Math.random and no DOM, so one seed plus the inputs replays a turn. The shell
 * (loop.tsx) runs it at a fixed 60 Hz and every view on the page draws the same world.
 *
 * Two spaces: the colony map, in tiles, and the store hall, in hall units on a 4:3 floor (every view draws the hall at
 * that aspect, so a step is the same length across and down). Movement is continuous: speed × terrain × condition pace.
 */

export type Space = 'map' | 'hall';
export interface P {
  x: number;
  y: number;
}
export type WalkTerrain = Exclude<Terrain, 'store'>;
/** The four outfitters slice 1 opens (Heiko's loop); Water, Rare earth and the works stay shut. */
export const ARCADE_OUTFITS = ['food', 'energy', 'smithore', 'crystite'] as const;
export type ArcadeOutfit = (typeof ARCADE_OUTFITS)[number];

// --- Tunables ----------------------------------------------------------------------------------

/** Every speed, price and frequency the arcade uses: Heiko changes them while playing (Tunables.tsx). */
export interface Tunables {
  /** Tiles a second on plains at full pace: today's DEV_WALK.tileSeconds, turned round. */
  mapTilesPerSecond: number;
  /** Seconds from the store door to the corral at full pace: today's DEV_WALK.floorSeconds. */
  floorSeconds: number;
  /** Share of full speed on each land; 0 is impassable. */
  terrain: Record<WalkTerrain, number>;
  hungerPaceMin: number;
  sickPace: number;
  zipwingSpeed: number;
  /** Share of your speed while you lead a MULE: 1 is no drag (an open question). */
  leadPace: number;
  /** How far behind you the MULE walks, in tiles on the map. */
  leadTiles: number;
  devSeconds: number;
  /** The MULE's price is MULE.labour + MULE.smithorePerMule × this (engine mulePrice). */
  smithorePrice: number;
  storeMules: number;
  outfit: Record<ArcadeOutfit, number>;
  /** How long a bot stands at a counter before it presses its action. */
  botThinkSeconds: number;
  seats: Record<string, { food: number; need: number; sick: boolean; money: number }>;
  /** Slices 2 to 4, each an event on the world: off (0) in slice 1, their numbers already have a home. */
  events: {
    wolves: { perMinute: number; reward: number; cost: number };
    glint: { perMinute: number; reward: number };
    scramble: { mulesLeft: number; perMinute: number };
  };
}

export const DEFAULT_TUNABLES: Tunables = {
  mapTilesPerSecond: 1 / DEV_WALK.tileSeconds,
  floorSeconds: DEV_WALK.floorSeconds,
  // Plains are the yardstick; mountains and swamp are Heiko's two slow ones; the rest are the mock's judgement.
  terrain: {
    plains: 1,
    desert: 0.9,
    tundra: 0.85,
    forest: 0.75,
    ice: 0.75,
    crater: 0.8,
    hills: 0.7,
    volcanic: 0.6,
    river: 0.6,
    swamp: 0.5,
    mountains: 0.4,
    lake: 0,
  },
  hungerPaceMin: DEV_WALK.hungerPaceMin,
  sickPace: DEV_WALK.sickPace,
  zipwingSpeed: SPECIES_PERK.zipwingSpeed,
  leadPace: 1,
  leadTiles: 0.55,
  devSeconds: DEVELOPMENT.fullSeconds,
  // 120 + 19 = 139 cr, the development audit's month-2 MULE.
  smithorePrice: 19,
  storeMules: 6,
  outfit: { food: MULE.outfitCost.food, energy: MULE.outfitCost.energy, smithore: MULE.outfitCost.smithore, crystite: MULE.outfitCost.crystite },
  botThinkSeconds: 0.5,
  seats: {
    lena: { food: 3, need: 3, sick: false, money: 300 },
    ossa: { food: 4, need: 4, sick: false, money: 520 },
    brix: { food: 8, need: 10, sick: false, money: 410 },
    kai: { food: 3, need: 3, sick: true, money: 280 },
  },
  events: {
    wolves: { perMinute: 0, reward: 50, cost: 30 },
    glint: { perMinute: 0, reward: 80 },
    scramble: { mulesLeft: 0, perMinute: 0 },
  },
};

export const mulePrice = (t: Tunables) => Math.round(MULE.labour + MULE.smithorePerMule * t.smithorePrice);

// --- The world ---------------------------------------------------------------------------------

export interface Lead {
  /** What it was outfitted for; null while empty. */
  good: ArcadeOutfit | null;
  x: number;
  y: number;
  facing: 'left' | 'right';
}

export interface Colonist {
  id: string;
  name: string;
  slot: 0 | 1 | 2 | 3 | 4 | 5;
  species: Species;
  /** Driven by botInput inside step; Lena too on the TV's autopilot. */
  bot: boolean;
  space: Space;
  x: number;
  y: number;
  facing: 'left' | 'right';
  moving: boolean;
  mule: Lead | null;
  money: number;
  /** In the pub: this turn is over. */
  done: boolean;
  installs: number;
  /** A bot's pick at the outfitters, drawn from the seed. */
  plan: ArcadeOutfit;
  /** Ms a bot has stood at its counter. */
  botWait: number;
  /** Where it walked lately, newest last: the MULE on the lead walks it. */
  trail: P[];
}

/** A slice 2–4 happening, queued by the seed: wolves, a glint, the corral scramble. */
export type EventKind = 'wolves' | 'glint' | 'scramble';
export interface WorldEvent {
  atMs: number;
  kind: EventKind;
}

export interface World {
  t: number;
  seed: number;
  rng: number;
  month: number;
  width: number;
  height: number;
  store: P;
  tiles: TileView[];
  colonists: Colonist[];
  storeMules: number;
  queue: WorldEvent[];
  /** Newest last: what happened, for the TV and the tests. */
  log: string[];
  over: boolean;
}

export interface Input {
  /** Each axis -1..1; a joystick may give less than 1 to walk slower. */
  dir: P;
  /** Pressed this step. */
  action: boolean;
  /** Mouse held on a spot of this space: walk toward it. Wins over dir when set. */
  toward?: (P & { space: Space }) | null;
}
export const IDLE: Input = { dir: { x: 0, y: 0 }, action: false };

// --- Seeded randomness (mulberry32, the engine's, kept as a number in the world so step stays pure) ---

function rand(state: number): [number, number] {
  const a = (state + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}

/** Each slice-2–4 event at its rate, as a Poisson stream over the turn; a rate of 0 queues none. */
function schedule(rng: number, tun: Tunables): { queue: WorldEvent[]; rng: number } {
  const queue: WorldEvent[] = [];
  const rates: [EventKind, number][] = [
    ['wolves', tun.events.wolves.perMinute],
    ['glint', tun.events.glint.perMinute],
    ['scramble', tun.events.scramble.perMinute],
  ];
  let r = rng;
  for (const [kind, perMinute] of rates) {
    if (perMinute <= 0) continue;
    let at = 0;
    for (;;) {
      const [u, n] = rand(r);
      r = n;
      at += (-Math.log(1 - u) / perMinute) * 60_000;
      if (at >= tun.devSeconds * 1000) break;
      queue.push({ atMs: at, kind });
    }
  }
  return { queue: queue.sort((a, b) => a.atMs - b.atMs), rng: r };
}

/** Where slices 2–4 plug in: a handler per kind. None is built in slice 1, so a due event is only logged. */
export const EVENT_HANDLERS: Partial<Record<EventKind, (w: World, e: WorldEvent, tun: Tunables) => World>> = {};

export interface Seat {
  id: string;
  name: string;
  slot: Colonist['slot'];
  species: Species;
  bot: boolean;
  start: P;
}

export function initWorld(seed: number, seats: Seat[], tiles: TileView[], size: { width: number; height: number; month: number }, tun: Tunables): World {
  let rng = seed >>> 0;
  const colonists = seats.map((s): Colonist => {
    const [u, n] = rand(rng);
    rng = n;
    return {
      id: s.id, name: s.name, slot: s.slot, species: s.species, bot: s.bot,
      space: 'map', x: s.start.x + 0.5, y: s.start.y + 0.5, facing: 'right', moving: false, mule: null,
      money: tun.seats[s.id]?.money ?? 0, done: false, installs: 0,
      plan: ARCADE_OUTFITS[Math.floor(u * ARCADE_OUTFITS.length)]!, botWait: 0, trail: [],
    };
  });
  const store = tiles.find((t) => t.terrain === 'store')!;
  const sched = schedule(rng, tun);
  return {
    t: 0, seed, rng: sched.rng, month: size.month, width: size.width, height: size.height, store: { x: store.x, y: store.y },
    tiles, colonists, storeMules: tun.storeMules, queue: sched.queue, log: [], over: false,
  };
}

// --- Condition and speed -------------------------------------------------------------------------

export interface Pace {
  foodShare: number;
  hunger: number;
  sick: number;
  species: number;
  /** hunger × sickness, species aside: the DS Condition's conditionPace. */
  condition: number;
  /** All three. */
  total: number;
}

/** The engine's dev-walk pace (hungerPace × sickPace × the Zipwing's perk), linear in the Food held. */
export function paceOf(c: Pick<Colonist, 'id' | 'species'>, tun: Tunables): Pace {
  const s = tun.seats[c.id] ?? { food: 1, need: 1, sick: false, money: 0 };
  const foodShare = Math.min(1, s.food / Math.max(1, s.need));
  const hunger = 1 - (1 - tun.hungerPaceMin) * (1 - foodShare);
  const sick = s.sick ? tun.sickPace : 1;
  const species = c.species === 'zipwing' ? tun.zipwingSpeed : 1;
  return { foodShare, hunger, sick, species, condition: hunger * sick, total: hunger * sick * species };
}

/** The hall: 16 × 12 units, the 4:3 floor every view draws StoreInterior at. */
export const HALL = { w: 16, h: 12 };

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * DS-GAP: StoreInterior (packages/ui Store.tsx) lays its rooms out in % of the hall but exports no floor plan, so its
 * TOP, BOT, X0, X1, COL, BOTTOM and DOOR are mirrored here. If Store.tsx moves a room, this copy drifts: the DS should
 * export its plan for a free-walking colonist.
 */
const TOP = { y0: 3, y1: 39 };
const BOT = { y0: 60, y1: 97 };
const X0 = 9;
const X1 = 91;
const COL = (X1 - X0) / 6;
const SHOP_ORDER = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth'] as const;
const BOTTOM = { works: [9, 36], greenBelt: [37, 46], corral: [47, 73], pub: [74, 91] } as const;

export type HallRoom = (typeof SHOP_ORDER)[number] | keyof typeof BOTTOM | 'doorL' | 'doorR';

/** Each room's box in % of the hall, as StoreInterior draws it. */
export const ROOMS: Record<HallRoom, Rect> = {
  ...(Object.fromEntries(SHOP_ORDER.map((g, i) => [g, { x0: X0 + COL * i + 0.4, x1: X0 + COL * (i + 1) - 0.4, y0: TOP.y0, y1: TOP.y1 }])) as Record<(typeof SHOP_ORDER)[number], Rect>),
  ...(Object.fromEntries(Object.entries(BOTTOM).map(([k, [x0, x1]]) => [k, { x0, x1, y0: BOT.y0, y1: BOT.y1 }])) as Record<keyof typeof BOTTOM, Rect>),
  doorL: { x0: 0.6, x1: 7.6, y0: 30, y1: 70 },
  doorR: { x0: 92.4, x1: 99.4, y0: 30, y1: 70 },
};
export const OPEN_ROOMS: HallRoom[] = ['food', 'energy', 'smithore', 'crystite', 'corral', 'pub', 'doorL', 'doorR'];

/** The body's clearance from walls, in % of the hall. */
const MX = 1.5;
const MY = 3;
/**
 * Where a colonist's feet may stand: the walkway, the doorways, and each open room, which overlaps the walkway by a
 * little so you walk straight in. Shut rooms are walls.
 */
const WALKABLE: Rect[] = [
  { x0: 3, x1: 97, y0: TOP.y1 + MY, y1: BOT.y0 - MY },
  { x0: 0.2, x1: 8, y0: 30 + MY, y1: 70 - MY },
  { x0: 92, x1: 99.8, y0: 30 + MY, y1: 70 - MY },
  ...OPEN_ROOMS.filter((r) => r !== 'doorL' && r !== 'doorR').map((r) => {
    const b = ROOMS[r];
    return b.y1 <= TOP.y1
      ? { x0: b.x0 + MX, x1: b.x1 - MX, y0: b.y0 + MY, y1: TOP.y1 + MY + 1 }
      : { x0: b.x0 + MX, x1: b.x1 - MX, y0: BOT.y0 - MY - 1, y1: b.y1 - MY };
  }),
];
const inRect = (r: Rect, x: number, y: number) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
const pct = (p: P): P => ({ x: (p.x / HALL.w) * 100, y: (p.y / HALL.h) * 100 });
const units = (x: number, y: number): P => ({ x: (x / 100) * HALL.w, y: (y / 100) * HALL.h });
const walkable = (p: P) => {
  const q = pct(p);
  return WALKABLE.some((r) => inRect(r, q.x, q.y));
};

/** The room a point in the hall stands in, or null on the walkway. */
export function roomAt(p: P): HallRoom | null {
  const q = pct(p);
  for (const r of Object.keys(ROOMS) as HallRoom[]) if (inRect(ROOMS[r], q.x, q.y)) return r;
  return null;
}

/** Inside each door, and in front of the corral: StoreInterior's SPOT, so the floor crossing is today's. */
const DOOR_SPOT = { doorL: units(4.5, 50), doorR: units(95.5, 50) };
const CORRAL_SPOT = units(60, 54);
const HALL_CROSS = Math.hypot(CORRAL_SPOT.x - DOOR_SPOT.doorL.x, CORRAL_SPOT.y - DOOR_SPOT.doorL.y);

/** Map clearance in tiles, and the band of the store's left and right faces that is its door. */
const R = 0.18;
const DOOR_BAND = 0.25;

export function tileAt(w: World, x: number, y: number): TileView | undefined {
  if (x < 0 || y < 0 || x >= w.width || y >= w.height) return undefined;
  return w.tiles[Math.floor(y) * w.width + Math.floor(x)];
}

export const terrainMult = (tun: Tunables, t: Terrain) => (t === 'store' ? 1 : tun.terrain[t]);

export interface Speed {
  /** Tiles a second on the map, hall units a second in the store. */
  perSecond: number;
  /** The land underfoot, or null in the store. */
  terrain: Terrain | null;
  ground: number;
  pace: Pace;
  lead: number;
}

export function speedOf(w: World, c: Colonist, tun: Tunables): Speed {
  const pace = paceOf(c, tun);
  const lead = c.mule ? tun.leadPace : 1;
  if (c.space === 'hall') return { perSecond: (HALL_CROSS / Math.max(0.05, tun.floorSeconds)) * pace.total * lead, terrain: null, ground: 1, pace, lead };
  const t = tileAt(w, c.x, c.y)?.terrain ?? 'plains';
  const ground = terrainMult(tun, t);
  return { perSecond: tun.mapTilesPerSecond * ground * pace.total * lead, terrain: t, ground, pace, lead };
}

// --- Moving ------------------------------------------------------------------------------------

const inStore = (w: World, x: number, y: number) => x > w.store.x - R && x < w.store.x + 1 + R && y > w.store.y - R && y < w.store.y + 1 + R;
const doorY = (w: World) => w.store.y + 0.5;
const inDoorBand = (w: World, y: number) => Math.abs(y - doorY(w)) < DOOR_BAND;

function passable(w: World, tun: Tunables, x: number, y: number): boolean {
  if (x < R || y < R || x > w.width - R || y > w.height - R) return false;
  if (inStore(w, x, y)) return false;
  for (const [cx, cy] of [[x - R, y - R], [x + R, y - R], [x - R, y + R], [x + R, y + R]] as const) {
    const t = tileAt(w, cx, cy);
    if (!t || terrainMult(tun, t.terrain) <= 0) return false;
  }
  return true;
}

/** Just outside each of the store's doors on the map. */
export const doorOutside = (w: World, side: 'L' | 'R'): P => ({ x: side === 'L' ? w.store.x - R - 0.12 : w.store.x + 1 + R + 0.12, y: doorY(w) });

function mapMove(w: World, tun: Tunables, c: Colonist, dx: number, dy: number): { x: number; y: number; enter: 'L' | 'R' | null } {
  let { x, y } = c;
  const nx = x + dx;
  if (inStore(w, nx, y)) {
    const fromL = x <= w.store.x - R && dx > 0;
    const fromR = x >= w.store.x + 1 + R && dx < 0;
    if ((fromL || fromR) && inDoorBand(w, y)) return { x, y, enter: fromL ? 'L' : 'R' };
    // Pushing into the store's face near its door slides you onto the door, so it is easy to find.
    if ((fromL || fromR) && Math.abs(y - doorY(w)) < 0.5 && dy === 0) {
      const toward = Math.sign(doorY(w) - y) * Math.min(Math.abs(dx), Math.abs(doorY(w) - y));
      if (passable(w, tun, x, y + toward)) y += toward;
    }
  } else if (passable(w, tun, nx, y)) x = nx;
  const ny = y + dy;
  if (passable(w, tun, x, ny)) y = ny;
  return { x, y, enter: null };
}

function hallMove(c: Colonist, dx: number, dy: number): { x: number; y: number; exit: 'L' | 'R' | null } {
  let { x, y } = c;
  // Out through a doorway: judged on where the step would land, so a fast step past the threshold still leaves.
  const room = roomAt(c);
  const to = pct({ x: x + dx, y: y + dy });
  if (room === 'doorL' && to.x < 1.2) return { x, y, exit: 'L' };
  if (room === 'doorR' && to.x > 98.8) return { x, y, exit: 'R' };
  if (walkable({ x: x + dx, y })) x += dx;
  if (walkable({ x, y: y + dy })) y += dy;
  return { x, y, exit: null };
}

/** The point `len` back along the trail; the trail's oldest point when it is shorter. */
function alongTrail(trail: P[], head: P, len: number): P {
  let left = len;
  let a = head;
  for (let i = trail.length - 1; i >= 0; i--) {
    const b = trail[i]!;
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d >= left) {
      const k = left / d;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    left -= d;
    a = b;
  }
  return a;
}

const leadLength = (space: Space, tun: Tunables) => (space === 'map' ? tun.leadTiles : tun.leadTiles * 2.2);

function follow(c: Colonist, tun: Tunables): Colonist {
  if (!c.mule) return c;
  const at = alongTrail(c.trail, c, leadLength(c.space, tun));
  const dx = at.x - c.mule.x;
  const facing = Math.abs(dx) < 0.002 ? c.mule.facing : dx > 0 ? 'right' : 'left';
  return { ...c, mule: { ...c.mule, x: at.x, y: at.y, facing } };
}

/** Into a new space: the trail starts afresh behind you, so the MULE comes through the door after you. */
function arrive(c: Colonist, space: Space, at: P, facing: 'left' | 'right', tun: Tunables): Colonist {
  const back = leadLength(space, tun) * (facing === 'right' ? -1 : 1);
  const behind = { x: at.x + back, y: at.y };
  return { ...c, space, x: at.x, y: at.y, facing, trail: [behind, at], mule: c.mule ? { ...c.mule, x: behind.x, y: behind.y, facing } : null };
}

const enterHall = (c: Colonist, side: 'L' | 'R', tun: Tunables) => arrive(c, 'hall', side === 'L' ? DOOR_SPOT.doorL : DOOR_SPOT.doorR, side === 'L' ? 'right' : 'left', tun);
const leaveHall = (w: World, c: Colonist, side: 'L' | 'R', tun: Tunables) => arrive(c, 'map', doorOutside(w, side), side === 'L' ? 'left' : 'right', tun);

// --- What the action button does -----------------------------------------------------------------

export type ReachKind = 'enter' | 'buy' | 'outfit' | 'leave' | 'install' | 'pub' | 'none';
export interface Reach {
  kind: ReachKind;
  /** The button's words, e.g. "BUY MULE"; with `detail`, e.g. "139 cr". */
  verb: string;
  detail?: string;
  /** False: dim, and pressing does nothing; the words say what to do instead. */
  enabled: boolean;
  /** The thing in reach, for the views to highlight and the mouse to click. */
  target?: { space: 'map'; door: 'L' | 'R' } | { space: 'map'; tile: P } | { space: 'hall'; room: HallRoom };
  outfit?: ArcadeOutfit;
}

const NAME: Record<ArcadeOutfit, string> = { food: 'FOOD', energy: 'ENERGY', smithore: 'SMITHORE', crystite: 'CRYSTITE' };
export const pubPayout = (w: World, tun: Tunables) => {
  const left = Math.max(0, tun.devSeconds * 1000 - w.t) / (tun.devSeconds * 1000);
  return Math.round(DEVELOPMENT.pub.base + (DEVELOPMENT.pub.start + w.month * DEVELOPMENT.pub.perMonth) * left);
};
export const freePlotsOf = (w: World, id: string) => w.tiles.filter((t) => t.owner === id && !t.outfit);

/** What pressing the action button would do right now, for this colonist. Never a menu: one thing, or a dim hint. */
export function reachOf(w: World, c: Colonist, tun: Tunables): Reach {
  if (w.over) return { kind: 'none', verb: 'DEVELOPMENT OVER', enabled: false };
  if (c.done) return { kind: 'none', verb: 'IN THE PUB', detail: 'turn over', enabled: false };
  const price = mulePrice(tun);
  if (c.space === 'hall') {
    const room = roomAt(c);
    if (room === 'doorL' || room === 'doorR') return { kind: 'leave', verb: 'LEAVE', detail: c.mule ? 'with your MULE' : 'to the colony', enabled: true, target: { space: 'hall', room } };
    if (room === 'pub') return { kind: 'pub', verb: 'PUB · END TURN', detail: `+${pubPayout(w, tun)} cr${c.mule ? ' · MULE back' : ''}`, enabled: true, target: { space: 'hall', room } };
    if (room === 'corral') {
      const target = { space: 'hall' as const, room };
      if (c.mule) return { kind: 'none', verb: c.mule.good ? 'MULE ON LEAD' : 'TO AN OUTFITTER', enabled: false };
      if (w.storeMules <= 0) return { kind: 'none', verb: 'SOLD OUT', enabled: false };
      if (c.money < price) return { kind: 'buy', verb: 'BUY MULE', detail: `need ${price} cr`, enabled: false, target };
      return { kind: 'buy', verb: 'BUY MULE', detail: `${price} cr`, enabled: true, target };
    }
    if (room && (ARCADE_OUTFITS as readonly string[]).includes(room)) {
      const g = room as ArcadeOutfit;
      const target = { space: 'hall' as const, room };
      const cost = tun.outfit[g];
      if (!c.mule) return { kind: 'outfit', verb: `OUTFIT · ${NAME[g]}`, detail: 'needs a MULE', enabled: false, target, outfit: g };
      if (c.mule.good === g) return { kind: 'none', verb: `FITTED · ${NAME[g]}`, detail: 'now to a door', enabled: false };
      if (c.money < cost) return { kind: 'outfit', verb: `OUTFIT · ${NAME[g]}`, detail: `need ${cost} cr`, enabled: false, target, outfit: g };
      return { kind: 'outfit', verb: `${c.mule.good ? 'REFIT' : 'OUTFIT'} · ${NAME[g]}`, detail: `${cost} cr`, enabled: true, target, outfit: g };
    }
    if (room) return { kind: 'none', verb: 'CLOSED', detail: 'not in slice 1', enabled: false };
    return { kind: 'none', verb: !c.mule ? 'TO THE CORRAL' : !c.mule.good ? 'TO AN OUTFITTER' : 'TO A DOOR', enabled: false };
  }
  for (const side of ['L', 'R'] as const) {
    const d = doorOutside(w, side);
    if (Math.hypot(c.x - d.x, c.y - d.y) < 0.6) return { kind: 'enter', verb: 'ENTER STORE', enabled: true, target: { space: 'map', door: side } };
  }
  const t = tileAt(w, c.x, c.y);
  const mine = t && t.owner === c.id;
  if (mine && t.outfit && c.mule?.good) return { kind: 'none', verb: 'PLOT HAS A MULE', detail: 'try a free plot', enabled: false };
  if (mine && c.mule?.good) return { kind: 'install', verb: `INSTALL · ${NAME[c.mule.good]}`, enabled: true, target: { space: 'map', tile: { x: t.x, y: t.y } }, outfit: c.mule.good };
  if (mine && c.mule) return { kind: 'none', verb: 'OUTFIT IT FIRST', detail: 'in the store', enabled: false };
  if (c.mule?.good) return { kind: 'none', verb: 'TO YOUR PLOT', detail: t?.owner ? 'not yours' : undefined, enabled: false };
  if (c.installs > 0 && !c.mule) return { kind: 'none', verb: 'TO THE STORE', detail: 'MULE or pub', enabled: false };
  return { kind: 'none', verb: 'TO THE STORE', enabled: false };
}

function act(w: World, c: Colonist, tun: Tunables): { w: World; c: Colonist } {
  const r = reachOf(w, c, tun);
  if (!r.enabled) return { w, c };
  const say = (line: string) => [...w.log, `${(w.t / 1000).toFixed(1)}s ${c.name} ${line}`].slice(-40);
  switch (r.kind) {
    case 'enter':
      return { w, c: enterHall(c, r.target && 'door' in r.target ? r.target.door : 'L', tun) };
    case 'leave':
      return { w, c: leaveHall(w, c, roomAt(c) === 'doorR' ? 'R' : 'L', tun) };
    case 'buy': {
      const price = mulePrice(tun);
      const behind = alongTrail(c.trail, c, leadLength('hall', tun));
      return { w: { ...w, storeMules: w.storeMules - 1, log: say(`bought a MULE (${price} cr)`) }, c: { ...c, money: c.money - price, mule: { good: null, x: behind.x, y: behind.y, facing: c.facing } } };
    }
    case 'outfit': {
      const g = r.outfit!;
      return { w: { ...w, log: say(`outfitted for ${NAME[g]} (${tun.outfit[g]} cr)`) }, c: { ...c, money: c.money - tun.outfit[g], mule: { ...c.mule!, good: g } } };
    }
    case 'install': {
      const at = r.target && 'tile' in r.target ? r.target.tile : { x: Math.floor(c.x), y: Math.floor(c.y) };
      const tiles = w.tiles.map((t) => (t.x === at.x && t.y === at.y ? { ...t, outfit: c.mule!.good } : t));
      return { w: { ...w, tiles, log: say(`installed ${NAME[c.mule!.good!]} on ${at.x + 1}·${at.y + 1}`) }, c: { ...c, mule: null, installs: c.installs + 1 } };
    }
    case 'pub': {
      const pay = pubPayout(w, tun);
      return { w: { ...w, storeMules: w.storeMules + (c.mule ? 1 : 0), log: say(`went to the pub (+${pay} cr)`) }, c: { ...c, money: c.money + pay, done: true, moving: false, mule: null } };
    }
    default:
      return { w, c };
  }
}

// --- Bots --------------------------------------------------------------------------------------

/** Cheapest path in tiles (4-way, cost 1/terrain), avoiding the store's tile and impassable land; null if none. */
export function pathTo(w: World, tun: Tunables, from: P, to: P): P[] | null {
  const n = w.width * w.height;
  const idx = (x: number, y: number) => y * w.width + x;
  const cost = (i: number) => {
    const t = w.tiles[i]!;
    if (t.terrain === 'store') return Infinity;
    const m = terrainMult(tun, t.terrain);
    return m > 0 ? 1 / m : Infinity;
  };
  const dist = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  const s = idx(from.x, from.y);
  const g = idx(to.x, to.y);
  dist[s] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i]! < Infinity && (u < 0 || dist[i]! < dist[u]!)) u = i;
    if (u < 0) return null;
    if (u === g) break;
    done[u] = true;
    const ux = u % w.width;
    const uy = Math.floor(u / w.width);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const vx = ux + dx;
      const vy = uy + dy;
      if (vx < 0 || vy < 0 || vx >= w.width || vy >= w.height) continue;
      const v = idx(vx, vy);
      const d = dist[u]! + cost(v);
      if (d < dist[v]!) {
        dist[v] = d;
        prev[v] = u;
      }
    }
  }
  const out: P[] = [];
  for (let v = g; v >= 0; v = prev[v]!) out.unshift({ x: v % w.width, y: Math.floor(v / w.width) });
  return out;
}

const toward = (from: P, to: P, near = 0.06): P => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  return d < near ? { x: 0, y: 0 } : { x: dx / d, y: dy / d };
};
const centreOf = (r: Rect): P => units((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2);
const WALKWAY_Y = units(0, (TOP.y1 + BOT.y0) / 2).y;

type Goal = { kind: 'room'; room: HallRoom } | { kind: 'plot'; at: P } | { kind: 'store' } | { kind: 'door'; side: 'L' | 'R' } | { kind: 'idle' };

function botGoal(w: World, c: Colonist, tun: Tunables): Goal {
  if (c.done) return { kind: 'idle' };
  const plot = freePlotsOf(w, c.id)[0];
  const side = (x: number): 'L' | 'R' => (x < w.store.x + 0.5 ? 'L' : 'R');
  const pub: Goal = c.space === 'hall' ? { kind: 'room', room: 'pub' } : { kind: 'store' };
  const affordable = ARCADE_OUTFITS.filter((g) => tun.outfit[g] <= c.money);
  if (c.installs > 0 || !plot) return pub;
  if (!c.mule) {
    if (w.storeMules <= 0 || c.money < mulePrice(tun) + Math.min(...ARCADE_OUTFITS.map((g) => tun.outfit[g]))) return pub;
    return c.space === 'hall' ? { kind: 'room', room: 'corral' } : { kind: 'store' };
  }
  if (!c.mule.good) {
    if (c.space !== 'hall') return { kind: 'store' };
    const g = tun.outfit[c.plan] <= c.money ? c.plan : affordable[0];
    return g ? { kind: 'room', room: g } : { kind: 'room', room: 'pub' };
  }
  return c.space === 'hall' ? { kind: 'door', side: side(plot.x) } : { kind: 'plot', at: { x: plot.x, y: plot.y } };
}

/** A bot's input from the world alone: where it is heading next, and whether it presses its action. */
export function botInput(w: World, c: Colonist, tun: Tunables): Input {
  const goal = botGoal(w, c, tun);
  const ready = c.botWait >= tun.botThinkSeconds * 1000;
  const press = (at: boolean): Input => (at ? { dir: { x: 0, y: 0 }, action: ready } : IDLE);
  if (goal.kind === 'idle') return IDLE;
  if (c.space === 'hall') {
    const room = roomAt(c);
    if (goal.kind === 'room' && room === goal.room) return { ...press(true), dir: toward(c, centreOf(ROOMS[goal.room]), 0.5) };
    const target = goal.kind === 'door' ? units(goal.side === 'L' ? 0.4 : 99.6, 50) : goal.kind === 'room' ? centreOf(ROOMS[goal.room]) : DOOR_SPOT.doorL;
    // Out of a room onto the walkway first, along the walkway, then straight in.
    if (room && room !== 'doorL' && room !== 'doorR') return { dir: toward(c, { x: c.x, y: WALKWAY_Y }), action: false };
    if (Math.abs(c.x - target.x) > 0.3 && goal.kind === 'room') return { dir: toward(c, { x: target.x, y: WALKWAY_Y }), action: false };
    return { dir: toward(c, target), action: false };
  }
  const here = { x: Math.floor(c.x), y: Math.floor(c.y) };
  const side: 'L' | 'R' = c.x < w.store.x + 0.5 ? 'L' : 'R';
  const goalTile = goal.kind === 'plot' ? goal.at : { x: side === 'L' ? w.store.x - 1 : w.store.x + 1, y: w.store.y };
  if (here.x === goalTile.x && here.y === goalTile.y) {
    if (goal.kind === 'plot') {
      const centre = { x: goal.at.x + 0.5, y: goal.at.y + 0.5 };
      if (Math.hypot(c.x - centre.x, c.y - centre.y) < 0.2) return press(true);
      return { dir: toward(c, centre), action: false };
    }
    // Line up on the door, then walk in through it.
    const d = doorOutside(w, side);
    if (Math.abs(c.y - d.y) > 0.1) return { dir: toward(c, { x: d.x, y: d.y }, 0.02), action: false };
    return { dir: { x: side === 'L' ? 1 : -1, y: 0 }, action: false };
  }
  const path = pathTo(w, tun, here, goalTile);
  if (!path || path.length < 2) return IDLE;
  const next = path[1]!;
  return { dir: toward(c, { x: next.x + 0.5, y: next.y + 0.5 }), action: false };
}

// --- The step ----------------------------------------------------------------------------------

function stepColonist(w: World, c0: Colonist, input: Input, dtMs: number, tun: Tunables): { w: World; c: Colonist } {
  let c = c0;
  let dir = input.dir;
  if (input.toward && input.toward.space === c.space) dir = toward(c, input.toward, 0.08);
  const mag = Math.min(1, Math.hypot(dir.x, dir.y));
  if (mag > 0.05) {
    const len = Math.hypot(dir.x, dir.y);
    const d = (speedOf(w, c, tun).perSecond * dtMs) / 1000;
    const dx = (dir.x / len) * mag * d;
    const dy = (dir.y / len) * mag * d;
    const facing = dir.x > 0.05 ? 'right' : dir.x < -0.05 ? 'left' : c.facing;
    if (c.space === 'map') {
      const m = mapMove(w, tun, c, dx, dy);
      c = m.enter ? enterHall(c, m.enter, tun) : { ...c, x: m.x, y: m.y, facing };
    } else {
      const m = hallMove(c, dx, dy);
      c = m.exit ? leaveHall(w, c, m.exit, tun) : { ...c, x: m.x, y: m.y, facing };
    }
    const last = c.trail[c.trail.length - 1];
    const moved = c.x !== c0.x || c.y !== c0.y;
    if (!last || Math.hypot(c.x - last.x, c.y - last.y) > 0.04) c = { ...c, trail: [...c.trail, { x: c.x, y: c.y }].slice(-48) };
    c = follow({ ...c, moving: moved }, tun);
  } else if (c.moving) c = { ...c, moving: false };
  c = { ...c, botWait: c.bot && mag <= 0.05 && !input.action ? c.botWait + dtMs : 0 };
  if (input.action) return act(w, c, tun);
  return { w, c };
}

/**
 * One fixed step of the whole world. `inputs` holds the humans' inputs by colonist id; every bot's comes from botInput
 * on the same world, so bots walk by the same rules. Due events run their slice's handler, or are logged.
 */
export function step(w0: World, inputs: Record<string, Input>, dtMs: number, tun: Tunables): World {
  if (w0.over) return w0;
  let w: World = { ...w0, t: w0.t + dtMs };
  const colonists: Colonist[] = [];
  for (const c0 of w0.colonists) {
    if (c0.done) {
      colonists.push(c0);
      continue;
    }
    const input = c0.bot ? botInput(w, c0, tun) : (inputs[c0.id] ?? IDLE);
    const r = stepColonist(w, c0, input, dtMs, tun);
    w = r.w;
    colonists.push(r.c);
  }
  w = { ...w, colonists };
  while (w.queue.length > 0 && w.queue[0]!.atMs <= w.t) {
    const [e, ...rest] = w.queue;
    w = { ...w, queue: rest };
    const handle = EVENT_HANDLERS[e!.kind];
    w = handle ? handle(w, e!, tun) : { ...w, log: [...w.log, `${(w.t / 1000).toFixed(1)}s ${e!.kind} (a later slice: not built)`].slice(-40) };
  }
  if (w.t >= tun.devSeconds * 1000 || w.colonists.every((c) => c.done)) w = { ...w, over: true, colonists: w.colonists.map((c) => ({ ...c, moving: false })) };
  return w;
}

// --- Outside the step: the review page's own controls ----------------------------------------------

/** Drop a colonist on a tile of the map, to feel a land's speed (the tunables' test track). */
export function teleport(w: World, id: string, at: P, tun: Tunables): World {
  return { ...w, colonists: w.colonists.map((c) => (c.id === id ? arrive(c, 'map', at, 'right', tun) : c)) };
}

export const setBot = (w: World, id: string, bot: boolean): World => ({ ...w, colonists: w.colonists.map((c) => (c.id === id ? { ...c, bot, botWait: 0 } : c)) });
