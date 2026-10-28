import {
  advanceGrant,
  advancePhase,
  AI_HANDS,
  airBand,
  allPrices,
  analysePlot,
  auctionDone,
  buyMule,
  castVote,
  claimPlot,
  cover,
  createGame,
  createRng,
  declareRole,
  electionDone,
  DEVELOPMENT,
  fitFilter,
  foodShare,
  GAME,
  GOODS,
  goodsMarket,
  type AiLevelId,
  grantDone,
  grantPass,
  hasAnalysed,
  hungerPace,
  installMule,
  list as listLot,
  litPlot,
  lotDone,
  LOTS,
  monthlyDemand,
  monthNeeds,
  mulePrice,
  mulePriceFor,
  needsOf,
  orderGeoDrone,
  outfitCostFor,
  outfitMule,
  PHASES,
  playerEventReason,
  RuleError,
  runFor,
  score,
  scoreParts,
  setLotWalk,
  setSalesTax,
  setWalk,
  shipAnnounced,
  shipInPort,
  shipLine,
  shipPrice,
  sickPace,
  SPECIES,
  type Species,
  stepAuction,
  stepElection,
  stepLandAuction,
  storeBuyLine,
  storeForSale,
  storeQuotes,
  storeSellLine,
  unlist as unlistLot,
  visitPub,
  WALK,
  walkSeconds,
  type GameState,
  type Good,
  type Outfit,
  type Phase,
  type Trade,
} from '@mule/engine';
import { AiSeat, LotHand, personaFor, VoteHand, type AiAction } from '@mule/ai';
import { PLAYER_COLORS, type MuleIntent, type MuleView, type ProductionReason, type ProductionView, type ScorePartsView } from '@mule/protocol';
import type { Game, GameContext, SeatInfo } from '@tabletop/core';
import { createBrain, type BrainService } from './brain/index.js';
import { colonistView, dueArrivals, placeName, walkTarget, type Colonist, type DevIntent } from './dev-walking.js';
import { boardRange, landAuctionView, listingView, lotNews } from './land-auction.js';
import { electionNews, myPoliticsView, politicsView, resultShown } from './politics-view.js';

/**
 * The longest each phase lasts, in milliseconds, from the engine's PHASES.
 * Each is read from the config when asked, so a value set at runtime times the
 * next phase that starts. Planning's is null: it has no clock and waits for
 * every player's Ready. The land grant's is null too: it ends after one pass of
 * its light, or once every claim is used. The auction has no entry: it runs good by good on its
 * own clocks (WALK), stepped by the server every WALK.tickMs. The land auction
 * runs the same way, lot by lot on its own clocks (LOTS).
 */
export const PHASE_MS: { readonly planning: number | null; readonly landGrant: number | null } & Readonly<
  Record<Exclude<Phase, 'gameOver' | 'auction' | 'landAuction' | 'planning' | 'landGrant'>, number>
> = {
  get planning() {
    return PHASES.planningMs;
  },
  get landGrant() {
    return PHASES.landGrantMs;
  },
  get development() {
    return DEVELOPMENT.fullSeconds * 1_000;
  },
  get production() {
    return PHASES.productionMs;
  },
  get upkeep() {
    return PHASES.upkeepMs;
  },
};

/** How long each free plot stays lit in the land grant. */
export const GRANT_TICK_MS = GAME.grantTickMs;

/** The longest a land grant can run, from the engine's grant rules: one pass over the largest map. */
export { GRANT_PASS_MAX_MS } from '@mule/engine';

export const AI_NAMES = ['The Accountant', 'The Baron', 'The Grudge', 'The Gambler', 'The Good Neighbour'];

/** How often AI hands act during development. */
export const AI_DEV_TICK_MS = AI_HANDS.devTickMs;

/** The level AI seats play at until the lobby lets the host choose. */
export const DEFAULT_AI_LEVEL: AiLevelId = 'trader';

/** A seat's lobby pick as a species; anything else leaves the engine's default. */
function isSpecies(pick: string | undefined): pick is Species {
  return (SPECIES as readonly (string | undefined)[]).includes(pick);
}

/** The reasons a plot's badges may name; its ground, the output floor, a factory's fit and the event never get one. */
const BADGE_REASONS: readonly ProductionReason[] = ['cluster', 'species', 'trait', 'pollution', 'noEnergy', 'noWater'];
const MAX_BADGES = 2;

/** Names in reading order: "A", "A and B", "A, B and C". */
function andList(names: string[]): string {
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** A player's Worth line by line, without the total their public row carries as `worth`. Only for their own `me`. */
function worthPartsOf(state: GameState, playerId: string): ScorePartsView {
  const { total: _total, ...parts } = scoreParts(state, playerId);
  return parts;
}

/**
 * The month's production as every screen may see it: each working plot with
 * what it made before the event and its biggest reasons, and the event's hits.
 * Built field by field from the report, so the stock players held never
 * reaches a screen through it.
 */
function productionView(state: GameState, lengthMs: number): ProductionView | null {
  const report = state.history.at(-1);
  if (!report) return null;
  const at = (index: number) => ({ x: index % state.width, y: Math.floor(index / state.width) });
  const isBadge = (why: string): why is ProductionReason => (BADGE_REASONS as readonly string[]).includes(why);
  const lines = [...(report.lines ?? [])]
    .sort((a, b) => a.tile - b.tile)
    .map((line) => ({
      ...at(line.tile),
      owner: state.tiles[line.tile]!.owner!,
      good: line.good,
      made: line.made - line.parts.reduce((n, p) => n + (p.why === 'event' ? p.delta : 0), 0),
      parts: line.parts
        .flatMap(({ why, delta }) => (isBadge(why) && delta !== 0 ? [{ why, delta }] : []))
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, MAX_BADGES),
    }));
  const events = (report.events ?? []).map((e) => ({
    key: e.key,
    kind: e.kind,
    title: e.title,
    line: e.line,
    sign: e.sign,
    scope: e.scope,
    origin: { ...e.origin },
    ...(e.direction ? { from: e.direction } : {}),
    hits: e.plots.map((p) => ({ ...at(p.index), order: p.order, delta: p.delta })),
  }));
  return { lines, events, lengthMs };
}

/** M.U.L.E. as a game hosted by a @tabletop/core room. */
export class MuleGame implements Game<MuleIntent, MuleView> {
  private state: GameState | null = null;
  private seats: SeatInfo[] = [];
  private readonly ready = new Set<string>();
  private readonly away = new Set<string>();
  /** Seats the server pressed Done for in this election stage because their phone dropped. */
  private readonly doneForAway = new Set<string>();
  /** Trades between players in the good that is up, for the news when it closes. */
  private dealsInGood: Trade[] = [];
  /** When the one development clock runs out for every seat, epoch ms; null outside development. */
  private devEndsAt: number | null = null;
  /** Each seat's colonist during development, keyed by seat id. */
  private readonly colonists = new Map<string, Colonist>();
  /** Every human was Ready, away or done while a colonist was still out; development ends once all have arrived. */
  private endWhenSettled = false;
  private cancels: (() => void)[] = [];
  private news: string[] = [];
  private phaseEndsAt: number | null = null;
  /** This month's production length in real ms, as its timer was given: the show stretches over it through upkeep. */
  private productionMs = 0;
  /** The AI players: strategist, decider and hands, keyed by seat id. */
  private readonly ai = new Map<string, AiSeat>();
  /** Each AI player's hand at the land auction, keyed by seat id. */
  private readonly lotHands = new Map<string, LotHand>();
  /** Each AI player's hand in politics: runs, votes and governs, keyed by seat id. */
  private readonly voteHands = new Map<string, VoteHand>();

  /** Real time per unit of game time: 1 is real time, 0.1 ten times faster. Test-only. */
  private readonly phaseScale: number;
  /** Deciders and table chat for the AI seats; Classic when the server has no key. */
  private readonly brain: BrainService;

  constructor(
    private readonly ctx: GameContext,
    private readonly seed: number,
    /** `politics` plays elections, offices and the Governor's tax; off unless the server is created with it on. */
    private readonly options: { maxMonths?: number; phaseScale?: number; politics?: boolean; brain?: BrainService } = {},
  ) {
    this.phaseScale = options.phaseScale ?? 1;
    if (!(this.phaseScale > 0 && this.phaseScale <= 1)) throw new RangeError(`phaseScale must be in (0, 1], got ${this.phaseScale}`);
    // One ledger file holds every game, so the id must not repeat: the seed, the room's clock at creation, and a
    // random suffix for two games made in the same tick.
    this.brain = options.brain ?? createBrain({ gameId: `g-${seed}-${ctx.now()}-${crypto.randomUUID().slice(0, 8)}` });
  }

  start(seats: SeatInfo[]): void {
    this.seats = seats.map((s) => ({ ...s }));
    this.state = createGame({ seed: this.seed, players: seats.map(({ id, name, isAi, pick }) => ({ id, name, isAi, ...(isSpecies(pick) ? { species: pick } : {}) })), maxMonths: this.options.maxMonths, politics: this.options.politics ?? false });
    this.ai.clear();
    this.lotHands.clear();
    this.voteHands.clear();
    seats.forEach((s, i) => {
      if (!s.isAi) return;
      const brainSeat = { id: s.id, persona: personaFor(s.name, i), level: DEFAULT_AI_LEVEL };
      const chat = this.brain.chatter(brainSeat, (line) => this.ctx.say?.(s.id, line));
      const seat = new AiSeat({
        ...brainSeat,
        name: s.name,
        // From the game seed and the seat, so a replay plays the same AI.
        seed: (this.seed * 7_919 + i * 104_729 + 17) >>> 0,
        decider: this.brain.deciderFor(brainSeat),
        // A decision can come in the tick that enters a phase, before that phase's view goes out; its line waits for it.
        onDecision: (record) => {
          this.ctx.schedule(0, () => chat(record));
        },
      });
      this.ai.set(s.id, seat);
      this.lotHands.set(s.id, new LotHand(seat.mind, createRng((seat.options.seed ^ 0xc2b2ae35) >>> 0)));
      this.voteHands.set(s.id, new VoteHand(seat.mind, createRng((seat.options.seed ^ 0x165667b1) >>> 0)));
    });
    this.news = ['Welcome to the colony. Talk tactics, then grab land.'];
    this.enterPhase();
  }

  handle(seatId: string, intent: MuleIntent): void {
    const state = this.requireState();
    switch (intent.type) {
      case 'ready':
        // During the election, ready is Done for the stage; it never ends planning.
        if (this.electionOpen()) {
          electionDone(state, seatId);
          return;
        }
        if (state.phase === 'auction') {
          auctionDone(state, seatId);
          return;
        }
        if (state.phase === 'landAuction') {
          lotDone(state, seatId);
          return;
        }
        // In the land grant, Ready is Done with land: the grant ends once every seat has used its claims or is done.
        if (state.phase === 'landGrant') {
          grantPass(state, seatId);
          if (grantDone(state)) this.nextPhase();
          return;
        }
        this.ready.add(seatId);
        this.checkAllReady();
        return;
      case 'drone':
        orderGeoDrone(state, seatId, intent.plots);
        return;
      case 'claim':
        claimPlot(state, seatId, intent.x, intent.y);
        if (grantDone(state)) this.nextPhase();
        return;
      case 'buyMule':
      case 'outfit':
      case 'install':
      case 'analyse':
      case 'filter':
      case 'pub':
        this.develop(seatId, intent);
        return;
      case 'declare':
        declareRole(state, seatId, intent.side);
        return;
      case 'walk': {
        const dir = intent.dir === 'up' ? 1 : intent.dir === 'down' ? -1 : 0;
        // Walking again takes back a Done; at the land auction the engine does that itself.
        if (state.phase === 'landAuction') {
          setLotWalk(state, seatId, dir);
          return;
        }
        setWalk(state, seatId, dir);
        if (intent.dir !== 'stop') auctionDone(state, seatId, false);
        return;
      }
      case 'list':
        listLot(state, seatId, intent);
        return;
      case 'unlist':
        unlistLot(state, seatId, intent.id);
        return;
      case 'run':
        runFor(state, seatId, intent.office, intent.promise);
        return;
      case 'vote':
        castVote(state, seatId, intent.office, intent.candidate);
        return;
      case 'setTax':
        setSalesTax(state, seatId, intent.percent);
        return;
      case 'continue': {
        if (seatId !== this.ctx.hostId()) throw new RuleError('Only the host can continue');
        const left = this.seats.filter((s) => !s.isAi && s.id !== seatId && !this.ready.has(s.id)).map((s) => s.name);
        this.continuePlanning();
        if (left.length > 0) this.addNews(`${this.nameOf(seatId)} continued without ${andList(left)}.`);
        return;
      }
    }
  }

  /** The host's Continue: ends planning proper with players not yet Ready. The caller must have checked the seat is the host. */
  private continuePlanning(): void {
    if (this.electionOpen()) throw new RuleError('The election is still running');
    if (this.state?.phase !== 'planning') throw new RuleError('Continue ends planning only');
    this.nextPhase();
  }

  /**
   * A development tap names where to go and what to do there: the colonist walks there (walkSeconds) and the move
   * applies on arrival; an outfit applies where it stands. Refused while it walks or assays, and when the walk would
   * end after the clock, except to the pub, which pays for whatever time is left when it gets there.
   */
  private develop(seatId: string, intent: DevIntent): void {
    const state = this.requireState();
    this.settleArrivals();
    const now = this.ctx.now();
    const colonist = this.colonists.get(seatId);
    if (!colonist || this.secondsLeft(now) <= 0) throw new RuleError('Your development time is up');
    if (state.players.find((p) => p.id === seatId)?.doneDeveloping) throw new RuleError('Your turn is over: you went to the pub');
    if (colonist.walk) throw new RuleError('Still walking');
    if (colonist.assayUntil !== null) throw new RuleError('Still assaying');
    const to = walkTarget(state, intent);
    if (to === null) {
      this.act(seatId, intent, now);
      return;
    }
    const arrivesAt = now + this.realMs(walkSeconds(state, seatId, colonist.at, to));
    if (arrivesAt > this.devEndsAt! && intent.type !== 'pub') throw new RuleError('Not enough time to walk there');
    colonist.walk = { from: colonist.at, startedAt: now, arrivesAt, then: intent };
    colonist.at = to;
    if (arrivesAt > now) {
      this.cancels.push(this.ctx.schedule(arrivesAt - now, () => this.settle()));
      return;
    }
    this.settleArrivals();
    this.checkEarlyEnd();
  }

  /** A walk or an assay is due: applies what has arrived, ends development if that was the last seat, tells every screen. */
  private settle(): void {
    this.settleArrivals();
    this.checkEarlyEnd();
    this.ctx.changed();
  }

  /** Development's two early ends, checked again whenever a colonist arrives or finishes an assay. */
  private checkEarlyEnd(): void {
    if (this.endWhenSettled) this.checkAllReady();
    this.checkDevelopmentOver();
  }

  /** True when no colonist is walking, so ending development drops no move; an assay applied on arrival, so it holds nothing. */
  private colonistsSettled(): boolean {
    return [...this.colonists.values()].every((c) => c.walk === null);
  }

  /** Applies every walk that has arrived by now, in arrival order; then frees colonists whose assay is done. */
  private settleArrivals(): void {
    const now = this.ctx.now();
    for (const id of dueArrivals(this.seats.map((s) => s.id), this.colonists, now)) this.arrive(id);
    for (const colonist of this.colonists.values()) if (colonist.assayUntil !== null && colonist.assayUntil <= now) colonist.assayUntil = null;
  }

  /** Ends a colonist's walk: its move applies as of its arrival. Refused then (the MULEs ran out), nothing changes and the news says so. */
  private arrive(seatId: string): void {
    const colonist = this.colonists.get(seatId)!;
    const { then, arrivesAt } = colonist.walk!;
    colonist.walk = null;
    try {
      this.act(seatId, then, arrivesAt);
    } catch (err) {
      if (!(err instanceof RuleError)) throw err;
      this.addNews(`${this.nameOf(seatId)} reached ${placeName(colonist.at)}: ${err.message}.`);
    }
  }

  /** One development move through the engine's own checks, as of `at`, epoch ms. */
  private act(seatId: string, intent: DevIntent, at: number): void {
    const state = this.requireState();
    switch (intent.type) {
      case 'buyMule':
        buyMule(state, seatId);
        return;
      case 'outfit':
        outfitMule(state, seatId, intent.outfit);
        return;
      case 'install':
        installMule(state, seatId, intent.x, intent.y);
        return;
      case 'filter':
        fitFilter(state, seatId, intent.x, intent.y);
        return;
      case 'analyse': {
        const until = at + this.realMs(analysePlot(state, seatId, intent.x, intent.y));
        this.colonists.get(seatId)!.assayUntil = until;
        this.cancels.push(this.ctx.schedule(Math.max(0, until - this.ctx.now()), () => this.settle()));
        return;
      }
      case 'pub': {
        const payout = visitPub(state, seatId, Math.max(0, this.secondsLeft(at)));
        this.addNews(`${this.nameOf(seatId)} went to the pub and won ${payout}.`);
        return;
      }
    }
  }

  /** Development is over: walks that have arrived apply; a colonist on its way to the pub gets there, any other walk comes to nothing. */
  private finishDevelopment(): void {
    this.settleArrivals();
    for (const s of this.seats) if (this.colonists.get(s.id)?.walk?.then.type === 'pub') this.arrive(s.id);
    this.colonists.clear();
    this.devEndsAt = null;
  }

  /** Game seconds left on the development clock at `at`, epoch ms; 0 outside development. */
  private secondsLeft(at: number): number {
    return this.devEndsAt === null ? 0 : this.gameSeconds(this.devEndsAt - at);
  }

  /** Real ms that `seconds` of game time last at this table's phaseScale, in whole ms like the server's clock. */
  private realMs(seconds: number): number {
    return Math.round(seconds * 1_000 * this.phaseScale);
  }

  /** Game seconds that `ms` of real time stand for at this table's phaseScale. */
  private gameSeconds(ms: number): number {
    return ms / 1_000 / this.phaseScale;
  }

  private nameOf(seatId: string): string {
    return this.seats.find((s) => s.id === seatId)?.name ?? seatId;
  }

  /** Puts a line at the top of the news, which keeps the latest three. */
  private addNews(line: string): void {
    this.news = [line, ...this.news].slice(0, 3);
  }

  /** A player's line reaches the AI seats it was for: a public line every other AI seat, a whisper only its addressee. Never throws. */
  heard(from: string, text: string, to?: string): void {
    const line = { from: this.nameOf(from), text };
    for (const seat of this.ai.values()) if (to === undefined ? seat.id !== from : seat.id === to) seat.hear(line);
  }

  connectionChanged(seatId: string, connected: boolean): void {
    if (connected) this.away.delete(seatId);
    else this.away.add(seatId);
    // A Done the server pressed for the dropped phone is taken back; one the player pressed stands.
    if (connected && this.electionOpen() && this.doneForAway.delete(seatId)) electionDone(this.requireState(), seatId, false);
    // Nobody waits for a phone that dropped.
    this.checkAllReady();
  }

  /** Stops the seat's auction walk: the old screen can't release it and the new one never pressed it. A move is neither Done nor a drop. */
  seatMoved(seatId: string): void {
    const state = this.state;
    if (!state || this.ai.has(seatId)) return;
    try {
      if (state.phase === 'landAuction') setLotWalk(state, seatId, 0);
      else if (state.phase === 'auction') setWalk(state, seatId, 0);
    } catch (err) {
      if (!(err instanceof RuleError)) throw err;
    }
  }

  private checkAllReady(): void {
    // The election ends on its own clocks.
    if (this.electionOpen()) return;
    const phase = this.state?.phase;
    // The land grant ends only through grantDone: every seat's claims used or Done with land, or the pass over. A phone
    // that drops in the grant just doesn't claim and is not Done; a reload must not end the grant for everyone.
    if (phase === 'landGrant') return;
    // In planning a dropped phone may be a player who locked it to think: planning waits for their Ready.
    const excused = (id: string) => this.away.has(id) && phase !== 'planning';
    const waiting = this.seats.filter((s) => !s.isAi && !excused(s.id) && !this.ready.has(s.id) && !this.doneDeveloping(s.id));
    // The auctions end on their own, good by good and lot by lot.
    if (!phase || phase === 'gameOver' || phase === 'auction' || phase === 'landAuction') return;
    if (waiting.length > 0) {
      // Someone is back and playing: an early end held for a walk no longer stands.
      if (phase === 'development') this.endWhenSettled = false;
      return;
    }
    if (phase === 'development' && !this.colonistsSettled()) {
      this.endWhenSettled = true;
      return;
    }
    this.nextPhase();
  }

  /** During development: true once a player went to the pub or ran out of time. */
  private doneDeveloping(seatId: string): boolean {
    const state = this.requireState();
    if (state.phase !== 'development') return false;
    const p = state.players.find((q) => q.id === seatId);
    return !!p?.doneDeveloping || (this.devEndsAt ?? 0) <= this.ctx.now();
  }

  /** Development ends once every player, AI included, is at the pub, out of time or away, and no colonist is still out. */
  private checkDevelopmentOver(): void {
    const state = this.requireState();
    if (state.phase !== 'development') return;
    if (this.seats.every((s) => this.away.has(s.id) || this.doneDeveloping(s.id)) && this.colonistsSettled()) this.nextPhase();
  }

  private requireState(): GameState {
    if (!this.state) throw new RuleError('The game has not started');
    return this.state;
  }

  private nextPhase(): void {
    const state = this.requireState();
    if (state.phase === 'gameOver') return;
    if (state.phase === 'development') this.finishDevelopment();
    advancePhase(state);
    this.enterPhase();
  }

  private enterPhase(): void {
    const state = this.requireState();
    for (const cancel of this.cancels) cancel();
    this.cancels = [];
    this.ready.clear();

    if (state.phase === 'gameOver') {
      this.phaseEndsAt = null;
      const ranking = [...this.seats].sort((a, b) => score(state, b.id) - score(state, a.id));
      this.news = [`Game over. ${ranking[0]?.name} wins the colony!`];
      this.brain.finish();
      return;
    }

    if (state.phase === 'auction') {
      this.phaseEndsAt = null;
      this.dealsInGood = [];
      this.news = ['The auction opens. Walk up to buy, down to sell.'];
      this.scheduleAuctionTick(this.ctx.now());
      return;
    }

    // The land auction runs on its lots' own clocks, not a phase timer.
    if (state.phase === 'landAuction') {
      this.phaseEndsAt = null;
      this.scheduleLandAuctionTick(this.ctx.now());
      return;
    }
    // In an election month the election runs first, on its own clocks; planning proper opens once it is over.
    if (this.electionOpen()) {
      this.phaseEndsAt = null;
      this.scheduleElectionTick(this.ctx.now());
      return;
    }
    if (state.phase === 'development') {
      this.startDevelopment();
      return;
    }
    this.startPhaseTimer(state.phase);

    if (state.phase === 'planning') this.startPlanning();
    if (state.phase === 'landGrant') {
      this.aiGrantBids();
      this.scheduleGrantTick();
    }
    if (state.phase === 'production') this.reportProduction();
    if (state.phase === 'upkeep') this.reportUpkeep();
  }

  /** Ends the phase when its PHASE_MS runs out; a phase whose PHASE_MS is null has no clock and waits for Ready. */
  private startPhaseTimer(phase: keyof typeof PHASE_MS): void {
    const length = PHASE_MS[phase];
    this.phaseEndsAt = null;
    if (length === null) return;
    const ms = length * this.phaseScale;
    this.phaseEndsAt = this.ctx.now() + ms;
    if (phase === 'production') this.productionMs = ms;
    this.cancels.push(
      this.ctx.schedule(ms, () => {
        this.nextPhase();
        this.ctx.changed();
      }),
    );
  }

  private startPlanning(): void {
    const state = this.requireState();
    // At once, so an AI Governor's tax lands before a quick table can press ready.
    this.tickVoteHands(0);
    for (const seat of this.ai.values()) seat.planMonth(state);
  }

  /** True while this month's election runs, before planning proper. */
  private electionOpen(): boolean {
    const state = this.state;
    const election = state?.politics?.election;
    return state?.phase === 'planning' && !!election && election.stage !== 'over';
  }

  /**
   * Steps the election every WALK.tickMs until it is over: the AI vote hands act
   * first, then dropped phones count as Done and the election steps, all with the
   * same dt. When it ends, planning proper opens, timed only when PHASES.planningMs is a number.
   */
  private scheduleElectionTick(last: number): void {
    const state = this.requireState();
    this.cancels.push(
      this.ctx.schedule(WALK.tickMs, () => {
        if (!this.electionOpen()) return;
        const now = this.ctx.now();
        // A stalled server loop must not skip a stage.
        const dt = Math.min(Math.max(0, now - last), WALK.tickMs * 3) / this.phaseScale;
        this.tickVoteHands(dt);
        const { done, stage } = state.politics!.election!;
        for (const id of this.away) if (!done.includes(id)) this.doneForAway.add(id);
        for (const seat of this.seats) if (this.away.has(seat.id)) electionDone(state, seat.id);
        const shown = resultShown(state);
        stepElection(state, dt);
        if (state.politics!.election!.stage !== stage) this.doneForAway.clear();
        const result = state.politics!.election!.result;
        if (!shown && result && resultShown(state)) this.addNews(electionNews(result, (id) => this.nameOf(id)));
        if (this.electionOpen()) this.scheduleElectionTick(now);
        else {
          this.startPhaseTimer('planning');
          this.startPlanning();
        }
        this.ctx.changed();
      }),
    );
  }

  /** Ticks every AI vote hand by dt through the same checks a phone gets. */
  private tickVoteHands(dt: number): void {
    const state = this.requireState();
    for (const [id, hand] of this.voteHands) hand.tick(state, dt, (action) => this.aiAct(id, action));
  }

  /** The land grant's light moves on every tick; each new plot gets the AI players' bids. */
  private scheduleGrantTick(): void {
    const state = this.requireState();
    this.cancels.push(
      this.ctx.schedule(GRANT_TICK_MS, () => {
        if (state.phase !== 'landGrant') return;
        advanceGrant(state);
        // An AI seat that wants nothing still ahead of the light presses Done with land, as a phone's Ready.
        for (const seat of this.ai.values()) if (seat.passesGrant(state)) this.aiAct(seat.id, { type: 'done', done: true });
        // The pass ends when the last plot's tick does, so the light never comes back round to the first.
        if (grantDone(state)) this.nextPhase();
        else {
          this.aiGrantBids();
          this.scheduleGrantTick();
        }
        this.ctx.changed();
      }),
    );
  }

  /**
   * A plot just lit up. Each AI player that wants it presses Claim after its
   * own human reaction time, like a thumb on a phone, so a quick human can
   * beat it. A press that comes after the light moved on is refused by the
   * rules, exactly as a late human press is.
   */
  private aiGrantBids(): void {
    const state = this.requireState();
    const lit = litPlot(state);
    if (!lit) return;
    const step = state.grant?.step;
    for (const seat of this.ai.values()) {
      const ms = seat.onLit(state);
      if (ms === null || ms >= GRANT_TICK_MS) continue;
      this.cancels.push(
        this.ctx.schedule(ms, () => {
          if (state.phase !== 'landGrant' || state.grant?.step !== step) return;
          if (!this.aiAct(seat.id, { type: 'claim', x: lit.x, y: lit.y })) return;
          if (grantDone(state)) this.nextPhase();
          this.ctx.changed();
        }),
      );
    }
  }

  /** One clock for every seat, DEVELOPMENT.fullSeconds long: hunger and sickness slow the walk, never the clock. */
  private startDevelopment(): void {
    const state = this.requireState();
    const now = this.ctx.now();
    this.devEndsAt = now + this.realMs(DEVELOPMENT.fullSeconds);
    this.phaseEndsAt = null;
    this.endWhenSettled = false;
    for (const s of this.seats) this.colonists.set(s.id, { at: 'store', walk: null, assayUntil: null });
    this.scheduleDevelopmentEnd(state.month);
    if (this.ai.size > 0) this.scheduleAiDevelop(state.month, now);
  }

  /**
   * Ends development when the clock runs out. It re-arms if devEndsAt moved later meanwhile, as the e2e's giveStoreTime
   * moves it to give the store walk-through time.
   */
  private scheduleDevelopmentEnd(month: number): void {
    const state = this.requireState();
    this.cancels.push(
      this.ctx.schedule(Math.max(0, (this.devEndsAt ?? 0) - this.ctx.now()), () => {
        if (state.phase !== 'development' || state.month !== month) return;
        if (this.ctx.now() < (this.devEndsAt ?? 0)) {
          this.scheduleDevelopmentEnd(month);
          return;
        }
        this.nextPhase();
        this.ctx.changed();
      }),
    );
  }

  /**
   * AI hands in development: every tick each AI player works through its
   * to-do list (buy, outfit, install, pub) at a quick human's pace, in game
   * time on the one clock, told where its colonist stands and whether it is
   * still walking or assaying. Its taps walk through the same moves a phone sends.
   */
  private scheduleAiDevelop(month: number, last: number): void {
    const state = this.requireState();
    this.cancels.push(
      this.ctx.schedule(AI_DEV_TICK_MS, () => {
        if (state.phase !== 'development' || state.month !== month) return;
        const now = this.ctx.now();
        // The time that really passed, capped so a stalled loop doesn't make the hands skip ahead.
        const dt = Math.min(Math.max(0, now - last), AI_DEV_TICK_MS * 10);
        // A walk due this ms lands before the hands look, whichever timer fired first.
        this.settleArrivals();
        for (const seat of this.ai.values()) {
          const p = state.players.find((q) => q.id === seat.id)!;
          const left = this.secondsLeft(now);
          const colonist = this.colonists.get(seat.id);
          if (p.doneDeveloping || left <= 0 || !colonist) continue;
          const walk = { at: colonist.at, busy: colonist.walk !== null || colonist.assayUntil !== null };
          seat.developTick(state, this.gameSeconds(dt) * 1_000, left, (a) => this.aiAct(seat.id, a), walk);
          if (state.phase !== 'development') break;
        }
        this.checkEarlyEnd();
        if (state.phase === 'development') this.scheduleAiDevelop(month, now);
        this.ctx.changed();
      }),
    );
  }

  /**
   * Plays one AI move through the same checks a phone's intent gets.
   * Returns false when the rules refused it, so the hands move on.
   */
  private aiAct(seatId: string, action: AiAction): boolean {
    const state = this.requireState();
    try {
      switch (action.type) {
        case 'claim':
          claimPlot(state, seatId, action.x, action.y);
          break;
        case 'walk':
          // The goods hands set Done themselves, so walking doesn't take it back here; at the land auction the engine does.
          if (state.phase === 'landAuction') setLotWalk(state, seatId, action.dir);
          else setWalk(state, seatId, action.dir);
          break;
        case 'done':
          if (this.electionOpen()) electionDone(state, seatId, action.done);
          else if (state.phase === 'landGrant') grantPass(state, seatId);
          else if (state.phase === 'landAuction') lotDone(state, seatId, action.done);
          else auctionDone(state, seatId, action.done);
          break;
        default:
          this.handle(seatId, action);
      }
      return true;
    } catch (err) {
      if (err instanceof RuleError) return false;
      throw err;
    }
  }

  /**
   * The live auction runs on a fixed tick. Each tick the AI players choose
   * their step, players who dropped count as done, and the engine moves
   * everyone by the time that really passed on the server's clock. Every
   * screen gets the new board.
   */
  private scheduleAuctionTick(last: number): void {
    const state = this.requireState();
    this.cancels.push(
      this.ctx.schedule(WALK.tickMs, () => {
        if (state.phase !== 'auction' || !state.auction) return;
        const now = this.ctx.now();
        // A stalled server loop must not teleport walkers across the board.
        const dt = Math.min(Math.max(0, now - last), WALK.tickMs * 3) / this.phaseScale;
        const good = state.auction.good;
        for (const seat of this.seats) {
          try {
            const ai = this.ai.get(seat.id);
            if (ai) ai.auctionTick(state, dt, (a) => this.aiAct(seat.id, a));
            else if (this.away.has(seat.id)) this.sitOut(seat.id);
          } catch (err) {
            if (!(err instanceof RuleError)) throw err;
          }
        }
        this.dealsInGood.push(...stepAuction(state, dt).filter((t) => t.buyer !== 'store' && t.buyer !== 'ship' && t.seller !== 'store'));
        if (state.auction.good !== good) {
          this.reportGood(good);
          const skipped = state.auction.skipped;
          if (skipped.length > 0) this.addNews(`Skipped: ${skipped.map((x) => x.good).join(', ')}.`);
        }
        if (state.auction.stage === 'over') this.nextPhase();
        else this.scheduleAuctionTick(now);
        this.ctx.changed();
      }),
    );
  }

  /**
   * A dropped phone sits the rest of the good out, on the status screen and
   * in the walk: off the board, it can't walk on its own or stand on a line
   * for the store or a player to trade with. Back online during the walk, the
   * side picker lets it rejoin.
   */
  private sitOut(seatId: string): void {
    const state = this.requireState();
    // Passing also stops the walker: it leaves the board.
    try {
      declareRole(state, seatId, 'pass');
    } catch (err) {
      if (!(err instanceof RuleError)) throw err;
    }
    // Last, because passing during the walk takes a Done back.
    auctionDone(state, seatId);
  }

  /** Steps the land auction every WALK.tickMs until its last lot is over; the AI hands move first, with the same dt. */
  private scheduleLandAuctionTick(last: number): void {
    const state = this.requireState();
    this.cancels.push(
      this.ctx.schedule(WALK.tickMs, () => {
        const a = state.landAuction;
        if (state.phase !== 'landAuction' || !a) return;
        const now = this.ctx.now();
        // A stalled server loop must not teleport walkers across the board.
        const dt = Math.min(Math.max(0, now - last), WALK.tickMs * 3) / this.phaseScale;
        for (const seat of this.seats) {
          const hand = this.lotHands.get(seat.id);
          if (hand) {
            hand.tick(state, dt, (action) => this.aiAct(seat.id, action));
            continue;
          }
          if (!this.away.has(seat.id)) continue;
          // A dropped phone has finished bidding: its walker stops where it is.
          try {
            setLotWalk(state, seat.id, 0);
          } catch (err) {
            if (!(err instanceof RuleError)) throw err;
          }
          lotDone(state, seat.id);
        }
        const lot = a.lot;
        const result = stepLandAuction(state, dt);
        if (lot && result) this.addNews(lotNews(lot, result, (id) => this.nameOf(id)));
        if (a.stage === 'over') this.nextPhase();
        else this.scheduleLandAuctionTick(now);
        this.ctx.changed();
      }),
    );
  }

  /** When a good closes: the biggest deals between players make the news. */
  private reportGood(good: Good | null): void {
    if (!good) return;
    const lots = new Map<string, { seller: string; buyer: string; n: number; value: number }>();
    for (const t of this.dealsInGood) {
      const k = `${t.seller}>${t.buyer}`;
      const lot = lots.get(k) ?? { seller: t.seller, buyer: t.buyer, n: 0, value: 0 };
      lot.n++;
      lot.value += t.price;
      lots.set(k, lot);
    }
    this.dealsInGood = [];
    const best = [...lots.values()].sort((x, y) => y.value - x.value)[0];
    if (!best) return;
    this.addNews(`${this.nameOf(best.seller)} sold ${best.n} ${good} to ${this.nameOf(best.buyer)} at ${Math.round(best.value / best.n)}.`);
  }

  private reportProduction(): void {
    const state = this.requireState();
    const report = state.history.at(-1);
    if (!report) return;
    const best = this.seats
      .map((s) => ({ name: s.name, total: GOODS.reduce((n, g) => n + (report.produced[s.id]?.[g] ?? 0), 0) }))
      .sort((a, b) => b.total - a.total)[0];
    this.news = [`Harvest is in. ${best?.name} produced the most this month.`];
  }

  private reportUpkeep(): void {
    const state = this.requireState();
    const report = state.history.at(-1);
    const shortages = report?.shortages ?? [];
    const hungry = state.players.filter((p) => p.hungry).map((p) => p.name);
    this.news = [
      shortages.length > 0
        ? `The store ran out of ${shortages.join(' and ')}! Colonists are leaving.`
        : report?.colonistsHungry
          ? 'Colonists could not afford their Food and Water. Some are leaving.'
          : 'The colony is fed and growing.',
      ...(hungry.length > 0 ? [`Hungry this month: ${hungry.join(', ')}.`] : []),
    ];
  }

  /** What one player may see, or with `null` what everyone may see. Stock, hidden ground and score parts stay private. */
  viewFor(seatId: string | null): MuleView {
    const state = this.requireState();
    const prices = allPrices(state);
    const demand = monthlyDemand(state);
    const me = seatId ? state.players.find((p) => p.id === seatId) : undefined;
    const lit = litPlot(state);
    const band = airBand(state.air).name;
    const outfits: Outfit[] = [...GOODS, 'greenBelt'];
    // While the election runs, the one "I'm ready" button stands for Done in the stage; planning's own ready set is untouched.
    // In the land grant a seat is ready once it has used its claims or pressed Done with land.
    const doneWithLand = (id: string) => {
      const p = state.players.find((q) => q.id === id);
      return !!p && (p.doneWithLand || p.claimsThisGrant >= GAME.claimsPerGrant);
    };
    const isReady = (id: string) =>
      this.electionOpen() ? state.politics!.election!.done.includes(id) : state.phase === 'landGrant' ? doneWithLand(id) : this.ready.has(id);
    return {
      finished: state.phase === 'gameOver',
      month: state.month,
      maxMonths: state.maxMonths,
      phase: state.phase,
      phaseEndsAt: state.phase === 'development' ? this.devEndsAt : this.phaseEndsAt,
      width: state.width,
      height: state.height,
      tiles: state.tiles.map((t) => {
        const analysed = !!me && hasAnalysed(me, state, t);
        return {
          x: t.x,
          y: t.y,
          terrain: t.terrain,
          peaks: t.peaks,
          owner: t.owner,
          outfit: t.outfit,
          pollution: t.pollution,
          filter: t.filter,
          // A special field is public: every viewer sees it, the TV too. Only the ground stays private.
          ...(t.special ? { special: { kind: t.special.kind, ...(t.special.salvage ? { salvage: t.special.salvage } : {}) } } : {}),
          ...(analysed ? { ground: t.ground } : {}),
          ...(analysed || (me && t.owner === me.id) ? { traits: t.traits } : {}),
        };
      }),
      lit: lit ? { x: lit.x, y: lit.y } : null,
      players: this.seats.map((s) => {
        const p = state.players.find((q) => q.id === s.id)!;
        return {
          id: s.id,
          name: s.name,
          isAi: s.isAi,
          color: PLAYER_COLORS[s.color % PLAYER_COLORS.length]!,
          slot: s.color,
          species: p.species,
          money: p.money,
          worth: score(state, s.id),
          plots: state.tiles.filter((t) => t.owner === s.id).length,
          ready: isReady(s.id),
          doneDeveloping: p.doneDeveloping,
          colonist: colonistView(this.colonists.get(s.id), state.phase),
          condition:
            state.phase === 'development'
              ? {
                  foodShare: foodShare(state, s.id),
                  sick: p.sick,
                  sickBecause: p.sick ? playerEventReason(state, 'sickness', 'development', s.id) : null,
                  conditionPace: hungerPace(state, s.id) * sickPace(state, s.id),
                }
              : null,
        };
      }),
      me: me
        ? {
            id: me.id,
            species: me.species,
            stock: me.stock,
            carriedMule: me.carriedMule,
            claimsLeft: GAME.claimsPerGrant - me.claimsThisGrant,
            hungry: me.hungry,
            sick: me.sick,
            needs: needsOf(state, me.id),
            monthNeeds: monthNeeds(state, me.id),
            devEndsAt: state.phase === 'development' ? this.devEndsAt : null,
            devSeconds: me.devSeconds,
            produced: state.history.at(-1)?.produced[me.id] ?? null,
            mulePrice: mulePriceFor(state, me.id),
            outfitCosts: Object.fromEntries(outfits.map((o) => [o, outfitCostFor(state, me.id, o)])) as Record<Outfit, number>,
            droneOrder: me.droneOrder.map((i) => ({ x: i % state.width, y: Math.floor(i / state.width) })),
            politics: myPoliticsView(state, me.id),
            installedThisTurn: me.installedThisTurn,
            worthParts: worthPartsOf(state, me.id),
          }
        : null,
      market: GOODS.map((good) => {
        const quotes = storeQuotes(state, good);
        const c = cover(state, good, demand);
        return {
          good,
          price: prices[good],
          storeBuys: quotes.buy,
          storeSells: quotes.sell,
          storeStock: state.store.stock[good],
          cover: Number.isFinite(c) ? Math.round(c * 10) / 10 : 99,
          demand: Math.round(demand[good] * 10) / 10,
          shipPays: shipInPort(state) ? shipPrice(state, good) : null,
        };
      }),
      storeMules: state.store.mules,
      mulePrice: mulePrice(state),
      colonists: state.colonists,
      air: { level: Math.round(state.air), band },
      ship: {
        arrives: state.ship.arrives,
        inPort: shipInPort(state),
        wants: shipAnnounced(state) ? { ...state.ship.hold } : null,
      },
      treasury: { money: state.treasury.money, salesTax: state.treasury.salesTax },
      news: this.news,
      scores:
        state.phase === 'gameOver'
          ? this.seats.map((s) => {
              if (s.id !== seatId) return { id: s.id, score: score(state, s.id) };
              const { total, ...parts } = scoreParts(state, s.id);
              return { id: s.id, score: total, parts };
            })
          : null,
      auction: this.auctionView(),
      listings: state.listings.map(listingView),
      lotSlots: { used: state.listings.length, max: LOTS.maxLotsPerMonth },
      landAuction: landAuctionView(state),
      production: state.phase === 'production' || state.phase === 'upkeep' ? productionView(state, this.productionMs) : null,
      politics: politicsView(state),
    };
  }

  /** The auction board as every screen draws it. Public, as in the original: everyone sees everyone walk. */
  private auctionView(): MuleView['auction'] {
    const state = this.requireState();
    const a = state.auction;
    if (state.phase !== 'auction' || !a || !a.good || a.stage === 'over') return null;
    const market = goodsMarket(state);
    const prices = a.walkers.map((w) => w.price);
    const lines = [storeBuyLine(state), storeSellLine(state), shipLine(state)].filter((n): n is number => n !== null);
    return {
      good: a.good,
      stage: a.stage,
      seconds: Math.max(0, a.clockMs / 1_000),
      total: (a.stage === 'status' ? WALK.statusMs : WALK.goodMs) / 1_000,
      slowed: a.stage === 'walk' && a.deals.length > 0,
      next: [...a.queue],
      storeBuys: storeBuyLine(state),
      storeSells: storeSellLine(state),
      storeForSale: storeForSale(state, a.good),
      shipPays: shipLine(state),
      ...boardRange(a.lo, a.hi, [...prices, ...lines]),
      speed: a.speed,
      walkers: a.walkers.map((w) => ({
        id: w.id,
        side: w.side,
        price: Math.round(w.price),
        at: w.price,
        dir: w.dir,
        done: a.done.includes(w.id),
        units: market.units(w.id),
      })),
      deals: a.deals.map(({ buyer, seller, price, units }) => ({ buyer, seller, price, units })),
      units: a.units,
      status: a.status,
      skipped: a.skipped,
    };
  }

  dispose(): void {
    for (const cancel of this.cancels) cancel();
    this.cancels = [];
    this.brain.finish();
  }
}
