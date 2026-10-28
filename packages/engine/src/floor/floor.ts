/**
 * The dev floor: where every colonist stands in development. Held beside GameState, built when development starts,
 * and moved only by stepFloor.
 */
import { DEV_STEER, WOLVES } from '../config.js';
import { pace } from '../dev-walk.js';
import type { GameState, Outfit, Tile } from '../types.js';

export type Space = 'map' | 'hall';
export type DoorSide = 'L' | 'R';
export const DOOR_SIDES: readonly DoorSide[] = ['L', 'R'];

export interface FloorPoint {
  x: number;
  y: number;
}

export interface FloorRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * The store's hall as the floor walks it, in the plan's own units, the same length across and down. Crossing its
 * width takes DEV_STEER.floorSeconds at full pace.
 */
export interface HallPlan {
  width: number;
  height: number;
  /** Where feet may stand: the walkway, the doorways and the open rooms. Anywhere else is wall. */
  floor: readonly FloorRect[];
  /** Each door, inside the floor. A step out through its outer side (left of L, right of R) leaves for the map. */
  doors: Readonly<Record<DoorSide, FloorRect>>;
}

export interface FloorConfig {
  steer: typeof DEV_STEER;
  wolves: Pick<typeof WOLVES, 'bittenPace'>;
  hall: HallPlan;
}

/** One seat's input for a tick: the stick, each axis -1 to 1, and whether the button was pressed since the last tick. */
export interface FloorInput {
  x: number;
  y: number;
  act: boolean;
}

export const IDLE_INPUT: FloorInput = { x: 0, y: 0, act: false };

/** A MULE on its lead, walking behind its colonist. */
export interface FloorLead {
  /** What it is outfitted for; null while empty. */
  good: Outfit | null;
  x: number;
  y: number;
}

/** A wolf encounter's stage. */
export interface FloorEncounter {
  stage: 'choose' | 'chase' | 'fight';
}

export interface FloorColonist {
  /** The seat's player id. */
  id: string;
  space: Space;
  /** In tiles on the map; in the hall plan's units in the hall. */
  x: number;
  y: number;
  facing: 'left' | 'right';
  /** It moved on the last tick. */
  moving: boolean;
  /** Whether there is one, and its good, follow the player's carriedMule; the floor keeps where it walks. */
  lead: FloorLead | null;
  /** dev-walk.ts's pace when development started: hunger × sickness × the Zipwing's perk. */
  pace: number;
  /** An AI seat's colonist. */
  bot: boolean;
  bitten: boolean;
  encounter: FloorEncounter | null;
  pelts: number;
}

export interface DevFloor {
  /** Ticks stepped since development started. */
  tick: number;
  /** In seat order. */
  colonists: readonly FloorColonist[];
}

const HALF = 0.5; // literal-ok: geometry, the middle of a side, not balance

/** The live config objects, so a sim run's --set reaches the floor, and a hall plan. */
export function floorConfig(hall: HallPlan): FloorConfig {
  return { steer: DEV_STEER, wolves: WOLVES, hall };
}

export function storeOf(state: GameState): Tile {
  return state.tiles.find((t) => t.terrain === 'store')!;
}

/** Where a colonist stands on the map just outside one of the store's doors, at the middle of that side. */
export function doorOutside(state: GameState, side: DoorSide, cfg: FloorConfig): FloorPoint {
  const store = storeOf(state);
  const body = cfg.steer.bodyTiles;
  return { x: side === 'L' ? store.x - body : store.x + 1 + body, y: store.y + HALF };
}

export const middleOf = (r: FloorRect): FloorPoint => ({ x: r.x0 + (r.x1 - r.x0) * HALF, y: r.y0 + (r.y1 - r.y0) * HALF });

export const inRect = (r: FloorRect, x: number, y: number): boolean => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;

/** A MULE for the player's carriedMule, standing where its old one stood or else at its colonist; none without one. */
export function leadFor(state: GameState, c: Pick<FloorColonist, 'id' | 'x' | 'y' | 'lead'>): FloorLead | null {
  const carried = state.players.find((p) => p.id === c.id)!.carriedMule;
  if (!carried) return null;
  const good = carried === 'empty' ? null : carried;
  return { good, x: c.lead?.x ?? c.x, y: c.lead?.y ?? c.y };
}

/** The floor at development start: each colonist outside a store door, the seats taking the two doors in turn. */
export function buildFloor(state: GameState, cfg: FloorConfig): DevFloor {
  return {
    tick: 0,
    colonists: state.players.map((p, seat): FloorColonist => {
      const side = DOOR_SIDES[seat % DOOR_SIDES.length]!;
      const at = doorOutside(state, side, cfg);
      return {
        id: p.id,
        space: 'map',
        ...at,
        facing: side === 'L' ? 'left' : 'right',
        moving: false,
        lead: leadFor(state, { id: p.id, ...at, lead: null }),
        pace: pace(state, p.id),
        bot: p.isAi,
        bitten: false,
        encounter: null,
        pelts: 0,
      };
    }),
  };
}
