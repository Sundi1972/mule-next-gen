/**
 * The dev floor: where every colonist stands in development. Held beside GameState, built when development starts,
 * and moved only by stepFloor.
 */
import { DEV_STEER, WOLVES } from '../config.js';
import { pace } from '../dev-walk.js';
import { tileAt } from '../grid.js';
import type { GameState, Outfit, Tile } from '../types.js';
import { HALL, HALL_DOORS, type HallDoor, type HallPlan } from './hall.js';
import { terrainShare } from './speed.js';

export type Space = 'map' | 'hall';

/** A point on the map, in tiles. */
export interface FloorPoint {
  readonly x: number;
  readonly y: number;
}

export interface FloorConfig {
  steer: typeof DEV_STEER;
  wolves: Pick<typeof WOLVES, 'bittenPace' | 'peltPrice'>;
  /** Its door-to-corral walk takes steer.floorSeconds at full pace. */
  hall: HallPlan;
}

/** One seat's input for a tick: the stick, each axis -1 to 1, and whether the button was pressed since the last tick. */
export interface FloorInput {
  x: number;
  y: number;
  act: boolean;
}

export const IDLE_INPUT: Readonly<FloorInput> = { x: 0, y: 0, act: false };

/** A MULE on its lead, walking behind its colonist. */
export interface FloorLead {
  /** What it is outfitted for; null while empty. */
  readonly good: Outfit | null;
  readonly x: number;
  readonly y: number;
}

/** A wolf encounter's stage. */
export interface FloorEncounter {
  readonly stage: 'choose' | 'chase' | 'fight';
}

export interface FloorColonist {
  /** The seat's player id. */
  readonly id: string;
  readonly space: Space;
  /** In tiles on the map; in the hall plan's units in the hall. */
  readonly x: number;
  readonly y: number;
  readonly facing: 'left' | 'right';
  /** It moved on the last tick. */
  readonly moving: boolean;
  /** Whether there is one, and its good, follow the player's carriedMule; the floor keeps where it walks. */
  readonly lead: FloorLead | null;
  /** dev-walk.ts's pace when development started: hunger × sickness × the Zipwing's perk. */
  readonly pace: number;
  /** An AI seat's colonist. */
  readonly bot: boolean;
  readonly bitten: boolean;
  readonly encounter: FloorEncounter | null;
  readonly pelts: number;
}

export interface DevFloor {
  /** Ticks stepped since development started. */
  readonly tick: number;
  /** In seat order. */
  readonly colonists: readonly FloorColonist[];
}

const HALF = 0.5; // literal-ok: geometry, the middle of a side, not balance

/** The live config objects, so a sim run's --set reaches the floor, and the store's hall. */
export function floorConfig(hall: HallPlan = HALL): FloorConfig {
  return { steer: DEV_STEER, wolves: WOLVES, hall };
}

export function storeOf(state: GameState): Tile {
  return state.tiles.find((t) => t.terrain === 'store')!;
}

/** Where a colonist stands on the map just outside one of the store's doors, at the middle of that side. */
export function doorOutside(state: GameState, door: HallDoor, cfg: FloorConfig): FloorPoint {
  return mouthOf(storeOf(state), door, cfg);
}

/** doorOutside, for the store's tile already found. */
export function mouthOf(store: Tile, door: HallDoor, cfg: FloorConfig): FloorPoint {
  const body = cfg.steer.bodyTiles;
  return { x: door === 'doorL' ? store.x - body : store.x + 1 + body, y: store.y + HALF };
}

/** A MULE for the player's carriedMule, standing where its old one stood or else at its colonist; none without one. */
export function leadFor(state: GameState, c: Pick<FloorColonist, 'id' | 'x' | 'y' | 'lead'>): FloorLead | null {
  const carried = state.players.find((p) => p.id === c.id)!.carriedMule;
  if (!carried) return null;
  const good = carried === 'empty' ? null : carried;
  return { good, x: c.lead?.x ?? c.x, y: c.lead?.y ?? c.y };
}

/** The door a colonist uses onto the map: `door`, or the other one when the ground outside `door` is blocked. */
export function openDoor(state: GameState, store: Tile, door: HallDoor, cfg: FloorConfig): HallDoor {
  const open = (d: HallDoor) => {
    const at = mouthOf(store, d, cfg);
    const tile = tileAt(state.tiles, state.width, Math.floor(at.x), Math.floor(at.y));
    return tile !== undefined && terrainShare(tile.terrain, cfg) > 0;
  };
  const other = HALL_DOORS.find((d) => d !== door)!;
  return open(door) || !open(other) ? door : other;
}

/** The floor at development start: each colonist outside a store door, the seats taking the open doors in turn. */
export function buildFloor(state: GameState, cfg: FloorConfig): DevFloor {
  const store = storeOf(state);
  return {
    tick: 0,
    colonists: state.players.map((p, seat): FloorColonist => {
      const door = openDoor(state, store, HALL_DOORS[seat % HALL_DOORS.length]!, cfg);
      const at = mouthOf(store, door, cfg);
      return {
        id: p.id,
        space: 'map',
        ...at,
        facing: door === 'doorL' ? 'left' : 'right',
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
