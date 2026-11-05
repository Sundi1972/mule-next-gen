import { AI_HANDS, lineOf, MS_PER_SECOND, observe, SHIP_ID, shipLine, shipPrice, storeBuyLine, storeSellLine, type GameState, type Good, type GoodPlay, type Rng, type Walker } from '@mule/engine';
import type { Act } from '../actions.js';
import type { Brain, Pending } from '../brain.js';
import { goodPlan, tradeDecision, type GoodPlan, type TradeAction } from '../strategist.js';
import { situation } from '../summary.js';
import { beforeTax } from '../value.js';

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
 *
 * At the store's or the ship's line nothing trades until the seat says how
 * many (A-6): standing there, it chooses the units it still wants at that
 * price, and stands still while they move; then it chooses again, or walks off.
 *
 * On the playbook path the good's play replaces the decider's pick and bounds the same walk: walkAway bounds the
 * limit, at the line too; start and concedeCrPerS bound the target; vsRival and per say whom it overtakes. See RULE-10.
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

/** The good's play on the playbook path, asked once a good at its status screen; null plays today's ask. */
export type GoodPlaySource = (state: GameState, good: Good) => GoodPlay | null;

type Side = 'buyer' | 'seller';

/** The TradeAction a play stands for: a seller never keeps under the Food or Energy it needs. */
function tradeOf(play: GoodPlay, plan: GoodPlan): TradeAction {
  if (play.role === 'seller') return { side: 'seller', keep: Math.max(play.hold, plan.values.floorUnits) };
  if (play.role === 'buyer') return { side: 'buyer', upTo: play.hold };
  return { side: 'pass' };
}

export class AuctionHand {
  private key = '';
  private plan: GoodPlan | null = null;
  private pending: Pending<TradeAction> | null = null;
  private play: GoodPlay | null = null;
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
  /** The line, price, stock and money it last chose at: a refused or finished choice isn't asked again until one changes. */
  private lineTried: string | null = null;

  constructor(
    private readonly brain: Brain,
    private readonly rng: Rng,
    private readonly playOf: GoodPlaySource | null = null,
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
    // The close stage after a good (A-5) is the receipt on screen: nothing to decide, walk or press.
    if (state.phase !== 'auction' || !a || !a.good || a.stage === 'over' || a.stage === 'close') return;
    const mind = this.brain.mind;
    const key = `${state.month}:${a.good}`;
    if (key !== this.key) this.reset(key);
    const me = state.players.find((p) => p.id === mind.me)!;

    if (!this.plan) {
      const obs = observe(state, mind.me);
      this.plan = goodPlan(obs, mind, a.good);
      this.play = this.playOf?.(state, a.good) ?? null;
      if (this.play) this.trade = tradeOf(this.play, this.plan);
      else this.pending = this.brain.ask('trade', tradeDecision(obs, mind, this.plan), obs, AI_HANDS.auction.decideWaitMs, a.good, situation(obs, mind));
    }
    if (!this.trade && this.pending) {
      const settled = a.stage === 'status' ? this.brain.resolve(this.pending, dt, state) : this.brain.resolveNow(this.pending, state);
      if (settled) this.trade = settled.action;
    }

    // Sides are picked on the status screen; a decision that only settles once the walk has begun is declared there.
    if (this.trade && !this.declared) {
      const side = this.trade.side === 'seller' && me.stock[a.good] <= 0 ? 'pass' : this.trade.side;
      act({ type: 'declare', side });
      this.declared = true;
    }
    if (a.stage === 'status') {
      if (this.declared && !this.statusDone) this.statusDone = act({ type: 'done', done: true });
      return;
    }
    if (!this.trade) return;

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
    this.chooseAtLine(state, w, act);
  }

  private reset(key: string): void {
    const p = this.brain.mind.persona;
    this.key = key;
    this.plan = null;
    this.pending = null;
    this.play = null;
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
    this.lineTried = null;
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
    this.jitter = (this.rng.next() * 2 - 1) * AI_HANDS.auction.targetJitter * range; // literal-ok: maps the rng's [0, 1) onto [-1, 1)
    const h = me.stock[good];
    const mine = Math.round(w.price);
    const others = a.walkers.filter((x) => x.id !== me.id);
    const money = (id: string) => state.players.find((p) => p.id === id)?.money ?? 0;
    const stock = (id: string) => state.players.find((p) => p.id === id)?.stock[good] ?? 0;
    if (this.startMoney === 0) this.startMoney = me.money;
    if (this.play?.bluff) {
      this.target = w.side === 'seller' ? a.hi : a.lo;
      this.doneFlag = true;
      return;
    }
    const pricesOf = (rivals: Walker[], stance: GoodPlay['vsRival']) => rivals.filter((x) => this.stanceTo(x.id) === stance).map((x) => Math.round(x.price));

    if (w.side === 'seller') {
      // Units past the table are beyond what the depot keeps: they spoil, so they are worth nothing.
      // Unit values are what the seat keeps after the sales tax; the board shows the price before it.
      const floor = this.bounded('seller', Math.ceil(beforeTax(state, plan.values.keep[h - 1] ?? 0)));
      this.limit = floor;
      const finished = trade.side !== 'seller' || h <= trade.keep || !Number.isFinite(floor);
      const houses = Math.max(storeBuyLine(state) ?? 0, shipLine(state) ?? 0);
      const bids = others.filter((x) => x.side === 'buyer' && money(x.id) >= Math.max(1, Math.round(x.price))).map((x) => Math.round(x.price));
      const bestBid = Math.max(houses, ...bids, 0);
      if (finished) this.target = a.hi;
      else if (bestBid >= floor) this.target = bestBid;
      else {
        const rivals = others.filter((x) => x.side === 'seller' && stock(x.id) > 0);
        const lowest = Math.min(Infinity, ...pricesOf(rivals, 'undercut1'));
        const yielded = Math.min(Infinity, ...pricesOf(rivals, 'yield'));
        if (lowest <= mine && lowest - 1 >= floor) this.target = Math.max(floor, lowest - 1 - Math.abs(this.jitter));
        else if (yielded <= mine) this.target = Math.max(floor, yielded + 1);
        else if (mine - bestBid <= gap) this.target = mine;
        else this.target = Math.max(floor, bestBid + gap + this.jitter);
      }
      if (!finished) this.target = this.scheduled('seller', this.target, a.elapsed);
      this.doneFlag = finished || (this.target <= floor && a.deals.every((d) => d.seller !== me.id));
      return;
    }

    // Buyer.
    const spent = this.startMoney - me.money;
    const budgetLeft = Math.max(0, plan.budget - spent);
    const value = plan.values.buy[h] ?? 0;
    const essential = h < plan.values.block && (good === 'food' || good === 'energy');
    const cap = essential ? me.money : Math.min(me.money, budgetLeft);
    const ceiling = this.bounded('buyer', Math.floor(Math.min(value, cap)));
    this.limit = ceiling;
    const finished = trade.side !== 'buyer' || h >= trade.upTo || ceiling < 1;
    const storeAsk = storeSellLine(state);
    const asks = others.filter((x) => x.side === 'seller' && stock(x.id) > 0).map((x) => Math.round(x.price));
    const bestAsk = Math.min(Infinity, storeAsk ?? Infinity, ...asks);
    if (finished) this.target = a.lo;
    else if (bestAsk <= ceiling) this.target = bestAsk;
    else {
      const rivals = others.filter((x) => x.side === 'buyer' && money(x.id) >= Math.max(1, Math.round(x.price)));
      const highest = Math.max(-Infinity, ...pricesOf(rivals, 'undercut1'));
      const yielded = Math.max(-Infinity, ...pricesOf(rivals, 'yield'));
      if (highest >= mine && highest + 1 <= ceiling) this.target = Math.min(ceiling, highest + 1 + Math.abs(this.jitter));
      else if (yielded >= mine) this.target = Math.min(ceiling, yielded - 1);
      else if (bestAsk - mine <= gap) this.target = mine;
      else this.target = Math.min(ceiling, (Number.isFinite(bestAsk) ? bestAsk : ceiling) - gap + this.jitter);
    }
    if (!finished) this.target = this.scheduled('buyer', this.target, a.elapsed);
    this.target = Math.max(0, this.target);
    this.doneFlag = finished || (this.target >= ceiling && a.deals.every((d) => d.buyer !== me.id));
  }

  /** The play's limit: a buyer pays at most its walkAway, a seller asks at least it. */
  private bounded(side: Side, today: number): number {
    if (!this.play) return today;
    return side === 'buyer' ? Math.min(today, this.play.walkAway) : Math.max(today, this.play.walkAway);
  }

  /** The play's schedule: from start, conceding concedeCrPerS a second of the walk, never past walkAway. */
  private scheduled(side: Side, target: number, elapsedMs: number): number {
    const p = this.play;
    if (!p) return target;
    const conceded = (p.concedeCrPerS * elapsedMs) / MS_PER_SECOND;
    return side === 'buyer' ? Math.min(target, p.walkAway, p.start + conceded) : Math.max(target, p.walkAway, p.start - conceded);
  }

  /** How it meets this rival on its side: today's hand always overtakes by one. */
  private stanceTo(rival: string): GoodPlay['vsRival'] {
    return this.play ? (this.play.per?.[rival] ?? this.play.vsRival) : 'undercut1';
  }

  /** Standing at a house's line with no choice running, it says how many units it still wants there. */
  private chooseAtLine(state: GameState, w: Walker, act: Act): void {
    const line = lineOf(state, w.id);
    if (!line || this.dir !== 0 || w.dir !== 0 || running(w)) return;
    const me = state.players.find((p) => p.id === this.brain.mind.me)!;
    const units = this.unitsAt(state, w.side, line);
    const key = `${line.house}:${line.price}:${me.stock[state.auction!.good!]}:${me.money}`;
    if (units < 1 || key === this.lineTried) return;
    this.lineTried = key;
    act({ type: 'lineTrade', units });
  }

  /**
   * The units it would trade one by one at this line, by the same limits `aim` walks to: a buyer's value and purse, a
   * seller's floor, each bounded by the play's walkAway. The ship pays a little less for each further unit, so each is
   * priced as the ship will pay it.
   */
  private unitsAt(state: GameState, side: Walker['side'], line: { house: string; price: number }): number {
    if (this.play?.bluff) return 0;
    const price = line.price;
    const good = state.auction!.good!;
    const plan = this.plan!;
    const trade = this.trade!;
    const me = state.players.find((p) => p.id === this.brain.mind.me)!;
    let units = 0;
    if (side === 'seller' && trade.side === 'seller') {
      const bought = state.ship.bought[good] ?? 0;
      const pays = (k: number) => (line.house === SHIP_ID ? shipPrice({ ...state, ship: { ...state.ship, bought: { ...state.ship.bought, [good]: bought + k } } }, good) : price);
      for (let h = me.stock[good]; h > trade.keep && h > 0; h--, units++) {
        const floor = this.bounded('seller', Math.ceil(beforeTax(state, plan.values.keep[h - 1] ?? 0)));
        const unit = pays(units);
        if (!Number.isFinite(floor) || unit === null || floor > unit) break;
      }
      return units;
    }
    if (side !== 'buyer' || trade.side !== 'buyer') return 0;
    for (let h = me.stock[good], money = me.money; h < trade.upTo; h++, units++, money -= price) {
      const budgetLeft = Math.max(0, plan.budget - (this.startMoney - money));
      const essential = h < plan.values.block && (good === 'food' || good === 'energy');
      const cap = essential ? money : Math.min(money, budgetLeft);
      if (this.bounded('buyer', Math.floor(Math.min(plan.values.buy[h] ?? 0, cap))) < price) break;
    }
    return units;
  }

  /** Holds up or down until the rounded price is on the target, a step at most past it, so it never wobbles. */
  private steer(state: GameState, w: Walker, dt: number, act: Act): void {
    const a = state.auction!;
    // While its choice at a line runs it stands still: walking would stop the units it chose.
    if (running(w)) return;
    const target = this.target!;
    const step = (a.speed * dt) / MS_PER_SECOND;
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

/** A choice made at a house's line that still has units to move. */
const running = (w: Walker) => w.order !== undefined && w.order.traded < w.order.units;
