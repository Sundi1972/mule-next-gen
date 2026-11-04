/**
 * The dev floor: where every colonist stands in development. Held beside GameState, built when development starts,
 * and moved only by stepFloor.
 */
import { DEV_STEER, GLINT, SCRAMBLE, WOLVES } from '../config.js';
import { pace } from '../dev-walk.js';
import { tileAt } from '../grid.js';
import type { GameState, Outfit, Tile } from '../types.js';
import { MS_PER_SECOND } from '../units.js';
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
  /** The moments (arcade C4): wolves, the glint race, the corral scramble. */
  wolves: typeof WOLVES;
  glint: typeof GLINT;
  scramble: typeof SCRAMBLE;
  /** Its door-to-corral walk takes steer.floorSeconds at full pace. */
  hall: HallPlan;
  /** What the pub pays a seat with secondsLeft of development left, for the button's words; null shows no payout. */
  // The server and the sim pass game.ts's pubPayoutFor.
  pubPayout: ((state: GameState, id: string, secondsLeft: number) => number) | null;
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

/** One wolf of a pack (RULE-4): where it is, and what it is doing. */
export interface FloorWolf {
  readonly x: number;
  readonly y: number;
  /** Its bearing from the fight's middle (or its colonist), in radians: where it circles. */
  readonly angle: number;
  /** Circling; crouched to lunge (the warning); lunging; open after a miss; hurt after a strike or a bite. */
  readonly state: 'prowl' | 'tell' | 'lunge' | 'open' | 'hurt';
  /** The tick its state began, and the tick it ends (unused while it prowls). */
  readonly sinceTick: number;
  readonly untilTick: number;
  /** A lunge's start and the spot it aims at: where its colonist stood when it crouched. */
  readonly from: FloorPoint | null;
  readonly target: FloorPoint | null;
}

/** A pack met (RULE-4): choosing, running from it, or fighting it. */
export interface FloorEncounter {
  readonly stage: 'choose' | 'chase' | 'fight';
  /** The tick the stage began. */
  readonly sinceTick: number;
  /** Where the stage began: a chase gives up this far from it, and a fight stays round it. */
  readonly centre: FloorPoint;
  readonly wolves: readonly FloorWolf[];
  readonly strikes: number;
  readonly bites: number;
  /** In a fight: the tick the next wolf crouches, and the tick a strike at nothing stops leaving its colonist open. */
  readonly nextLungeTick: number;
  readonly recoverUntilTick: number;
}

/** A MULE bolting after a lost fight: its heading, and the tiles of its run still to go; 0 stands. */
export interface FloorBolt {
  readonly dx: number;
  readonly dy: number;
  readonly left: number;
}

/** The glint lit on a tile (RULE-5), from one tick to another. */
export interface FloorGlint {
  readonly x: number;
  readonly y: number;
  readonly sinceTick: number;
  readonly untilTick: number;
}

/** The corral scramble (RULE-6): called when a sale leaves the corral at its last few MULEs. */
export interface FloorScramble {
  readonly sinceTick: number;
  /** It ends then, if the corral has not emptied first. */
  readonly untilTick: number;
  /** The seats that needed a MULE when it was called, and those of them that got one since, in order. */
  readonly needers: readonly string[];
  readonly got: readonly string[];
  /** How it ended: the corral emptied, its clock ran out, or every needer had a MULE; null while it runs. */
  readonly over: 'empty' | 'time' | 'everyone' | null;
  /** Needers still without a MULE when the corral emptied. */
  readonly leftOut: readonly string[];
}

/** A short public line the TV and the phones show for a moment, and whose it is (null: nobody's). */
export interface FloorBeat {
  readonly kind: 'wolves' | 'glint' | 'scramble' | 'store';
  readonly who: string | null;
  readonly text: string;
}

/** An outcome a step decided that settleMoments pays through game.ts: the glint's prize, or a lost fight's bolted MULE. */
export type FloorDue = { readonly kind: 'glint'; readonly who: string } | { readonly kind: 'bolt'; readonly who: string };

/** What a step's moments had happen, gathered as it goes: the beats to show and the outcomes to pay. */
export interface MomentsOut {
  beats: FloorBeat[];
  due: FloorDue[];
}

/** The moments' state on the floor (arcade C4). */
export interface FloorMoments {
  readonly glint: FloorGlint | null;
  /** No glint lights before this tick: the turn's first seconds, or a pause after one. */
  readonly glintAfterTick: number;
  readonly scramble: FloorScramble | null;
  /** One scramble a turn. */
  readonly scrambled: boolean;
  /** This tick's beats, in order: the step's, then settleMoments', then the presses'. */
  readonly beats: readonly FloorBeat[];
  /** What the last step decided and settleMoments has yet to pay. */
  readonly due: readonly FloorDue[];
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
  /** No pack comes for it before this tick (WOLVES.cooldownSeconds after the last); absent: any time. */
  readonly wolvesAfterTick?: number;
  /** Stunned by a fight lost with no MULE on the lead: it stands till this tick. Absent: not stunned. */
  readonly stunnedUntilTick?: number;
  /** Its MULE bolted and not caught yet: the lead is where the MULE is, running or standing. Absent or null: not bolted. */
  readonly bolt?: FloorBolt | null;
  /**
   * Assaying a plot while the floor's tick is below it: stepFloor holds the colonist still and reachOf offers nothing.
   * The hold is the analysis's time cost, so the server must not also take its seconds off the seat's clock.
   */
  readonly assayUntilTick: number | null;
}

export const isAssaying = (c: FloorColonist, tick: number): boolean => c.assayUntilTick !== null && tick < c.assayUntilTick;

export const isStunned = (c: FloorColonist, tick: number): boolean => c.stunnedUntilTick !== undefined && tick < c.stunnedUntilTick;

/** Whole ticks in some seconds, at the config's tick. */
export const ticksOf = (seconds: number, cfg: FloorConfig): number => Math.round((seconds * MS_PER_SECOND) / cfg.steer.tickMs);

export interface DevFloor {
  /** Ticks stepped since development started. */
  readonly tick: number;
  /** In seat order. */
  readonly colonists: readonly FloorColonist[];
  readonly moments: FloorMoments;
}

const HALF = 0.5; // literal-ok: geometry, the middle of a side, not balance

/** The live config objects, so a sim run's --set reaches the floor, the store's hall, and no pub payout. */
export function floorConfig(hall: HallPlan = HALL): FloorConfig {
  return { steer: DEV_STEER, wolves: WOLVES, glint: GLINT, scramble: SCRAMBLE, hall, pubPayout: null };
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
        assayUntilTick: null,
      };
    }),
    moments: { glint: null, glintAfterTick: ticksOf(cfg.glint.firstAfterSeconds, cfg), scramble: null, scrambled: false, beats: [], due: [] },
  };
}
