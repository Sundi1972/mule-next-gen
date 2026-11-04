import {
  AI_HANDS,
  AI_LEVELS,
  AI_PERSONAS,
  AI_PLANS,
  createRng,
  floorConfig,
  GAME,
  observe,
  type AiLevelId,
  type AiPersonaId,
  type DevFloor,
  type FloorConfig,
  type FloorInput,
  type GameState,
  type Playbook,
} from '@mule/engine';
import type { Act, AiAction } from './actions.js';
import { Brain, type DecisionRecord, type Pending } from './brain.js';
import type { Decider, TableTalk } from './decider.js';
import { AuctionHand, type AuctionDebug } from './hands/auction.js';
import { DevelopHand, type DevWalking } from './hands/develop.js';
import { PERSONAS } from './personas.js';
import { adoptInto, DRAFT_PHASE_OF, draftPlaybook, pathFor, validatePlaybook, validatorFor, type DraftPhase, type PartKey, type PlayedPart, type PlayPath, type ValidatePlan, type ValidatorProfile } from './playbook/index.js';
import { landDecision, wantsAnyAhead, wantsPlot, type LandPlan } from './strategist.js';
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
  /** RULE-6 row 1: false plays every phase by today's asks. Unset, AI_PLANS.on decides. */
  playbook?: boolean;
  /** Each playbook the seat plays itself, validated: what the game records for it. Unset, the seat writes none. */
  onPlaybook?: (playbook: Playbook) => void;
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
  /** Playbooks adopted for the newest month adopted, oldest first. */
  private adopted: readonly Playbook[] = [];

  constructor(readonly options: AiSeatOptions) {
    this.mind = {
      me: options.id,
      personaId: options.persona,
      persona: AI_PERSONAS[options.persona],
      levelId: options.level,
      level: AI_LEVELS[options.level],
      salt: (options.seed ^ 0x27d4eb2d) >>> 0, // literal-ok: a hash salt, so the seat's tie-break stream is its own
    };
    this.rng = createRng(options.seed >>> 0);
    this.brain = new Brain(this.mind, PERSONAS[options.persona], options.name, options.seed, options.decider ?? null, options.onDecision);
    this.develop = new DevelopHand(this.brain, createRng((options.seed ^ 0x9e3779b9) >>> 0)); // literal-ok: a hash salt for the develop hand's rng stream
    this.auction = new AuctionHand(this.brain, createRng((options.seed ^ 0x85ebca6b) >>> 0)); // literal-ok: a hash salt for the auction hand's rng stream
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
    // With no listener the draft would reach nothing: no act reads it (T-AC-4).
    if (this.options.onPlaybook && this.playPath(state.month, 'planning').by === 'own') this.writeDraft(state, 'planning');
  }

  private playPath(month: number, key: PartKey): PlayPath {
    return pathFor({ on: AI_PLANS.on, playbook: this.options.playbook, hasDecider: !!this.options.decider, adopted: this.adopted, month, key });
  }

  /** A draft point: drafts, validates and writes. A draft or validator error is logged and the phase plays today's path (HC-9). */
  private writeDraft(state: GameState, phase: DraftPhase): void {
    let playbook: Playbook;
    try {
      playbook = this.draft(state, phase);
    } catch (err) {
      console.error(`AI seat ${this.id}: no ${phase} playbook for month ${state.month}, playing without one: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    this.options.onPlaybook?.(playbook);
  }

  /** The seat's validated draft for a phase. `month` is the month whose land grant it plans. Writes nothing; throws on a draft or validator error. */
  draft(state: GameState, phase: DraftPhase, month = state.month): Playbook {
    // Read, never settled: settling would log the land decision before the grant.
    const land = this.landMonth === month ? this.land : null;
    const drafted = draftPlaybook({ state, seat: this.id, mind: this.mind, seed: this.options.seed, phase, land, month });
    return validatePlaybook(this.profileFor(month))(state, this.id, drafted, []).playbook;
  }

  /**
   * RULE-6: what this month's hand plays for `key`; null plays today's path, as does a draft or validator error (HC-9,
   * logged). The seat's own part is drafted from `state`, as `draft` does: it writes nothing and changes no kept state.
   */
  part<K extends PartKey>(state: GameState, key: K): PlayedPart<K> | null {
    const path = this.playPath(state.month, key);
    if (path.by === 'today') return null;
    let playbook = path.by === 'adopted' ? path.playbook : null;
    try {
      playbook ??= this.draft(state, DRAFT_PHASE_OF[key]);
    } catch (err) {
      console.error(`AI seat ${this.id}: no ${key} part for month ${state.month}, playing without one: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
    const part = playbook[key];
    // A copy: a hand that changes what it plays changes nothing the seat keeps.
    return part === undefined ? null : structuredClone({ part: part as NonNullable<Playbook[K]>, strategy: playbook.strategy, by: path.by });
  }

  /** Puts a playbook's parts in effect for its month (RULE-7). */
  adopt(playbook: Playbook): void {
    this.adopted = adoptInto(this.adopted, playbook);
  }

  /** The gate this seat's playbooks pass: its mind, its seed and, for the month it holds one, its pending land pick. */
  validator(): ValidatePlan {
    return (state, seat, draft, edits) => validatorFor(this.profileFor(draft.month))(state, seat, draft, edits);
  }

  private profileFor(month: number): ValidatorProfile {
    return { mind: this.mind, seed: this.options.seed, land: this.landMonth === month ? this.land : null };
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
    if (me.claimsThisGrant >= GAME.claimsPerGrant || me.doneWithLand) return null;
    const plan = this.landPlan(state);
    const index = grant.order[grant.step];
    if (index === undefined) return null;
    const obs = observe(state, this.id);
    if (!wantsPlot(plan, obs, index, grant.order.slice(grant.step), this.mind)) return null;
    if (this.rng.next() < this.mind.level.missChance) return null;
    return this.rng.int(...this.mind.level.reactMs) + this.rng.int(...AI_HANDS.grant.choiceMs);
  }

  /**
   * Done with land: true when the seat has claims left and wants no plot still ahead of the light, by the same rule
   * as onLit. A seat whose claims are used, or that is done already, has nothing to press.
   */
  passesGrant(state: GameState): boolean {
    const grant = state.grant;
    if (state.phase !== 'landGrant' || !grant) return false;
    const me = state.players.find((p) => p.id === this.id)!;
    if (me.claimsThisGrant >= GAME.claimsPerGrant || me.doneWithLand) return false;
    return !wantsAnyAhead(this.landPlan(state), observe(state, this.id), grant.order.slice(grant.step), this.mind);
  }

  /** This month's land plan, as its hands read it: planned once a month, settled now. */
  private landPlan(state: GameState): LandPlan {
    if (!this.land || this.landMonth !== state.month) this.planMonth(state);
    return this.brain.resolveNow(this.land!, state).action;
  }

  /**
   * One development tick: `dt` in game ms, `secondsLeft` the game seconds left on the one development clock. Where
   * the game walks, `walk` says where the colonist stands (or is walking to) and whether it is still walking or
   * assaying; the referee refuses taps meanwhile, so the hands wait. Without it the seat develops as where nobody walks.
   */
  developTick(state: GameState, dt: number, secondsLeft: number, act: Act, walk?: DevWalking): void {
    this.develop.tick(state, dt, secondsLeft, act, walk);
  }

  /**
   * One tick of development on the arcade floor (DEV_STEER.on): this seat's input for the floor's next stepFloor, the
   * stick and the button, as a phone's would be; `secondsLeft` the game seconds left on the one clock. `held`: month
   * 1's clock waits and this seat is in, so the referee refuses its next MULE, analysis or filter until it starts. The
   * server's tick and the sim call it the same way, every DEV_STEER.tickMs, with the same floor (HC-4).
   */
  developSteer(state: GameState, floor: DevFloor, secondsLeft: number, cfg: FloorConfig = floorConfig(), held = false): FloorInput {
    return this.develop.steer(state, floor, secondsLeft, cfg, held);
  }

  auctionTick(state: GameState, dt: number, act: Act): void {
    this.auction.tick(state, dt, act);
  }

  /** On the floor: the glint this seat races now, by the tick it lit, or null (the sim's report). */
  developRacing(): number | null {
    return this.develop.racing();
  }

  /** On the floor: whether this seat is off its errand's walk for a moment (a glint race, a leg by wolf land). */
  developDetouring(): boolean {
    return this.develop.detouring();
  }

  /** On the floor: the scrambles this seat raced this month (the sim's report). */
  developScramblesRaced(): number {
    return this.develop.scramblesRaced();
  }

  /** The development steps taken this month, in order. */
  developLog(): readonly { label: string; ok: boolean; at: number; action: AiAction; why?: string }[] {
    return this.develop.done;
  }

  debug(): AiSeatDebug {
    const plan = this.land?.settled?.action ?? null;
    return {
      persona: this.mind.personaId as AiPersonaId,
      level: this.mind.levelId as AiLevelId,
      // literal-ok: the dev view's top five plots, utility to three decimals: display only
      landPlan: plan ? { focus: plan.focus, top: plan.ranking.slice(0, 5).map((s) => ({ label: s.label, utility: Math.round(s.utility * 1000) / 1000, value: s.value })) } : null,
      developPlan: this.develop.plan(),
      auction: this.auction.debug(),
      recent: this.brain.log.slice(-5), // literal-ok: the dev view's last five decisions, display only
    };
  }
}
