import { AI_HANDS, AI_LEVELS, AI_PERSONAS, createRng, GAME, observe, type AiLevelId, type AiPersonaId, type GameState } from '@mule/engine';
import type { Act } from './actions.js';
import { Brain, type DecisionRecord, type Pending } from './brain.js';
import type { Decider, TableTalk } from './decider.js';
import { AuctionHand, type AuctionDebug } from './hands/auction.js';
import { DevelopHand } from './hands/develop.js';
import { PERSONAS } from './personas.js';
import { landDecision, wantsPlot, type LandPlan } from './strategist.js';
import { situation } from './summary.js';
import type { Mind } from './value.js';

export interface AiSeatOptions {
  id: string;
  name: string;
  persona: AiPersonaId;
  level: AiLevelId;
  /** Seeds the hands' noise and the default pick. Derive it from the game seed and the seat. */
  seed: number;
  /** Picks among the shortlists; null plays the default pick (TopPickDecider). */
  decider?: Decider | null;
  /** Every settled decision, with its candidates and scores. */
  onDecision?: (record: DecisionRecord) => void;
}

/** What the dev view shows of an AI: its limits and its plan. */
export interface AiSeatDebug {
  persona: AiPersonaId;
  level: AiLevelId;
  landPlan: { focus: string; top: { label: string; utility: number; value: number }[] } | null;
  developPlan: string[];
  auction: AuctionDebug | null;
  recent: DecisionRecord[];
}

/**
 * One AI player: the strategist and decider (its "brain") and its hands for
 * the real-time phases. It reads the game only through `observe` and plays
 * only through `Act`, so the server and the simulator drive it the same way:
 * call `planMonth` when planning starts, `onLit` when a plot lights up,
 * `developTick` and `auctionTick` on every tick of those phases.
 */
export class AiSeat {
  readonly mind: Mind;
  readonly brain: Brain;
  private readonly rng;
  private readonly develop: DevelopHand;
  private readonly auction: AuctionHand;
  private land: Pending<LandPlan> | null = null;
  private landMonth = -1;

  constructor(readonly options: AiSeatOptions) {
    this.mind = {
      me: options.id,
      personaId: options.persona,
      persona: AI_PERSONAS[options.persona],
      levelId: options.level,
      level: AI_LEVELS[options.level],
    };
    this.rng = createRng(options.seed >>> 0);
    this.brain = new Brain(this.mind, PERSONAS[options.persona], options.name, options.seed, options.decider ?? null, options.onDecision);
    this.develop = new DevelopHand(this.brain, createRng((options.seed ^ 0x9e3779b9) >>> 0));
    this.auction = new AuctionHand(this.brain, createRng((options.seed ^ 0x85ebca6b) >>> 0));
  }

  get id(): string {
    return this.options.id;
  }

  hear(line: TableTalk): void {
    this.brain.hear(line);
  }

  /** Planning: the land plan for this month's grant, with its full ranking of free plots. */
  planMonth(state: GameState): void {
    if (this.landMonth === state.month) return;
    const obs = observe(state, this.id);
    this.landMonth = state.month;
    this.land = this.brain.ask('land', landDecision(obs, this.mind), obs, Infinity, null, situation(obs, this.mind));
  }

  /**
   * A plot just lit up. Returns after how many ms the hands press Claim, or
   * null to let it go: they press when the plot clears the plan's bar, after
   * a reaction and a go/no-go choice, and Rookie sometimes misses on purpose.
   */
  onLit(state: GameState): number | null {
    const grant = state.grant;
    if (state.phase !== 'landGrant' || !grant) return null;
    const me = state.players.find((p) => p.id === this.id)!;
    if (me.claimsThisGrant >= GAME.claimsPerGrant) return null;
    if (!this.land || this.landMonth !== state.month) this.planMonth(state);
    const plan = this.brain.resolveNow(this.land!, state).action;
    const index = grant.order[grant.step];
    if (index === undefined) return null;
    const obs = observe(state, this.id);
    if (!wantsPlot(plan, obs, index, grant.sweep)) return null;
    if (this.rng.next() < this.mind.level.missChance) return null;
    return this.rng.int(...this.mind.level.reactMs) + this.rng.int(...AI_HANDS.grant.choiceMs);
  }

  developTick(state: GameState, dt: number, secondsLeft: number, act: Act): void {
    this.develop.tick(state, dt, secondsLeft, act);
  }

  auctionTick(state: GameState, dt: number, act: Act): void {
    this.auction.tick(state, dt, act);
  }

  /** The development steps taken this month, in order. */
  developLog(): readonly { label: string; ok: boolean; at: number }[] {
    return this.develop.done;
  }

  debug(): AiSeatDebug {
    const plan = this.land?.settled?.action ?? null;
    return {
      persona: this.mind.personaId as AiPersonaId,
      level: this.mind.levelId as AiLevelId,
      landPlan: plan ? { focus: plan.focus, top: plan.ranking.slice(0, 5).map((s) => ({ label: s.label, utility: Math.round(s.utility * 1000) / 1000, value: s.value })) } : null,
      developPlan: this.develop.plan(),
      auction: this.auction.debug(),
      recent: this.brain.log.slice(-5),
    };
  }
}
