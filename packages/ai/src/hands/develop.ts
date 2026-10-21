import { AI_HANDS, observe, type GameState, type Outfit, type Rng } from '@mule/engine';
import type { Act, AiAction } from '../actions.js';
import type { Brain, Pending } from '../brain.js';
import { analysesWanted, developDecision, filtersWanted, outfitName, plotName, type DevAction } from '../strategist.js';
import { situation } from '../summary.js';

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
 */

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

  constructor(
    private readonly brain: Brain,
    private readonly rng: Rng,
  ) {}

  /** What the hands are about to do, for the dev view. */
  plan(): string[] {
    return this.queue.map((s) => s.label);
  }

  /** Advances by dt ms. `secondsLeft` is the seat's development time left. */
  tick(state: GameState, dt: number, secondsLeft: number, act: Act): void {
    const mind = this.brain.mind;
    if (state.phase !== 'development') return;
    if (state.month !== this.month) this.reset(state.month);
    const me = state.players.find((p) => p.id === mind.me)!;
    if (me.doneDeveloping || this.stage === 'done') return;
    if (secondsLeft <= 0) {
      this.stage = 'done';
      return;
    }
    this.clock += dt;

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
        this.pending = this.brain.ask('develop', developDecision(obs, mind, this.mules), obs, AI_HANDS.develop.decideWaitMs, null, situation(obs, mind));
      }
      const settled = this.brain.resolve(this.pending, dt, state);
      if (!settled) return;
      this.pending = null;
      const a = settled.action;
      if (a.kind === 'stop') this.finish(state);
      else this.queueMule(state, a.index, a.outfit);
      // The first step's time starts now.
      return;
    }

    if (this.stage !== 'steps') return;
    if (this.queue.length === 0) {
      if (this.then === 'decide') this.stage = 'decide';
      else if (this.then === 'finish') this.finish(state);
      else this.stage = 'done';
      return;
    }
    this.timer += dt;
    const step = this.queue[0]!;
    if (this.timer < step.ms) return;
    this.timer = 0;
    this.queue.shift();
    const ok = act(step.action);
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
  }

  private push(action: AiAction, range: [number, number], label: string, group: number): void {
    const ms = this.rng.int(...range) * this.brain.mind.level.devPace;
    this.queue.push({ action, ms, label, group });
  }

  private queueMule(state: GameState, index: number, outfit: Outfit): void {
    const t = state.tiles[index]!;
    const g = ++this.group;
    this.mules++;
    this.push({ type: 'buyMule' }, AI_HANDS.develop.buyMs, 'Buy a MULE at the corral', g);
    this.push({ type: 'outfit', outfit }, AI_HANDS.develop.outfitMs, `Outfit it as a ${outfitName(outfit)}`, g);
    this.push({ type: 'install', x: t.x, y: t.y }, AI_HANDS.develop.installMs, `Install it on ${plotName(t)}`, g);
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
