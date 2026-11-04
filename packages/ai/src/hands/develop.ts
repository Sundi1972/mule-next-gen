import {
  AI_HANDS,
  analysisSeconds,
  doorOutside,
  HALL_DOORS,
  reachOf,
  glintMiddle,
  IDLE_INPUT,
  MS_PER_SECOND,
  observe,
  pathTo,
  terrainShare,
  tileAt,
  tileIndex,
  wolfInput,
  type AiLevelId,
  type DevFloor,
  type DevPlace,
  type FloorColonist,
  type FloorConfig,
  type FloorInput,
  type FloorPoint,
  type GameState,
  type Outfit,
  type Rng,
  type WolfFightLevel,
  type WolfPlay,
} from '@mule/engine';
import type { Act, AiAction } from '../actions.js';
import type { Brain, Pending } from '../brain.js';
import { floorDevWalk, leading, mapFactor, plotErrandSeconds, pubSeconds, tileMiddle, tripSeconds } from '../floor-time.js';
import { analysesWanted, developDecision, filtersWanted, outfitName, plotName, type DevAction, type DevWalk } from '../strategist.js';
import { situation } from '../summary.js';
import { FloorWalker, type FloorView } from './floor-walker.js';

/**
 * Development hands. On this server development is tap-to-act: a phone has
 * no creature walking the map, it taps the corral, an outfitter, then a plot
 * of its own (see apps/web Develop.tsx). So the AI taps too, at a quick
 * human's pace, through an ordered to-do list: analyse the plots worth it,
 * then for each MULE the strategist picks, buy, outfit and install; then fit
 * filters and go to the pub. Every step is done once, in order; a step the
 * rules refuse (corral sold out, money gone) drops what depended on it and
 * the hands go on with the next item. Nothing is retried and nothing waits
 * without a reason, so there is no dithering.
 *
 * Where the game walks (the referee says where the seat stands), the walk
 * costs clock time on its own, so the taps are taps alone and a MULE the
 * seat can't walk out before its time runs out is not bought.
 *
 * Where the game steers (the arcade floor, DEV_STEER.on), the same list is
 * walked instead of tapped: `steer` hands each step to a FloorWalker, which
 * returns the stick and the button for the tick, and the floor's stepFloor
 * moves the colonist. The list's source (`next`, `taken` and the stages) and
 * its runner (a tap, or a walk) are apart, so either can change alone.
 */

/** Where the colonist stands (or is walking to), and whether it is still walking or assaying, when the game walks. */
export interface DevWalking {
  at: DevPlace;
  busy: boolean;
}

/** The middle of a ms range, in seconds. */
const midSeconds = ([lo, hi]: [number, number]) => (lo + hi) / 2 / 1_000; // literal-ok: midpoint of a range, ms to s

/** The presses a MULE takes at the counters and its plot: buy, outfit, install. */
const MULE_PRESSES = 3; // literal-ok: a count of the rule's steps, not balance

/** How an AI level plays a pack of wolves (RULE-4's levels): a Rookie a rookie, a Trader a regular, a Tycoon a veteran. */
const WOLF_LEVEL: Record<AiLevelId, WolfFightLevel> = { rookie: 'rookie', trader: 'regular', tycoon: 'veteran' };

/** What a seat already in may not do while month 1's clock waits for the others' first MULEs (the server's rule). */
const HELD: ReadonlySet<AiAction['type']> = new Set(['buyMule', 'install', 'analyse', 'filter']);

export interface DevStep {
  action: AiAction;
  /** Ms the step takes before its tap. */
  ms: number;
  label: string;
  /** Steps that depend on this one; they are dropped if it fails. */
  group: number;
}

type Stage = 'start' | 'steps' | 'decide' | 'done';

export class DevelopHand {
  private month = -1;
  private stage: Stage = 'start';
  private queue: DevStep[] = [];
  private timer = 0;
  private pending: Pending<DevAction> | null = null;
  private mules = 0;
  private group = 0;
  /** Where to go once the queue is empty. */
  private then: 'decide' | 'finish' | 'done' = 'decide';
  /** Every step taken this month, in order, for tests, the dev view and the sim's report. */
  readonly done: { label: string; ok: boolean; at: number; action: AiAction; why?: string }[] = [];
  private clock = 0;
  /** Where the seat stands, when the game walks. */
  private at: DevPlace | undefined;
  /** On the floor: the runner, and the step it is walking. */
  private readonly walker: FloorWalker;
  private walking: DevStep | null = null;
  /** On the floor: the clock ran short and the list is down to the pub. */
  private toPub = false;
  /** On the floor, the moments (arcade C9): the runner for a detour, and whether one interrupted the step being walked. */
  private readonly chaser: FloorWalker;
  private detoured = false;
  /** How it plays the pack it meets now: drawn once, when the pack comes. */
  private pack: WolfPlay | null = null;
  /** The glint it last decided on, and the one it races (by the tick each lit). */
  private glintSeen: number | null = null;
  private glintWanted = false;
  private racingGlint: number | null = null;
  /** The leg it last drew wolf land for (the step, and the space it set off in), and the wolf-land tile it goes by. */
  private leg: { step: DevStep; space: string } | null = null;
  private via: FloorPoint | null = null;
  /** The scramble it last decided on (by the tick it was called), and whether it raced it. */
  private scrambleSeen: number | null = null;
  private scrambleRaced = 0;

  constructor(
    private readonly brain: Brain,
    private readonly rng: Rng,
  ) {
    this.walker = new FloorWalker(brain.mind.me);
    this.chaser = new FloorWalker(brain.mind.me);
  }

  /** The glint this seat is racing now, by the tick it lit; null when it races none. For the sim's report. */
  racing(): number | null {
    return this.racingGlint;
  }

  /** Whether it is off its errand's walk for a moment: racing a glint, or going by wolf land. For the tests. */
  detouring(): boolean {
    return this.racingGlint !== null || this.via !== null;
  }

  /** Scrambles this seat raced this month. For the sim's report. */
  scramblesRaced(): number {
    return this.scrambleRaced;
  }

  /** What the hands are about to do, for the dev view. */
  plan(): string[] {
    return this.queue.map((s) => s.label);
  }

  /** Advances by dt ms. `secondsLeft` is the development time left; `walk` says where it stands, if the game walks. */
  tick(state: GameState, dt: number, secondsLeft: number, act: Act, walk?: DevWalking): void {
    const mind = this.brain.mind;
    if (state.phase !== 'development') return;
    if (state.month !== this.month) this.reset(state.month);
    // While the colonist walks or assays nothing else happens; the next tap's time starts when it is done.
    if (walk?.busy) return;
    const at = walk?.at;
    this.at = at;
    const me = state.players.find((p) => p.id === mind.me)!;
    if (me.doneDeveloping || this.stage === 'done') return;
    if (secondsLeft <= 0) {
      this.stage = 'done';
      return;
    }
    this.clock += dt;
    const d = AI_HANDS.develop;
    const taps = () => (midSeconds(d.buyTapMs) + midSeconds(d.outfitMs) + midSeconds(d.installTapMs)) * mind.level.devPace;
    const step = this.next(state, dt, secondsLeft, at === undefined ? undefined : () => ({ at, left: secondsLeft, taps: taps() }));
    if (!step) return;
    this.timer += dt;
    if (this.timer < step.ms) return;
    this.timer = 0;
    this.taken(step, act(step.action));
  }

  /**
   * One tick on the dev floor: the stick and the button for this seat's colonist, walking the to-do list `tick` taps.
   * `held`: month 1's clock is waiting and this seat is in, so it may not start another MULE, analysis or filter yet
   * (the referee refuses them); it stands until the clock starts.
   */
  steer(state: GameState, floor: DevFloor, secondsLeft: number, cfg: FloorConfig, held = false): FloorInput {
    const mind = this.brain.mind;
    if (state.phase !== 'development') return IDLE_INPUT;
    if (state.month !== this.month) this.reset(state.month);
    const me = state.players.find((p) => p.id === mind.me)!;
    if (me.doneDeveloping || this.stage === 'done') return IDLE_INPUT;
    if (secondsLeft <= 0) {
      this.stage = 'done';
      return IDLE_INPUT;
    }
    const dt = cfg.steer.tickMs;
    this.clock += dt;
    const view = { state, floor, cfg, secondsLeft };
    const colonist = floor.colonists.find((c) => c.id === mind.me)!;
    const moment = this.moment(view, colonist, held);
    if (moment) {
      this.detoured = true;
      return moment;
    }
    // Back from a detour: the step being walked starts its walk again from where the colonist now stands.
    if (this.detoured) {
      this.detoured = false;
      this.walker.reset();
    }
    // The clock is nearly out: whatever is left of the errand, the pub. Held, the clock stands, so there is time.
    // An assay under way holds the colonist still for the rest of it: that time is spent before any walk.
    const holding = colonist.assayUntilTick === null ? 0 : (Math.max(0, colonist.assayUntilTick - floor.tick) * dt) / MS_PER_SECOND;
    if (!held && !this.toPub && secondsLeft <= holding + pubSeconds(state, cfg, colonist) + this.margin(cfg, colonist)) this.hurry();
    const pauseMs = cfg.steer.botCounterPauseSeconds * MS_PER_SECOND * mind.level.devPace;
    // A step done this tick hands over to the next at once, so no tick is spent standing between them.
    for (let ticks = dt; ; ticks = 0) {
      const step = this.next(state, ticks, secondsLeft, () => floorDevWalk(state, cfg, colonist, secondsLeft - holding, (MULE_PRESSES * pauseMs) / MS_PER_SECOND));
      if (!step) return IDLE_INPUT;
      // Held, it starts none of these; one it is already walking (or has just pressed) it sees through.
      if (held && HELD.has(step.action.type) && this.walking !== step) return IDLE_INPUT;
      if (this.walking !== step) {
        // An analysis or a filter it sets off for only if the walk there, the work and the walk on to the pub still
        // fit the clock (RULE-8's spare time); the MULEs' walks were priced when they were chosen.
        if (!held && !this.fits(state, cfg, colonist, step, secondsLeft - holding)) {
          this.taken(step, false, 'no time');
          continue;
        }
        this.walking = step;
        this.walker.reset();
      }
      const via = !held && !this.toPub ? this.byWolfLand(view, colonist, step) : null;
      if (via) return via;
      const run = this.walker.run(view, step.action, pauseMs);
      if (run.kind === 'going') return run.input;
      this.walking = null;
      this.taken(step, run.kind === 'ok', run.kind === 'failed' ? run.why : undefined);
    }
  }

  /**
   * The development moments, before the to-do list (arcade C9): a pack it meets it fights or runs from (RULE-4); stunned
   * it stands; a glint or the scramble it races only with time to spare (RULE-8); a bolted MULE it goes to catch. The
   * input for the tick, or null to walk the list.
   */
  private moment(view: FloorView, c: FloorColonist, held: boolean): FloorInput | null {
    const { state, floor, cfg, secondsLeft } = view;
    const me = this.brain.mind.me;
    if (c.encounter) {
      this.pack ??= this.playFor(view, c);
      return wolfInput(floor, state, me, cfg, this.pack);
    }
    this.pack = null;
    if (c.stunnedUntilTick !== undefined && floor.tick < c.stunnedUntilTick) return IDLE_INPUT;
    // Pelts on it at a door in the store: the store buys them (and the door's LEAVE waits a press behind SELL).
    if (c.pelts > 0 && reachOf(floor, state, me, cfg, { secondsLeft }).kind === 'sell') return { x: 0, y: 0, act: true };
    if (c.assayUntilTick !== null && floor.tick < c.assayUntilTick) return null;
    const g = floor.moments.glint;
    // Whether it would race is drawn once a glint (GLINT.botShare); whether it can, every tick the glint is lit and it
    // is not racing yet: near enough to care, and with the time to spare (RULE-8).
    if (g && this.glintSeen !== g.sinceTick) {
      this.glintSeen = g.sinceTick;
      this.glintWanted = this.rng.next() < cfg.glint.botShare;
    }
    if (g && this.glintWanted && this.racingGlint !== g.sinceTick && !held) {
      const to = glintMiddle(g);
      const from = this.raceFrom(view, c);
      if (Math.hypot(to.x - from.x, to.y - from.y) <= cfg.glint.botCareTiles && this.fitsDetour(view, c, to)) {
        this.racingGlint = g.sinceTick;
        this.chaser.reset();
      }
    }
    // With the spare-time rule, a race that no longer leaves the pub's time (a pack on the way, a bite) is given up.
    const spare = !cfg.steer.botsSpareTime || secondsLeft > pubSeconds(state, cfg, c) + this.margin(cfg, c);
    if (g && this.racingGlint === g.sinceTick && spare) {
      const input = this.chaser.seek(view, glintMiddle(g), 'grab');
      if (input) return input;
    }
    // No way there after all, or no more time: it gives the race up.
    if (g && this.racingGlint === g.sinceTick) this.glintWanted = false;
    this.racingGlint = null;
    this.raceScramble(view, c, held);
    const p = state.players.find((x) => x.id === me)!;
    if (p.muleBolted && c.lead && !this.toPub && secondsLeft > pubSeconds(state, cfg, c) + this.margin(cfg, c)) return this.chaser.seek(view, c.lead, 'catch');
    return null;
  }

  /** The seconds it keeps in hand for the pub: botPubMarginSeconds at full pace, more as a bite or a MULE slows it. */
  private margin(cfg: FloorConfig, c: FloorColonist): number {
    return cfg.steer.botPubMarginSeconds / Math.min(1, mapFactor(cfg, c.pace, leading(c), c.bot, c.bitten));
  }

  /**
   * RULE-4's AI line (AM-22): each new leg on the map goes by wolf land by WOLVES.botWolfLandShare, by the wolf-land tile
   * that adds least to the straight walk, if that detour still fits its errand and the clock (RULE-8). The input that
   * walks there, or null to walk the leg as it is.
   */
  private byWolfLand(view: FloorView, c: FloorColonist, step: DevStep): FloorInput | null {
    const { cfg } = view;
    if (this.leg?.step !== step || this.leg.space !== c.space) {
      this.leg = { step, space: c.space };
      this.via = c.space === 'map' && this.rng.next() < cfg.wolves.botWolfLandShare ? this.wolfVia(view, c, step) : null;
      if (this.via) this.chaser.reset();
    }
    const via = this.via;
    if (!via) return null;
    if (Math.floor(c.x) === Math.floor(via.x) && Math.floor(c.y) === Math.floor(via.y)) {
      // Been by it: on with the leg, its walk set off afresh from here.
      this.via = null;
      this.walker.reset();
      return null;
    }
    const input = this.chaser.seek(view, via, 'none');
    if (input) return input;
    this.via = null;
    return null;
  }

  /** The wolf-land tile a leg goes by: the one adding least to the straight walk to the leg's goal, if it fits. */
  private wolfVia(view: FloorView, c: FloorColonist, step: DevStep): FloorPoint | null {
    const { state, cfg } = view;
    const lands = cfg.wolves.lands as readonly string[];
    const here = tileAt(state.tiles, state.width, Math.floor(c.x), Math.floor(c.y));
    if (!here || lands.includes(here.terrain)) return null;
    const a = step.action;
    const store = state.tiles.find((t) => t.terrain === 'store')!;
    const goal = a.type === 'install' || a.type === 'analyse' || a.type === 'filter' ? tileMiddle(a.x, a.y) : tileMiddle(store.x, store.y);
    const d = (p: FloorPoint, q: FloorPoint) => Math.hypot(p.x - q.x, p.y - q.y);
    let best: { at: FloorPoint; extra: number } | null = null;
    for (const t of state.tiles) {
      if (!lands.includes(t.terrain) || terrainShare(t.terrain, cfg) <= 0) continue;
      const at = tileMiddle(t.x, t.y);
      const extra = d(c, at) + d(at, goal) - d(c, goal);
      if (!best || extra < best.extra) best = { at, extra };
    }
    return best && this.fitsDetour(view, c, best.at) ? best.at : null;
  }

  /** How it plays a pack: its level's dodge and strike, and fight or run by WOLVES.botFightShare, running if a fight would cost it the pub. */
  private playFor(view: FloorView, c: FloorColonist): WolfPlay {
    const { state, cfg, secondsLeft } = view;
    const level = WOLF_LEVEL[this.brain.mind.levelId as AiLevelId] ?? 'regular';
    const time = cfg.wolves.chooseSeconds + cfg.wolves.fightSeconds + pubSeconds(state, cfg, c) + cfg.steer.botPubMarginSeconds;
    const fights = this.rng.next() < cfg.wolves.botFightShare && time <= secondsLeft;
    // Running, it heads for the store's nearer door: inside, the wolves give up, and the pub is that way anyway.
    const doors = HALL_DOORS.map((d) => doorOutside(state, d, cfg));
    const refuge = doors.reduce((a, b) => (Math.hypot(b.x - c.x, b.y - c.y) < Math.hypot(a.x - c.x, a.y - c.y) ? b : a));
    return { level, fights, refuge };
  }

  /** Where a colonist is for a race's care distance: on the map, or at the store when inside. */
  private raceFrom({ state, cfg }: FloorView, c: FloorColonist): FloorPoint {
    if (c.space === 'map') return c;
    const store = state.tiles.find((t) => t.terrain === 'store')!;
    return tileMiddle(store.x, store.y);
  }

  /**
   * The scramble called with this seat needing a MULE: it races by SCRAMBLE.botShare, from within botCareTiles of the
   * store and with time to spare (RULE-8), by dropping the analyses and filters ahead of its next MULE.
   */
  private raceScramble(view: FloorView, c: FloorColonist, held: boolean): void {
    const s = view.floor.moments.scramble;
    const me = this.brain.mind.me;
    if (!s || s.over || this.scrambleSeen === s.sinceTick || !s.needers.includes(me) || held) return;
    this.scrambleSeen = s.sinceTick;
    const store = this.raceFrom(view, { ...c, space: 'hall' });
    const care = Math.hypot(store.x - this.raceFrom(view, c).x, store.y - this.raceFrom(view, c).y) <= view.cfg.scramble.botCareTiles;
    if (!(this.rng.next() < view.cfg.scramble.botShare && care && this.fitsDetour(view, c, store))) return;
    const scouting = (step: DevStep) => step.action.type === 'analyse' || step.action.type === 'filter';
    if (this.walking && scouting(this.walking)) {
      const step = this.walking;
      this.walking = null;
      this.taken(step, false, 'scramble');
    }
    this.queue = this.queue.filter((step) => !scouting(step));
    this.scrambleRaced++;
  }

  /**
   * RULE-8: whether a detour to `to` still leaves the errand time to finish inside the turn: the walk there, then from
   * there the step under way (or next) and the pub, at the floor's speeds, with botPubMarginSeconds in hand. A rough
   * reckoning, as the mock's spare.ts: the next MULE's walk and the pub, not every step on the list. Always true with
   * DEV_STEER.botsSpareTime off.
   */
  private fitsDetour(view: FloorView, c: FloorColonist, to: FloorPoint): boolean {
    const { state, cfg, secondsLeft } = view;
    if (!cfg.steer.botsSpareTime) return true;
    const index = tileIndex(state.width, Math.floor(to.x), Math.floor(to.y));
    const w = { pace: c.pace, bot: c.bot };
    const there =
      c.space === 'hall'
        ? tripSeconds(state, cfg, w, c, index, leading(c))
        : (pathTo(state, c, to, cfg)?.seconds ?? Infinity) / mapFactor(cfg, c.pace, leading(c), c.bot, c.bitten);
    const from: FloorColonist = { ...c, space: 'map', x: to.x, y: to.y };
    return there + this.restFrom(view, from) + cfg.steer.botPubMarginSeconds <= secondsLeft;
  }

  /** Seconds of errand left from a colonist standing at a point: the step under way or next, then the pub. */
  private restFrom(view: FloorView, at: FloorColonist): number {
    const { state, cfg } = view;
    const step = this.walking ?? this.queue[0];
    const a = step?.action;
    if (a && (a.type === 'install' || a.type === 'analyse' || a.type === 'filter')) {
      const work = a.type === 'analyse' ? analysisSeconds(state, this.brain.mind.me) : 0;
      return plotErrandSeconds(state, cfg, at, tileIndex(state.width, a.x, a.y), work);
    }
    const install = this.queue.find((x) => x.action.type === 'install')?.action;
    const outfit = this.queue.find((x) => x.action.type === 'outfit')?.action;
    if (a && (a.type === 'buyMule' || a.type === 'outfit') && install?.type === 'install' && outfit?.type === 'outfit') {
      const legs = floorDevWalk(state, cfg, at, 0, 0).floor!(tileIndex(state.width, install.x, install.y), outfit.outfit);
      return legs.there + legs.pub;
    }
    return pubSeconds(state, cfg, at);
  }

  /** Whether an analysis or a filter, from where the colonist stands, still leaves time for the pub. */
  private fits(state: GameState, cfg: FloorConfig, c: FloorColonist, step: DevStep, secondsLeft: number): boolean {
    const a = step.action;
    if (a.type !== 'analyse' && a.type !== 'filter') return true;
    // A lake plot is analysed from its shore, whose own land Reach analyses first if it has not been (AM-18): two analyses.
    const lake = state.tiles[tileIndex(state.width, a.x, a.y)]!.terrain === 'lake' && cfg.steer.lakeMode === 'shore';
    const work = a.type === 'analyse' ? analysisSeconds(state, this.brain.mind.me) * (lake ? 2 : 1) : 0; // literal-ok: the shore's land and the lake, two analyses
    return plotErrandSeconds(state, cfg, c, tileIndex(state.width, a.x, a.y), work) + cfg.steer.botPubMarginSeconds <= secondsLeft;
  }

  /** Out of time: drop the rest of the list and go to the pub. */
  private hurry(): void {
    this.toPub = true;
    this.pending = null;
    this.queue = [];
    this.walking = null;
    this.push({ type: 'pub' }, AI_HANDS.develop.pubMs, 'Go to the pub', ++this.group);
    this.stage = 'steps';
    this.then = 'done';
  }

  /**
   * The to-do list's source: runs its stages until a step is due and returns it, the head of the queue, or null while
   * it decides or has nothing to do. `walk` prices the walks, where the game walks or steers.
   */
  private next(state: GameState, dt: number, secondsLeft: number, walk?: () => DevWalk): DevStep | null {
    const mind = this.brain.mind;
    if (this.stage === 'start') {
      const obs = observe(state, mind.me);
      for (const index of analysesWanted(obs, mind, secondsLeft)) {
        const t = state.tiles[index]!;
        this.push({ type: 'analyse', x: t.x, y: t.y }, AI_HANDS.develop.analyseTapMs, `Analyse ${plotName(t)}`, ++this.group);
      }
      this.stage = 'steps';
      this.then = 'decide';
    }

    if (this.stage === 'decide') {
      if (!this.pending) {
        const obs = observe(state, mind.me);
        const d = AI_HANDS.develop;
        this.pending = this.brain.ask('develop', developDecision(obs, mind, this.mules, walk?.()), obs, d.decideWaitMs, null, situation(obs, mind));
      }
      const settled = this.brain.resolve(this.pending, dt, state);
      if (!settled) return null;
      this.pending = null;
      const a = settled.action;
      if (a.kind === 'stop') this.finish(state);
      else this.queueMule(state, a.index, a.outfit);
      // The first step's time starts now.
      return null;
    }

    if (this.stage !== 'steps') return null;
    if (this.queue.length === 0) {
      if (this.then === 'decide') this.stage = 'decide';
      else if (this.then === 'finish') this.finish(state);
      else this.stage = 'done';
      return null;
    }
    return this.queue[0]!;
  }

  /** The head step was taken: done, or refused, which drops what depended on it. */
  private taken(step: DevStep, ok: boolean, why?: string): void {
    if (this.walking === step) this.walking = null;
    this.queue.shift();
    this.done.push({ label: step.label, ok, at: this.clock, action: step.action, ...(why && { why }) });
    if (!ok) {
      // Drop what depended on it. A MULE that couldn't be bought means the corral is empty: no more MULEs this month.
      this.queue = this.queue.filter((s) => s.group !== step.group);
      if (step.action.type === 'buyMule' || step.action.type === 'outfit') this.then = 'finish';
    }
    if (step.action.type === 'pub' && ok) this.stage = 'done';
  }

  private reset(month: number): void {
    this.month = month;
    this.stage = 'start';
    this.queue = [];
    this.timer = 0;
    this.pending = null;
    this.mules = 0;
    this.done.length = 0;
    this.clock = 0;
    this.toPub = false;
    this.walking = null;
    this.detoured = false;
    this.leg = null;
    this.via = null;
    this.pack = null;
    this.glintSeen = null;
    this.glintWanted = false;
    this.racingGlint = null;
    this.scrambleSeen = null;
    this.scrambleRaced = 0;
  }

  private push(action: AiAction, range: [number, number], label: string, group: number): void {
    const ms = this.rng.int(...range) * this.brain.mind.level.devPace;
    this.queue.push({ action, ms, label, group });
  }

  private queueMule(state: GameState, index: number, outfit: Outfit): void {
    const t = state.tiles[index]!;
    const g = ++this.group;
    this.mules++;
    const d = AI_HANDS.develop;
    const walks = this.at !== undefined;
    this.push({ type: 'buyMule' }, walks ? d.buyTapMs : d.buyMs, 'Buy a MULE at the corral', g);
    this.push({ type: 'outfit', outfit }, d.outfitMs, `Outfit it as a ${outfitName(outfit)}`, g);
    this.push({ type: 'install', x: t.x, y: t.y }, walks ? d.installTapMs : d.installMs, `Install it on ${plotName(t)}`, g);
    this.stage = 'steps';
    this.then = 'decide';
  }

  private finish(state: GameState): void {
    const mind = this.brain.mind;
    for (const index of filtersWanted(observe(state, mind.me), mind)) {
      const t = state.tiles[index]!;
      this.push({ type: 'filter', x: t.x, y: t.y }, AI_HANDS.develop.filterMs, `Fit a filter on ${plotName(t)}`, ++this.group);
    }
    this.push({ type: 'pub' }, AI_HANDS.develop.pubMs, 'Go to the pub', ++this.group);
    this.stage = 'steps';
    this.then = 'done';
  }
}
