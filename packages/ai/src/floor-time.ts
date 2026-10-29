import {
  boxOf,
  doorOutside,
  HALL_DOORS,
  pathTo,
  speedOf,
  terrainShare,
  tileAt,
  tileIndex,
  type FloorColonist,
  type FloorConfig,
  type FloorPoint,
  type GameState,
  type HallDoor,
  type HallPlace,
  type HallPlan,
  type HallPoint,
  type HallRect,
} from '@mule/engine';
import type { DevWalk, FloorLegs } from './strategist.js';

/**
 * How long walks take on the dev floor (arcade RULE-2), for the AI's plans: the strategist's and value.ts's walk-time
 * estimates and the develop hand's "is there still time for the pub". Estimates only: the floor moves nobody here.
 * The map legs are pathTo's (the same quickest walk the hand steers along), the hall legs the hall plan's walkway at
 * its speed; both at full pace, so a caller divides by its colonist's factors (factorOf).
 */

/** The walkway: the widest of the hall's floor boxes, the corridor every room opens onto. */
export function walkwayOf(hall: HallPlan): HallRect {
  return hall.floor.reduce((a, b) => (b.x1 - b.x0 > a.x1 - a.x0 ? b : a));
}

const middle = (a: number, b: number) => (a + b) / 2; // literal-ok: halfway between two edges

/** Where a colonist heads to be at a place: a door's spot, or the middle of the room's or bay's box. */
export function placePoint(place: HallPlace, hall: HallPlan): HallPoint {
  if (place === 'doorL' || place === 'doorR') return hall.spots[place];
  const box = boxOf(place, hall);
  return { x: middle(box.x0, box.x1), y: middle(box.y0, box.y1) };
}

/** Hall units from a point to a place, the way the hand walks it: onto the walkway, along it, then straight in. */
export function hallDistance(from: HallPoint, to: HallPlace, hall: HallPlan): number {
  const mid = middle(walkwayOf(hall).y0, walkwayOf(hall).y1);
  const at = placePoint(to, hall);
  return Math.abs(from.y - mid) + Math.abs(from.x - at.x) + Math.abs(mid - at.y);
}

/** A colonist standing for a walk the floor would make: its pace and lead, nothing else about it. */
function probe(space: 'map' | 'hall', at: FloorPoint, pace: number, lead: boolean, bot: boolean): FloorColonist {
  return { id: '', space, ...at, facing: 'right', moving: false, lead: lead ? { good: null, ...at } : null, pace, bot, bitten: false, encounter: null, pelts: 0, assayUntilTick: null };
}

/** Hall units a second, at this pace and lead: the floor's own speedOf. */
export function hallSpeed(state: GameState, cfg: FloorConfig, pace: number, lead: boolean): number {
  return speedOf(probe('hall', { x: 0, y: 0 }, pace, lead, false), state, cfg);
}

/** The share of pathTo's full-pace map speed a colonist walks at: RULE-2's pace, lead and bot factors, off its land. */
export function mapFactor(cfg: FloorConfig, pace: number, lead: boolean, bot: boolean): number {
  return pace * (lead ? cfg.steer.leadPace : 1) * (bot ? cfg.steer.botSpeed : 1);
}

/** Hall seconds from a point to a place, at this pace and lead. */
export function hallSeconds(state: GameState, cfg: FloorConfig, from: HallPoint, to: HallPlace, pace: number, lead: boolean): number {
  return hallDistance(from, to, cfg.hall) / hallSpeed(state, cfg, pace, lead);
}

/** Per open door: full-pace seconds from just outside it to every map tile, by tile index (Infinity where none is open). */
export type DoorTable = ReadonlyMap<HallDoor, readonly number[]>;

const tables = new Map<string, DoorTable>();
/** Distinct maps and configs remembered at once: a sim run plays one map a game. */
const TABLES_KEPT = 16; // literal-ok: a cache's size, not balance

/** Whether the land just outside a door is open, so a colonist leaving by it steps out there (floor.ts openDoor). */
export function doorOpen(state: GameState, door: HallDoor, cfg: FloorConfig): boolean {
  const at = doorOutside(state, door, cfg);
  const tile = tileAt(state.tiles, state.width, Math.floor(at.x), Math.floor(at.y));
  return tile !== undefined && terrainShare(tile.terrain, cfg) > 0;
}

/** The middle of a tile. */
export const tileMiddle = (x: number, y: number): FloorPoint => ({ x: x + middle(0, 1), y: y + middle(0, 1) });

/**
 * Full-pace seconds from each open door's outside to every tile, pathTo's quickest walk. Remembered per map and per the
 * config pathTo reads, so a game pays for it once.
 */
export function doorTable(state: GameState, cfg: FloorConfig): DoorTable {
  const { steer } = cfg;
  const key = JSON.stringify([state.width, state.tiles.map((t) => t.terrain), steer.mapTilesPerSecond, steer.terrain, steer.lakeMode, steer.wading, steer.mountainsImpassable, steer.bodyTiles]);
  const known = tables.get(key);
  if (known) return known;
  const table = new Map<HallDoor, number[]>();
  for (const door of HALL_DOORS) {
    if (!doorOpen(state, door, cfg)) continue;
    const from = doorOutside(state, door, cfg);
    table.set(door, state.tiles.map((t) => pathTo(state, from, tileMiddle(t.x, t.y), cfg)?.seconds ?? Infinity));
  }
  if (tables.size >= TABLES_KEPT) tables.clear();
  tables.set(key, table);
  return table;
}

/** A colonist's walk factors, for the estimates. */
export interface Walker {
  pace: number;
  bot: boolean;
}

/**
 * Seconds from a hall place out to plot `index` and back to the store: out through the door that makes the trip
 * quickest, leading a MULE out if `lead`, and on to `back` inside the store (null: only to the plot).
 */
export function tripSeconds(state: GameState, cfg: FloorConfig, w: Walker, from: HallPoint, index: number, lead: boolean, back: HallPlace | null = null): number {
  let best = Infinity;
  for (const [door, map] of doorTable(state, cfg)) {
    const out = hallSeconds(state, cfg, from, door, w.pace, lead) + map[index]! / mapFactor(cfg, w.pace, lead, w.bot);
    const home = back === null ? 0 : map[index]! / mapFactor(cfg, w.pace, false, w.bot) + hallSeconds(state, cfg, cfg.hall.spots[door], back, w.pace, false);
    best = Math.min(best, out + home);
  }
  return best;
}

/** Seconds from where a colonist stands to a place in the store's hall, by the quickest door when it is on the map. */
export function secondsToPlace(state: GameState, cfg: FloorConfig, c: FloorColonist, place: HallPlace): number {
  const lead = c.lead !== null;
  if (c.space === 'hall') return hallSeconds(state, cfg, c, place, c.pace, lead);
  const here = tileIndex(state.width, Math.floor(c.x), Math.floor(c.y));
  let best = Infinity;
  for (const [door, map] of doorTable(state, cfg)) {
    best = Math.min(best, map[here]! / mapFactor(cfg, c.pace, lead, c.bot) + hallSeconds(state, cfg, cfg.hall.spots[door], place, c.pace, lead));
  }
  return best;
}

/** Seconds from where a colonist stands to the pub, walking without a MULE (one led runs off there anyway). */
export function pubSeconds(state: GameState, cfg: FloorConfig, c: FloorColonist): number {
  return secondsToPlace(state, cfg, { ...c, lead: null }, 'pub');
}

/**
 * The develop hand's DevWalk on the floor: for each plot and outfit, the walk from where the colonist stands to the
 * corral, its outfitter and out to the plot leading the MULE, and from the plot back to the pub.
 */
export function floorDevWalk(state: GameState, cfg: FloorConfig, c: FloorColonist, left: number, taps: number): DevWalk {
  const w: Walker = { pace: c.pace, bot: c.bot };
  const toCorral = secondsToPlace(state, cfg, { ...c, lead: null }, 'corral');
  const corral = placePoint('corral', cfg.hall);
  const floor: FloorLegs = (index, outfit) => {
    // A plot nobody can stand to install on is out of reach: a lake whose shore is all the seat's own land.
    if (!installable(state, cfg, c.id, index)) return { there: Infinity, pub: Infinity };
    // Every outfit has its counter in the hall: a shopfront, one of the works' bays, or the Green belt.
    const place = outfit as HallPlace;
    const there = toCorral + hallSeconds(state, cfg, corral, place, w.pace, true) + tripSeconds(state, cfg, w, placePoint(place, cfg.hall), index, true);
    return { there, pub: plotToPlace(state, cfg, w, index, 'pub') };
  };
  return { left, taps, floor };
}

/** Seconds from plot `index` back into the store to a place, without a MULE, by the quickest door. */
export function plotToPlace(state: GameState, cfg: FloorConfig, w: Walker, index: number, place: HallPlace): number {
  let best = Infinity;
  for (const [door, map] of doorTable(state, cfg)) {
    best = Math.min(best, map[index]! / mapFactor(cfg, w.pace, false, w.bot) + hallSeconds(state, cfg, cfg.hall.spots[door], place, w.pace, false));
  }
  return best;
}

/**
 * Seconds for an errand on a plot from where a colonist stands: the walk there (out of the store first, if inside),
 * `work` seconds on it, and the walk back to the pub. RULE-8's test for whether an errand still fits the clock.
 */
export function plotErrandSeconds(state: GameState, cfg: FloorConfig, c: FloorColonist, index: number, work: number): number {
  const w: Walker = { pace: c.pace, bot: c.bot };
  const lead = c.lead !== null;
  const tile = state.tiles[index]!;
  const there = c.space === 'hall' ? tripSeconds(state, cfg, w, c, index, lead) : (pathTo(state, c, tileMiddle(tile.x, tile.y), cfg)?.seconds ?? Infinity) / mapFactor(cfg, c.pace, lead, c.bot);
  return there + work + plotToPlace(state, cfg, w, index, 'pub');
}

const AROUND = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

/**
 * The spots a lake plot can be installed on from, in shore mode: on each open neighbour, side or corner, that is not
 * the seat's own plot (there Reach installs on the land underfoot), DEV_STEER.botShoreTiles from its middle towards the
 * lake.
 */
export function shoreStands(state: GameState, cfg: FloorConfig, me: string, plot: FloorPoint): FloorPoint[] {
  return AROUND.flatMap(([dx, dy]) => {
    const t = tileAt(state.tiles, state.width, plot.x + dx, plot.y + dy);
    if (!t || terrainShare(t.terrain, cfg) <= 0 || t.owner === me) return [];
    const middle = tileMiddle(t.x, t.y);
    return [{ x: middle.x - dx * cfg.steer.botShoreTiles, y: middle.y - dy * cfg.steer.botShoreTiles }];
  });
}

/** Whether a colonist can stand where Reach offers installing on the plot: on it, or (a lake plot) on its shore. */
export function installable(state: GameState, cfg: FloorConfig, me: string, index: number): boolean {
  const t = state.tiles[index]!;
  return terrainShare(t.terrain, cfg) > 0 || (cfg.steer.lakeMode === 'shore' && shoreStands(state, cfg, me, t).length > 0);
}
