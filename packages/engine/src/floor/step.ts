import { tileAt } from '../grid.js';
import type { GameState, Tile } from '../types.js';
import { MS_PER_SECOND } from '../units.js';
import {
  DOOR_SIDES,
  doorOutside,
  IDLE_INPUT,
  inRect,
  leadFor,
  middleOf,
  storeOf,
  type DevFloor,
  type DoorSide,
  type FloorColonist,
  type FloorConfig,
  type FloorInput,
  type HallPlan,
} from './floor.js';
import { speedOf, terrainShare } from './speed.js';

/**
 * One tick of the floor: every colonist moved by its seat's input, at RULE-2's speed. Pure: a new floor, the old one
 * and the game untouched. A seat with no input stands still.
 */
export function stepFloor(floor: DevFloor, state: GameState, inputs: Readonly<Record<string, FloorInput>>, dtMs: number, cfg: FloorConfig): DevFloor {
  return {
    tick: floor.tick + 1,
    colonists: floor.colonists.map((c) => stepColonist(withLead(c, state), state, inputs[c.id] ?? IDLE_INPUT, dtMs, cfg)),
  };
}

/** The colonist with its lead as the game has it now: a MULE bought, outfitted or installed since the last tick. */
function withLead(c: FloorColonist, state: GameState): FloorColonist {
  const lead = leadFor(state, c);
  return lead?.good === c.lead?.good && !lead === !c.lead ? c : { ...c, lead };
}

function stepColonist(c: FloorColonist, state: GameState, input: FloorInput, dtMs: number, cfg: FloorConfig): FloorColonist {
  const length = Math.hypot(input.x, input.y);
  if (length === 0) return c.moving ? { ...c, moving: false } : c;
  // A stick pushed past full walks at full speed: diagonals are no faster.
  const scale = length > 1 ? 1 / length : 1;
  const step = (speedOf(c, state, cfg) * dtMs) / MS_PER_SECOND;
  const dx = input.x * scale * step;
  const dy = input.y * scale * step;
  const facing = input.x > 0 ? 'right' : input.x < 0 ? 'left' : c.facing;
  const moved = c.space === 'map' ? mapMove({ ...c, facing }, dx, dy, state, cfg) : hallMove({ ...c, facing }, dx, dy, state, cfg);
  return follow({ ...moved, moving: moved.space !== c.space || moved.x !== c.x || moved.y !== c.y }, cfg);
}

const inStore = (store: Tile, body: number, x: number, y: number) =>
  x > store.x - body && x < store.x + 1 + body && y > store.y - body && y < store.y + 1 + body;

/** Whether a colonist may stand here: clear of the store's walls, and every tile its body touches on the map and open. */
function passable(state: GameState, cfg: FloorConfig, x: number, y: number): boolean {
  const body = cfg.steer.bodyTiles;
  if (inStore(storeOf(state), body, x, y)) return false;
  for (const [cx, cy] of [[x - body, y - body], [x + body, y - body], [x - body, y + body], [x + body, y + body]] as const) {
    const tile = tileAt(state.tiles, state.width, Math.floor(cx), Math.floor(cy));
    // Off the map's edge there is no tile.
    if (!tile) return false;
    // Touching the store's tile is its walls' business, judged above.
    if (tile.terrain !== 'store' && terrainShare(tile.terrain, cfg) <= 0) return false;
  }
  return true;
}

/** On the map: each axis on its own, so a blocked step slides along the free one; into a door, into the hall. */
function mapMove(c: FloorColonist, dx: number, dy: number, state: GameState, cfg: FloorConfig): FloorColonist {
  const store = storeOf(state);
  const body = cfg.steer.bodyTiles;
  let { x, y } = c;
  if (inStore(store, body, x + dx, y)) {
    const side: DoorSide | null = x <= store.x - body && dx > 0 ? 'L' : x >= store.x + 1 + body && dx < 0 ? 'R' : null;
    const doorY = doorOutside(state, 'L', cfg).y;
    if (side && Math.abs(y - doorY) <= cfg.steer.doorHalfTiles) return enterHall(c, side, cfg.hall);
    // Pushing straight into the store's side slides you along it onto the door, so the door is easy to find.
    if (side && dy === 0) {
      const slide = Math.max(-Math.abs(dx), Math.min(Math.abs(dx), doorY - y));
      if (passable(state, cfg, x, y + slide)) y += slide;
    }
  } else if (passable(state, cfg, x + dx, y)) x += dx;
  if (passable(state, cfg, x, y + dy)) y += dy;
  return { ...c, x, y };
}

const onFloor = (hall: HallPlan, x: number, y: number) => hall.floor.some((r) => inRect(r, x, y));

/** In the hall: walls are wherever the plan has no floor; out through a door's outer side, onto the map. */
function hallMove(c: FloorColonist, dx: number, dy: number, state: GameState, cfg: FloorConfig): FloorColonist {
  const { hall } = cfg;
  for (const side of DOOR_SIDES) {
    const door = hall.doors[side];
    const out = side === 'L' ? c.x + dx < door.x0 : c.x + dx > door.x1;
    if (out && inRect(door, c.x, c.y)) return leaveHall(c, side, state, cfg);
  }
  let { x, y } = c;
  if (onFloor(hall, x + dx, y)) x += dx;
  if (onFloor(hall, x, y + dy)) y += dy;
  return { ...c, x, y };
}

/** In at a door, facing into the hall; a MULE on the lead comes through with its colonist. */
function enterHall(c: FloorColonist, side: DoorSide, hall: HallPlan): FloorColonist {
  const at = middleOf(hall.doors[side]);
  return { ...c, space: 'hall', ...at, facing: side === 'L' ? 'right' : 'left', lead: c.lead && { ...c.lead, ...at } };
}

function leaveHall(c: FloorColonist, side: DoorSide, state: GameState, cfg: FloorConfig): FloorColonist {
  const at = doorOutside(state, side, cfg);
  return { ...c, space: 'map', ...at, facing: side === 'L' ? 'left' : 'right', lead: c.lead && { ...c.lead, ...at } };
}

/** The MULE on its lead, pulled after its colonist to the rope's length. */
function follow(c: FloorColonist, cfg: FloorConfig): FloorColonist {
  if (!c.lead) return c;
  const rope = c.space === 'map' ? cfg.steer.leadTiles : cfg.steer.leadHallShare * cfg.hall.width;
  const gap = Math.hypot(c.lead.x - c.x, c.lead.y - c.y);
  if (gap <= rope) return c;
  const k = rope / gap;
  return { ...c, lead: { ...c.lead, x: c.x + (c.lead.x - c.x) * k, y: c.y + (c.lead.y - c.y) * k } };
}
