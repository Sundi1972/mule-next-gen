import { tileAt } from '../grid.js';
import type { GameState, Tile } from '../types.js';
import { MS_PER_SECOND } from '../units.js';
import { IDLE_INPUT, leadFor, mouthOf, openDoor, storeOf, type DevFloor, type FloorColonist, type FloorConfig, type FloorInput, type FloorPoint } from './floor.js';
import { HALL_DOORS, isOpenFloor, placeAt, type HallDoor, type HallPlan } from './hall.js';
import { reachOf, type Reach } from './reach.js';
import { speedOf, terrainShare } from './speed.js';

/** What one step reads: the game, the config, and the store's tile, found once. */
interface Step {
  readonly state: GameState;
  readonly cfg: FloorConfig;
  readonly store: Tile;
}

type Inputs = Readonly<Record<string, FloorInput>>;

/**
 * One tick of the floor: every colonist moved by its seat's input, at RULE-2's speed, or through a door when its press
 * reached ENTER or LEAVE on this floor. Pure: a new floor, the old one and the game untouched. A seat with no input
 * stands still. Throws an Error for a dtMs other than cfg.steer.tickMs: every runner steps at the one tick.
 */
export function stepFloor(floor: DevFloor, state: GameState, inputs: Inputs, dtMs: number, cfg: FloorConfig): DevFloor {
  if (dtMs !== cfg.steer.tickMs) throw new Error(`stepFloor steps ${cfg.steer.tickMs} ms at a time, not ${dtMs}`);
  const ctx: Step = { state, cfg, store: storeOf(state) };
  return {
    tick: floor.tick + 1,
    colonists: floor.colonists.map((c) => {
      const input = inputs[c.id] ?? IDLE_INPUT;
      const reach = doorMove(floor, state, c.id, input, cfg);
      const led = withLead(c, ctx.state);
      if (reach?.kind === 'enter') return follow({ ...enterHall(led, reach.door, cfg.hall), moving: true }, cfg);
      if (reach?.kind === 'leave') return follow({ ...leaveHall(led, reach.door, ctx), moving: true }, cfg);
      return stepColonist(led, input, dtMs, ctx);
    }),
  };
}

/**
 * The seats whose press stepFloor spends on a door move from this floor, given what stepFloor was given. A press does
 * one thing: after the step, apply every other press at the stepped position (RULE-1), and not these.
 */
export function doorPresses(floor: DevFloor, state: GameState, inputs: Inputs, cfg: FloorConfig): ReadonlySet<string> {
  return new Set(floor.colonists.filter((c) => doorMove(floor, state, c.id, inputs[c.id] ?? IDLE_INPUT, cfg)).map((c) => c.id));
}

/** The ENTER or LEAVE a seat's press reaches on this floor, or null when it presses nothing or reaches something else. */
function doorMove(floor: DevFloor, state: GameState, seat: string, input: FloorInput, cfg: FloorConfig): Extract<Reach, { kind: 'enter' | 'leave' }> | null {
  if (!input.act) return null;
  const reach = reachOf(floor, state, seat, cfg);
  return reach.kind === 'enter' || reach.kind === 'leave' ? reach : null;
}

/** The colonist with its lead as the game has it now: a MULE bought, outfitted or installed since the last tick. */
function withLead(c: FloorColonist, state: GameState): FloorColonist {
  const lead = leadFor(state, c);
  return lead?.good === c.lead?.good && !lead === !c.lead ? c : { ...c, lead };
}

function stepColonist(c: FloorColonist, input: FloorInput, dtMs: number, ctx: Step): FloorColonist {
  const { state, cfg } = ctx;
  const length = Math.hypot(input.x, input.y);
  if (length === 0) return c.moving ? { ...c, moving: false } : c;
  // A stick pushed past full walks at full speed: diagonals are no faster.
  const scale = length > 1 ? 1 / length : 1;
  const step = (speedOf(c, state, cfg) * dtMs) / MS_PER_SECOND;
  const dx = input.x * scale * step;
  const dy = input.y * scale * step;
  const facing = input.x > 0 ? 'right' : input.x < 0 ? 'left' : c.facing;
  const moved = c.space === 'map' ? mapMove({ ...c, facing }, dx, dy, ctx) : hallMove({ ...c, facing }, dx, dy, ctx);
  return follow({ ...moved, moving: moved.space !== c.space || moved.x !== c.x || moved.y !== c.y }, cfg);
}

const inStore = (store: Tile, body: number, x: number, y: number) =>
  x > store.x - body && x < store.x + 1 + body && y > store.y - body && y < store.y + 1 + body;

/** The map tiles under a body standing at p, one under each of its corners; undefined off the map's edge. */
function underfoot(state: GameState, body: number, p: FloorPoint): (Tile | undefined)[] {
  const corners = [[p.x - body, p.y - body], [p.x + body, p.y - body], [p.x - body, p.y + body], [p.x + body, p.y + body]] as const;
  return corners.map(([cx, cy]) => tileAt(state.tiles, state.width, Math.floor(cx), Math.floor(cy)));
}

/**
 * Whether a colonist standing at `from` may step to (x, y): clear of the store's walls, and every tile its body
 * touches on the map and open. Land under it at `from` never blocks it, so one on land it may not enter walks off it.
 */
function passable({ state, cfg, store }: Step, from: FloorPoint, x: number, y: number): boolean {
  const body = cfg.steer.bodyTiles;
  if (inStore(store, body, x, y)) return false;
  const standing = underfoot(state, body, from);
  return underfoot(state, body, { x, y }).every(
    // Touching the store's tile is its walls' business, judged above.
    (tile) => tile !== undefined && (tile.terrain === 'store' || terrainShare(tile.terrain, cfg) > 0 || standing.includes(tile)),
  );
}

/** On the map: each axis on its own, so a blocked step slides along the free one; into a door, into the hall. */
function mapMove(c: FloorColonist, dx: number, dy: number, ctx: Step): FloorColonist {
  const { cfg, store } = ctx;
  const body = cfg.steer.bodyTiles;
  let { x, y } = c;
  if (inStore(store, body, x + dx, y)) {
    const door: HallDoor | null = x <= store.x - body && dx > 0 ? 'doorL' : x >= store.x + 1 + body && dx < 0 ? 'doorR' : null;
    const doorY = mouthOf(store, 'doorL', cfg).y;
    if (door && Math.abs(y - doorY) <= cfg.steer.doorHalfTiles) return enterHall(c, door, cfg.hall);
    // Pushing straight into the store's side slides you along it onto the door, so the door is easy to find.
    if (door && dy === 0) {
      const slide = Math.max(-Math.abs(dx), Math.min(Math.abs(dx), doorY - y));
      if (passable(ctx, c, x, y + slide)) y += slide;
    }
  } else if (passable(ctx, c, x + dx, y)) x += dx;
  if (passable(ctx, c, x, y + dy)) y += dy;
  return { ...c, x, y };
}

/**
 * In the hall: walls are wherever the plan has no floor; out through a door's outer side, onto the map. A step is
 * walked in pieces each shorter than the plan's thinnest wall, so no speed carries a colonist over one.
 */
function hallMove(c: FloorColonist, dx: number, dy: number, ctx: Step): FloorColonist {
  const { hall } = ctx.cfg;
  const pieces = Math.floor(Math.hypot(dx, dy) / thinnestWall(hall)) + 1;
  const [px, py] = [dx / pieces, dy / pieces];
  let { x, y } = c;
  for (let i = 0; i < pieces; i++) {
    const at = placeAt({ x, y }, hall);
    for (const door of HALL_DOORS) {
      const frame = hall.doors[door];
      const out = door === 'doorL' ? x + px < frame.x0 : x + px > frame.x1;
      if (out && at === door) return leaveHall(c, door, ctx);
    }
    if (isOpenFloor({ x: x + px, y }, hall)) x += px;
    if (isOpenFloor({ x, y: y + py }, hall)) y += py;
  }
  return { ...c, x, y };
}

/** The narrowest gap between two of the plan's floor boxes that do not touch. */
function thinnestWall(hall: HallPlan): number {
  let thinnest = Infinity;
  hall.floor.forEach((a, i) => {
    for (const b of hall.floor.slice(i + 1)) {
      const gap = Math.hypot(Math.max(0, b.x0 - a.x1, a.x0 - b.x1), Math.max(0, b.y0 - a.y1, a.y0 - b.y1));
      if (gap > 0) thinnest = Math.min(thinnest, gap);
    }
  });
  return thinnest;
}

/** In at a door's spot, facing into the hall; a MULE on the lead comes through with its colonist. */
function enterHall(c: FloorColonist, door: HallDoor, hall: HallPlan): FloorColonist {
  const { x, y } = hall.spots[door];
  return { ...c, space: 'hall', x, y, facing: door === 'doorL' ? 'right' : 'left', lead: c.lead && { ...c.lead, x, y } };
}

/** Out onto the map at a door, or at the other one when the ground outside it is blocked. */
function leaveHall(c: FloorColonist, door: HallDoor, { state, cfg, store }: Step): FloorColonist {
  const out = openDoor(state, store, door, cfg);
  const at = mouthOf(store, out, cfg);
  return { ...c, space: 'map', ...at, facing: out === 'doorL' ? 'left' : 'right', lead: c.lead && { ...c.lead, ...at } };
}

/** The MULE on its lead, pulled after its colonist to the rope's length. */
function follow(c: FloorColonist, cfg: FloorConfig): FloorColonist {
  if (!c.lead) return c;
  const rope = c.space === 'map' ? cfg.steer.leadTiles : cfg.steer.leadHallShare * cfg.hall.w;
  const gap = Math.hypot(c.lead.x - c.x, c.lead.y - c.y);
  if (gap <= rope) return c;
  const k = rope / gap;
  return { ...c, lead: { ...c.lead, x: c.x + (c.lead.x - c.x) * k, y: c.y + (c.lead.y - c.y) * k } };
}
