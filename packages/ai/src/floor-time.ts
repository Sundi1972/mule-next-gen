import {
  boxOf,
  doorOutside,
  HALL_DOORS,
  pathTo,
  reachOf,
  speedOf,
  terrainShare,
  tileAt,
  tileIndex,
  type DevFloor,
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
  type Player,
  type Reach,
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

/**
 * The seconds an AI colonist keeps in hand for the pub (DEV_STEER.botPubMarginSeconds at full pace, more as hunger,
 * sickness, a bite or a MULE on the lead slows it): the hurry for the pub keeps it, and every plan the hands make is
 * priced with it, so no MULE is bought on a plan the hurry would then drop (FM-hurry-margin). `lead`: as if leading a
 * MULE, or not; absent, as it stands.
 */
export function pubMargin(cfg: FloorConfig, c: FloorColonist, lead = leading(c)): number {
  return cfg.steer.botPubMarginSeconds / Math.min(1, mapFactor(cfg, c.pace, lead, c.bot, c.bitten));
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

/** A walk to a plot, priced from the walk onto one tile: onto the plot itself, or onto a stand on a lake plot's shore. */
interface Approach {
  /** The tile the walk steps onto, by index. */
  tile: number;
  /** The rest of the walk from where the walk onto that tile ends, to where Reach first offers the plot. */
  finish: (onto: MapWalk) => MapWalk;
}

/** Who walks to a plot and the press it walks there for: a lake plot's walk depends on both (shoreStands). */
export interface Errand {
  me: string;
  press: ShorePress;
}

/** Whether a plot is worked from its shore, never stood on: a lake plot in shore mode (AM-18). */
const worksFromShore = (state: GameState, cfg: FloorConfig, index: number) => state.tiles[index]!.terrain === 'lake' && cfg.steer.lakeMode === 'shore';

/**
 * How a walk reaches plot `index`: onto it; or, a lake plot, onto any of the stands shoreStands returns for the errand's
 * seat and press (the walker's own spots), each walk ending where Reach first offers the plot. Without an errand (a
 * valuation's estimate), its holder's install; one nobody holds as if each seat held it, unreachablePlot's judgement.
 */
function approaches(state: GameState, cfg: FloorConfig, index: number, errand?: Errand): Approach[] {
  if (!worksFromShore(state, cfg, index)) return [{ tile: index, finish: (onto) => onto }];
  const lake = state.tiles[index]!;
  const via = (me: string, press: ShorePress, game = state) => shoreStands(game, cfg, me, lake, press).map((stand) => shoreApproach(game, cfg, me, lake, stand, press));
  const holding = (me: string) => ({ ...state, tiles: state.tiles.map((t, i) => (i === index ? { ...t, owner: me } : t)) });
  if (errand) return via(errand.me, errand.press);
  return lake.owner !== null ? via(lake.owner, 'install') : state.players.flatMap((p) => via(p.id, 'install', holding(p.id)));
}

/** Bisections of a walk's last stretch for where Reach first offers a lake plot: a billionth of the stretch. */
const BISECTIONS = 30; // literal-ok: a search's precision, not balance

/** The first share of the way, past `short` where it does not hold, to 1 where it does, where `inside` holds: by halving. */
function firstInside(inside: (f: number) => boolean, short: number): number {
  let within = 1;
  for (let k = 0; k < BISECTIONS; k++) {
    const f = middle(short, within);
    if (inside(f)) within = f;
    else short = f;
  }
  return within;
}

/**
 * The walk to lake plot `lake` from a stand on its shore for `press`, as the walker walks it: onto the stand's tile,
 * then straight for the stand until Reach offers the press on the plot, where the hand presses. The stand is a spot
 * where it does (shoreStands asked Reach there). Reach's gap to the plot's nearest point shrinks and then grows along a
 * straight line, so the first point within DEV_STEER.shoreReachTiles is found by halving, and Reach is asked there; if
 * it offers a nearer lake of the seat's own instead, the halving goes on, on Reach, between there and the stand. A stand
 * where Reach offers the land underfoot first (landFirst) the walker walks to: it presses that land there.
 */
function shoreApproach(state: GameState, cfg: FloorConfig, me: string, lake: FloorPoint, stand: ShoreStand, press: ShorePress): Approach {
  const { at } = stand;
  const gap = (p: FloorPoint) => Math.hypot(Math.max(lake.x - p.x, 0, p.x - lake.x - 1), Math.max(lake.y - p.y, 0, p.y - lake.y - 1));
  const game = atWork(state, me, press);
  const offered = (p: FloorPoint) => pressOn(reachOf(standingAt(me, p), game, me, cfg), press, lake);
  const finish = (onto: MapWalk): MapWalk => {
    if (!Number.isFinite(onto.seconds)) return onto;
    const a = onto.end;
    const along = (f: number): FloorPoint => ({ x: a.x + f * (at.x - a.x), y: a.y + f * (at.y - a.y) });
    const reached = (f: number) => gap(along(f)) < cfg.steer.shoreReachTiles;
    const near = stand.landFirst ? 1 : reached(0) ? 0 : firstInside(reached, 0);
    const end = along(stand.landFirst || offered(along(near)) ? near : firstInside((f) => offered(along(f)), near));
    return { seconds: onto.seconds + Math.hypot(end.x - a.x, end.y - a.y) * tileSeconds(state, cfg, at), end };
  };
  return { tile: tileIndex(state.width, Math.floor(at.x), Math.floor(at.y)), finish };
}

/** The quickest of some walks; `none` if there are none. */
const quickest = (walks: readonly MapWalk[], none: MapWalk): MapWalk => walks.reduce((a, b) => (b.seconds < a.seconds ? b : a), none);

/**
 * The walk from a point on the map to plot `index`, as the hand walks pathTo's quickest walk: from each tile straight
 * for the next one's middle, cutting the corners, until it steps onto the plot, where Reach offers it. A lake plot it
 * works from the quickest of its stands for the errand (AM-18; approaches). Not pathTo's seconds, which count every tile
 * crossed whole: the plot's own, where the walk ends at its edge, and none of the one it starts on.
 */
export function mapWalk(state: GameState, cfg: FloorConfig, from: FloorPoint, index: number, errand?: Errand): MapWalk {
  return quickest(approaches(state, cfg, index, errand).map((a) => a.finish(sideWalk(state, cfg, from, a.tile))), { seconds: Infinity, end: from });
}

/** Per open door, the walk from just outside it to plot `index` for the errand (approaches), by doorTable's walks. */
function doorWalks(state: GameState, cfg: FloorConfig, index: number, errand?: Errand): [HallDoor, MapWalk][] {
  const ways = approaches(state, cfg, index, errand);
  return [...doorTable(state, cfg)].map(([door, map]) => [door, quickest(ways.map((a) => a.finish(map[a.tile]!)), { seconds: Infinity, end: doorOutside(state, door, cfg) })]);
}

/**
 * The walk onto tile `index` along pathTo's four-way path. A plot nobody may stand on it works from the tile before it:
 * towards it until within DEV_STEER.shoreReachTiles of its edge. A lake plot in shore mode is priced by its stands
 * (approaches), not here.
 */
function sideWalk(state: GameState, cfg: FloorConfig, from: FloorPoint, index: number): MapWalk {
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
 * Per open door, the walk out from just outside it onto every tile, as the hand walks it (sideWalk). Remembered per map
 * and per the config the walk reads, so a game pays for it once. The walk back in is the same walk the other way
 * (backToDoor). A lake plot in shore mode is Infinity here: its walk depends on who walks there and for what press, so
 * it is priced by its stands (doorWalks), from these walks onto their tiles.
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
    table.set(door, state.tiles.map((_, i) => (worksFromShore(state, cfg, i) ? { seconds: Infinity, end: from } : sideWalk(state, cfg, from, i))));
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
 * quickest, leading a MULE out if `lead`, and on to `back` inside the store (null: only to the plot). A lake plot by
 * the errand's stands (approaches).
 */
export function tripSeconds(state: GameState, cfg: FloorConfig, w: Walker, from: HallPoint, index: number, lead: boolean, back: HallPlace | null = null, errand?: Errand): number {
  let best = Infinity;
  for (const [door, there] of doorWalks(state, cfg, index, errand)) {
    const walk = there.seconds;
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
  const errand: Errand = { me: c.id, press: 'install' };
  // Each leg sets off from where the last one stopped: the counter's threshold, where the hand pressed.
  const corral = standPoint('corral', cfg.hall);
  // Every outfit has its counter in the hall: a shopfront, one of the works' bays, or the Green belt.
  const place = outfit as HallPlace;
  return {
    corral: toCorral ?? secondsToPlace(state, cfg, { ...c, lead: null }, 'corral'),
    outfitter: hallSeconds(state, cfg, corral, place, w.pace, true),
    plot: tripSeconds(state, cfg, w, standPoint(place, cfg.hall), index, true, null, errand),
    pub: plotToPlace(state, cfg, w, index, 'pub', errand),
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

/** Seconds from plot `index` back into the store to a place, without a MULE, by the quickest door: from where the errand's walk there ended. */
export function plotToPlace(state: GameState, cfg: FloorConfig, w: Walker, index: number, place: HallPlace, errand?: Errand): number {
  let best = Infinity;
  for (const [door, walk] of doorWalks(state, cfg, index, errand)) {
    best = Math.min(best, walk.seconds / mapFactor(cfg, w.pace, false, w.bot) + hallSeconds(state, cfg, cfg.hall.spots[door], place, w.pace, false));
  }
  return best;
}

/**
 * Seconds for an errand on a plot from where a colonist stands, to make `press` there: the walk there (out of the store
 * first, if inside), `work` seconds on it, and the walk back to the pub. RULE-8's test for whether an errand still fits
 * the clock.
 */
export function plotErrandSeconds(state: GameState, cfg: FloorConfig, c: FloorColonist, index: number, work: number, press: ShorePress): number {
  const w: Walker = { pace: c.pace, bot: c.bot };
  const lead = leading(c);
  const errand: Errand = { me: c.id, press };
  if (c.space === 'hall') return tripSeconds(state, cfg, w, c, index, lead, null, errand) + work + plotToPlace(state, cfg, w, index, 'pub', errand);
  // On the map it walks there from where it stands (slowed by a bite), and back from where that walk ends.
  const walk = mapWalk(state, cfg, c, index, errand);
  return walk.seconds / mapFactor(cfg, c.pace, lead, c.bot, c.bitten) + work + pubSeconds(state, cfg, { ...c, ...walk.end, lead: null });
}

/**
 * The walk from where a colonist stands to plot `index` to make `press` there, as the hand walks it: on the map from
 * where it stands (slowed by a bite), from the hall out by the door that makes it quickest; a lake plot to the quickest
 * of its stands (approaches). Its seconds at the colonist's factors, and where it ends, where Reach first offers the plot.
 */
export function plotWalk(state: GameState, cfg: FloorConfig, c: FloorColonist, index: number, press: ShorePress): MapWalk {
  return walkVia(state, cfg, c, approaches(state, cfg, index, { me: c.id, press }));
}

/**
 * The walk from where a colonist stands to lake plot `lake` from a stand on its shore for `press`, as plotWalk prices it:
 * the walker (FloorWalker) heads for the stand this is quickest for, so the walk it makes is the walk the plan priced.
 */
export function standWalk(state: GameState, cfg: FloorConfig, c: FloorColonist, lake: FloorPoint, stand: ShoreStand, press: ShorePress): MapWalk {
  return walkVia(state, cfg, c, [shoreApproach(state, cfg, c.id, lake, stand, press)]);
}

/** The quickest walk from where a colonist stands by any of the approaches, at its factors. */
function walkVia(state: GameState, cfg: FloorConfig, c: FloorColonist, ways: readonly Approach[]): MapWalk {
  const lead = leading(c);
  if (c.space === 'map') {
    const walk = quickest(ways.map((a) => a.finish(sideWalk(state, cfg, c, a.tile))), { seconds: Infinity, end: c });
    return { seconds: walk.seconds / mapFactor(cfg, c.pace, lead, c.bot, c.bitten), end: walk.end };
  }
  let best: MapWalk = { seconds: Infinity, end: c };
  for (const [door, map] of doorTable(state, cfg)) {
    const walk = quickest(ways.map((a) => a.finish(map[a.tile]!)), { seconds: Infinity, end: c });
    const seconds = hallSeconds(state, cfg, c, door, c.pace, lead) + walk.seconds / mapFactor(cfg, c.pace, lead, c.bot);
    if (seconds < best.seconds) best = { seconds, end: walk.end };
  }
  return best;
}

/**
 * A stop on the rest of a plan: a place in the hall, or a plot and the press made there, and `work` seconds there (the
 * press's pause, an assay). `lead`: whether it walks there leading a MULE (true from the corral to the plot it installs
 * on, false to the corral); absent, as it stands.
 */
export type PlanStop = ({ place: HallPlace } | { plot: number; press: ShorePress }) & { work: number; lead?: boolean };

/**
 * Seconds for the rest of a plan from where a colonist stands: each stop in order, every leg setting off where the last
 * ended (a counter's threshold, a plot's edge) at the floor's speeds, the work at each, as the estimates the plans are
 * priced by (muleLegs, plotErrandSeconds). A bite slows it until it is back in the store.
 */
export function planSeconds(state: GameState, cfg: FloorConfig, c: FloorColonist, stops: readonly PlanStop[]): number {
  let at = c;
  let seconds = 0;
  for (const stop of stops) {
    const lead = stop.lead === undefined ? at.lead : stop.lead ? (at.lead ?? { good: null, x: at.x, y: at.y }) : null;
    const me: FloorColonist = { ...at, lead, bolt: undefined };
    if ('plot' in stop) {
      const walk = plotWalk(state, cfg, me, stop.plot, stop.press);
      seconds += walk.seconds + stop.work;
      // Installed, the MULE stays on the plot.
      at = { ...me, space: 'map', ...walk.end, lead: null, bitten: me.space === 'map' && me.bitten };
    } else {
      seconds += secondsToPlace(state, cfg, me, stop.place) + stop.work;
      at = { ...me, space: 'hall', ...standPoint(stop.place, cfg.hall), bitten: false };
    }
    if (seconds === Infinity) return seconds;
  }
  return seconds;
}

const AROUND = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

/** The presses the develop hand makes on a lake plot from its shore (AM-18). */
export type ShorePress = 'install' | 'analyse' | 'filter';

/** A spot to work a lake plot from, and whether Reach there offers the land underfoot first (an analysis, AM-18). */
export interface ShoreStand {
  at: FloorPoint;
  landFirst: boolean;
}

/** Whether Reach offers `press` on plot `p`. */
const pressOn = (r: Reach, press: ShorePress, p: FloorPoint) => r.kind === press && r.plot.x === p.x && r.plot.y === p.y;

/** The floor with only the seat's colonist on it, standing at a point on the map, and no moments. */
function standingAt(me: string, at: FloorPoint): DevFloor {
  const c: FloorColonist = { ...probe('map', at, 1, false, true), id: me };
  return { tick: 0, colonists: [c], moments: { glint: null, glintAfterTick: 0, scramble: null, scrambled: false, beats: [], due: [] } };
}

/**
 * The game as Reach sees it for a seat about to press: in development, the seat not at the pub, and for an install
 * leading an outfitted MULE, as it will be when it walks one to its plot. A plan may be priced at any time (a test reads
 * one after the pub); what Reach offers at a spot is the same.
 */
function atWork(state: GameState, me: string, press: ShorePress): GameState {
  const ready = (p: Player): Player => {
    const fitted = p.carriedMule && p.carriedMule !== 'empty' ? p.carriedMule : 'food';
    // Caught again, a bolted MULE installs from the same spots: a bolt is no reason a shore can't reach the plot.
    return { ...p, doneDeveloping: false, ...(press === 'install' && { carriedMule: fitted, muleBolted: false }) };
  };
  return { ...state, phase: 'development', players: state.players.map((p) => (p.id === me ? ready(p) : p)) };
}

/**
 * The spots a seat can work lake plot `plot` from with `press`, in shore mode (AM-18): on each open neighbour, side or
 * corner, DEV_STEER.botShoreTiles from its middle towards the lake, that a walk from the store reaches, and where the
 * engine's Reach offers that press on this plot: not on the land underfoot (a plot of the seat's own, for an install),
 * nor on another lake plot nearer. An analysis may also stand where Reach offers the land underfoot first and the lake
 * after it (landFirst): it costs an analysis more. The plans (installable) and the walker (FloorWalker) stand by these
 * alike, so no MULE is bought for a plot the floor then gives nowhere to install it from (FM-floor-lake-stand).
 */
export function shoreStands(state: GameState, cfg: FloorConfig, me: string, plot: FloorPoint, press: ShorePress): ShoreStand[] {
  if (cfg.steer.lakeMode !== 'shore') return [];
  const walks = [...doorTable(state, cfg).values()];
  const game = atWork(state, me, press);
  const on = (r: Reach, p: FloorPoint) => pressOn(r, press, p);
  return AROUND.flatMap(([dx, dy]): ShoreStand[] => {
    const t = tileAt(state.tiles, state.width, plot.x + dx, plot.y + dy);
    if (!t || terrainShare(t.terrain, cfg) <= 0) return [];
    const index = tileIndex(state.width, t.x, t.y);
    if (!walks.some((map) => Number.isFinite(map[index]!.seconds))) return [];
    const middle = tileMiddle(t.x, t.y);
    const at = { x: middle.x - dx * cfg.steer.botShoreTiles, y: middle.y - dy * cfg.steer.botShoreTiles };
    const floor = standingAt(me, at);
    const reach = reachOf(floor, game, me, cfg);
    if (on(reach, plot)) return [{ at, landFirst: false }];
    if (press !== 'analyse' || !on(reach, t)) return [];
    // With the land underfoot analysed first.
    const after = { ...game, players: game.players.map((p) => (p.id === me ? { ...p, analysed: [...p.analysed, index] } : p)) };
    return on(reachOf(floor, after, me, cfg), plot) ? [{ at, landFirst: true }] : [];
  });
}

/** Whether a colonist can stand where Reach offers installing on the plot: on it, or (a lake plot) at a spot on its shore. */
export function installable(state: GameState, cfg: FloorConfig, me: string, index: number): boolean {
  const t = state.tiles[index]!;
  return terrainShare(t.terrain, cfg) > 0 || shoreStands(state, cfg, me, t, 'install').length > 0;
}
