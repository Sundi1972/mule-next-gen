import {
  advancePhase,
  aiClaim,
  aiDevelop,
  aiOrders,
  allPrices,
  buyMule,
  claimPlot,
  cover,
  createGame,
  GAME,
  GOODS,
  installMule,
  monthlyDemand,
  mulePrice,
  outfitMule,
  RuleError,
  score,
  settleAuction,
  storeQuotes,
  type GameState,
  type Good,
  type Order,
  type Phase,
} from '@mule/engine';
import { PLAYER_COLORS, type MuleIntent, type MuleView } from '@mule/protocol';
import type { Game, GameContext, SeatInfo } from '@tabletop/core';

/** How long each phase lasts, in milliseconds. Phases also end early when every connected player is ready. */
export const PHASE_MS: Record<Exclude<Phase, 'gameOver'>, number> = {
  planning: 45_000,
  landGrant: 20_000,
  development: 45_000,
  production: 5_000,
  auction: 30_000,
  upkeep: 8_000,
};

export const AI_NAMES = ['The Accountant', 'The Baron', 'The Grudge', 'The Gambler', 'The Good Neighbour'];

type StandingOrder = { side: 'buy' | 'sell'; quantity: number; limit: number };

/** M.U.L.E. as a game hosted by a @tabletop/core room. */
export class MuleGame implements Game<MuleIntent, MuleView> {
  private state: GameState | null = null;
  private seats: (SeatInfo & { color: string })[] = [];
  private readonly ready = new Set<string>();
  private readonly away = new Set<string>();
  private readonly orders = new Map<string, Partial<Record<Good, StandingOrder>>>();
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
      case 'claim':
        claimPlot(state, seatId, intent.x, intent.y);
        return;
      case 'buyMule':
        buyMule(state, seatId);
        return;
      case 'outfit':
        outfitMule(state, seatId, intent.good);
        return;
      case 'install':
        installMule(state, seatId, intent.x, intent.y);
        return;
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

  connectionChanged(seatId: string, connected: boolean): void {
    if (connected) this.away.delete(seatId);
    else this.away.add(seatId);
    // Nobody waits for a phone that dropped.
    this.checkAllReady();
  }

  private checkAllReady(): void {
    const waiting = this.seats.filter((s) => !s.isAi && !this.away.has(s.id) && !this.ready.has(s.id));
    if (this.state && this.state.phase !== 'gameOver' && waiting.length === 0) this.nextPhase();
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

    if (state.phase === 'landGrant') {
      this.scheduleAi((id) => {
        for (let i = 0; i < GAME.claimsPerGrant; i++) aiClaim(state, id);
      });
    }
    if (state.phase === 'development') this.scheduleAi((id) => aiDevelop(state, id));
    if (state.phase === 'auction') this.orders.clear();
    if (state.phase === 'production') this.reportProduction();
    if (state.phase === 'upkeep') this.reportUpkeep();
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
    const shortages = state.history.at(-1)?.shortages ?? [];
    const hungry = state.players.filter((p) => p.hungry).map((p) => p.name);
    this.news = [
      shortages.length > 0 ? `Colony shortage of ${shortages.join(' and ')}! Colonists are leaving.` : 'The colony is fed and growing.',
      ...(hungry.length > 0 ? [`Hungry this month: ${hungry.join(', ')}.`] : []),
    ];
  }

  /** What one player may see, or with `null` what everyone may see. Stock and hidden tile data stay private. */
  viewFor(seatId: string | null): MuleView {
    const state = this.requireState();
    const prices = allPrices(state);
    const demand = monthlyDemand(state);
    const me = seatId ? state.players.find((p) => p.id === seatId) : undefined;
    return {
      finished: state.phase === 'gameOver',
      month: state.month,
      maxMonths: state.maxMonths,
      phase: state.phase,
      phaseEndsAt: this.phaseEndsAt,
      width: state.width,
      height: state.height,
      tiles: state.tiles.map((t) => ({
        x: t.x,
        y: t.y,
        terrain: t.terrain,
        peaks: t.peaks,
        owner: t.owner,
        outfit: t.outfit,
        ...(me && t.owner === me.id ? { crystite: t.crystite, traits: t.traits } : {}),
      })),
      players: this.seats.map((s) => ({
        id: s.id,
        name: s.name,
        isAi: s.isAi,
        color: s.color,
        money: state.players.find((p) => p.id === s.id)?.money ?? 0,
        plots: state.tiles.filter((t) => t.owner === s.id).length,
        ready: this.ready.has(s.id),
      })),
      me: me
        ? {
            id: me.id,
            stock: me.stock,
            carriedMule: me.carriedMule,
            claimsLeft: GAME.claimsPerGrant - me.claimsThisGrant,
            hungry: me.hungry,
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
        };
      }),
      storeMules: state.store.mules,
      mulePrice: mulePrice(state),
      colonists: state.colonists,
      news: this.news,
      scores: state.phase === 'gameOver' ? this.seats.map((s) => ({ id: s.id, score: score(state, s.id) })) : null,
    };
  }

  dispose(): void {
    for (const cancel of this.cancels) cancel();
    this.cancels = [];
  }
}
