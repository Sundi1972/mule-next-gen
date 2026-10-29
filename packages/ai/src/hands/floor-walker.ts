import {
  doorOutside,
  HALL_DOORS,
  IDLE_INPUT,
  MS_PER_SECOND,
  pathTo,
  placeAt,
  reachOf,
  speedOf,
  terrainShare,
  tileAt,
  tileIndex,
  type DevFloor,
  type FloorColonist,
  type FloorConfig,
  type FloorInput,
  type FloorPoint,
  type GameState,
  type HallDoor,
  type HallPlace,
  type HallPoint,
  type Reach,
} from '@mule/engine';
import type { AiAction } from '../actions.js';
import { doorTable, hallSeconds, mapFactor, placePoint, shoreStands, tileMiddle, walkwayOf } from '../floor-time.js';

/**
 * The develop hand's runner on the dev floor (arcade C9): it walks one step of the to-do list, as a person would, with
 * the stick and the button. A step names a place (the corral, an outfitter, the pub, a plot); the runner steers there,
 * along pathTo's quickest walk on the map and the walkway in the hall, through the store's doors with a press, and
 * presses the button once Reach (reachOf) offers what the step is for. The next tick reads the game to see whether the
 * press took. It moves nobody: stepFloor moves the colonist by the input it returns (HC-4).
 *
 * A step fails, so the hand drops it and what depends on it as when the rules refuse a tap, when its place cannot be
 * reached (no open walk, a lake plot to stand on), when the colonist stands at it and Reach offers something else or
 * offers it dim (the corral sold out, money short), when the press did not take, or when the colonist pushes without
 * moving for DEV_STEER.botStuckTicks.
 */

/** Where a step is done: a place in the store's hall, or a plot on the map. */
export type StepGoal = { space: 'hall'; place: HallPlace } | { space: 'map'; plot: FloorPoint };

/** What a tick of the runner came to: still on its way (with the input), or the step done or given up. */
export type StepRun = { kind: 'going'; input: FloorInput } | { kind: 'ok' } | { kind: 'failed'; why: string };

/** What the runner reads each tick: the game, the floor, the config, and the time left on the clock. */
export interface FloorView {
  state: GameState;
  floor: DevFloor;
  cfg: FloorConfig;
  secondsLeft: number;
}

/** Where a development action is done; null for one that is not a development step. */
export function goalOf(action: AiAction): StepGoal | null {
  switch (action.type) {
    case 'buyMule':
      return { space: 'hall', place: 'corral' };
    case 'outfit':
      return { space: 'hall', place: action.outfit };
    case 'pub':
      return { space: 'hall', place: 'pub' };
    case 'install':
    case 'analyse':
    case 'filter':
      return { space: 'map', plot: { x: action.x, y: action.y } };
    default:
      return null;
  }
}

const samePlot = (a: FloorPoint, b: FloorPoint) => a.x === b.x && a.y === b.y;

/** Whether Reach offers the press this step is for. */
export function offers(reach: Reach, action: AiAction): boolean {
  switch (action.type) {
    case 'buyMule':
      return reach.kind === 'buy';
    case 'outfit':
      return reach.kind === 'outfit' && reach.good === action.outfit;
    case 'pub':
      return reach.kind === 'pub';
    case 'install':
    case 'analyse':
    case 'filter':
      return reach.kind === action.type && samePlot(reach.plot, action);
    default:
      return false;
  }
}

/** Whether the press took, read from the game: what the rule changes for the seat. */
function took(state: GameState, me: string, action: AiAction): boolean {
  const p = state.players.find((q) => q.id === me)!;
  switch (action.type) {
    case 'buyMule':
      return p.carriedMule === 'empty';
    case 'outfit':
      return p.carriedMule === action.outfit;
    case 'install':
      return p.carriedMule === null && tileAt(state.tiles, state.width, action.x, action.y)?.outfit !== null;
    case 'analyse':
      return p.analysed.includes(tileIndex(state.width, action.x, action.y));
    case 'filter':
      return tileAt(state.tiles, state.width, action.x, action.y)?.filter === true;
    case 'pub':
      return p.doneDeveloping;
    default:
      return false;
  }
}

/** Closer than this to a point, in tiles or hall units, is there: well under a tick's step at any pace. */
const THERE = 1e-3; // literal-ok: geometry, a tolerance on floating-point positions, not balance

const isDoor = (place: HallPlace | null): place is HallDoor => place === 'doorL' || place === 'doorR';


export class FloorWalker {
  /** Ms stood at the counter before the press. */
  private paused = 0;
  /** The button was pressed for the step on the last tick; this tick reads whether it took. */
  private pressed = false;
  /** Ticks pushed without moving. */
  private stuck = 0;
  private pushed = false;
  /** Where the colonist stood when the stuck count started. */
  private anchor: { x: number; y: number; space: string } | null = null;
  /** Where on the map it stands for the step: undefined until worked out, null if nowhere. */
  private stand: FloorPoint | null | undefined = undefined;

  /** The runner for one seat: `me`, the seat whose colonist it steers. */
  constructor(private readonly me: string) {}

  /** Starts a new step: nothing pressed, no pause stood. */
  reset(): void {
    this.paused = 0;
    this.pressed = false;
    this.stuck = 0;
    this.pushed = false;
    this.anchor = null;
    this.stand = undefined;
  }

  /** One tick of a step: the input that walks it on, or how it ended. `pauseMs`: how long it stands at a counter first. */
  run(view: FloorView, action: AiAction, pauseMs: number): StepRun {
    const { state, floor, cfg } = view;
    if (this.pressed) {
      const ok = took(state, this.me, action);
      this.reset();
      return ok ? { kind: 'ok' } : { kind: 'failed', why: 'the press did not take' };
    }
    const c = floor.colonists.find((x) => x.id === this.me);
    if (!c) return { kind: 'failed', why: 'no colonist on the floor' };
    if (c.assayUntilTick !== null && floor.tick < c.assayUntilTick) return this.going(IDLE_INPUT);
    // Pushing for botStuckTicks and no further than where it started them: a wall, a lake's corner, or going back and forth.
    if (!this.pushed || !this.anchor || c.space !== this.anchor.space) {
      this.anchor = { x: c.x, y: c.y, space: c.space };
      this.stuck = 0;
    } else if (++this.stuck >= cfg.steer.botStuckTicks) {
      if (Math.hypot(c.x - this.anchor.x, c.y - this.anchor.y) < THERE) return { kind: 'failed', why: 'stuck' };
      this.anchor = { x: c.x, y: c.y, space: c.space };
      this.stuck = 0;
    }
    const goal = goalOf(action);
    if (!goal) return { kind: 'failed', why: 'not a development step' };
    const reach = reachOf(floor, state, this.me, cfg, { secondsLeft: view.secondsLeft });
    if (offers(reach, action)) {
      if (!reach.enabled) return { kind: 'failed', why: 'offered dim' };
      if (this.paused < pauseMs) {
        this.paused += cfg.steer.tickMs;
        return this.going(IDLE_INPUT);
      }
      this.pressed = true;
      return this.going({ x: 0, y: 0, act: true });
    }
    return goal.space === 'hall' ? this.toPlace(view, c, goal.place, reach) : this.toPlot(view, c, goal.plot, action, reach);
  }

  private going(input: FloorInput): StepRun {
    this.pushed = input.x !== 0 || input.y !== 0;
    return { kind: 'going', input };
  }

  /** The stick towards `to`, short of a full push for the last bit so the colonist stops on it. */
  private toward(view: FloorView, c: FloorColonist, to: HallPoint): StepRun {
    const dx = to.x - c.x;
    const dy = to.y - c.y;
    const gap = Math.hypot(dx, dy);
    if (gap < THERE) return this.going(IDLE_INPUT);
    const step = (speedOf(c, view.state, view.cfg) * view.cfg.steer.tickMs) / MS_PER_SECOND;
    const k = gap > step ? 1 / gap : 1 / step;
    return this.going({ x: dx * k, y: dy * k, act: false });
  }

  /** In the hall: onto the walkway, along it, then straight into the place. On the map: to the store, and in. */
  private toPlace(view: FloorView, c: FloorColonist, place: HallPlace, reach: Reach): StepRun {
    const { hall } = view.cfg;
    if (c.space === 'map') {
      if (reach.kind === 'enter') return this.going({ x: 0, y: 0, act: true });
      return this.toDoor(view, c, place);
    }
    const at = placeAt(c, hall);
    if (at === place) {
      // At a door to leave by, the press is the way out.
      if (isDoor(place) && reach.kind === 'leave') return this.going({ x: 0, y: 0, act: true });
      return { kind: 'failed', why: `at the ${place}, the button offers ${reach.kind}` };
    }
    const walk = walkwayOf(hall);
    const mid = (walk.y0 + walk.y1) / 2; // literal-ok: halfway across the walkway
    const there = placePoint(place, hall);
    // Inside another room, or a door's far ends: back out onto the walkway first.
    const astray = at !== null && (c.y < walk.y0 || c.y > walk.y1);
    if (astray) return this.toward(view, c, { x: Math.min(walk.x1, Math.max(walk.x0, c.x)), y: mid });
    if (Math.abs(c.x - there.x) > THERE) return this.toward(view, c, { x: there.x, y: mid });
    return this.toward(view, c, there);
  }

  /** On the map: to just outside the store door that makes the walk to `place` quickest. */
  private toDoor(view: FloorView, c: FloorColonist, place: HallPlace): StepRun {
    const { state, cfg } = view;
    const here = tileIndex(state.width, Math.floor(c.x), Math.floor(c.y));
    let best: { door: HallDoor; s: number } | null = null;
    for (const [door, map] of doorTable(state, cfg)) {
      const s = map[here]! / mapFactor(cfg, c.pace, c.lead !== null, c.bot) + hallSeconds(state, cfg, cfg.hall.spots[door], place, c.pace, c.lead !== null);
      if (!best || s < best.s) best = { door, s };
    }
    if (!best || !Number.isFinite(best.s)) return { kind: 'failed', why: 'no open walk to the store' };
    // A body's width further out than the door's mouth: arriving there from above or below never grazes the store's
    // wall, and the door is still in reach.
    const mouth = doorOutside(state, best.door, cfg);
    const out = best.door === 'doorL' ? -cfg.steer.bodyTiles : cfg.steer.bodyTiles;
    return this.onMap(view, c, { x: mouth.x + out, y: mouth.y });
  }

  /** To a plot: out of the store first, by the door nearest it, then across the map onto it, or to its shore. */
  private toPlot(view: FloorView, c: FloorColonist, plot: FloorPoint, action: AiAction, reach: Reach): StepRun {
    const { state, cfg } = view;
    const tile = tileAt(state.tiles, state.width, plot.x, plot.y);
    if (!tile) return { kind: 'failed', why: 'no such plot' };
    const open = terrainShare(tile.terrain, cfg) > 0;
    // A lake plot is installed on from its shore; nobody stands on it to analyse it or fit its filter.
    // Where to stand is settled once a step: the shore's spot costs a search.
    if (this.stand === undefined) this.stand = open ? tileMiddle(plot.x, plot.y) : action.type === 'install' ? this.shore(view, c, plot) : null;
    const stand = this.stand;
    if (!stand) return { kind: 'failed', why: 'nowhere to stand for it' };
    if (c.space === 'hall') {
      if (reach.kind === 'leave' && placeAt(c, cfg.hall) === this.exitFor(view, c, stand)) return this.going({ x: 0, y: 0, act: true });
      return this.toPlace(view, c, this.exitFor(view, c, stand), reach);
    }
    const under = (p: FloorPoint) => tileIndex(state.width, Math.floor(p.x), Math.floor(p.y));
    // On the plot (or at its shore) and the button offers something else: it never will.
    if (under(c) === under(stand) && Math.hypot(c.x - stand.x, c.y - stand.y) < THERE) return { kind: 'failed', why: `on the plot, the button offers ${reach.kind}` };
    return this.onMap(view, c, stand);
  }

  /** The door out to a point on the map: the one whose walk from here, out and across, is quickest. */
  private exitFor(view: FloorView, c: FloorColonist, to: FloorPoint): HallDoor {
    const { state, cfg } = view;
    const index = tileIndex(state.width, Math.floor(to.x), Math.floor(to.y));
    const lead = c.lead !== null;
    let best: { door: HallDoor; s: number } = { door: HALL_DOORS[0], s: Infinity };
    for (const [door, map] of doorTable(state, cfg)) {
      const s = hallSeconds(state, cfg, c, door, c.pace, lead) + map[index]! / mapFactor(cfg, c.pace, lead, c.bot);
      if (s < best.s) best = { door, s };
    }
    return best.door;
  }

  /**
   * For a lake plot: the spot on its quickest open neighbour, towards the lake, from which Reach offers it. Not on a
   * plot of the seat's own: there Reach installs on the land underfoot, not the lake beside it.
   */
  private shore(view: FloorView, c: FloorColonist, plot: FloorPoint): FloorPoint | null {
    const { state, floor, cfg } = view;
    const from = c.space === 'map' ? c : doorOutside(state, HALL_DOORS[0], cfg);
    let best: { at: FloorPoint; s: number } | null = null;
    for (const at of shoreStands(state, cfg, this.me, plot)) {
      // Reach itself says whether this spot offers this plot, and not another lake plot of the seat's nearer to it.
      const there = { ...floor, colonists: floor.colonists.map((x) => (x.id === this.me ? { ...x, space: 'map' as const, ...at } : x)) };
      const offered = reachOf(there, state, this.me, cfg);
      if (offered.kind !== 'install' || !samePlot(offered.plot, plot)) continue;
      const s = pathTo(state, from, at, cfg)?.seconds ?? Infinity;
      if (Number.isFinite(s) && (!best || s < best.s)) best = { at, s };
    }
    return best?.at ?? null;
  }

  /** Across the map to a point: along pathTo's quickest walk tile by tile, then onto the point within its tile. */
  private onMap(view: FloorView, c: FloorColonist, to: FloorPoint): StepRun {
    const { state, cfg } = view;
    if (Math.floor(c.x) === Math.floor(to.x) && Math.floor(c.y) === Math.floor(to.y)) return this.toward(view, c, to);
    const path = pathTo(state, c, to, cfg);
    const next = path?.tiles[1];
    if (!next) return { kind: 'failed', why: 'no open walk there' };
    // The last tile of the walk is the goal's: head for the point itself; before it, the next tile's middle.
    const last = path.tiles.at(-1)!;
    return this.toward(view, c, next === last ? to : tileMiddle(next.x, next.y));
  }
}
