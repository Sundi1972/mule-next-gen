import {
  advanceGrant,
  advancePhase,
  aiClaim,
  aiDevelop,
  aiOrders,
  airBand,
  allPrices,
  analysePlot,
  buyMule,
  claimPlot,
  cover,
  createGame,
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
  settleAuction,
  shipAnnounced,
  shipInPort,
  shipPrice,
  storeQuotes,
  visitPub,
  type GameState,
  type Good,
  type Order,
  type Outfit,
  type Phase,
} from '@mule/engine';
import { PLAYER_COLORS, type MuleIntent, type MuleView } from '@mule/protocol';
import type { Game, GameContext, SeatInfo } from '@tabletop/core';

/**
 * The longest each phase lasts, in milliseconds. Phases also end early when
 * every connected player is ready; the land grant ends when the claims are
 * used, development when everyone is out of time or at the pub.
 */
export const PHASE_MS: Record<Exclude<Phase, 'gameOver'>, number> = {
  planning: 45_000,
  landGrant: 60_000,
  development: (DEVELOPMENT.fullSeconds + 5) * 1_000,
  production: 5_000,
  auction: 30_000,
  upkeep: 8_000,
};

/** How long each free plot stays lit in the land grant. */
export const GRANT_TICK_MS = 650;

export const AI_NAMES = ['The Accountant', 'The Baron', 'The Grudge', 'The Gambler', 'The Good Neighbour'];

type StandingOrder = { side: 'buy' | 'sell'; quantity: number; limit: number };

/** M.U.L.E. as a game hosted by a @tabletop/core room. */
export class MuleGame implements Game<MuleIntent, MuleView> {
  private state: GameState | null = null;
  private seats: (SeatInfo & { color: string })[] = [];
  private readonly ready = new Set<string>();
  private readonly away = new Set<string>();
  private readonly orders = new Map<string, Partial<Record<Good, StandingOrder>>>();
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
      case 'setOrder': {
        if (state.phase !== 'auction') throw new RuleError('The auction is not running');
        const mine = this.orders.get(seatId) ?? {};
        if (intent.side === 'none' || intent.quantity <= 0) delete mine[intent.good];
        else mine[intent.good] = { side: intent.side, quantity: Math.floor(intent.quantity), limit: Math.max(1, Math.round(intent.limit)) };
        this.orders.set(seatId, mine);
        return;
      }
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
    if (this.state && this.state.phase !== 'gameOver' && waiting.length === 0) this.nextPhase();
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
    if (state.phase === 'auction') this.settle();
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
    if (state.phase === 'auction') this.orders.clear();
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

  private settle(): void {
    const state = this.requireState();
    const all: Partial<Record<Good, Order[]>> = {};
    for (const seat of this.seats) {
      const source = seat.isAi
        ? Object.fromEntries(Object.entries(aiOrders(state, seat.id)).map(([g, list]) => [g, list?.[0]]))
        : this.orders.get(seat.id) ?? {};
      for (const [good, order] of Object.entries(source) as [Good, StandingOrder | undefined][]) {
        if (order) (all[good] ??= []).push({ playerId: seat.id, ...order });
      }
    }
    const trades = settleAuction(state, all);
    const name = (id: string) => (id === 'store' ? 'the store' : this.seats.find((s) => s.id === id)?.name ?? id);
    const notable = trades
      .filter((t) => t.buyer !== 'store' && t.seller !== 'store')
      .sort((a, b) => b.quantity * b.price - a.quantity * a.price)
      .slice(0, 3)
      .map((t) => `${name(t.seller)} sold ${t.quantity} ${t.good} to ${name(t.buyer)} at ${t.price}.`);
    this.news = notable.length > 0 ? notable : ['A quiet market: everyone traded with the store.'];
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
            mulePrice: mulePriceFor(state, me.id),
            outfitCosts: Object.fromEntries(outfits.map((o) => [o, outfitCostFor(state, me.id, o)])) as Record<Outfit, number>,
            droneOrder: me.droneOrder.map((i) => ({ x: i % state.width, y: Math.floor(i / state.width) })),
            orders: this.orders.get(me.id) ?? {},
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
    };
  }

  dispose(): void {
    for (const cancel of this.cancels) cancel();
    this.cancels = [];
  }
}
