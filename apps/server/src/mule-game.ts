import {
  advanceGrant,
  advancePhase,
  airBand,
  allPrices,
  analysePlot,
  auctionDone,
  buyMule,
  claimPlot,
  cover,
  createGame,
  createRng,
  declareRole,
  DEVELOPMENT,
  fitFilter,
  GAME,
  GOODS,
  type AiLevelId,
  grantDone,
  hasAnalysed,
  installMule,
  list as listLot,
  litPlot,
  lotDone,
  LOTS,
  monthlyDemand,
  mulePrice,
  mulePriceFor,
  needsOf,
  orderGeoDrone,
  outfitCostFor,
  outfitMule,
  RuleError,
  score,
  scoreParts,
  setLotWalk,
  setWalk,
  shipAnnounced,
  shipInPort,
  shipLine,
  shipPrice,
  SPECIES,
  type Species,
  stepAuction,
  stepLandAuction,
  storeBuyLine,
  storeQuotes,
  storeSellLine,
  unlist as unlistLot,
  visitPub,
  WALK,
  type GameState,
  type Good,
  type Outfit,
  type Phase,
  type Trade,
} from '@mule/engine';
import { AiSeat, LotHand, personaFor, type AiAction } from '@mule/ai';
import { PLAYER_COLORS, type MuleIntent, type MuleView } from '@mule/protocol';
import type { Game, GameContext, SeatInfo } from '@tabletop/core';
import { boardRange, landAuctionView, listingView, lotNews } from './land-auction.js';

/**
 * The longest each phase lasts, in milliseconds. Phases also end early when
 * every connected player is ready; the land grant ends when the claims are
 * used, development when everyone is out of time or at the pub. The auction
 * has no fixed length: it runs good by good on its own clocks (WALK in the
 * engine's config), stepped by the server every WALK.tickMs. The land
 * auction runs the same way, lot by lot on its own clocks (LOTS).
 */
export const PHASE_MS: Record<Exclude<Phase, 'gameOver' | 'auction' | 'landAuction'>, number> = {
  planning: 45_000,
  landGrant: 60_000,
  development: (DEVELOPMENT.fullSeconds + 5) * 1_000,
  production: 5_000,
  upkeep: 8_000,
};

/** How long each free plot stays lit in the land grant. */
export const GRANT_TICK_MS = 650;

export const AI_NAMES = ['The Accountant', 'The Baron', 'The Grudge', 'The Gambler', 'The Good Neighbour'];

/** How often AI hands act during development. */
export const AI_DEV_TICK_MS = 100;

/** The level AI seats play at until the lobby lets the host choose. */
export const DEFAULT_AI_LEVEL: AiLevelId = 'trader';

/** A seat's lobby pick as a species; anything else leaves the engine's default. */
function isSpecies(pick: string | undefined): pick is Species {
  return (SPECIES as readonly (string | undefined)[]).includes(pick);
}

/** M.U.L.E. as a game hosted by a @tabletop/core room. */
export class MuleGame implements Game<MuleIntent, MuleView> {
  private state: GameState | null = null;
  private seats: (SeatInfo & { color: string })[] = [];
  private readonly ready = new Set<string>();
  private readonly away = new Set<string>();
  /** Trades between players in the good that is up, for the news when it closes. */
  private dealsInGood: Trade[] = [];
  /** When each player's development time runs out, epoch ms. */
  private readonly devEndsAt = new Map<string, number>();
  private cancels: (() => void)[] = [];
  private news: string[] = [];
  private phaseEndsAt: number | null = null;
  /** The AI players: strategist, decider and hands, keyed by seat id. */
  private readonly ai = new Map<string, AiSeat>();
  /** Each AI player's hand at the land auction, keyed by seat id. */
  private readonly lotHands = new Map<string, LotHand>();

  /** Real time per unit of game time: 1 is real time, 0.1 ten times faster. Test-only. */
  private readonly phaseScale: number;

  constructor(
    private readonly ctx: GameContext,
    private readonly seed: number,
    private readonly options: { maxMonths?: number; phaseScale?: number } = {},
  ) {
    this.phaseScale = options.phaseScale ?? 1;
    if (!(this.phaseScale > 0 && this.phaseScale <= 1)) throw new RangeError(`phaseScale must be in (0, 1], got ${this.phaseScale}`);
  }

  start(seats: SeatInfo[]): void {
    this.seats = seats.map((s, i) => ({ ...s, color: PLAYER_COLORS[i % PLAYER_COLORS.length]! }));
    this.state = createGame({ seed: this.seed, players: seats.map(({ id, name, isAi, pick }) => ({ id, name, isAi, ...(isSpecies(pick) ? { species: pick } : {}) })), maxMonths: this.options.maxMonths });
    this.ai.clear();
    this.lotHands.clear();
    seats.forEach((s, i) => {
      if (!s.isAi) return;
      const seat = new AiSeat({
        id: s.id,
        name: s.name,
        persona: personaFor(s.name, i),
        level: DEFAULT_AI_LEVEL,
        // From the game seed and the seat, so a replay plays the same AI.
        seed: (this.seed * 7_919 + i * 104_729 + 17) >>> 0,
      });
      this.ai.set(s.id, seat);
      this.lotHands.set(s.id, new LotHand(seat.mind, createRng((seat.options.seed ^ 0xc2b2ae35) >>> 0)));
    });
    this.news = ['Welcome to the colony. Talk tactics, then grab land.'];
    this.enterPhase();
  }

  handle(seatId: string, intent: MuleIntent): void {
    const state = this.requireState();
    switch (intent.type) {
      case 'ready':
        if (state.phase === 'auction') {
          auctionDone(state, seatId);
          return;
        }
        if (state.phase === 'landAuction') {
          lotDone(state, seatId);
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
        this.requireTime(seatId);
        buyMule(state, seatId);
        return;
      case 'outfit':
        this.requireTime(seatId);
        outfitMule(state, seatId, intent.outfit);
        return;
      case 'install':
        this.requireTime(seatId);
        installMule(state, seatId, intent.x, intent.y);
        return;
      case 'analyse': {
        this.requireTime(seatId);
        const seconds = analysePlot(state, seatId, intent.x, intent.y);
        this.devEndsAt.set(seatId, this.devEndsAt.get(seatId)! - seconds * 1_000);
        this.checkDevelopmentOver();
        return;
      }
      case 'filter':
        this.requireTime(seatId);
        fitFilter(state, seatId, intent.x, intent.y);
        return;
      case 'pub': {
        const payout = visitPub(state, seatId, this.requireTime(seatId));
        this.addNews(`${this.nameOf(seatId)} went to the pub and won ${payout}.`);
        this.checkDevelopmentOver();
        return;
      }
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
    }
  }

  /** Seconds of development time this player has left; throws when it has run out. */
  private requireTime(seatId: string): number {
    const ends = this.devEndsAt.get(seatId);
    const left = ends === undefined ? 0 : (ends - this.ctx.now()) / 1_000;
    if (left <= 0) throw new RuleError('Your development time is up');
    return left;
  }

  private nameOf(seatId: string): string {
    return this.seats.find((s) => s.id === seatId)?.name ?? seatId;
  }

  /** Puts a line at the top of the news, which keeps the latest three. */
  private addNews(line: string): void {
    this.news = [line, ...this.news].slice(0, 3);
  }

  connectionChanged(seatId: string, connected: boolean): void {
    if (connected) this.away.delete(seatId);
    else this.away.add(seatId);
    // Nobody waits for a phone that dropped.
    this.checkAllReady();
  }

  private checkAllReady(): void {
    const waiting = this.seats.filter((s) => !s.isAi && !this.away.has(s.id) && !this.ready.has(s.id) && !this.doneDeveloping(s.id));
    // The auctions end on their own, good by good and lot by lot.
    const phase = this.state?.phase;
    if (phase && phase !== 'gameOver' && phase !== 'auction' && phase !== 'landAuction' && waiting.length === 0) this.nextPhase();
  }

  /** During development: true once a player went to the pub or ran out of time. */
  private doneDeveloping(seatId: string): boolean {
    const state = this.requireState();
    if (state.phase !== 'development') return false;
    const p = state.players.find((q) => q.id === seatId);
    return !!p?.doneDeveloping || (this.devEndsAt.get(seatId) ?? 0) <= this.ctx.now();
  }

  /** Development ends once every player, AI included, is at the pub or out of time. */
  private checkDevelopmentOver(): void {
    const state = this.requireState();
    if (state.phase !== 'development') return;
    if (this.seats.every((s) => this.away.has(s.id) || this.doneDeveloping(s.id))) this.nextPhase();
  }

  private requireState(): GameState {
    if (!this.state) throw new RuleError('The game has not started');
    return this.state;
  }

  private nextPhase(): void {
    const state = this.requireState();
    if (state.phase === 'gameOver') return;
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
    const ms = PHASE_MS[state.phase] * this.phaseScale;
    this.phaseEndsAt = this.ctx.now() + ms;
    this.cancels.push(
      this.ctx.schedule(ms, () => {
        this.nextPhase();
        this.ctx.changed();
      }),
    );

    if (state.phase === 'planning') for (const seat of this.ai.values()) seat.planMonth(state);
    if (state.phase === 'landGrant') {
      this.aiGrantBids();
      this.scheduleGrantTick();
    }
    if (state.phase === 'development') this.startDevelopment();
    if (state.phase === 'production') this.reportProduction();
    if (state.phase === 'upkeep') this.reportUpkeep();
  }

  /** The land grant's light moves on every tick; each new plot gets the AI players' bids. */
  private scheduleGrantTick(): void {
    const state = this.requireState();
    this.cancels.push(
      this.ctx.schedule(GRANT_TICK_MS, () => {
        if (state.phase !== 'landGrant') return;
        if (grantDone(state)) this.nextPhase();
        else {
          advanceGrant(state);
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

  /** Each player gets their own clock: Food, sickness and analyses set how long they have. */
  private startDevelopment(): void {
    const state = this.requireState();
    const now = this.ctx.now();
    this.devEndsAt.clear();
    for (const p of state.players) {
      this.devEndsAt.set(p.id, now + p.devSeconds * 1_000 * this.phaseScale);
      // Check when this player's time runs out, so the phase ends as soon as everyone's has.
      this.cancels.push(this.ctx.schedule(p.devSeconds * 1_000 * this.phaseScale + 1, () => {
        this.checkDevelopmentOver();
        this.ctx.changed();
      }));
    }
    if (this.ai.size > 0) this.scheduleAiDevelop(state.month, now);
  }

  /**
   * AI hands in development: every tick each AI player works through its
   * to-do list (buy, outfit, install, pub) at a quick human's pace, on its
   * own clock, through the same moves a phone sends.
   */
  private scheduleAiDevelop(month: number, last: number): void {
    const state = this.requireState();
    this.cancels.push(
      this.ctx.schedule(AI_DEV_TICK_MS, () => {
        if (state.phase !== 'development' || state.month !== month) return;
        const now = this.ctx.now();
        // The time that really passed, capped so a stalled loop doesn't make the hands skip ahead.
        const dt = Math.min(Math.max(0, now - last), AI_DEV_TICK_MS * 10);
        for (const seat of this.ai.values()) {
          const p = state.players.find((q) => q.id === seat.id)!;
          const left = ((this.devEndsAt.get(seat.id) ?? now) - now) / 1_000;
          if (p.doneDeveloping || left <= 0) continue;
          seat.developTick(state, dt, left, (a) => this.aiAct(seat.id, a));
          if (state.phase !== 'development') break;
        }
        this.checkDevelopmentOver();
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
          if (state.phase === 'landAuction') lotDone(state, seatId, action.done);
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
            else if (this.away.has(seat.id)) auctionDone(state, seat.id);
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
    return {
      finished: state.phase === 'gameOver',
      month: state.month,
      maxMonths: state.maxMonths,
      phase: state.phase,
      phaseEndsAt: this.phaseEndsAt,
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
          color: s.color,
          species: p.species,
          money: p.money,
          plots: state.tiles.filter((t) => t.owner === s.id).length,
          ready: this.ready.has(s.id),
          doneDeveloping: p.doneDeveloping,
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
            devEndsAt: state.phase === 'development' ? (this.devEndsAt.get(me.id) ?? null) : null,
            devSeconds: me.devSeconds,
            produced: state.history.at(-1)?.produced[me.id] ?? null,
            mulePrice: mulePriceFor(state, me.id),
            outfitCosts: Object.fromEntries(outfits.map((o) => [o, outfitCostFor(state, me.id, o)])) as Record<Outfit, number>,
            droneOrder: me.droneOrder.map((i) => ({ x: i % state.width, y: Math.floor(i / state.width) })),
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
    };
  }

  /** The auction board as every screen draws it. Public, as in the original: everyone sees everyone walk. */
  private auctionView(): MuleView['auction'] {
    const state = this.requireState();
    const a = state.auction;
    if (state.phase !== 'auction' || !a || !a.good || a.stage === 'over') return null;
    const prices = a.walkers.map((w) => w.price);
    const lines = [storeBuyLine(state), storeSellLine(state), shipLine(state)].filter((n): n is number => n !== null);
    return {
      good: a.good,
      stage: a.stage,
      seconds: Math.max(0, a.clockMs / 1_000),
      total: (a.stage === 'status' ? WALK.statusMs : a.stage === 'declare' ? WALK.declareMs : WALK.goodMs) / 1_000,
      slowed: a.stage === 'walk' && a.deals.length > 0,
      next: [...a.queue],
      storeBuys: storeBuyLine(state),
      storeSells: storeSellLine(state),
      shipPays: shipLine(state),
      ...boardRange(a.lo, a.hi, [...prices, ...lines]),
      speed: a.speed,
      walkers: a.walkers.map((w) => ({ id: w.id, side: w.side, price: Math.round(w.price), at: w.price, dir: w.dir, done: a.done.includes(w.id) })),
      deals: a.deals.map(({ buyer, seller, price, units }) => ({ buyer, seller, price, units })),
      units: a.units,
      status: a.status,
      skipped: a.skipped,
    };
  }

  dispose(): void {
    for (const cancel of this.cancels) cancel();
    this.cancels = [];
  }
}
