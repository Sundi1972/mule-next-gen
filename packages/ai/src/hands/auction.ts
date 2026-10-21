import { AI_HANDS, observe, shipLine, storeBuyLine, storeSellLine, type GameState, type Good, type Rng, type Walker } from '@mule/engine';
import type { Act } from '../actions.js';
import type { Brain, Pending } from '../brain.js';
import { goodPlan, tradeDecision, type GoodPlan, type TradeAction } from '../strategist.js';
import { situation } from '../summary.js';

/**
 * Auction hands, after the design doc's auction example. At the status
 * screen the strategist values every unit and the decider picks buy, sell or
 * pass and how far; the hands then walk to it on the server tick:
 *
 * - if the best price on offer is inside the limit, walk to it and trade;
 * - if a rival on my side is ahead and the limit leaves room, overtake;
 * - if the gap to the other side is small, wait for them to close it;
 * - otherwise edge towards them, never past the limit.
 *
 * They re-aim only after a reaction time (0.2 to 0.4 s, by level, seeded
 * noise), start after a jittered delay, and wander their stopping point a
 * little inside the limit, so there is no fixed habit to read. A buyer's
 * limit is what one more unit is worth to it; a seller's floor is what the
 * unit it would give up is worth. Both follow its stock as units trade.
 */
export interface AuctionDebug {
  good: Good;
  side: 'buyer' | 'seller' | 'pass' | null;
  /** The ceiling a buyer pays, or the floor a seller asks, right now. */
  limit: number | null;
  target: number | null;
  /** Units it wants to end with. */
  goal: number | null;
}

export class AuctionHand {
  private key = '';
  private plan: GoodPlan | null = null;
  private pending: Pending<TradeAction> | null = null;
  private trade: TradeAction | null = null;
  private declared = false;
  private statusDone = false;
  private startDelay = 0;
  private reactIn = 0;
  private gap = 0;
  private jitter = 0;
  private target: number | null = null;
  private limit: number | null = null;
  private dir: -1 | 0 | 1 = 0;
  private doneFlag = false;
  private startMoney = 0;

  constructor(
    private readonly brain: Brain,
    private readonly rng: Rng,
  ) {}

  debug(): AuctionDebug | null {
    if (!this.plan) return null;
    return {
      good: this.plan.good,
      side: this.trade?.side ?? null,
      limit: this.limit === null || !Number.isFinite(this.limit) ? null : Math.round(this.limit),
      target: this.target === null ? null : Math.round(this.target),
      goal: this.trade?.side === 'seller' ? this.trade.keep : this.trade?.side === 'buyer' ? this.trade.upTo : null,
    };
  }

  tick(state: GameState, dt: number, act: Act): void {
    const a = state.auction;
    if (state.phase !== 'auction' || !a || !a.good || a.stage === 'over') return;
    const mind = this.brain.mind;
    const key = `${state.month}:${a.good}`;
    if (key !== this.key) this.reset(key);
    const me = state.players.find((p) => p.id === mind.me)!;

    if (!this.plan) {
      const obs = observe(state, mind.me);
      this.plan = goodPlan(obs, mind, a.good);
      this.pending = this.brain.ask('trade', tradeDecision(obs, mind, this.plan), obs, AI_HANDS.auction.decideWaitMs, a.good, situation(obs, mind));
    }
    if (!this.trade && this.pending) {
      const settled = a.stage === 'status' ? this.brain.resolve(this.pending, dt, state) : this.brain.resolveNow(this.pending, state);
      if (settled) this.trade = settled.action;
    }

    if (a.stage === 'status') {
      if (this.trade && !this.statusDone) this.statusDone = act({ type: 'done', done: true });
      return;
    }
    if (!this.trade) return;
    if (a.stage === 'declare') {
      if (!this.declared) {
        const side = this.trade.side === 'seller' && me.stock[a.good] <= 0 ? 'pass' : this.trade.side;
        act({ type: 'declare', side });
        act({ type: 'done', done: true });
        this.declared = true;
      }
      return;
    }

    // The walk.
    const w = a.walkers.find((x) => x.id === mind.me);
    if (!w || w.side === 'pass') return;
    if (this.startDelay > 0) {
      this.startDelay -= dt;
      return;
    }
    this.reactIn -= dt;
    if (this.reactIn <= 0 || this.target === null) {
      this.reactIn = this.rng.int(...mind.level.reactMs);
      this.aim(state, w);
    }
    this.steer(state, w, dt, act);
  }

  private reset(key: string): void {
    const p = this.brain.mind.persona;
    this.key = key;
    this.plan = null;
    this.pending = null;
    this.trade = null;
    this.declared = false;
    this.statusDone = false;
    this.startDelay = this.rng.int(...AI_HANDS.auction.startMs) * p.patience;
    this.reactIn = 0;
    this.gap = this.rng.next() * (AI_HANDS.auction.waitGap[1] - AI_HANDS.auction.waitGap[0]) + AI_HANDS.auction.waitGap[0];
    this.gap *= p.patience;
    this.jitter = 0;
    this.target = null;
    this.limit = null;
    this.dir = 0;
    this.doneFlag = false;
    this.startMoney = 0;
  }

  /** Picks where to stand, from what it sees on the board now. */
  private aim(state: GameState, w: Walker): void {
    const a = state.auction!;
    const good = a.good!;
    const plan = this.plan!;
    const trade = this.trade!;
    const me = state.players.find((p) => p.id === this.brain.mind.me)!;
    const range = Math.max(1, a.hi - a.lo);
    const gap = this.gap * range;
    this.jitter = (this.rng.next() * 2 - 1) * AI_HANDS.auction.targetJitter * range;
    const h = me.stock[good];
    const mine = Math.round(w.price);
    const others = a.walkers.filter((x) => x.id !== me.id);
    const money = (id: string) => state.players.find((p) => p.id === id)?.money ?? 0;
    const stock = (id: string) => state.players.find((p) => p.id === id)?.stock[good] ?? 0;
    if (this.startMoney === 0) this.startMoney = me.money;

    if (w.side === 'seller') {
      // Units past the table are beyond what the depot keeps: they spoil, so they are worth nothing.
      const floor = Math.ceil(plan.values.keep[h - 1] ?? 0);
      this.limit = floor;
      const finished = trade.side !== 'seller' || h <= trade.keep || !Number.isFinite(floor);
      const houses = Math.max(storeBuyLine(state) ?? 0, shipLine(state) ?? 0);
      const bids = others.filter((x) => x.side === 'buyer' && money(x.id) >= Math.max(1, Math.round(x.price))).map((x) => Math.round(x.price));
      const bestBid = Math.max(houses, ...bids, 0);
      if (finished) this.target = a.hi;
      else if (bestBid >= floor) this.target = bestBid;
      else {
        const rivals = others.filter((x) => x.side === 'seller' && stock(x.id) > 0).map((x) => Math.round(x.price));
        const lowest = Math.min(Infinity, ...rivals);
        if (lowest <= mine && lowest - 1 >= floor) this.target = Math.max(floor, lowest - 1 - Math.abs(this.jitter));
        else if (mine - bestBid <= gap) this.target = mine;
        else this.target = Math.max(floor, bestBid + gap + this.jitter);
      }
      this.doneFlag = finished || (this.target <= floor && a.deals.every((d) => d.seller !== me.id));
      return;
    }

    // Buyer.
    const spent = this.startMoney - me.money;
    const budgetLeft = Math.max(0, plan.budget - spent);
    const value = plan.values.buy[h] ?? 0;
    const essential = h < plan.values.block && (good === 'food' || good === 'energy');
    const cap = essential ? me.money : Math.min(me.money, budgetLeft);
    const ceiling = Math.floor(Math.min(value, cap));
    this.limit = ceiling;
    const finished = trade.side !== 'buyer' || h >= trade.upTo || ceiling < 1;
    const storeAsk = storeSellLine(state);
    const asks = others.filter((x) => x.side === 'seller' && stock(x.id) > 0).map((x) => Math.round(x.price));
    const bestAsk = Math.min(Infinity, storeAsk ?? Infinity, ...asks);
    if (finished) this.target = a.lo;
    else if (bestAsk <= ceiling) this.target = bestAsk;
    else {
      const rivals = others.filter((x) => x.side === 'buyer' && money(x.id) >= Math.max(1, Math.round(x.price))).map((x) => Math.round(x.price));
      const highest = Math.max(-Infinity, ...rivals);
      if (highest >= mine && highest + 1 <= ceiling) this.target = Math.min(ceiling, highest + 1 + Math.abs(this.jitter));
      else if (bestAsk - mine <= gap) this.target = mine;
      else this.target = Math.min(ceiling, (Number.isFinite(bestAsk) ? bestAsk : ceiling) - gap + this.jitter);
    }
    this.target = Math.max(0, this.target);
    this.doneFlag = finished || (this.target >= ceiling && a.deals.every((d) => d.buyer !== me.id));
  }

  /** Holds up or down until the rounded price is on the target, a step at most past it, so it never wobbles. */
  private steer(state: GameState, w: Walker, dt: number, act: Act): void {
    const a = state.auction!;
    const target = this.target!;
    const step = (a.speed * dt) / 1000;
    const p = Math.round(w.price);
    const dir: -1 | 0 | 1 =
      w.side === 'seller' ? (p > target ? -1 : w.price < target - step ? 1 : 0) : p < target ? 1 : w.price > target + step ? -1 : 0;
    if (dir !== this.dir || w.dir !== dir) {
      this.dir = dir;
      act({ type: 'walk', dir });
    }
    const done = this.doneFlag && dir === 0;
    if (done !== a.done.includes(w.id)) act({ type: 'done', done });
  }
}
