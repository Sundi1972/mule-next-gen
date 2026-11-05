import {
  analysisSeconds,
  doorOutside,
  HALL_DOORS,
  IDLE_INPUT,
  inStore,
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
  type ReachKind,
} from '@mule/engine';
import type { AiAction } from '../actions.js';
import { backToDoor, doorTable, hallSeconds, leading, mapFactor, placePoint, shoreStands, tileMiddle, walkwayOf } from '../floor-time.js';

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
 * moving, or stands short of the step's goal, for DEV_STEER.botStuckTicks.
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

/**
 * On the map inside the band a body's width round the store's walls, where the floor stops every step that ends in it:
 * no walk puts a colonist there, nor since FM-arena-wall a fight's arena edge (game 18 of T-AC-5's sample, AM-26): a
 * guard, for a colonist the floor ever leaves there by another way. From there only a
 * step straight out moves it, so the walker makes that first: the spot just past the band's nearest edge on open land.
 * Null where the colonist is clear of the band.
 */
export function outOfWallBand(state: GameState, cfg: FloorConfig, c: FloorPoint): FloorPoint | null {
  const store = state.tiles.find((t) => t.terrain === 'store')!;
  const body = cfg.steer.bodyTiles;
  const band = { x0: store.x - body, x1: store.x + 1 + body, y0: store.y - body, y1: store.y + 1 + body };
  if (!inStore(store, body, c.x, c.y)) return null;
  const open = (p: FloorPoint) => {
    const t = tileAt(state.tiles, state.width, Math.floor(p.x), Math.floor(p.y));
    return t !== undefined && terrainShare(t.terrain, cfg) > 0;
  };
  const outs = [
    { gap: c.y - band.y0, at: { x: c.x, y: band.y0 - THERE } },
    { gap: band.y1 - c.y, at: { x: c.x, y: band.y1 + THERE } },
    { gap: c.x - band.x0, at: { x: band.x0 - THERE, y: c.y } },
    { gap: band.x1 - c.x, at: { x: band.x1 + THERE, y: c.y } },
  ];
  return outs.filter((o) => open(o.at)).sort((a, b) => a.gap - b.gap)[0]?.at ?? null;
}


export class FloorWalker {
  /** Ms stood at the counter before the press. */
  private paused = 0;
  /** The button was pressed for the step on the last tick; this tick reads whether it took. */
  private pressed = false;
  /** Ticks pushed, or stood short of the goal, without moving. */
  private stuck = 0;
  /** The last tick's input counts towards stuck: a push, or standing with nothing to wait for (not a counter's pause or an assay). */
  private pushed = false;
  /** Where the colonist stood when the stuck count started. */
  private anchor: { x: number; y: number; space: string } | null = null;
  /** Where on the map it stands for the step: undefined until worked out, null if nowhere. */
  private stand: FloorPoint | null | undefined = undefined;
  /** The last press was the analysis of the shore's own land, before the lake's (AM-18): it took nothing of the step's. */
  private pressedLand = false;

  /** The runner for one seat: `me`, the seat whose colonist it steers. */
  constructor(private readonly me: string) {}

  /** Whether the step's button was pressed on the last tick: the step is committed, its outcome read this tick. */
  pressing(): boolean {
    return this.pressed;
  }

  /** Starts a new step: nothing pressed, no pause stood. */
  reset(): void {
    this.paused = 0;
    this.pressed = false;
    this.stuck = 0;
    this.pushed = false;
    this.anchor = null;
    this.stand = undefined;
    this.pressedLand = false;
  }

  /** One tick of a step: the input that walks it on, or how it ended. `pauseMs`: how long it stands at a counter first. */
  run(view: FloorView, action: AiAction, pauseMs: number): StepRun {
    const { state, floor, cfg } = view;
    if (this.pressed && this.pressedLand) {
      // The shore's land analysed: the lake's own press comes next, from the same spot.
      this.pressed = false;
      this.pressedLand = false;
      this.paused = 0;
    } else if (this.pressed) {
      const ok = took(state, this.me, action);
      if (!ok && this.glintTook(floor)) {
        // The step that carried the press lit a glint in GRAB's reach, which ranks above the step's row (RULE-3): the
        // press grabbed it (FM-glint-install). Nothing of the step's is done, so it presses again, the counter's pause
        // already stood; the hand's clock checks still hold it to the time left.
        this.pressed = false;
      } else {
        this.reset();
        return ok ? { kind: 'ok' } : { kind: 'failed', why: 'the press did not take' };
      }
    }
    const c = floor.colonists.find((x) => x.id === this.me);
    if (!c) return { kind: 'failed', why: 'no colonist on the floor' };
    if (c.assayUntilTick !== null && floor.tick < c.assayUntilTick) return this.waiting();
    // Pushing, or standing short of the goal, for botStuckTicks and no further than where it started them: a wall, a
    // lake's corner, going back and forth, or a spot outside a door whose Reach never offers ENTER.
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
    const land = this.landFirst(c, reach, action);
    if (offers(reach, action) || land) {
      if (!reach.enabled) return { kind: 'failed', why: 'offered dim' };
      if (this.paused < pauseMs) {
        this.paused += cfg.steer.tickMs;
        return this.waiting();
      }
      this.pressed = true;
      this.pressedLand = land;
      return this.going({ x: 0, y: 0, act: true });
    }
    return goal.space === 'hall' ? this.toPlace(view, c, goal.place, reach) : this.toPlot(view, c, goal.plot, action, reach);
  }

  /**
   * Whether this seat won a glint on the last tick, read from the floor's beats for it (the step's, settleMoments' and
   * the presses'): its press went to GRAB THE GLINT, not to the step.
   */
  private glintTook(floor: DevFloor): boolean {
    return floor.moments.beats.some((b) => b.kind === 'glint' && b.who === this.me);
  }

  /**
   * One tick of a detour for a moment (arcade C9): to a point on the map, out of the store first by the door nearest
   * it, pressing once Reach offers `wants` (GRAB THE GLINT, CATCH MULE). The input, or null when there is no way there.
   */
  seek(view: FloorView, to: FloorPoint, wants: ReachKind): FloorInput | null {
    const { state, floor, cfg } = view;
    const c = floor.colonists.find((x) => x.id === this.me);
    if (!c) return null;
    const reach = reachOf(floor, state, this.me, cfg, { secondsLeft: view.secondsLeft });
    if (reach.kind === wants && reach.enabled) return this.going({ x: 0, y: 0, act: true }).input;
    let run: StepRun;
    if (c.space === 'hall') {
      const exit = this.exitFor(view, c, to);
      run = reach.kind === 'leave' && placeAt(c, cfg.hall) === exit ? this.going({ x: 0, y: 0, act: true }) : this.toPlace(view, c, exit, reach);
    } else run = this.onMap(view, c, to);
    return run.kind === 'going' ? run.input : null;
  }

  /**
   * On its way with `input`. A press does not count towards stuck; a push does, and so does standing still: the
   * runner stands only when it has got as close as it can and Reach does not offer the step, which no tick will change.
   */
  private going(input: FloorInput): { kind: 'going'; input: FloorInput } {
    this.pushed = !input.act;
    return { kind: 'going', input };
  }

  /** Standing for a reason that ends by itself, a counter's pause or an assay: it does not count towards stuck. */
  private waiting(): StepRun {
    this.pushed = false;
    return { kind: 'going', input: IDLE_INPUT };
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
    let best: { door: HallDoor; s: number } | null = null;
    for (const [door, map] of doorTable(state, cfg)) {
      const s = backToDoor(state, cfg, map, c) / mapFactor(cfg, c.pace, leading(c), c.bot, c.bitten) + hallSeconds(state, cfg, cfg.hall.spots[door], place, c.pace, leading(c));
      if (!best || s < best.s) best = { door, s };
    }
    if (!best || !Number.isFinite(best.s)) return { kind: 'failed', why: 'no open walk to the store' };
    // A body's width further out than the door's mouth: arriving there from above or below never grazes the store's
    // wall, and the door is still in reach.
    const mouth = doorOutside(state, best.door, cfg);
    const out = best.door === 'doorL' ? -cfg.steer.bodyTiles : cfg.steer.bodyTiles;
    const to = { x: mouth.x + out, y: mouth.y };
    // Against the store's top or bottom wall (a straight line to the door grazed its corner): along the wall to the
    // door's side first, rather than sliding along it at the stick's sideways share.
    const store = state.tiles.find((t) => t.terrain === 'store')!;
    const body = cfg.steer.bodyTiles;
    const inBand = c.x > store.x - body && c.x < store.x + 1 + body;
    // A step short of the wall is against it: the floor stops a step that would cross into it.
    const step = (speedOf(c, state, cfg) * cfg.steer.tickMs) / MS_PER_SECOND;
    const onWall = Math.min(Math.abs(c.y - (store.y - body)), Math.abs(c.y - (store.y + 1 + body))) < step + THERE;
    return this.onMap(view, c, inBand && onWall ? { x: to.x, y: c.y } : to);
  }

  /** To a plot: out of the store first, by the door nearest it, then across the map onto it, or to its shore. */
  private toPlot(view: FloorView, c: FloorColonist, plot: FloorPoint, action: AiAction, reach: Reach): StepRun {
    const { state, cfg } = view;
    const tile = tileAt(state.tiles, state.width, plot.x, plot.y);
    if (!tile) return { kind: 'failed', why: 'no such plot' };
    const open = terrainShare(tile.terrain, cfg) > 0;
    // A lake plot is worked from its shore: installed on, analysed or fitted with a filter there (AM-18).
    // Where to stand is settled once a step: the shore's spot costs a search.
    if (this.stand === undefined) this.stand = open ? tileMiddle(plot.x, plot.y) : this.shore(view, c, plot, action);
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
    const lead = leading(c);
    let best: { door: HallDoor; s: number } = { door: HALL_DOORS[0], s: Infinity };
    for (const [door, map] of doorTable(state, cfg)) {
      const s = hallSeconds(state, cfg, c, door, c.pace, lead) + map[index]!.seconds / mapFactor(cfg, c.pace, lead, c.bot);
      if (s < best.s) best = { door, s };
    }
    return best.door;
  }

  /**
   * At the shore spot for a lake plot's analysis, Reach offers the land underfoot first (AM-18 mirrors row 10): the
   * press analyses that land, and the lake's comes after it.
   */
  private landFirst(c: FloorColonist, reach: Reach, action: AiAction): boolean {
    const stand = this.stand;
    if (action.type !== 'analyse' || !stand || reach.kind !== 'analyse' || c.space !== 'map') return false;
    const under = { x: Math.floor(stand.x), y: Math.floor(stand.y) };
    return samePlot(reach.plot, under) && Math.floor(c.x) === under.x && Math.floor(c.y) === under.y && Math.hypot(c.x - stand.x, c.y - stand.y) < THERE;
  }

  /**
   * For a lake plot: of the spots on its shore the plans count on (floor-time.ts shoreStands, by the engine's Reach), the
   * quickest to walk to. One where Reach offers an analysis of the land underfoot first costs that analysis more.
   */
  private shore(view: FloorView, c: FloorColonist, plot: FloorPoint, action: AiAction): FloorPoint | null {
    const { state, cfg } = view;
    if (action.type !== 'install' && action.type !== 'analyse' && action.type !== 'filter') return null;
    // From the hall, out of whichever open door walks there quickest: doorTable's doors, the ones shoreStands keeps a
    // spot for, so a spot the plan counts on is one the walker can walk to.
    const lead = leading(c);
    const walk = (at: FloorPoint): number => {
      if (c.space === 'map') return pathTo(state, c, at, cfg)?.seconds ?? Infinity;
      const out = (door: HallDoor) => hallSeconds(state, cfg, c, door, c.pace, lead) + (pathTo(state, doorOutside(state, door, cfg), at, cfg)?.seconds ?? Infinity) / mapFactor(cfg, c.pace, lead, c.bot);
      return Math.min(Infinity, ...[...doorTable(state, cfg).keys()].map(out));
    };
    let best: { at: FloorPoint; s: number } | null = null;
    for (const { at, landFirst } of shoreStands(state, cfg, this.me, plot, action.type)) {
      const extra = landFirst ? analysisSeconds(state, this.me) : 0;
      const s = walk(at) + extra;
      if (Number.isFinite(s) && (!best || s < best.s)) best = { at, s };
    }
    return best?.at ?? null;
  }

  /** Across the map to a point: along pathTo's quickest walk tile by tile, then onto the point within its tile. */
  private onMap(view: FloorView, c: FloorColonist, to: FloorPoint): StepRun {
    const { state, cfg } = view;
    const out = outOfWallBand(state, cfg, c);
    if (out) return this.toward(view, c, out);
    if (Math.floor(c.x) === Math.floor(to.x) && Math.floor(c.y) === Math.floor(to.y)) return this.toward(view, c, to);
    const path = pathTo(state, c, to, cfg);
    const next = path?.tiles[1];
    if (!next) return { kind: 'failed', why: 'no open walk there' };
    // The last tile of the walk is the goal's: head for the point itself; before it, the next tile's middle.
    const last = path.tiles.at(-1)!;
    return this.toward(view, c, next === last ? to : tileMiddle(next.x, next.y));
  }
}
