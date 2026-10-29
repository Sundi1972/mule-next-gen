import type { RawGood } from '../types.js';
import { PERCENT } from '../units.js';

/**
 * The store's hall as one floor plan: the floor's walls and reach read it, and StoreInterior draws from it (spec C2).
 * In hall units, 16 across by 12 down, the 4:3 the hall is drawn at: a unit is as long across as down.
 */

export interface HallPoint {
  readonly x: number;
  readonly y: number;
}

/** A box on the hall's floor; y runs down. */
export interface HallRect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** The shopfronts along the back wall, left to right: an outfitter for each raw good. */
export const HALL_OUTFITTERS = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth'] as const satisfies readonly RawGood[];
const FRONT_ROW = ['works', 'greenBelt', 'corral', 'pub'] as const;
export const HALL_ROOMS = [...HALL_OUTFITTERS, ...FRONT_ROW] as const;
/** The airlocks on the store's left and right faces: each is the way out to the map and the way in on its side. */
export const HALL_DOORS = ['doorL', 'doorR'] as const;

export type HallRoom = (typeof HALL_ROOMS)[number];
export type HallDoor = (typeof HALL_DOORS)[number];
export type HallPlace = HallRoom | HallDoor;

export interface HallPlan {
  /** Width and height in hall units. */
  readonly w: number;
  readonly h: number;
  /** Each room's walls as the hall draws them; standing inside one is being at it. */
  readonly rooms: Readonly<Record<HallRoom, HallRect>>;
  /** Each airlock's frame; standing inside one is being at a door. */
  readonly doors: Readonly<Record<HallDoor, HallRect>>;
  /** Where a colonist stands for a place: on the walkway before a room's middle, or just inside a door. */
  readonly spots: Readonly<Record<HallPlace, HallPoint>>;
  /** Where a colonist's feet may stand: the walkway, the doorways and every room, a body's width off the walls. */
  readonly floor: readonly HallRect[];
}

const SIZE = { w: 16, h: 12 }; // literal-ok: hall units, the arcade mock's 4:3 floor (its sim.ts HALL)

// StoreInterior's layout in % of the hall, as Store.tsx gives it.
const TOP = { y0: 3, y1: 39 }; // literal-ok: the shopfronts' band, Store.tsx TOP
const BOT = { y0: 60, y1: 97 }; // literal-ok: the front row's band, Store.tsx BOT
const SHOPFRONTS = { x0: 9, x1: 91, gap: 0.4 }; // literal-ok: Store.tsx X0 and X1, and the 0.4 each shopfront keeps from its column's edge
const FRONT: Record<(typeof FRONT_ROW)[number], [number, number]> = { works: [9, 36], greenBelt: [37, 46], corral: [47, 73], pub: [74, 91] }; // literal-ok: Store.tsx BOTTOM, each room's left and right
const AIRLOCK: Record<HallDoor, [number, number]> = { doorL: [0.6, 7.6], doorR: [92.4, 99.4] }; // literal-ok: Store.tsx Door, 7 % wide and 0.6 % in from each side
const AIRLOCK_Y = { y0: 30, y1: 70 }; // literal-ok: Store.tsx DOOR, the airlocks across the walkway
const SPOT_Y = { shopfronts: 46, front: 54, doors: 50 }; // literal-ok: Store.tsx SPOT's rows, before each row and in the doors
const DOOR_SPOT_X: Record<HallDoor, number> = { doorL: 4.5, doorR: 95.5 }; // literal-ok: Store.tsx SPOT's doors, just inside each airlock

// Where feet may stand, in % of the hall: the arcade mock's walkable floor (its sim.ts WALKABLE).
const CLEAR = { x: 1.5, y: 3 }; // literal-ok: a body's clearance from a wall, the mock's MX and MY
const WALKWAY_X = { x0: 3, x1: 97 }; // literal-ok: the walkway's ends, under the airlocks
const DOORWAY_X: Record<HallDoor, [number, number]> = { doorL: [0.2, 8], doorR: [92, 99.8] }; // literal-ok: each doorway, a little wider than its airlock
/** A room's floor runs this far past its open front into the walkway's, so the two join. */
const OVERLAP = 1;

const COL = (SHOPFRONTS.x1 - SHOPFRONTS.x0) / HALL_OUTFITTERS.length;
const middle = (a: number, b: number) => (a + b) / 2; // literal-ok: halfway between two edges

const shopfrontsPct = HALL_OUTFITTERS.map((good, i) => ({
  place: good,
  box: { x0: SHOPFRONTS.x0 + COL * i + SHOPFRONTS.gap, x1: SHOPFRONTS.x0 + COL * (i + 1) - SHOPFRONTS.gap, ...TOP },
}));
const frontRowPct = FRONT_ROW.map((room) => ({ place: room, box: { x0: FRONT[room][0], x1: FRONT[room][1], ...BOT } }));
const doorsPct = HALL_DOORS.map((door) => ({ place: door, box: { x0: AIRLOCK[door][0], x1: AIRLOCK[door][1], ...AIRLOCK_Y } }));

const spotsPct = [
  ...shopfrontsPct.map(({ place, box }) => ({ place, at: { x: middle(box.x0, box.x1), y: SPOT_Y.shopfronts } })),
  ...frontRowPct.map(({ place, box }) => ({ place, at: { x: middle(box.x0, box.x1), y: SPOT_Y.front } })),
  ...HALL_DOORS.map((door) => ({ place: door, at: { x: DOOR_SPOT_X[door], y: SPOT_Y.doors } })),
];

// A room is walled on its sides and back; its front is open to the walkway.
const floorPct: HallRect[] = [
  { ...WALKWAY_X, y0: TOP.y1 + CLEAR.y, y1: BOT.y0 - CLEAR.y },
  ...HALL_DOORS.map((door) => ({ x0: DOORWAY_X[door][0], x1: DOORWAY_X[door][1], y0: AIRLOCK_Y.y0 + CLEAR.y, y1: AIRLOCK_Y.y1 - CLEAR.y })),
  ...shopfrontsPct.map(({ box }) => ({ x0: box.x0 + CLEAR.x, x1: box.x1 - CLEAR.x, y0: box.y0 + CLEAR.y, y1: TOP.y1 + CLEAR.y + OVERLAP })),
  ...frontRowPct.map(({ box }) => ({ x0: box.x0 + CLEAR.x, x1: box.x1 - CLEAR.x, y0: BOT.y0 - CLEAR.y - OVERLAP, y1: box.y1 - CLEAR.y })),
];

const ux = (pct: number) => (pct / PERCENT) * SIZE.w;
const uy = (pct: number) => (pct / PERCENT) * SIZE.h;
const toUnits = (r: HallRect): HallRect => ({ x0: ux(r.x0), y0: uy(r.y0), x1: ux(r.x1), y1: uy(r.y1) });
const boxes = <K extends HallPlace>(rows: { place: K; box: HallRect }[]) => rows.map(({ place, box }) => [place, toUnits(box)] as const);

/** The store's hall. */
export const HALL: HallPlan = {
  ...SIZE,
  rooms: Object.fromEntries([...boxes(shopfrontsPct), ...boxes(frontRowPct)]) as Record<HallRoom, HallRect>,
  doors: Object.fromEntries(boxes(doorsPct)) as Record<HallDoor, HallRect>,
  spots: Object.fromEntries(spotsPct.map(({ place, at }) => [place, { x: ux(at.x), y: uy(at.y) }])) as Record<HallPlace, HallPoint>,
  floor: floorPct.map(toUnits),
};

const contains = (r: HallRect, p: HallPoint) => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;

/** The room or door p stands in, or null on the walkway. */
export function placeAt(p: HallPoint, plan: HallPlan = HALL): HallPlace | null {
  for (const door of HALL_DOORS) if (contains(plan.doors[door], p)) return door;
  for (const room of HALL_ROOMS) if (contains(plan.rooms[room], p)) return room;
  return null;
}

/** Whether a colonist's feet may stand at p. */
export function isOpenFloor(p: HallPoint, plan: HallPlan = HALL): boolean {
  return plan.floor.some((r) => contains(r, p));
}
