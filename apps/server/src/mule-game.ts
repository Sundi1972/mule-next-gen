import {
  advanceGrant,
  advancePhase,
  aiClaim,
  aiAuction,
  aiDevelop,
  airBand,
  allPrices,
  analysePlot,
  auctionDone,
  buyMule,
  claimPlot,
  cover,
  createGame,
  declareRole,
  DEVELOPMENT,
  fitFilter,
  GAME,
  GOODS,
  grantDone,
  hasAnalysed,
  installMule,
  litPlot,
  monthlyDemand,
  mulePrice,
  mulePriceFor,
  needsOf,
  orderGeoDrone,
  outfitCostFor,
  outfitMule,
  RuleError,
  score,
  setWalk,
  shipAnnounced,
  shipInPort,
  shipLine,
  shipPrice,
  stepAuction,
  storeBuyLine,
  storeQuotes,
  storeSellLine,
  visitPub,
  WALK,
  type GameState,
  type Good,
  type Outfit,
  type Phase,
  type Trade,
} from '@mule/engine';
import { PLAYER_COLORS, type MuleIntent, type MuleView } from '@mule/protocol';
import type { Game, GameContext, SeatInfo } from '@tabletop/core';

/**
 * The longest each phase lasts, in milliseconds. Phases also end early when
 * every connected player is ready; the land grant ends when the claims are
 * used, development when everyone is out of time or at the pub. The auction
 * has no fixed length: it runs good by good on its own clocks (WALK in the
 * engine's config), stepped by the server every WALK.tickMs.
 */
export const PHASE_MS: Record<Exclude<Phase, 'gameOver' | 'auction'>, number> = {
  planning: 45_000,
  landGrant: 60_000,
  development: (DEVELOPMENT.fullSeconds + 5) * 1_000,
  production: 5_000,
  upkeep: 8_000,
};

/** How long each free plot stays lit in the land grant. */
export const GRANT_TICK_MS = 650;

export const AI_NAMES = ['The Accountant', 'The Baron', 'The Grudge', 'The Gambler', 'The Good Neighbour'];

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

  constructor(
    private readonly ctx: GameContext,
    private readonly seed: number,
  ) {}

  start(seats: SeatInfo[]): void {
    this.seats = seats.map((s, i) => ({ ...s, color: PLAYER_COLORS[i % PLAYER_COLORS.length]! }));
    this.state = createGame({ seed: this.seed, players: seats.map(({ id, name, isAi }) => ({ id, name, isAi })) });
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
        this.news = [`${this.nameOf(seatId)} went to the pub and won ${payout}.`, ...this.news].slice(0, 3);
        this.checkDevelopmentOver();
        return;
      }
      case 'declare':
        declareRole(state, seatId, intent.side);
        return;
      case 'walk':
        setWalk(state, seatId, intent.dir === 'up' ? 1 : intent.dir === 'down' ? -1 : 0);
        // Walking again takes back a Done.
        if (intent.dir !== 'stop') auctionDone(state, seatId, false);
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

  connectionChanged(seatId: string, connected: boolean): void {
    if (connected) this.away.delete(seatId);
    else this.away.add(seatId);
    // Nobody waits for a phone that dropped.
    this.checkAllReady();
  }

  private checkAllReady(): void {
    const waiting = this.seats.filter((s) => !s.isAi && !this.away.has(s.id) && !this.ready.has(s.id) && !this.doneDeveloping(s.id));
    // The auction ends on its own, good by good.
    if (this.state && this.state.phase !== 'gameOver' && this.state.phase !== 'auction' && waiting.length === 0) this.nextPhase();
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
    if (this.seats.every((s) => s.isAi || this.away.has(s.id) || this.doneDeveloping(s.id))) this.nextPhase();
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

    const ms = PHASE_MS[state.phase];
    this.phaseEndsAt = this.ctx.now() + ms;
    this.cancels.push(
      this.ctx.schedule(ms, () => {
        this.nextPhase();
        this.ctx.changed();
      }),
    );

    if (state.phase === 'landGrant') this.scheduleGrantTick();
    if (state.phase === 'development') this.startDevelopment();
    if (state.phase === 'production') this.reportProduction();
    if (state.phase === 'upkeep') this.reportUpkeep();
  }

  /**
   * The land grant's light moves on every tick. Before it moves, AI players
   * get their chance at the plot that was lit, after humans had the whole
   * tick to press. One AI at most takes it, in a rotating order.
   */
  private scheduleGrantTick(): void {
    const state = this.requireState();
    this.cancels.push(
      this.ctx.schedule(GRANT_TICK_MS, () => {
        if (state.phase !== 'landGrant') return;
        const ais = this.seats.filter((s) => s.isAi);
        const start = (state.grant?.step ?? 0) % Math.max(1, ais.length);
        for (let i = 0; i < ais.length; i++) {
          try {
            if (aiClaim(state, ais[(start + i) % ais.length]!.id)) break;
          } catch (err) {
            if (!(err instanceof RuleError)) throw err;
          }
        }
        if (grantDone(state)) this.nextPhase();
        else {
          advanceGrant(state);
          this.scheduleGrantTick();
        }
        this.ctx.changed();
      }),
    );
  }

  /** Each player gets their own clock: Food, sickness and analyses set how long they have. */
  private startDevelopment(): void {
    const state = this.requireState();
    const now = this.ctx.now();
    this.devEndsAt.clear();
    for (const p of state.players) {
      this.devEndsAt.set(p.id, now + p.devSeconds * 1_000);
      // Check when this player's time runs out, so the phase ends as soon as everyone's has.
      this.cancels.push(this.ctx.schedule(p.devSeconds * 1_000 + 1, () => {
        this.checkDevelopmentOver();
        this.ctx.changed();
      }));
    }
    this.scheduleAi((id) => aiDevelop(state, id));
  }

  /** AI players act after a short, varied delay, so real-time phases feel like a race. */
  private scheduleAi(act: (id: string) => void): void {
    const state = this.requireState();
    const phase = state.phase;
    this.seats
      .filter((s) => s.isAi)
      .forEach((seat, i) => {
        const delay = 2_000 + ((this.seed + i * 1_777 + state.month * 313) % 5_000);
        this.cancels.push(
          this.ctx.schedule(delay, () => {
            if (state.phase !== phase) return;
            try {
              act(seat.id);
            } catch (err) {
              if (!(err instanceof RuleError)) throw err;
            }
            this.ctx.changed();
          }),
        );
      });
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
        const dt = Math.min(Math.max(0, now - last), WALK.tickMs * 3);
        const good = state.auction.good;
        for (const seat of this.seats) {
          try {
            if (seat.isAi) aiAuction(state, seat.id, dt);
            else if (this.away.has(seat.id)) auctionDone(state, seat.id);
          } catch (err) {
            if (!(err instanceof RuleError)) throw err;
          }
        }
        this.dealsInGood.push(...stepAuction(state, dt).filter((t) => t.buyer !== 'store' && t.buyer !== 'ship' && t.seller !== 'store'));
        if (state.auction.good !== good) {
          this.reportGood(good);
          const skipped = state.auction.skipped;
          if (skipped.length > 0) this.news = [`Skipped: ${skipped.map((x) => x.good).join(', ')}.`, ...this.news].slice(0, 3);
        }
        if (state.auction.stage === 'over') this.nextPhase();
        else this.scheduleAuctionTick(now);
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
    const line = `${this.nameOf(best.seller)} sold ${best.n} ${good} to ${this.nameOf(best.buyer)} at ${Math.round(best.value / best.n)}.`;
    this.news = [line, ...this.news].slice(0, 3);
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

  /** What one player may see, or with `null` what everyone may see. Stock and hidden ground stay private. */
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
      scores: state.phase === 'gameOver' ? this.seats.map((s) => ({ id: s.id, score: score(state, s.id) })) : null,
      auction: this.auctionView(),
    };
  }

  /** The auction board as every screen draws it. Public, as in the original: everyone sees everyone walk. */
  private auctionView(): MuleView['auction'] {
    const state = this.requireState();
    const a = state.auction;
    if (state.phase !== 'auction' || !a || !a.good || a.stage === 'over') return null;
    const prices = a.walkers.map((w) => w.price);
    const lines = [storeBuyLine(state), storeSellLine(state), shipLine(state)].filter((n): n is number => n !== null);
    const top = Math.max(a.hi, ...prices, ...lines);
    const bottom = Math.min(a.lo, ...prices, ...lines);
    // Grow the board by a margin once someone walks past its edge.
    const pad = (top - bottom) * 0.08;
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
      lo: Math.max(0, Math.floor(top > a.hi || bottom < a.lo ? bottom - pad : bottom)),
      hi: Math.ceil(top > a.hi ? top + pad : top),
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
