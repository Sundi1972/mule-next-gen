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
  type Outfit,
} from '@mule/engine';
import type { DevWalk, FloorLegs } from './strategist.js';

/**
 * How long walks take on the dev floor (arcade RULE-2), for the AI's plans: the strategist's and value.ts's walk-time
 * estimates and the develop hand's "is there still time for the pub". Estimates only: the floor moves nobody here.
 * Each leg is the walk the hand (FloorWalker) steers and stepFloor plays: on the map along pathTo's quickest walk, in
 * the hall along the walkway, and in both ending where Reach first offers the press, at a plot's or a room's edge, not
 * its middle. Map legs are at full pace, so a caller divides by its colonist's factors (mapFactor).
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

/** The middle of the walkway, across: the line the hand walks along. */
const walkwayMiddle = (hall: HallPlan) => middle(walkwayOf(hall).y0, walkwayOf(hall).y1);

/**
 * Where the hand's walk to a place ends: the first step inside its box, where Reach offers its press and the hand stops
 * to press: a room's or bay's threshold on the walkway's side, before its middle; a door's frame along the walkway. Not
 * the placePoint it heads for, which is further in. The next leg sets off from here.
 */
export function standPoint(place: HallPlace, hall: HallPlan): HallPoint {
  const box = boxOf(place, hall);
  const mid = walkwayMiddle(hall);
  if (place === 'doorL' || place === 'doorR') return { x: place === 'doorL' ? box.x1 : box.x0, y: mid };
  return { x: placePoint(place, hall).x, y: box.y1 <= mid ? box.y1 : box.y0 };
}

/**
 * Hall units from a point to a place, the way the hand walks it (FloorWalker.toPlace): out of a room straight onto the
 * walkway, then across it for the walkway's middle before the place, then in to its threshold.
 */
export function hallDistance(from: HallPoint, to: HallPlace, hall: HallPlan): number {
  const walkway = walkwayOf(hall);
  const mid = walkwayMiddle(hall);
  const at = standPoint(to, hall);
  const onto = Math.min(walkway.y1, Math.max(walkway.y0, from.y));
  return Math.abs(from.y - onto) + Math.hypot(at.x - from.x, mid - onto) + Math.abs(mid - at.y);
}

/** A colonist standing for a walk the floor would make: its pace and lead, nothing else about it. */
function probe(space: 'map' | 'hall', at: FloorPoint, pace: number, lead: boolean, bot: boolean): FloorColonist {
  return { id: '', space, ...at, facing: 'right', moving: false, lead: lead ? { good: null, ...at } : null, pace, bot, bitten: false, encounter: null, pelts: 0, assayUntilTick: null };
}

/** Hall units a second, at this pace and lead: the floor's own speedOf. */
export function hallSpeed(state: GameState, cfg: FloorConfig, pace: number, lead: boolean): number {
  return speedOf(probe('hall', { x: 0, y: 0 }, pace, lead, false), state, cfg);
}

/** The share of pathTo's full-pace map speed a colonist walks at: RULE-2's pace, lead, bot and bitten factors, off its land. */
export function mapFactor(cfg: FloorConfig, pace: number, lead: boolean, bot: boolean, bitten = false): number {
  return pace * (lead ? cfg.steer.leadPace : 1) * (bot ? cfg.steer.botSpeed : 1) * (bitten ? cfg.wolves.bittenPace : 1);
}

/** Whether a colonist leads its MULE: one that bolted is off the rope. */
export const leading = (c: FloorColonist): boolean => c.lead !== null && !c.bolt;

/** Hall seconds from a point to a place, at this pace and lead. */
export function hallSeconds(state: GameState, cfg: FloorConfig, from: HallPoint, to: HallPlace, pace: number, lead: boolean): number {
  return hallDistance(from, to, cfg.hall) / hallSpeed(state, cfg, pace, lead);
}

/** Per open door: the walk from just outside it to every map tile, by tile index (Infinity seconds where none is open). */
export type DoorTable = ReadonlyMap<HallDoor, readonly MapWalk[]>;

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

/** Full-pace seconds a tile's length takes on the land under a point (speedOf's: 1 for land with no share). */
function tileSeconds(state: GameState, cfg: FloorConfig, p: FloorPoint): number {
  const tile = tileAt(state.tiles, state.width, Math.floor(p.x), Math.floor(p.y));
  return 1 / (cfg.steer.mapTilesPerSecond * ((tile && terrainShare(tile.terrain, cfg)) || 1));
}

/** A walk on the map: its full-pace seconds, and where it ends, where Reach first offers the plot. */
export interface MapWalk {
  seconds: number;
  end: FloorPoint;
}

/**
 * The walk from a point on the map to plot `index`, as the hand walks pathTo's quickest walk: from each tile straight
 * for the next one's middle, cutting the corners, until it steps onto the plot, where Reach offers it. A lake plot it
 * works from the shore: on the tile before it, towards it until within DEV_STEER.shoreReachTiles of its edge. Not
 * pathTo's seconds, which count every tile crossed whole: the plot's own, where the walk ends at its edge, and none of
 * the one it starts on.
 */
export function mapWalk(state: GameState, cfg: FloorConfig, from: FloorPoint, index: number): MapWalk {
  const goal = state.tiles[index]!;
  const path = pathTo(state, from, tileMiddle(goal.x, goal.y), cfg);
  if (!path) return { seconds: Infinity, end: from };
  const ashore = terrainShare(goal.terrain, cfg) <= 0;
  let at = from;
  let seconds = 0;
  for (let k = 1; k < path.tiles.length; k++) {
    const here = path.tiles[k - 1]!;
    const next = path.tiles[k]!;
    // The edge between this tile and the next, across the axis they differ on.
    const axis = next.x !== here.x ? 'x' : 'y';
    const edge = Math.max(here[axis], next[axis]);
    if (ashore && k === path.tiles.length - 1) {
      // On the shore: from where it stands, straight for the spot DEV_STEER.botShoreTiles short of the lake's middle
      // side, until the lake's edge is within reach.
      const spot = { ...tileMiddle(here.x, here.y), [axis]: middle(0, 1) + here[axis] + (next[axis] - here[axis]) * cfg.steer.botShoreTiles };
      const gap = (p: FloorPoint) => Math.abs(p[axis] - edge);
      const f = gap(at) <= cfg.steer.shoreReachTiles ? 0 : (gap(at) - cfg.steer.shoreReachTiles) / (gap(at) - gap(spot));
      const end = { x: at.x + f * (spot.x - at.x), y: at.y + f * (spot.y - at.y) };
      return { seconds: seconds + Math.hypot(end.x - at.x, end.y - at.y) * tileSeconds(state, cfg, at), end };
    }
    const to = tileMiddle(next.x, next.y);
    const f = (edge - at[axis]) / (to[axis] - at[axis]);
    const cross = { x: at.x + f * (to.x - at.x), y: at.y + f * (to.y - at.y) };
    seconds += Math.hypot(cross.x - at.x, cross.y - at.y) * tileSeconds(state, cfg, at);
    at = cross;
  }
  return { seconds, end: at };
}

/**
 * Full-pace seconds from a point on the map back to a door, by the door's walks out: the walk out to the point's tile
 * the other way, and before it the way across the tile from the point to where that walk stepped onto it.
 */
export function backToDoor(state: GameState, cfg: FloorConfig, walks: readonly MapWalk[], p: FloorPoint): number {
  const walk = walks[tileIndex(state.width, Math.floor(p.x), Math.floor(p.y))]!;
  return walk.seconds + Math.hypot(p.x - walk.end.x, p.y - walk.end.y) * tileSeconds(state, cfg, p);
}

/**
 * Per open door, the walk out from just outside it to every tile, as the hand walks it (mapWalk). Remembered per map
 * and per the config the walk reads, so a game pays for it once. The walk back in is the same walk the other way
 * (backToDoor).
 */
export function doorTable(state: GameState, cfg: FloorConfig): DoorTable {
  const { steer } = cfg;
  const key = JSON.stringify([state.width, state.tiles.map((t) => t.terrain), steer.mapTilesPerSecond, steer.terrain, steer.lakeMode, steer.wading, steer.mountainsImpassable, steer.bodyTiles, steer.botShoreTiles, steer.shoreReachTiles]);
  const known = tables.get(key);
  if (known) return known;
  const table = new Map<HallDoor, MapWalk[]>();
  for (const door of HALL_DOORS) {
    if (!doorOpen(state, door, cfg)) continue;
    const from = doorOutside(state, door, cfg);
    table.set(door, state.tiles.map((_, i) => mapWalk(state, cfg, from, i)));
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
    const walk = map[index]!.seconds;
    const out = hallSeconds(state, cfg, from, door, w.pace, lead) + walk / mapFactor(cfg, w.pace, lead, w.bot);
    const home = back === null ? 0 : walk / mapFactor(cfg, w.pace, false, w.bot) + hallSeconds(state, cfg, cfg.hall.spots[door], back, w.pace, false);
    best = Math.min(best, out + home);
  }
  return best;
}

/** Seconds from where a colonist stands to a place in the store's hall, by the quickest door when it is on the map. */
export function secondsToPlace(state: GameState, cfg: FloorConfig, c: FloorColonist, place: HallPlace): number {
  const lead = leading(c);
  if (c.space === 'hall') return hallSeconds(state, cfg, c, place, c.pace, lead);
  let best = Infinity;
  for (const [door, map] of doorTable(state, cfg)) {
    // A bite slows the walk to the store, and heals there.
    best = Math.min(best, backToDoor(state, cfg, map, c) / mapFactor(cfg, c.pace, lead, c.bot, c.bitten) + hallSeconds(state, cfg, cfg.hall.spots[door], place, c.pace, lead));
  }
  return best;
}

/** Just outside the store's door whose walk to the pub, from where a colonist stands on the map, is quickest. */
export function pubDoor(state: GameState, cfg: FloorConfig, c: FloorColonist): FloorPoint {
  let best: { door: HallDoor; s: number } = { door: HALL_DOORS[0], s: Infinity };
  for (const [door, map] of doorTable(state, cfg)) {
    const s = backToDoor(state, cfg, map, c) / mapFactor(cfg, c.pace, leading(c), c.bot, c.bitten) + hallSeconds(state, cfg, cfg.hall.spots[door], 'pub', c.pace, leading(c));
    if (s < best.s) best = { door, s };
  }
  return doorOutside(state, best.door, cfg);
}

/**
 * Seconds from where a colonist stands to the pub. A MULE it leads stays on the lead, slowing it, all the way: it runs
 * off at the pub, not before.
 */
export function pubSeconds(state: GameState, cfg: FloorConfig, c: FloorColonist): number {
  return secondsToPlace(state, cfg, c, 'pub');
}

/** One MULE's walk on the floor, leg by leg, in seconds at the colonist's pace, without the presses' pauses. */
export interface MuleLegs {
  /** From where the colonist stands to the corral. */
  corral: number;
  /** From the corral to the outfitter, leading the empty MULE. */
  outfitter: number;
  /** From the outfitter out to the plot, leading the outfitted MULE. */
  plot: number;
  /** From the plot back to the pub, without a MULE. */
  pub: number;
}

/**
 * The legs of a MULE for plot `index` and `outfit`, walked from where the colonist stands; Infinity where none is open.
 * `toCorral`: the first leg, when the caller has it already (it is the same for every plot and outfit).
 */
export function muleLegs(state: GameState, cfg: FloorConfig, c: FloorColonist, index: number, outfit: Outfit, toCorral?: number): MuleLegs {
  // A plot nobody can stand to install on is out of reach: a lake whose shore is all the seat's own land.
  if (!installable(state, cfg, c.id, index)) return { corral: Infinity, outfitter: Infinity, plot: Infinity, pub: Infinity };
  const w: Walker = { pace: c.pace, bot: c.bot };
  // Each leg sets off from where the last one stopped: the counter's threshold, where the hand pressed.
  const corral = standPoint('corral', cfg.hall);
  // Every outfit has its counter in the hall: a shopfront, one of the works' bays, or the Green belt.
  const place = outfit as HallPlace;
  return {
    corral: toCorral ?? secondsToPlace(state, cfg, { ...c, lead: null }, 'corral'),
    outfitter: hallSeconds(state, cfg, corral, place, w.pace, true),
    plot: tripSeconds(state, cfg, w, standPoint(place, cfg.hall), index, true),
    pub: plotToPlace(state, cfg, w, index, 'pub'),
  };
}

/**
 * The develop hand's DevWalk on the floor: for each plot and outfit, the walk from where the colonist stands to the
 * corral, its outfitter and out to the plot leading the MULE, and from the plot back to the pub.
 */
export function floorDevWalk(state: GameState, cfg: FloorConfig, c: FloorColonist, left: number, taps: number): DevWalk {
  const toCorral = secondsToPlace(state, cfg, { ...c, lead: null }, 'corral');
  const floor: FloorLegs = (index, outfit) => {
    const legs = muleLegs(state, cfg, c, index, outfit, toCorral);
    return { there: legs.corral + legs.outfitter + legs.plot, pub: legs.pub };
  };
  return { left, taps, floor };
}

/** Seconds from plot `index` back into the store to a place, without a MULE, by the quickest door. */
export function plotToPlace(state: GameState, cfg: FloorConfig, w: Walker, index: number, place: HallPlace): number {
  let best = Infinity;
  for (const [door, map] of doorTable(state, cfg)) {
    best = Math.min(best, map[index]!.seconds / mapFactor(cfg, w.pace, false, w.bot) + hallSeconds(state, cfg, cfg.hall.spots[door], place, w.pace, false));
  }
  return best;
}

/**
 * Seconds for an errand on a plot from where a colonist stands: the walk there (out of the store first, if inside),
 * `work` seconds on it, and the walk back to the pub. RULE-8's test for whether an errand still fits the clock.
 */
export function plotErrandSeconds(state: GameState, cfg: FloorConfig, c: FloorColonist, index: number, work: number): number {
  const w: Walker = { pace: c.pace, bot: c.bot };
  const lead = leading(c);
  if (c.space === 'hall') return tripSeconds(state, cfg, w, c, index, lead) + work + plotToPlace(state, cfg, w, index, 'pub');
  // On the map it walks there from where it stands (slowed by a bite), and back from where that walk ends.
  const walk = mapWalk(state, cfg, c, index);
  return walk.seconds / mapFactor(cfg, c.pace, lead, c.bot, c.bitten) + work + pubSeconds(state, cfg, { ...c, ...walk.end, lead: null });
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
