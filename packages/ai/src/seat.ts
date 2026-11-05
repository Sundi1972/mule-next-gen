import {
  AI_HANDS,
  AI_LEVELS,
  AI_PERSONAS,
  AI_PLANS,
  createRng,
  floorConfig,
  GAME,
  observe,
  stableJson,
  type AiLevelId,
  type AiPersonaId,
  type DevFloor,
  type FloorConfig,
  type FloorInput,
  type GameState,
  type Good,
  type GoodPlay,
  type Listing,
  type PhaseOutcome,
  type PlanningPlay,
  type Playbook,
} from '@mule/engine';
import type { Act, AiAction } from './actions.js';
import { Brain, type DecisionRecord, type Pending } from './brain.js';
import { templateLine, type Decider, type TableTalk } from './decider.js';
import { AuctionHand, type AuctionDebug } from './hands/auction.js';
import { DevelopHand, type DevLogEntry, type DevWalking } from './hands/develop.js';
import { PERSONAS } from './personas.js';
import {
  adoptInto,
  auctionOutcome,
  developmentOutcome,
  DRAFT_PHASE_OF,
  draftGoodPlaybook,
  draftPlanningPart,
  draftPlaybook,
  draftRoll,
  pathFor,
  validatePlaybook,
  validatorFor,
  type DraftInput,
  type DraftPhase,
  type OwnDeclare,
  type PartKey,
  type PhaseFact,
  type PlayedPart,
  type PlayPath,
  type ValidatePlan,
  type ValidatorProfile,
} from './playbook/index.js';
import { GOOD_NAME, landDecision, outfitName, plotName, wantsAnyAhead, wantsPlot, type LandPlan } from './strategist.js';
import { situation } from './summary.js';
import type { Mind } from './value.js';

/** One act of the seat's planning part, and whether the rules took it. */
export interface PlanningStep {
  action: AiAction;
  ok: boolean;
}

type ListEntry = NonNullable<PlanningPlay['list']>[number];

/** This month's auction as the seat plays it, good by good (AM-20). */
interface AuctionRun {
  month: number;
  /** The playbook it plays under: its month's own draft, or the adopted one; null until the first good is played. */
  head: Playbook | null;
  /** Each good's play as it was played, in order. */
  played: Partial<Record<Good, GoodPlay>>;
  /** A draft or validator error: the rest of this month's auction plays today's path (HC-9). */
  failed: boolean;
  /** Its own declares, in order: the outcome's side for each good (AM-23). */
  declared: OwnDeclare[];
}

/** The `id` of a DecisionRecord the seat builds itself, for a drafted part: no Brain decision, so no Brain id (AM-22). */
export const DRAFTED_RECORD_ID = 0;

/** The parts AI_PLANS.ownPhases holds back on the own path (AM-26). */
const OWN_PHASE_KEYS: ReadonlySet<PartKey> = new Set(['development', 'auction']);

const xyOf = (state: GameState, plot: number) => ({ x: state.tiles[plot]!.x, y: state.tiles[plot]!.y });
const sameSquare = (state: GameState, l: Listing, plot: number) => l.item.x === state.tiles[plot]?.x && l.item.y === state.tiles[plot]?.y;

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
  /** AM-26: whether the own path plays its own development and auction parts. Unset, AI_PLANS.ownPhases decides. */
  ownPhases?: boolean;
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
 *
 * It drafts lazily at its own ticks (RULE-7): the month's first developTick or developSteer drafts the development
 * part and hands its route to the development hand; each good's first auctionTick, at the good's status screen, plays
 * that good's part (AM-20). So the server and the sim draft at the same step, with no hook of their own. Its own
 * development and auction drafts wait behind AI_PLANS.ownPhases (AM-26); adopted parts play either way.
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
  /** The month whose planning this seat may act in, and how; an adopt in it plays the listings again. */
  private planning: { month: number; state: GameState; act: Act; refused: Set<string> } | null = null;
  private planned: PlanningStep[] = [];
  /** The month whose development draft point has passed, and the playbook whose route it plays; null on today's path. */
  private devMonth = -1;
  private devPlayed: Playbook | null = null;
  private auctionRun: AuctionRun | null = null;

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
    this.auction = new AuctionHand(this.brain, createRng((options.seed ^ 0x85ebca6b) >>> 0), (state, good) => this.goodPlay(state, good)); // literal-ok: a hash salt for the auction hand's rng stream
  }

  get id(): string {
    return this.options.id;
  }

  hear(line: TableTalk): void {
    this.brain.hear(line);
  }

  /**
   * Planning: the land plan for this month's grant, with its full ranking of free plots. With `act`, the seat also plays
   * its planning part: the drone, then its listings; an adopt later in this planning plays the listings again.
   */
  planMonth(state: GameState, act?: Act): void {
    if (this.landMonth === state.month) return;
    const obs = observe(state, this.id);
    this.landMonth = state.month;
    this.land = this.brain.ask('land', landDecision(obs, this.mind), obs, Infinity, null, situation(obs, this.mind));
    // Written only for a listener; the part plays whenever the seat may act, recorded or not.
    if (this.options.onPlaybook && this.playPath(state.month, 'planning').by === 'own') this.writeDraft(state, 'planning');
    if (!act) return;
    this.planning = { month: state.month, state, act, refused: new Set() };
    this.planned = [];
    // On its own path the part is its draft's: with nothing to list and nothing of its own listed yet it would play
    // nothing, so the seat skips the whole draft and its validation.
    const mine = state.listings.some((l) => l.seller === this.id);
    if (!mine && this.playPath(state.month, 'planning').by === 'own' && !draftPlanningPart(this.draftInput(state, 'planning')).list) return;
    const played = this.part(state, 'planning');
    if (!played) return;
    const drone = played.part.drone ?? [];
    const me = state.players.find((p) => p.id === this.id)!;
    if (drone.length > 0 && me.droneOrder.length === 0) this.planAct({ type: 'drone', plots: drone.map((plot) => xyOf(state, plot)) });
    this.playListings(state, played.part);
  }

  /** The planning acts this month, in order, each with whether the rules took it. */
  planningLog(): readonly PlanningStep[] {
    return this.planned;
  }

  /** Makes the seat's listings the part's list: unlists every other one, then lists each entry not yet up. */
  private playListings(state: GameState, part: PlanningPlay): void {
    const wanted = part.list ?? [];
    const mine = state.listings.filter((l) => l.seller === this.id);
    const same = (l: Listing, e: ListEntry) => l.item.kind === e.item && sameSquare(state, l, e.plot) && l.minimum === e.minimum && l.unsold === e.unsold;
    for (const l of mine) if (!wanted.some((e) => same(l, e))) this.planAct({ type: 'unlist', id: l.id });
    for (const e of wanted) {
      if (!mine.some((l) => same(l, e))) this.planAct({ type: 'list', item: { kind: e.item, ...xyOf(state, e.plot) }, minimum: e.minimum, unsold: e.unsold });
    }
  }

  /** One planning act, logged. One the rules refused this month is never tried again. */
  private planAct(action: AiAction): void {
    const p = this.planning!;
    const key = stableJson(action);
    if (p.refused.has(key)) return;
    const ok = p.act(action);
    this.planned.push({ action, ok });
    if (!ok) p.refused.add(key);
  }

  /**
   * RULE-6's path for `key`. The own path's development and auction parts play only while the seat's ownPhases is on,
   * AI_PLANS.ownPhases unless its options say (AM-26): off, the own path plays today's for them, while an adopted part
   * still plays. Read per call, so `--set` and a test that sets it switch it.
   */
  private playPath(month: number, key: PartKey): PlayPath {
    const path = pathFor({ on: AI_PLANS.on, playbook: this.options.playbook, hasDecider: !!this.options.decider, adopted: this.adopted, month, key });
    return path.by === 'own' && OWN_PHASE_KEYS.has(key) && !(this.options.ownPhases ?? AI_PLANS.ownPhases) ? { by: 'today' } : path;
  }

  /** A draft point: drafts, validates and writes. A draft or validator error is logged and the phase plays today's path (HC-9). */
  private writeDraft(state: GameState, phase: DraftPhase): void {
    this.ownDraft(state, phase, () => this.draft(state, phase));
  }

  /** The seat's validated draft for a phase. `month` is the month whose land grant it plans. Writes nothing; throws on a draft or validator error. */
  draft(state: GameState, phase: DraftPhase, month = state.month): Playbook {
    const drafted = draftPlaybook(this.draftInput(state, phase, month));
    return validatePlaybook(this.profileFor(month))(state, this.id, drafted, []).playbook;
  }

  /** What the seat's drafts are drafted from. */
  private draftInput(state: GameState, phase: DraftPhase, month = state.month): DraftInput {
    // Read, never settled: settling would log the land decision before the grant.
    const land = this.landMonth === month ? this.land : null;
    return { state, seat: this.id, mind: this.mind, seed: this.options.seed, phase, land, month };
  }

  /**
   * RULE-6: what this month's hand plays for `key`; null plays today's path, as does a draft or validator error (HC-9,
   * logged). The seat's own part is drafted from `state`, as `draft` does: it writes nothing and changes no kept state.
   * That draft costs milliseconds, so a hand reads its part once per phase and keeps it for the phase, never per tick.
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
    // A copy: a hand that changes what it plays changes nothing the seat keeps. The cast is safe: `== null` rules out
    // null and undefined, but TS can't narrow Playbook[K] for a generic K.
    return part == null ? null : structuredClone({ part: part as NonNullable<Playbook[K]>, strategy: playbook.strategy, by: path.by });
  }

  /**
   * Puts a playbook's parts in effect for its month (RULE-7). Adopting a later month drops every playbook adopted for
   * the current one, so a playbook for month m+1 is adopted only after month m's auction. Adopted during the planning
   * the seat acts in, it plays the listings again, from the planning part now in effect.
   */
  adopt(playbook: Playbook): void {
    this.adopted = adoptInto(this.adopted, playbook);
    const p = this.planning;
    // Listings are made in planning only: once it has ended, the ones made stand.
    if (!p || p.state.phase !== 'planning' || p.state.month !== p.month || playbook.month !== p.month) return;
    const played = this.part(p.state, 'planning');
    if (played) this.playListings(p.state, played.part);
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
    this.developPoint(state);
    this.develop.tick(state, dt, secondsLeft, act, walk);
  }

  /**
   * One tick of development on the arcade floor (DEV_STEER.on): this seat's input for the floor's next stepFloor, the
   * stick and the button, as a phone's would be; `secondsLeft` the game seconds left on the one clock. `held`: month
   * 1's clock waits and this seat is in, so the referee refuses its next MULE, analysis or filter until it starts. The
   * server's tick and the sim call it the same way, every DEV_STEER.tickMs, with the same floor (HC-4).
   */
  developSteer(state: GameState, floor: DevFloor, secondsLeft: number, cfg: FloorConfig = floorConfig(), held = false): FloorInput {
    this.developPoint(state);
    return this.develop.steer(state, floor, secondsLeft, cfg, held);
  }

  /** One goods-auction tick. Its declares are logged for the auction's outcome; the acts are the hand's, unchanged. */
  auctionTick(state: GameState, dt: number, act: Act): void {
    this.auction.tick(state, dt, (action) => {
      const ok = act(action);
      const good = state.auction?.good;
      if (action.type === 'declare' && good) this.auctionFor(state.month).declared.push({ good, side: action.side, ...(!ok && { refused: 'declare refused' }) });
      return ok;
    });
  }

  /**
   * RULE-7's development draft point, at the month's first development tick: on the playbook path, the part RULE-6
   * picks (the adopted one, or its own draft, written and said) is handed to the hand. A draft or validator error is
   * logged and the month plays today's path (HC-9).
   */
  private developPoint(state: GameState): void {
    if (state.phase !== 'development' || this.devMonth === state.month) return;
    this.devMonth = state.month;
    this.devPlayed = null;
    const path = this.playPath(state.month, 'development');
    if (path.by === 'today') return;
    const playbook = path.by === 'adopted' ? path.playbook : this.ownDraft(state, 'development', () => this.draft(state, 'development'));
    const part = playbook?.development;
    if (!playbook || !part) return;
    if (path.by === 'own') this.say(state, 'develop', null, routeLabel(state, part.route), 'development');
    this.devPlayed = playbook;
    this.develop.follow(state.month, { part: structuredClone(part), seed: this.options.seed, moneyMaker: playbook.strategy.moneyMaker });
  }

  /**
   * The auction hand's source, asked once a good at its status screen (AM-20, RULE-10). On the playbook path: the
   * adopted part's play for the good; else its own: at the month's first good the whole auction draft, written; at
   * each later good a fresh one-good draft, written as its own entry. Null plays today's ask. A draft or validator
   * error is logged and the rest of the month's auction plays today's path (HC-9).
   */
  private goodPlay(state: GameState, good: Good): GoodPlay | null {
    const run = this.auctionFor(state.month);
    const path = this.playPath(state.month, 'auction');
    if (run.failed || path.by === 'today') return null;
    let play = path.by === 'adopted' ? path.playbook.auction?.[good] : undefined;
    if (path.by === 'adopted') run.head ??= path.playbook;
    if (!play) {
      const whole = !run.head;
      const playbook = this.ownDraft(state, 'auction', () => (whole ? this.draft(state, 'auction') : this.draftGood(state, good)));
      if (!playbook) {
        run.failed = true;
        return null;
      }
      run.head ??= playbook;
      play = playbook.auction?.[good];
      if (play) this.say(state, 'trade', good, playLabel(state, this.id, good, play), `auction|${good}`);
    }
    if (!play) return null;
    run.played[good] = structuredClone(play);
    return structuredClone(play);
  }

  private auctionFor(month: number): AuctionRun {
    if (this.auctionRun?.month !== month) this.auctionRun = { month, head: null, played: {}, failed: false, declared: [] };
    return this.auctionRun;
  }

  /** AM-20: the seat's validated auction playbook for one good, drafted at that good's status screen. Throws on an error. */
  private draftGood(state: GameState, good: Good): Playbook {
    const { phase: _, ...input } = this.draftInput(state, 'auction');
    return validatePlaybook(this.profileFor(state.month))(state, this.id, draftGoodPlaybook(input, good), []).playbook;
  }

  /** An own draft point's playbook, written; a draft or validator error is logged and gives null (HC-9). */
  private ownDraft(state: GameState, phase: DraftPhase, make: () => Playbook): Playbook | null {
    let playbook: Playbook;
    try {
      playbook = make();
    } catch (err) {
      console.error(`AI seat ${this.id}: no ${phase} playbook for month ${state.month}, playing today's path: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
    this.options.onPlaybook?.(playbook);
    return playbook;
  }

  /**
   * AM-22: the table line for a drafted part, as a DecisionRecord the seat builds itself (no candidates, by 'top'), its
   * line the persona's template with a roll from the draft's seeded stream. The Brain's counter is not advanced, so every
   * Brain decision keeps the seed it has on today's path.
   */
  private say(state: GameState, kind: 'develop' | 'trade', topic: string | null, label: string, key: string): void {
    const persona = PERSONAS[this.options.persona];
    const line = templateLine(persona, kind, label, draftRoll(this.options.seed, state.month, key));
    this.options.onDecision?.({
      id: DRAFTED_RECORD_ID,
      seat: this.id,
      kind,
      month: state.month,
      phase: state.phase,
      topic,
      candidates: [],
      shortlist: [],
      pick: { id: key, key, label },
      by: 'top',
      line,
      waitedMs: 0,
    });
  }

  /**
   * How this month's development or auction went against the part it played (RULE-11), read from `state` as the phase
   * ends; `facts` are the phase's public facts (the server's phaseNotices). Null for a phase it played by today's path.
   */
  outcome(phase: 'development' | 'auction', state: GameState, facts: readonly PhaseFact[] = []): PhaseOutcome | null {
    if (phase === 'development') return this.devMonth === state.month && this.devPlayed ? developmentOutcome(this.devPlayed, this.develop.routeLog(state)) : null;
    const run = this.auctionRun;
    if (!run || run.month !== state.month || !run.head) return null;
    // After an error the goods it went on to play by today's path are not the part's (HC-9).
    const auction = run.failed ? run.played : { ...run.head.auction, ...run.played };
    return auctionOutcome({ ...run.head, auction }, state, facts, this.id, run.declared);
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

  /** The development steps taken this month, in order; on a route, each with its route index and RULE-11 outcome. */
  developLog(): readonly DevLogEntry[] {
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

/** A drafted route's label for its table line: its MULEs, as today's develop picks name them, else keeping the cash. */
function routeLabel(state: GameState, route: NonNullable<Playbook['development']>['route']): string {
  const mules = route.flatMap((s, i) => (s.act === 'install' && route[i - 1]?.outfit ? [`${outfitName(route[i - 1]!.outfit!)} on ${plotName(state.tiles[s.plot!]!)}`] : []));
  return mules.length > 0 ? mules.join(' and ') : 'Keep the cash';
}

/** A good's play, labelled as today's trade picks are. */
function playLabel(state: GameState, seat: string, good: Good, play: GoodPlay): string {
  const held = state.players.find((p) => p.id === seat)!.stock[good];
  const name = GOOD_NAME[good];
  if (play.role === 'seller' && held > play.hold) return `Sell ${held - play.hold} ${name}, keep ${play.hold}`;
  if (play.role === 'buyer' && play.hold > held) return `Buy ${play.hold - held} ${name}`;
  return `Pass on ${name}`;
}
