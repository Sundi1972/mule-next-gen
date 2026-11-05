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
  type DevelopmentPlay,
  type DevFloor,
  type DevPlace,
  type FloorColonist,
  type FloorConfig,
  type FloorInput,
  type FloorPoint,
  type GameState,
  type Good,
  type HallPlace,
  type Outfit,
  type Rng,
  type WolfFightLevel,
  type WolfPlay,
} from '@mule/engine';
import type { Act, AiAction } from '../actions.js';
import type { Brain, Pending } from '../brain.js';
import { draftMulePick, keptOutfitEarns } from '../playbook/draft.js';
import type { DevelopmentLog, DevelopmentStepLog } from '../playbook/outcome.js';
import { floorDevWalk, installable, leading, mapFactor, planSeconds, plotErrandSeconds, pubDoor, pubMargin, pubSeconds, tileMiddle, tripSeconds, type PlanStop } from '../floor-time.js';
import { analysesWanted, bestInstall, developDecision, filtersWanted, outfitName, plotName, walkVeto, type DevAction, type DevWalk } from '../strategist.js';
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
 *
 * The list has two sources: today's decides as it goes; a route handed in with
 * `follow` is released into the same list in the same shape, so both runners
 * play it unchanged. See spec C6, RULE-9.
 */

/** Where the colonist stands (or is walking to), and whether it is still walking or assaying, when the game walks. */
export interface DevWalking {
  at: DevPlace;
  busy: boolean;
}

/** The middle of a ms range, in seconds. */
const midSeconds = ([lo, hi]: [number, number]) => (lo + hi) / 2 / 1_000; // literal-ok: midpoint of a range, ms to s

const STOP: DevAction = { kind: 'stop' };

/** The presses a MULE takes at the counters and its plot: buy, outfit, install. */
const MULE_PRESSES = 3; // literal-ok: a count of the rule's steps, not balance

/** How an AI level plays a pack of wolves (RULE-4's levels): a Rookie a rookie, a Trader a regular, a Tycoon a veteran. */
const WOLF_LEVEL: Record<AiLevelId, WolfFightLevel> = { rookie: 'rookie', trader: 'regular', tycoon: 'veteran' };


export interface DevStep {
  action: AiAction;
  /** Ms the step takes before its tap. */
  ms: number;
  label: string;
  /** Steps that depend on this one; they are dropped if it fails. */
  group: number;
  /** Its index in the route it came from; unset for today's steps and for those the hand adds. */
  route?: number;
  /** The note logged when the step is done ('pub added'). See RULE-9. */
  note?: string;
}

/** A development route for the hand to play, and what its own picks are drafted from. See spec C6, RULE-9 row 3. */
export interface RoutePlay {
  part: DevelopmentPlay;
  /** The seat's draft seed, which seeds the own pick. */
  seed: number;
  /** The strategy's money-maker, the own pick's lean. */
  moneyMaker: Good | null;
  /** The seat's own draft; false for an adopted part, which plays as adopted: no re-pick, no MULE added. See AM-27. */
  own: boolean;
}

/** What became of a route step; one absent from the log was not reached. See RULE-11. */
type StepOutcome = DevelopmentStepLog['outcome'];

/** A step taken this month. On a route, also its index and outcome; `why` then holds the route's note. */
export interface DevLogEntry {
  label: string;
  ok: boolean;
  at: number;
  action: AiAction;
  why?: string;
  route?: number;
  outcome?: StepOutcome;
}

/** A route being played: the next step to release, the MULEs released (the own pick's k), and the clock it is played on. */
interface RouteRun {
  play: RoutePlay;
  at: number;
  mules: number;
  /** ifSoldOut 'pub' has fired: only the route's filters and pub are still released. */
  soldOut: boolean;
  /** The own pick for a MULE after the route's last said 'stop': none is added any more. */
  noMore: boolean;
  startLeft: number | null;
  left: number;
  usedMs: number;
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
  readonly done: DevLogEntry[] = [];
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
  /** Packs met this month, and how many had been met when it set off for the step it walks: a walk a pack met on the way. */
  private packsMet = 0;
  private walkPacks = 0;
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
  /** On the floor, where the tick's input must be pure (HC-4): decisions take the default pick, never the decider. */
  private onFloor = false;
  /** On the floor, the floor's config, for the plots a led MULE can be installed on. */
  private floorCfg: FloorConfig | null = null;
  /** This month's route, if the seat handed one in; null plays today's list. */
  private route: RouteRun | null = null;
  /** The route step last let through, so it is judged once, before its tap or walk starts. */
  private vetted: DevStep | null = null;
  /** The MULE group whose buy was the MULE the seat already led ('led'). */
  private ledGroup: number | null = null;

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

  /**
   * Plays `play`'s route this month instead of deciding as it goes. Call it before the month's first tick: once the
   * month is under way it keeps today's list.
   */
  follow(month: number, play: RoutePlay): void {
    if (month !== this.month) this.reset(month);
    if (this.stage !== 'start') return;
    this.route = { play, at: 0, mules: 0, soldOut: false, noMore: false, startLeft: null, left: 0, usedMs: 0 };
  }

  /**
   * This month's route as played, read against `state`; empty steps on today's list. On the floor the referee stops
   * steering a seat once it is in the pub, so the pub it was walking is read as done from the state: its walker never
   * gets the tick that would read the press.
   */
  routeLog(state: GameState): DevelopmentLog {
    const entries = this.done.filter((e) => e.outcome !== undefined);
    const pub = this.walking;
    const inPub = state.players.find((p) => p.id === this.brain.mind.me)!.doneDeveloping;
    if (this.route && pub?.action.type === 'pub' && inPub) entries.push(this.entry(pub, true, 'done', pub.note));
    const steps = entries.map((e): DevelopmentStepLog => ({ ...(e.route !== undefined && { route: e.route }), outcome: e.outcome!, ...(e.why !== undefined && { note: e.why }) }));
    return { steps, usedMs: this.route?.usedMs ?? 0 };
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
    this.taken(state, step, act(step.action));
  }

  /**
   * One tick on the dev floor: the stick and the button for this seat's colonist, walking the to-do list `tick` taps.
   */
  steer(state: GameState, floor: DevFloor, secondsLeft: number, cfg: FloorConfig): FloorInput {
    const mind = this.brain.mind;
    if (state.phase !== 'development') return IDLE_INPUT;
    if (state.month !== this.month) this.reset(state.month);
    this.onFloor = true;
    this.floorCfg = cfg;
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
    const moment = this.moment(view, colonist);
    if (moment) {
      this.detoured = true;
      return moment;
    }
    // Back from a detour: the step being walked starts its walk again from where the colonist now stands. A press made
    // the tick before the detour is kept, so the walker reads whether it took: started again, the step would find its
    // counter offering nothing (the MULE outfitted already) and drop the MULE (FM-floor-outfit-offer).
    if (this.detoured) {
      this.detoured = false;
      if (!this.walker.pressing()) this.walker.reset();
    }
    // The clock is nearly out: whatever is left of the errand, the pub. Held, the clock stands, so there is time.
    // An assay under way holds the colonist still for the rest of it: that time is spent before any walk.
    const holding = colonist.assayUntilTick === null ? 0 : (Math.max(0, colonist.assayUntilTick - floor.tick) * dt) / MS_PER_SECOND;
    // A MULE under way whose rest of errand, to its plot and on to the pub, still fits with the margin in hand is seen
    // through: dropping it for the pub would lose what it cost (FM-hurry-margin).
    if (!this.toPub && secondsLeft <= holding + pubSeconds(state, cfg, colonist) + this.margin(cfg, colonist) && !this.muleFits(view, colonist, secondsLeft - holding)) this.hurry(colonist);
    // Hurrying for the pub, it presses the moment it is there: a pause at the counter could cost it the pub.
    const pauseMs = this.toPub ? 0 : cfg.steer.botCounterPauseSeconds * MS_PER_SECOND * mind.level.devPace;
    // A step done this tick hands over to the next at once, so no tick is spent standing between them.
    for (let ticks = dt; ; ticks = 0) {
      // A MULE is priced with the margin the hurry for the pub keeps while it leads one, and its errand as if it ran
      // botPlanSlackShare longer than estimated (FM-hurry-margin).
      const planLeft = (secondsLeft - holding - pubMargin(cfg, colonist, true)) / (1 + cfg.steer.botPlanSlackShare);
      const step = this.next(state, ticks, secondsLeft, () => floorDevWalk(state, cfg, colonist, planLeft, (MULE_PRESSES * pauseMs) / MS_PER_SECOND));
      if (!step) return IDLE_INPUT;
      // An analysis or a filter it sets off for, and presses, only while the walk there, the work and the walk on to the
      // pub still fit the clock (RULE-8's spare time): a walk there that ran long drops it before it costs the pub. A
      // MULE it buys only while its errand still fits with the hurry's margin (FM-hurry-margin).
      const starting = this.walking !== step;
      const committed = !starting && (this.walker.pressing() || colonist.assayUntilTick !== null);
      if (!committed && !this.fits(view, colonist, step, secondsLeft - holding)) {
        if (!starting) this.walking = null;
        this.taken(state, step, false, 'no time');
        continue;
      }
      if (starting) {
        this.walking = step;
        this.walkPacks = this.packsMet;
        this.walker.reset();
      }
      const via = !this.toPub ? this.byWolfLand(view, colonist, step) : null;
      if (via) return via;
      const run = this.walker.run(view, step.action, pauseMs);
      if (run.kind === 'going') return run.input;
      this.walking = null;
      this.taken(state, step, run.kind === 'ok', run.kind === 'failed' ? run.why : undefined);
    }
  }

  /**
   * The development moments, before the to-do list (arcade C9): a pack it meets it fights or runs from (RULE-4); stunned
   * it stands; a glint or the scramble it races only with time to spare (RULE-8); a bolted MULE it goes to catch. The
   * input for the tick, or null to walk the list.
   */
  private moment(view: FloorView, c: FloorColonist): FloorInput | null {
    const { state, floor, cfg, secondsLeft } = view;
    const me = this.brain.mind.me;
    if (c.encounter) {
      if (!this.pack) this.packsMet++;
      this.pack ??= this.playFor(view, c);
      return wolfInput(floor, state, me, cfg, this.pack);
    }
    this.pack = null;
    if (c.stunnedUntilTick !== undefined && floor.tick < c.stunnedUntilTick) return IDLE_INPUT;
    // A press that comes first wherever it stands: pelts at a store door (the door's LEAVE waits behind SELL), and a
    // glint within reach, raced or not (ENTER, ANALYSE, INSTALL wait behind GRAB THE GLINT).
    const first = reachOf(floor, state, me, cfg, { secondsLeft }).kind;
    if ((c.pelts > 0 && first === 'sell') || first === 'grab') return { x: 0, y: 0, act: true };
    if (c.assayUntilTick !== null && floor.tick < c.assayUntilTick) return null;
    const g = floor.moments.glint;
    // Whether it would race is drawn once a glint (GLINT.botShare); whether it can, every tick the glint is lit and it
    // is not racing yet: near enough to care, and with the time to spare (RULE-8).
    if (g && this.glintSeen !== g.sinceTick) {
      this.glintSeen = g.sinceTick;
      this.glintWanted = this.rng.next() < cfg.glint.botShare;
    }
    if (g && this.glintWanted && this.racingGlint !== g.sinceTick) {
      const to = glintMiddle(g);
      const from = this.raceFrom(view, c);
      if (Math.hypot(to.x - from.x, to.y - from.y) <= cfg.glint.botCareTiles && this.fitsDetour(view, c, to)) {
        this.racingGlint = g.sinceTick;
        this.chaser.reset();
      }
    }
    // With the spare-time rule, a race that no longer leaves the errand's time (a pack on the way, a bite) is given up:
    // the pub's, and every step left on the list after the glint (RULE-8).
    const racing = g !== null && this.racingGlint === g.sinceTick;
    const spare = !cfg.steer.botsSpareTime || (racing && secondsLeft > pubSeconds(state, cfg, c) + this.margin(cfg, c) && this.fitsDetour(view, c, glintMiddle(g)));
    if (g && racing && spare) {
      const input = this.chaser.seek(view, glintMiddle(g), 'grab');
      if (input) return input;
    }
    // No way there after all, or no more time: it gives the race up.
    if (g && this.racingGlint === g.sinceTick) this.glintWanted = false;
    this.racingGlint = null;
    this.raceScramble(view, c);
    const p = state.players.find((x) => x.id === me)!;
    if (p.muleBolted && c.lead && !this.toPub && secondsLeft > pubSeconds(state, cfg, c) + this.margin(cfg, c)) return this.chaser.seek(view, c.lead, 'catch');
    return null;
  }

  /** The seconds it keeps in hand for the pub: botPubMarginSeconds at full pace, more as a bite or a MULE slows it. */
  private margin(cfg: FloorConfig, c: FloorColonist): number {
    return pubMargin(cfg, c);
  }

  /** The margin for the rest of the list: as the hurry counts it while the colonist leads a MULE, if one is on the list or the lead. */
  private restMargin(cfg: FloorConfig, c: FloorColonist): number {
    const mule = leading(c) || this.queue.some((s) => s.action.type === 'outfit' || s.action.type === 'install');
    return pubMargin(cfg, c, mule);
  }

  /** Whether the list is a MULE under way whose rest (every step left, then the pub) fits `left` with the hurry's margin in hand. */
  private muleFits(view: FloorView, c: FloorColonist, left: number): boolean {
    const head = this.queue[0]?.action.type;
    if (head !== 'buyMule' && head !== 'outfit' && head !== 'install') return false;
    return this.restFrom(view, c) + this.restMargin(view.cfg, c) <= left;
  }

  /**
   * RULE-4's AI line (AM-22): each new leg on the map goes by wolf land by WOLVES.botWolfLandShare, by the wolf-land tile
   * that adds least to the straight walk, if that detour still fits its errand and the clock (RULE-8). The input that
   * walks there, or null to walk the leg as it is. Never a leg walked leading a MULE: a pack met then is what loses the
   * install (the MULE bolts, or the fight and the bite cost the walk to the plot), so the AI spends its share of wolf-land
   * legs where a pack costs it least. With the wolves off, none: a leg by wolf land would be a detour for nothing.
   */
  private byWolfLand(view: FloorView, c: FloorColonist, step: DevStep): FloorInput | null {
    const { cfg } = view;
    if (this.leg?.step !== step || this.leg.space !== c.space) {
      this.leg = { step, space: c.space };
      this.via = cfg.wolves.on && c.space === 'map' && !leading(c) && this.rng.next() < cfg.wolves.botWolfLandShare ? this.wolfVia(view, c, step) : null;
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
    // The pub beats the pack: it never starts a fight it cannot finish and still make the pub, bitten on the way.
    const bitten: FloorColonist = { ...c, bitten: true };
    const fightTime = cfg.wolves.botChooseSeconds + cfg.wolves.fightSeconds + pubSeconds(state, cfg, bitten) + this.margin(cfg, bitten);
    const fights = this.rng.next() < cfg.wolves.botFightShare && fightTime <= secondsLeft;
    // Running, it heads for the store's door quickest to the pub: inside, the wolves give up, and the pub is there.
    const refuge = pubDoor(state, cfg, c);
    // Short of time, it heads for the pub at once and through the pack if that is the way: a bite on the way costs less
    // than the run off and back.
    const through = secondsLeft <= pubSeconds(state, cfg, bitten) + this.margin(cfg, bitten) + cfg.wolves.giveUpSeconds * 2; // literal-ok: a run off and back again
    return { level, fights, refuge, through };
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
  private raceScramble(view: FloorView, c: FloorColonist): void {
    const s = view.floor.moments.scramble;
    const me = this.brain.mind.me;
    if (!s || s.over || this.scrambleSeen === s.sinceTick || !s.needers.includes(me)) return;
    this.scrambleSeen = s.sinceTick;
    const store = this.raceFrom(view, { ...c, space: 'hall' });
    const care = Math.hypot(store.x - this.raceFrom(view, c).x, store.y - this.raceFrom(view, c).y) <= view.cfg.scramble.botCareTiles;
    if (!(this.rng.next() < view.cfg.scramble.botShare && care && this.fitsDetour(view, c, store))) return;
    // Ahead of its next MULE: the steps before the MULE on the list; with none on it yet and one still to be decided, the
    // whole list; finished (no MULE to come), none. The rest it keeps.
    const buy = this.queue.findIndex((step) => step.action.type === 'buyMule');
    const ahead = buy >= 0 ? buy : this.muleToCome() ? this.queue.length : 0;
    const scouting = (step: DevStep) => step.action.type === 'analyse' || step.action.type === 'filter';
    const dropped = new Set(this.queue.slice(0, ahead).filter(scouting));
    if (this.walking && dropped.has(this.walking)) {
      const step = this.walking;
      this.walking = null;
      this.taken(view.state, step, false, 'scramble');
    }
    // A route logs every step the race drops, not only the one it was walking. See RULE-11.
    if (this.route) for (const step of this.queue) if (dropped.has(step)) this.log(step, false, 'skipped', 'scramble');
    this.queue = this.queue.filter((step) => !dropped.has(step));
    this.scrambleRaced++;
  }

  /**
   * RULE-8: whether a detour to `to` still leaves the errand time to finish inside the turn: the walk there, then from
   * there every step left on the list and the pub, at the floor's speeds and with the presses' pauses (planSeconds, the
   * estimates the plan is priced by), with the hurry's margin in hand (restMargin). Always true with DEV_STEER.botsSpareTime off.
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
    return there + this.restFrom(view, from) + this.restMargin(cfg, from) <= secondsLeft;
  }

  /** Seconds of errand left from a colonist standing at a point: every step on the list, in order, then the pub. */
  private restFrom(view: FloorView, at: FloorColonist): number {
    const { state, cfg } = view;
    const pause = cfg.steer.botCounterPauseSeconds * this.brain.mind.level.devPace;
    const plot = (x: number, y: number) => tileIndex(state.width, x, y);
    const stops: PlanStop[] = [];
    for (const { action: a } of this.queue) {
      if (a.type === 'analyse') stops.push({ plot: plot(a.x, a.y), work: this.assaySeconds(state, cfg, a.x, a.y) + pause });
      else if (a.type === 'filter') stops.push({ plot: plot(a.x, a.y), work: pause });
      else if (a.type === 'buyMule') stops.push({ place: 'corral', work: pause, lead: false });
      else if (a.type === 'outfit') stops.push({ place: a.outfit as HallPlace, work: pause, lead: true });
      else if (a.type === 'install') stops.push({ plot: plot(a.x, a.y), work: pause, lead: true });
      else if (a.type === 'pub') stops.push({ place: 'pub', work: 0 });
    }
    const last = stops.at(-1);
    if (!last || !('place' in last) || last.place !== 'pub') stops.push({ place: 'pub', work: 0 });
    return planSeconds(state, cfg, at, stops);
  }

  /** Seconds an analysis of plot (x, y) holds the colonist: a lake plot's shore land is analysed first if it has not been (AM-18), two analyses. */
  private assaySeconds(state: GameState, cfg: FloorConfig, x: number, y: number): number {
    const lake = state.tiles[tileIndex(state.width, x, y)]!.terrain === 'lake' && cfg.steer.lakeMode === 'shore';
    return analysisSeconds(state, this.brain.mind.me) * (lake ? 2 : 1); // literal-ok: the shore's land and the lake, two analyses
  }

  /**
   * Whether an analysis or a filter, from where the colonist stands, still leaves time for the pub with the hurry's margin
   * in hand (restMargin: a hungry colonist's is several times botPubMarginSeconds); and a MULE about to be
   * bought, its errand to its plot and on to the pub priced as when it was planned (botPlanSlackShare longer, the hurry's
   * margin in hand): a walk to the corral that ran long drops the MULE before it is paid for (FM-hurry-margin).
   */
  private fits(view: FloorView, c: FloorColonist, step: DevStep, secondsLeft: number): boolean {
    const { state, cfg } = view;
    const a = step.action;
    if (a.type === 'buyMule') return this.restFrom(view, c) * (1 + cfg.steer.botPlanSlackShare) + this.restMargin(cfg, c) <= secondsLeft;
    if (a.type !== 'analyse' && a.type !== 'filter') return true;
    const work = a.type === 'analyse' ? this.assaySeconds(state, cfg, a.x, a.y) : 0;
    return plotErrandSeconds(state, cfg, c, tileIndex(state.width, a.x, a.y), work) + this.restMargin(cfg, c) <= secondsLeft;
  }

  /**
   * Out of time: drop the rest of the list and go to the pub. A step it was walking to and had not pressed yet it gives
   * up, logged so a walk the clock cut short shows: 'hurry', or 'hurry after a pack' where a pack met it on the way
   * (FM-hurry-margin).
   */
  private hurry(c: FloorColonist): void {
    const cut = this.walking;
    if (cut && !this.walker.pressing() && c.assayUntilTick === null) {
      const why = this.packsMet > this.walkPacks ? 'hurry after a pack' : 'hurry';
      if (this.route) this.log(cut, false, 'not reached', why);
      else this.done.push({ label: cut.label, ok: false, at: this.clock, action: cut.action, why });
    }
    this.toPub = true;
    this.pending = null;
    this.queue = [];
    this.walking = null;
    // On a route, the pub it hurries to is the route's own, if it has one; nothing after the pub is released.
    if (this.route) this.route.at = this.route.play.part.route.length;
    this.push({ type: 'pub' }, AI_HANDS.develop.pubMs, 'Go to the pub', ++this.group, this.route ? this.routePub() : {});
    this.stage = 'steps';
    this.then = 'done';
  }

  /**
   * The to-do list's source: runs its stages until a step is due and returns it, the head of the queue, or null while
   * it decides or has nothing to do. `walk` prices the walks, where the game walks or steers.
   */
  private next(state: GameState, dt: number, secondsLeft: number, walk?: () => DevWalk): DevStep | null {
    if (this.route) return this.routeNext(state, secondsLeft, walk);
    const mind = this.brain.mind;
    if (this.stage === 'start') {
      const obs = observe(state, mind.me);
      // A MULE led into development (one won at the land auction) is installed first: on the floor, while it is led a
      // plot's button offers INSTALL, not ANALYSE or FIT FILTER, and the corral no BUY (FM-led-analyse); off it, the
      // corral refuses a seat that leads one. Paid for already, it goes on the idle plot where it gains most, even at no
      // gain (a factory it can't feed included): on the floor a MULE taken off a plot can be re-outfitted next month
      // (Reach row 8a), and one led into the pub is lost (FM-led-no-gain). On the floor only a plot with somewhere to stand
      // for the install counts (a lake plot may have none). The analyses follow while the clock fits.
      const led = state.players.find((p) => p.id === mind.me)!.carriedMule;
      const cfg = this.onFloor ? this.floorCfg : null;
      const can = cfg ? (index: number) => installable(state, cfg, mind.me, index) : undefined;
      const target = led && led !== 'empty' ? bestInstall(obs, mind, led, can) : null;
      const install = target ? state.tiles[target.index]! : null;
      const tapMs = this.onFloor || this.at !== undefined ? AI_HANDS.develop.installTapMs : AI_HANDS.develop.installMs;
      if (install) this.push({ type: 'install', x: install.x, y: install.y }, tapMs, `Install the MULE it leads on ${plotName(install)}`, ++this.group);
      for (const index of analysesWanted(obs, mind, secondsLeft)) {
        if (install && index === target!.index) continue;
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
  private taken(state: GameState, step: DevStep, ok: boolean, why?: string): void {
    if (this.route) return this.routeTaken(state, step, ok, why);
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
    this.packsMet = 0;
    this.walkPacks = 0;
    this.glintSeen = null;
    this.glintWanted = false;
    this.racingGlint = null;
    this.scrambleSeen = null;
    this.scrambleRaced = 0;
    this.route = null;
    this.vetted = null;
    this.ledGroup = null;
  }

  private push(action: AiAction, range: [number, number], label: string, group: number, from: Pick<DevStep, 'route' | 'note'> = {}): void {
    const ms = this.rng.int(...range) * this.brain.mind.level.devPace;
    this.queue.push({ action, ms, label, group, ...from });
  }

  private queueMule(state: GameState, index: number, outfit: Outfit): void {
    this.mules++;
    this.pushMule(state, index, outfit);
    this.stage = 'steps';
    this.then = 'decide';
  }

  /**
   * A MULE's three steps, one group, at today's tap times; `route` is its buyMule's index in the route, and each press
   * after it the next index. `note` is logged with each step done.
   */
  private pushMule(state: GameState, index: number, outfit: Outfit, route?: number, note?: string): void {
    const g = ++this.group;
    this.muleSteps(state, index, outfit).forEach(({ action, range, label }, i) =>
      this.push(action, range, label, g, { ...(route !== undefined && { route: route + i }), ...(note !== undefined && { note }) }),
    );
  }

  /** A MULE's presses, buy, outfit and install, each with its tap time's range and label. */
  private muleSteps(state: GameState, index: number, outfit: Outfit): { action: AiAction; range: [number, number]; label: string }[] {
    const t = state.tiles[index]!;
    const d = AI_HANDS.develop;
    const walks = this.at !== undefined;
    return [
      { action: { type: 'buyMule' }, range: walks ? d.buyTapMs : d.buyMs, label: 'Buy a MULE at the corral' },
      { action: { type: 'outfit', outfit }, range: d.outfitMs, label: `Outfit it as a ${outfitName(outfit)}` },
      { action: { type: 'install', x: t.x, y: t.y }, range: walks ? d.installTapMs : d.installMs, label: `Install it on ${plotName(t)}` },
    ];
  }

  private finish(state: GameState): void {
    const mind = this.brain.mind;
    const { analysed, carriedMule } = state.players.find((p) => p.id === mind.me)!;
    // On the floor, a seat still leading a MULE (with no idle plot to put it on) is offered INSTALL on every own plot, not
    // ANALYSE or FIT FILTER: it walks to none of them (FM-led-no-gain).
    const filters = this.onFloor && carriedMule ? [] : filtersWanted(observe(state, mind.me), mind);
    for (const index of filters) {
      const t = state.tiles[index]!;
      const g = ++this.group;
      // On the floor an own plot not yet analysed offers ANALYSE before FIT FILTER (RULE-3 rows 10 and 11), so its
      // analysis is planned first, in the filter's group: an analysis dropped (for time, or refused) drops its filter too
      // (FM-floor-filter).
      if (this.onFloor && !analysed.includes(index)) this.push({ type: 'analyse', x: t.x, y: t.y }, AI_HANDS.develop.analyseTapMs, `Analyse ${plotName(t)}`, g);
      this.push({ type: 'filter', x: t.x, y: t.y }, AI_HANDS.develop.filterMs, `Fit a filter on ${plotName(t)}`, g);
    }
    this.push({ type: 'pub' }, AI_HANDS.develop.pubMs, 'Go to the pub', ++this.group);
    this.stage = 'steps';
    this.then = 'done';
  }
  // --- The route's source. See RULE-9. ----------------------------------------

  /** Whether a MULE is still to come after the queue: one to decide, or one of the route's still to be released. */
  private muleToCome(): boolean {
    const r = this.route;
    if (!r) return this.then === 'decide';
    return this.then === 'decide' && !r.soldOut && r.play.part.route.slice(r.at).some((s) => s.act === 'buyMule');
  }

  /** The route's head step once it may play, releasing the route as the queue empties; null when it is played out. */
  private routeNext(state: GameState, secondsLeft: number, walk?: () => DevWalk): DevStep | null {
    const r = this.route!;
    r.startLeft ??= secondsLeft;
    r.left = secondsLeft;
    r.usedMs = (r.startLeft - secondsLeft) * MS_PER_SECOND;
    if (this.stage === 'start') {
      this.stage = 'steps';
      this.then = 'decide';
    }
    if (this.stage !== 'steps') return null;
    for (;;) {
      if (this.queue.length === 0) {
        if (this.then === 'decide' && this.release(state, walk)) continue;
        this.stage = 'done';
        return null;
      }
      const head = this.queue[0]!;
      if (head === this.vetted || this.vet(state, head, walk)) {
        this.vetted = head;
        return head;
      }
    }
  }

  /** Releases the route's next run into the queue in today's shape; false when nothing was left. See RULE-9, AM-27. */
  private release(state: GameState, walk?: () => DevWalk): boolean {
    const r = this.route!;
    const steps = r.play.part.route;
    const before = this.queue.length;
    const d = AI_HANDS.develop;
    const scouted = (upTo: number) => r.play.own && steps.slice(0, upTo).some((s) => s.act === 'analyse');
    const mayAdd = () => scouted(steps.length) && !r.soldOut && !r.noMore && !steps.slice(r.at).some((s) => s.act === 'buyMule');
    while (r.at < steps.length) {
      const s = steps[r.at]!;
      if (s.act === 'buyMule') {
        if (r.soldOut) {
          r.at += MULE_PRESSES;
          continue;
        }
        if (this.queue.length > before) break;
        const at = r.at;
        r.at += MULE_PRESSES;
        if (scouted(at) ? this.repick(state, at, walk) : this.routeMule(state, at)) break;
        continue;
      }
      if ((s.act === 'filter' || s.act === 'pub') && mayAdd()) {
        if (this.queue.length > before || this.addMule(state, walk)) break;
      }
      if (!r.soldOut || s.act === 'filter' || s.act === 'pub') {
        const from = { route: r.at };
        if (s.act === 'pub') this.push({ type: 'pub' }, d.pubMs, 'Go to the pub', ++this.group, from);
        else {
          const { action, range, label } = this.scoutStep(state, s.act === 'analyse' ? 'analyse' : 'filter', s.plot!);
          this.push(action, range, label, ++this.group, from);
        }
      }
      r.at++;
    }
    if (r.at >= steps.length) {
      if (mayAdd() && (this.queue.length > before || this.addMule(state, walk))) return true;
      if (steps.at(-1)?.act !== 'pub') this.push({ type: 'pub' }, d.pubMs, 'Go to the pub', ++this.group, { note: 'pub added' });
      this.then = 'done';
    }
    return this.queue.length > before;
  }

  /** The route's MULE whose buyMule is route step `at`, queued as drafted, with the outfit and install after it. */
  private routeMule(state: GameState, at: number): boolean {
    const [, outfit, install] = this.route!.play.part.route.slice(at, at + MULE_PRESSES);
    this.pushMule(state, install!.plot!, outfit!.outfit!, at);
    this.route!.mules++;
    return true;
  }

  /** The route's MULE at step `at`, picked again now its analyses are done; whether a MULE was queued. See AM-27. */
  private repick(state: GameState, at: number, walk?: () => DevWalk): boolean {
    const r = this.route!;
    const [, outfit, install] = r.play.part.route.slice(at, at + MULE_PRESSES);
    const pick = this.ownPick(state, walk);
    if (pick.kind === 'install' && pick.index === install!.plot && pick.outfit === outfit!.outfit) return this.routeMule(state, at);
    this.muleSteps(state, install!.plot!, outfit!.outfit!).forEach(({ action, label }, i) =>
      this.log({ action, label, ms: 0, group: 0, route: at + i }, false, pick.kind === 'stop' ? 'skipped' : 'replaced', 'ground analysed'),
    );
    if (pick.kind === 'stop') return false;
    this.pushMule(state, pick.index, pick.outfit);
    r.mules++;
    return true;
  }

  /** One more MULE after the route's last, the own pick's, noted 'MULE added'; false once it says 'stop'. See AM-27. */
  private addMule(state: GameState, walk?: () => DevWalk): boolean {
    const r = this.route!;
    const pick = this.ownPick(state, walk);
    if (pick.kind === 'stop') {
      r.noMore = true;
      return false;
    }
    this.pushMule(state, pick.index, pick.outfit, undefined, 'MULE added');
    r.mules++;
    return true;
  }

  /** The seat's own pick for its next MULE on the live state: the draft's seeded pick for that MULE, leaning as the playbook does. */
  private ownPick(state: GameState, walk?: () => DevWalk): DevAction {
    const r = this.route!;
    const mind = this.brain.mind;
    const input = { state, seat: mind.me, mind, seed: r.play.seed, phase: 'development' as const, month: state.month };
    return this.drafting('own MULE pick', "taken as 'stop'", STOP, () => draftMulePick(input, r.mules, walk?.(), r.play.moneyMaker));
  }

  /** A draft call inside the tick: an error is logged with the seat and gives `fallback`, never reaching the game (HC-9). */
  private drafting<T>(what: string, fallbackNote: string, fallback: T, draft: () => T): T {
    try {
      return draft();
    } catch (err) {
      console.error(`AI seat ${this.brain.mind.me}: no ${what} for month ${this.month}, ${fallbackNote}: ${err instanceof Error ? err.message : String(err)}`);
      return fallback;
    }
  }

  /** Judges the head step before its tap or walk starts: true plays it, false has dealt with it. See RULE-9 rows 2-4. */
  private vet(state: GameState, head: DevStep, walk?: () => DevWalk): boolean {
    const r = this.route!;
    const a = head.action;
    const me = this.brain.mind.me;
    if (a.type !== 'pub' && r.usedMs >= r.play.part.timeBudgetMs) {
      this.skipToPub(state);
      return false;
    }
    if (a.type === 'buyMule' && head.route !== undefined) {
      const stale = this.staleMule(state, head.group, walk);
      if (stale !== null) {
        this.replace(state, head.group, stale, walk);
        return false;
      }
    }
    // A MULE it already leads (won at the land auction) is this MULE: not bought, nor outfitted again as it is.
    const led = state.players.find((p) => p.id === me)!.carriedMule;
    if (led !== null && (a.type === 'buyMule' || (a.type === 'outfit' && a.outfit === led && this.ledGroup === head.group))) {
      if (a.type === 'buyMule') this.ledGroup = head.group;
      this.queue.shift();
      const earns = a.type === 'buyMule' || this.drafting('kept-outfit check', 'noted led', true, () => keptOutfitEarns(state, this.brain.mind));
      this.log(head, true, 'done', earns ? 'led' : 'kept outfit, no gain');
      return false;
    }
    // The steps the hand added (a replacement, the analyses after a sold-out corral) are its own picks, played as they come.
    if (head.route === undefined) return true;
    const plotOf = (s: AiAction) => (s.type === 'install' || s.type === 'filter' || s.type === 'analyse' ? tileIndex(state.width, s.x, s.y) : -1);
    if (a.type === 'filter' && state.tiles[plotOf(a)]!.owner !== me) {
      this.queue.shift();
      this.log(head, false, 'skipped', `stale: plot ${plotOf(a)}`);
      return false;
    }
    // No filter while it still leads a MULE: on the floor the plot's button offers install. See FM-led-no-gain, AM-27.
    if (a.type === 'filter' && led !== null) {
      this.queue.shift();
      this.log(head, false, 'skipped', 'leading');
      return false;
    }
    if (a.type === 'analyse' && state.players.find((p) => p.id === me)!.analysed.includes(plotOf(a))) {
      this.queue.shift();
      this.log(head, false, 'skipped', 'already analysed');
      return false;
    }
    return true;
  }

  /** Why a route MULE about to be bought is stale, or null: its plot is not its idle plot, or the floor's walk vetoes it. See AM-25. */
  private staleMule(state: GameState, group: number, walk?: () => DevWalk): string | null {
    let plot = -1;
    let outfit: Outfit | null = null;
    for (const { group: g, action: a } of this.queue) {
      if (g === group && a.type === 'install') plot = tileIndex(state.width, a.x, a.y);
      if (g === group && a.type === 'outfit') outfit = a.outfit;
    }
    if (plot < 0) return null;
    const tile = state.tiles[plot]!;
    if (tile.owner !== this.brain.mind.me || tile.outfit !== null) return `stale: plot ${plot}`;
    // Only the floor's walk: where the game walks (DEV_WALK) the draft priced the route by that same walk.
    const w = walk?.();
    const legs = outfit === null ? undefined : w?.floor?.(plot, outfit);
    const veto = legs && walkVeto(w!, legs.there, legs.pub);
    return veto ? `stale: ${veto}` : null;
  }

  /** The stale MULE's group, replaced once by the seat's own pick for that MULE, ahead of the rest. See RULE-9 row 3. */
  private replace(state: GameState, group: number, note: string, walk?: () => DevWalk): void {
    const r = this.route!;
    for (const s of this.queue.filter((q) => q.group === group)) this.log(s, false, 'replaced', note);
    const rest = this.queue.filter((q) => q.group !== group);
    this.queue = [];
    const mind = this.brain.mind;
    const input = { state, seat: mind.me, mind, seed: r.play.seed, phase: 'development' as const, month: state.month };
    const pick = this.drafting('replacement MULE pick', "taken as 'stop'", STOP, () => draftMulePick(input, r.mules - 1, walk?.(), r.play.moneyMaker));
    if (pick.kind !== 'stop') this.pushMule(state, pick.index, pick.outfit);
    this.queue.push(...rest);
  }

  /** The time budget is spent: every step left, queued or not, is skipped for the route's pub, or an added one. See RULE-9 row 2. */
  private skipToPub(state: GameState): void {
    const r = this.route!;
    for (const s of this.queue) if (s.action.type !== 'pub') this.log(s, false, 'skipped', 'time budget');
    this.skipUnreleased(state, 'time budget');
    const pub = this.queue.find((s) => s.action.type === 'pub');
    this.queue = pub ? [pub] : [];
    r.at = r.play.part.route.length;
    if (!pub) this.push({ type: 'pub' }, AI_HANDS.develop.pubMs, 'Go to the pub', ++this.group, this.routePub());
    this.then = 'done';
  }

  /** Logs the route's steps not yet released, but its pub, as skipped. */
  private skipUnreleased(state: GameState, why: string): void {
    const steps = this.route!.play.part.route;
    for (let i = this.route!.at; i < steps.length; i++) {
      const s = steps[i]!;
      if (s.act === 'buyMule') {
        const [, outfit, install] = steps.slice(i, i + MULE_PRESSES);
        this.muleSteps(state, install!.plot!, outfit!.outfit!).forEach(({ action, label }, k) => this.log({ action, label, ms: 0, group: 0, route: i + k }, false, 'skipped', why));
        i += MULE_PRESSES - 1;
      } else if (s.act === 'analyse' || s.act === 'filter') {
        const { action, label } = this.scoutStep(state, s.act, s.plot!);
        this.log({ action, label, ms: 0, group: 0, route: i }, false, 'skipped', why);
      }
    }
  }

  /** An analysis or a filter of `plot`, with its tap time's range and label. */
  private scoutStep(state: GameState, act: 'analyse' | 'filter', plot: number): { action: AiAction; range: [number, number]; label: string } {
    const t = state.tiles[plot]!;
    const d = AI_HANDS.develop;
    if (act === 'analyse') return { action: { type: 'analyse', x: t.x, y: t.y }, range: d.analyseTapMs, label: `Analyse ${plotName(t)}` };
    return { action: { type: 'filter', x: t.x, y: t.y }, range: d.filterMs, label: `Fit a filter on ${plotName(t)}` };
  }

  /** The route's own pub, for a pub the hand pushes in its place: its index, or 'pub added' when the route has none. */
  private routePub(): Pick<DevStep, 'route' | 'note'> {
    const i = this.route!.play.part.route.findIndex((s) => s.act === 'pub');
    return i >= 0 ? { route: i } : { note: 'pub added' };
  }

  /**
   * The head step of a route was taken. A refused buy, or an outfit refused with no MULE come (an empty corral under
   * DEV_WALK), is 'sold out'; any other refusal drops its group and the route goes on. See RULE-9 rows 5-7, AM-19.
   */
  private routeTaken(state: GameState, step: DevStep, ok: boolean, why?: string): void {
    if (this.walking === step) this.walking = null;
    this.queue.shift();
    const dropGroup = () => (this.queue = this.queue.filter((s) => s.group !== step.group));
    if (ok) {
      this.log(step, true, 'done', step.note);
      if (step.action.type === 'pub') this.stage = 'done';
      return;
    }
    dropGroup();
    if (why === 'no time' || why === 'scramble') return this.log(step, false, 'skipped', why);
    const me = state.players.find((p) => p.id === this.brain.mind.me)!;
    const a = step.action.type;
    if (a === 'buyMule' || (a === 'outfit' && me.carriedMule === null)) {
      this.log(step, false, 'refused', 'sold out');
      return this.soldOut(state);
    }
    this.log(step, false, 'refused', why ?? 'refused');
  }

  /** ifSoldOut: 'pub' goes on to the route's filters and pub; 'analyse' plays analysesWanted, then the pub; 'stop' ends the turn. */
  private soldOut(state: GameState): void {
    const r = this.route!;
    const mode = r.play.part.ifSoldOut;
    if (mode === 'pub') {
      r.soldOut = true;
      this.queue = this.queue.filter((s) => s.action.type === 'filter' || s.action.type === 'pub');
      return;
    }
    this.queue = [];
    r.at = r.play.part.route.length;
    this.then = 'done';
    if (mode === 'stop') {
      this.stage = 'done';
      return;
    }
    const mind = this.brain.mind;
    for (const index of analysesWanted(observe(state, mind.me), mind, r.left)) {
      const t = state.tiles[index]!;
      this.push({ type: 'analyse', x: t.x, y: t.y }, AI_HANDS.develop.analyseTapMs, `Analyse ${plotName(t)}`, ++this.group);
    }
    this.push({ type: 'pub' }, AI_HANDS.develop.pubMs, 'Go to the pub', ++this.group);
  }

  /** Logs a route step's end, with its note. */
  private log(step: DevStep, ok: boolean, outcome: StepOutcome, why?: string): void {
    this.done.push(this.entry(step, ok, outcome, why));
  }

  private entry(step: DevStep, ok: boolean, outcome: StepOutcome, why?: string): DevLogEntry {
    return { label: step.label, ok, at: this.clock, action: step.action, ...(why !== undefined && { why }), ...(step.route !== undefined && { route: step.route }), outcome };
  }
}
