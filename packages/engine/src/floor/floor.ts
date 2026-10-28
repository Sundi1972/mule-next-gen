import { DEV_STEER, WOLVES } from '../config.js';
import type { GameState, Outfit } from '../types.js';

/** The dev floor: where every colonist stands in development, held beside GameState and moved only by stepFloor. */

export type Space = 'map' | 'hall';
export type DoorSide = 'L' | 'R';

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

/** The live config objects, so a sim run's --set reaches the floor, and a hall plan. */
export function floorConfig(hall: HallPlan): FloorConfig {
  throw new Error('NotImplemented: floorConfig');
}

/** The floor at development start, from the game's players. */
export function buildFloor(state: GameState, cfg: FloorConfig): DevFloor {
  throw new Error('NotImplemented: buildFloor');
}
