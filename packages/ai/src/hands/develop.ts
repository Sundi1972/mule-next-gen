import { AI_HANDS, analysisSeconds, IDLE_INPUT, MS_PER_SECOND, observe, tileIndex, type DevFloor, type DevPlace, type FloorColonist, type FloorConfig, type FloorInput, type GameState, type Outfit, type Rng } from '@mule/engine';
import type { Act, AiAction } from '../actions.js';
import type { Brain, Pending } from '../brain.js';
import { floorDevWalk, plotErrandSeconds, pubSeconds } from '../floor-time.js';
import { analysesWanted, developDecision, filtersWanted, outfitName, plotName, type DevAction, type DevWalk } from '../strategist.js';
import { situation } from '../summary.js';
import { FloorWalker } from './floor-walker.js';

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
  /** Every step taken this month, in order, for tests and the dev view. */
  readonly done: { label: string; ok: boolean; at: number }[] = [];
  private clock = 0;
  /** Where the seat stands, when the game walks. */
  private at: DevPlace | undefined;
  /** On the floor: the runner, and the step it is walking. */
  private readonly walker: FloorWalker;
  private walking: DevStep | null = null;
  /** On the floor: the clock ran short and the list is down to the pub. */
  private toPub = false;
  /** On the floor, where the tick's input must be pure (HC-4): decisions take the default pick, never the decider. */
  private onFloor = false;

  constructor(
    private readonly brain: Brain,
    private readonly rng: Rng,
  ) {
    this.walker = new FloorWalker(brain.mind.me);
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
    this.onFloor = false;
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
    this.onFloor = true;
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
    // The clock is nearly out: whatever is left of the errand, the pub. Held, the clock stands, so there is time.
    // An assay under way holds the colonist still for the rest of it: that time is spent before any walk.
    const holding = colonist.assayUntilTick === null ? 0 : (Math.max(0, colonist.assayUntilTick - floor.tick) * dt) / MS_PER_SECOND;
    if (!held && !this.toPub && secondsLeft <= holding + pubSeconds(state, cfg, colonist) + cfg.steer.botPubMarginSeconds) this.hurry();
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
          this.taken(step, false);
          continue;
        }
        this.walking = step;
        this.walker.reset();
      }
      const run = this.walker.run(view, step.action, pauseMs);
      if (run.kind === 'going') return run.input;
      this.walking = null;
      this.taken(step, run.kind === 'ok');
    }
  }

  /** Whether an analysis or a filter, from where the colonist stands, still leaves time for the pub. */
  private fits(state: GameState, cfg: FloorConfig, c: FloorColonist, step: DevStep, secondsLeft: number): boolean {
    const a = step.action;
    if (a.type !== 'analyse' && a.type !== 'filter') return true;
    const work = a.type === 'analyse' ? analysisSeconds(state, this.brain.mind.me) : 0;
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
        const list = developDecision(obs, mind, this.mules, walk?.());
        // On the floor the server computes this inside the tick's recorded step, and a replay computes it again: no
        // decider call and no reply to wait for (WS3's condition 1). A Smart seat plays the default pick here.
        this.pending = this.onFloor
          ? this.brain.pick('develop', list, obs, null, situation(obs, mind))
          : this.brain.ask('develop', list, obs, d.decideWaitMs, null, situation(obs, mind));
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
  private taken(step: DevStep, ok: boolean): void {
    this.queue.shift();
    this.done.push({ label: step.label, ok, at: this.clock });
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
