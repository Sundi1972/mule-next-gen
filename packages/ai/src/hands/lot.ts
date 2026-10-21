import { AI_HANDS, lotLeader, observe, type GameState, type Listing, type Rng, type Walker } from '@mule/engine';
import type { Act } from '../actions.js';
import { muleValue, plotValue } from '../strategist.js';
import { cashReserve, type Mind } from '../value.js';

/**
 * The land auction hand: bids on one lot at a time up to what the lot is
 * worth to the seat, keeping its cash reserve back (spec RULE-6). It holds
 * the seat's mind, not its brain, so it can't reach a decider.
 */
export class LotHand {
  private key = '';
  /** The most it bids on the lot that is up: max(0, min(money − cashReserve, value)). */
  private limit = 0;
  private introDelay = 0;
  private startDelay = 0;
  private reactIn = 0;
  /** The rounded bid it walks up to, or null to stand still. */
  private target: number | null = null;
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
      this.aim(state, a.lot);
    }
    this.steer(w, (a.speed * dt) / 1000, act, a.done.includes(me));
  }

  private reset(state: GameState, key: string, lot: Listing): void {
    const obs = observe(state, this.mind.me);
    const money = obs.players.find((p) => p.id === this.mind.me)!.money;
    const value = lot.item.kind === 'plot' ? plotValue(obs, this.mind, lot.item.y * obs.width + lot.item.x) : muleValue(obs, this.mind);
    this.key = key;
    this.limit = Math.max(0, Math.min(money - cashReserve(obs, this.mind), value));
    this.introDelay = this.rng.int(...AI_HANDS.lot.introMs);
    this.startDelay = this.rng.int(...AI_HANDS.lot.startMs) * this.mind.persona.patience;
    this.reactIn = 0;
    this.target = null;
    this.wantsDone = false;
  }

  /** RULE-6, first match wins. Only a buyer gets here: anyone else pressed Done in tick. */
  private aim(state: GameState, lot: Listing): void {
    const limit = this.limit;
    const leader = lotLeader(state);
    // With no bid at the minimum yet, the bid to beat is one under it.
    const toBeat = leader?.bid ?? lot.minimum - 1;
    if (limit < lot.minimum) this.standStill(true);
    else if (leader?.id === this.mind.me) this.standStill(false);
    else if (toBeat + 1 <= limit) {
      this.target = toBeat + 1;
      this.wantsDone = false;
    } else this.standStill(true);
  }

  private standStill(done: boolean): void {
    this.target = null;
    this.wantsDone = done;
  }

  /** Holds up until the rounded bid reaches the target. A step that would round past the limit is never taken: it stops and is Done until it next re-aims. */
  private steer(w: Walker, step: number, act: Act, isDone: boolean): void {
    const bid = Math.round(w.price);
    let dir: 0 | 1 = 0;
    if (this.target !== null && bid < this.target) {
      if (Math.round(w.price + step) <= this.limit) dir = 1;
      else this.standStill(true);
    }
    if (w.dir !== dir) act({ type: 'walk', dir });
    const done = this.wantsDone && dir === 0;
    if (done !== isDone) act({ type: 'done', done });
  }
}
