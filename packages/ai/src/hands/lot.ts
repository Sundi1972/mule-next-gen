import { lotLeader, LOTS, observe, WALK, type GameState, type LandAuction, type Listing, type Rng, type Walker } from '@mule/engine';
import type { Act } from '../actions.js';
import { muleValue, plotRoom, plotValue } from '../strategist.js';
import { cashReserve, type Mind } from '../value.js';

/** Where an overtake aims: past the leader by a share of the gap to the limit, rounded down, so never past the limit (RULE-6). */
export function overtakeTarget(limit: number, leaderBid: number, share: number): number {
  const overshoot = Math.floor(share * (limit - leaderBid - 1));
  return Math.min(limit, leaderBid + 1 + overshoot);
}

/**
 * The land auction hand: bids on one lot at a time up to what the lot is
 * worth to the seat, keeping its cash reserve back (spec RULE-6). It holds
 * the seat's mind, not its brain, so it can't reach a decider.
 */
export class LotHand {
  private key = '';
  /** The most it bids on the lot that is up: max(0, min(money − cashReserve, value)), and for a plot within plotRoom. */
  private limit = 0;
  private introDelay = 0;
  private startDelay = 0;
  private reactIn = 0;
  /** The rounded bid it walks up to, or null to stand still. */
  private target: number | null = null;
  /** The leader's bid its target was set to beat, so a re-aim keeps the target while that bid stands. */
  private beating: number | null = null;
  private wantsDone = false;

  constructor(
    readonly mind: Mind,
    private readonly rng: Rng,
  ) {}

  /** Call before stepLandAuction with the same dt: it stops short of a step that would carry its bid past the limit. */
  tick(state: GameState, dt: number, act: Act): void {
    const a = state.landAuction;
    if (state.phase !== 'landAuction' || !a?.lot || (a.stage !== 'intro' && a.stage !== 'walk')) return;
    const me = this.mind.me;
    const key = `${state.month}:${a.number}:${a.lot.id}`;
    if (key !== this.key) this.reset(state, key, a.lot);

    if (a.stage === 'intro') {
      this.introDelay -= dt;
      if (this.introDelay <= 0 && !a.done.includes(me)) act({ type: 'done', done: true });
      return;
    }

    const w = a.walkers.find((x) => x.id === me);
    if (!w || w.side !== 'buyer') {
      if (!a.done.includes(me)) act({ type: 'done', done: true });
      return;
    }
    if (this.startDelay > 0) {
      this.startDelay -= dt;
      return;
    }
    this.reactIn -= dt;
    if (this.reactIn <= 0) {
      this.reactIn = this.rng.int(...this.mind.level.reactMs);
      this.aim(state, a, w);
    }
    this.steer(w, a.speed, dt, act, a.done.includes(me));
  }

  private reset(state: GameState, key: string, lot: Listing): void {
    const obs = observe(state, this.mind.me);
    const money = obs.players.find((p) => p.id === this.mind.me)!.money;
    const value = lot.item.kind === 'plot' ? plotValue(obs, this.mind, lot.item.y * obs.width + lot.item.x) : muleValue(obs, this.mind);
    this.key = key;
    const room = lot.item.kind === 'plot' ? plotRoom(obs, this.mind) : Infinity;
    this.limit = Math.max(0, Math.min(money - cashReserve(obs, this.mind), value, room));
    this.introDelay = this.rng.int(...LOTS.aiIntroMs);
    this.startDelay = this.rng.int(...LOTS.aiStartMs) * this.mind.persona.patience;
    this.reactIn = 0;
    this.target = null;
    this.beating = null;
    this.wantsDone = false;
  }

  /** RULE-6, first match wins. Only a buyer gets here: anyone else pressed Done in tick. */
  private aim(state: GameState, a: LandAuction, w: Walker): void {
    const lot = a.lot!;
    const leader = lotLeader(state);
    const othersDone = a.walkers.every((x) => x.id === w.id || x.side !== 'buyer' || a.done.includes(x.id));
    if (this.limit < lot.minimum) this.standStill(true);
    else if (leader?.id === w.id && othersDone) this.standStill(true);
    // Leading part-way through an overtake: it finishes the walk to its target, then stands.
    else if (leader?.id === w.id) {
      if (this.target === null || Math.round(w.price) >= this.target) this.standStill(false);
    } else if (!leader) this.walkTo(lot.minimum, null);
    else if (leader.bid + 1 <= this.limit) {
      if (this.beating !== leader.bid) this.walkTo(overtakeTarget(this.limit, leader.bid, this.overshootShare()), leader.bid);
    } else this.standStill(true);
  }

  private overshootShare(): number {
    const [lo, hi] = LOTS.aiOvershoot;
    return lo + this.rng.next() * (hi - lo);
  }

  private walkTo(target: number, beating: number | null): void {
    this.target = target;
    this.beating = beating;
    this.wantsDone = false;
  }

  private standStill(done: boolean): void {
    this.target = null;
    this.beating = null;
    this.wantsDone = done;
  }

  /**
   * Holds up until the rounded bid reaches the target. A step that would
   * round past the limit is never taken: it waits for a shorter tick, and
   * gives up (Done until it next re-aims) only if a normal tick's step would
   * pass the limit too.
   */
  private steer(w: Walker, speed: number, dt: number, act: Act, isDone: boolean): void {
    const bid = Math.round(w.price);
    const fits = (ms: number) => Math.round(w.price + (speed * ms) / 1000) <= this.limit;
    let dir: 0 | 1 = 0;
    if (this.target !== null && bid < this.target) {
      if (fits(dt)) dir = 1;
      else if (!fits(WALK.tickMs)) this.standStill(true);
    }
    if (w.dir !== dir) act({ type: 'walk', dir });
    const done = this.wantsDone && dir === 0;
    if (done !== isDone) act({ type: 'done', done });
  }
}
