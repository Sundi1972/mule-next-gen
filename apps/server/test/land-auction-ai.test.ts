import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  advancePhase,
  createGame,
  createRng,
  list,
  LOTS,
  MULE,
  lotDone,
  lotLeader,
  mulePriceFor,
  observe,
  RuleError,
  setLotWalk,
  stepLandAuction,
  WALK,
  type AiPersonaId,
  type GameState,
  type Listing,
  type LotResult,
  type Tile,
} from '@mule/engine';
import { AiSeat, Brain, cashReserve, LotHand, muleValue, overtakeTarget, plotRoom, plotValue, type Act, type Mind } from '@mule/ai';
import type { MuleView } from '@mule/protocol';
import { GRANT_TICK_MS, MuleGame, PHASE_MS } from '../src/mule-game.js';
import { fakeContext } from './fake-context.js';

const SELLER = 'h';
const AIS: { id: string; name: string; persona: AiPersonaId }[] = [
  { id: 'a1', name: 'The Baron', persona: 'aggressive' },
  { id: 'a2', name: 'The Gambler', persona: 'trader' },
  { id: 'a3', name: 'The Accountant', persona: 'cautious' },
];
/** Uneven ticks, the stall clamp's longest among them, so a step can't happen to land on a limit. */
const DTS = [WALK.tickMs, WALK.tickMs * 3, 37];
const PLOT_MIN = 200;
const MULE_MIN = 400;
const MULE_LOT_MIN = 150;
const SEEDS = [3, 7, 11, 19, 23, 42];
const FLUSH = 3_000;
const SHORT = { a1: 300, a2: 340, a3: 380 };

/** What the lot is worth to the seat and the limit RULE-6 sets, worked out here from the seat's own observation. */
function worthOf(state: GameState, mind: Mind, lot: Listing): Worth {
  const obs = observe(state, mind.me);
  const money = obs.players.find((p) => p.id === mind.me)!.money;
  const value = lot.item.kind === 'plot' ? plotValue(obs, mind, lot.item.y * obs.width + lot.item.x) : muleValue(obs, mind);
  const kept = money - cashReserve(obs, mind);
  const room = lot.item.kind === 'plot' ? plotRoom(obs, mind) : Infinity;
  return { value, kept, room, limit: Math.max(0, Math.min(kept, value, room)) };
}

/** The three bounds on a seat's limit for a lot: its worth, money − cashReserve, and for a plot plotRoom (∞ for a MULE). */
interface Worth {
  value: number;
  kept: number;
  room: number;
  limit: number;
}

/**
 * Brix and three AI seats in month 1's planning. Brix owns a plot and a
 * Food MULE on another; each AI owns one idle plot, so a MULE is worth
 * something to it. Brix lists both, and the land auction opens.
 */
function landAuction(seed: number, opts: { money?: Record<string, number>; muleMin?: number; keepBack?: boolean; bare?: string[]; glut?: boolean } = {}) {
  const state = createGame({ seed, players: [{ id: SELLER, name: 'Brix', isAi: false }, ...AIS.map(({ id, name }) => ({ id, name, isAi: true }))] });
  const free = state.tiles.filter((t) => t.terrain !== 'store' && t.owner === null);
  const own = (tile: Tile, owner: string, outfit: Tile['outfit'] = null) => Object.assign(tile, { terrain: 'plains', owner, outfit, runMonths: outfit ? 2 : 0 });
  const plot = own(free[0]!, SELLER);
  const mule = own(free[1]!, SELLER, 'food');
  // A bare AI holds no idle plot and no Food, Water or Energy: plotRoom keeps back one MULE, not two, and its
  // reserve covers next month's shortfall, so the reserve is its lower bound.
  AIS.forEach(({ id }, i) => opts.bare?.includes(id) || own(free[2 + i]!, id));
  for (const p of state.players) if (opts.bare?.includes(p.id)) Object.assign(p.stock, { food: 0, water: 0, energy: 0 });
  // A glut puts MULEs at their lowest price, under month 1's reserves.
  if (opts.glut) state.store.muleFactor = MULE.minFactor;
  // With keepBack an AI given money also holds the MULEs plotRoom keeps back (for each idle plot and the plot it
  // buys), so its plotRoom is the money given.
  const idle = (id: string) => (opts.bare?.includes(id) ? 0 : 1);
  const keep = (id: string) => (opts.keepBack && opts.money?.[id] !== undefined ? (idle(id) + 1) * mulePriceFor(state, id) : 0);
  for (const p of state.players) p.money = (opts.money?.[p.id] ?? p.money) + (p.isAi ? keep(p.id) : 0);
  list(state, SELLER, { item: { kind: 'plot', x: plot.x, y: plot.y }, minimum: PLOT_MIN, unsold: 'keep' });
  list(state, SELLER, { item: { kind: 'mule', x: mule.x, y: mule.y }, minimum: opts.muleMin ?? MULE_MIN, unsold: 'keep' });
  while (state.phase !== 'landAuction') advancePhase(state);
  const seats = AIS.map((a, i) => new AiSeat({ id: a.id, name: a.name, persona: a.persona, level: 'trader', seed: seed * 31 + i }));
  const hands = seats.map((s, i) => new LotHand(s.mind, createRng(seed * 131 + i)));
  return { state, seats, hands, plot };
}

/** The AI's moves through the same engine calls the server makes for a phone. */
function actFor(state: GameState, id: string): Act {
  return (action) => {
    try {
      if (action.type === 'walk') setLotWalk(state, id, action.dir);
      else if (action.type === 'done') lotDone(state, id, action.done);
      return true;
    } catch (err) {
      if (err instanceof RuleError) return false;
      throw err;
    }
  };
}

interface Sample extends Worth {
  lot: Listing;
  id: string;
  lo: number;
  price: number;
  dir: -1 | 0 | 1;
  done: boolean;
  /** The longest step one tick can take on this board: the hand stops short of a step that would round past its limit. */
  longestStep: number;
}

/** A lot's walk at its bell: how long it ran and what came of it. */
interface Bell {
  lot: Listing;
  walkMs: number;
  result: LotResult;
}

/** The bid a hand is walking to. Private to the hand; the leading rule is a promise about it. */
const targetOf = (hand: LotHand) => (hand as unknown as { target: number | null }).target;

/** Runs the land auction to its end, the hands ticking before each step with the same dt. Every AI walker on every walk tick, and every bell. */
function play(state: GameState, hands: LotHand[], dts = DTS): { samples: Sample[]; bells: Bell[] } {
  const samples: Sample[] = [];
  const bells: Bell[] = [];
  const worth = new Map<string, Worth>();
  for (let t = 0; state.phase === 'landAuction' && t < 5_000; t++) {
    const a = state.landAuction!;
    if (a.stage === 'over') break;
    if (a.lot) for (const h of hands) if (!worth.has(`${a.lot.id}:${h.mind.me}`)) worth.set(`${a.lot.id}:${h.mind.me}`, worthOf(state, h.mind, a.lot));
    const dt = dts[t % dts.length]!;
    const leader = a.stage === 'walk' ? hands.find((h) => h.mind.me === lotLeader(state)?.id) : undefined;
    const walker = leader && a.walkers.find((w) => w.id === leader.mind.me)!;
    const before = leader && { target: targetOf(leader), bid: Math.round(walker!.price) };
    for (const h of hands) h.tick(state, dt, actFor(state, h.mind.me));
    // Leading (RULE-6), an AI may finish walking to the target it set before it took the lead, but never raises it, and stands once there.
    if (leader && before) {
      const after = targetOf(leader);
      if (after !== null) expect(after, `${leader.mind.me} leads`).toBeLessThanOrEqual(before.target ?? -Infinity);
      if (before.target === null || before.bid >= before.target) expect(walker!.dir, `${leader.mind.me} leads at its target`).toBe(0);
    }
    const lot = a.lot!;
    const result = stepLandAuction(state, dt);
    if (result) bells.push({ lot, walkMs: a.elapsed, result });
    if (a.stage !== 'walk' && a.stage !== 'result') continue;
    for (const w of a.walkers) {
      if (w.id === SELLER || w.side !== 'buyer') continue;
      samples.push({ lot, id: w.id, ...worth.get(`${lot.id}:${w.id}`)!, lo: a.lo, price: Math.round(w.price), dir: w.dir, done: a.done.includes(w.id), longestStep: (a.speed * Math.max(...dts)) / 1000 });
    }
  }
  return { samples, bells };
}

/** Each AI's highest bid on each lot. */
function bestBids(samples: Sample[]): Sample[] {
  const best = new Map<string, Sample>();
  for (const s of samples) if (s.price > (best.get(`${s.lot.id}:${s.id}`)?.price ?? -1)) best.set(`${s.lot.id}:${s.id}`, s);
  return [...best.values()];
}

const flushMoney = () => Object.fromEntries(AIS.map((a) => [a.id, FLUSH]));

/** A MULE minimum just under the lowest MULE value at a flush table, so every AI bids and its value is the cap. */
function flushMuleMin(seed: number): number {
  const { state, seats } = landAuction(seed, { money: flushMoney() });
  const mule = state.listings.find((l) => l.item.kind === 'mule')!;
  return Math.min(...seats.map((s) => worthOf(state, s.mind, mule).value)) - 20;
}

describe('AI seats at the land auction', () => {
  it('B-AC-7: an AI never bids above min(money − cashReserve, value, and for a plot plotRoom)', () => {
    let reserveCapped = 0;
    let roomCapped = 0;
    let valueCapped = 0;
    for (const seed of SEEDS) {
      // Short of money, the plot's bidding stops at money − reserve for a3, which holds no idle plot, and at plotRoom
      // for the others, which keep back a MULE for their idle plot too.
      const short = landAuction(seed, { money: SHORT, keepBack: true, bare: ['a3'], glut: true });
      // Flush, with a MULE minimum just under every AI's MULE value, the MULE's bidding stops at its value.
      const flush = landAuction(seed, { money: flushMoney(), muleMin: flushMuleMin(seed) });
      for (const [table, kind] of [
        [short, 'plot'],
        [flush, 'mule'],
      ] as const) {
        const { samples } = play(table.state, table.hands);
        for (const s of samples) expect(s.price, `seed ${seed}, ${s.id} on ${s.lot.id}`).toBeLessThanOrEqual(Math.max(s.limit, s.lo));
        const pressed = bestBids(samples).filter((s) => s.lot.item.kind === kind && s.price >= s.lot.minimum && s.limit - s.price <= s.longestStep);
        if (kind === 'plot' && pressed.some((s) => s.limit === s.kept && s.kept < Math.min(s.value, s.room))) reserveCapped++;
        if (kind === 'plot' && pressed.some((s) => s.limit === s.room && s.room < Math.min(s.value, s.kept))) roomCapped++;
        if (kind === 'mule' && pressed.some((s) => s.limit === s.value)) valueCapped++;
      }
    }
    // Two long ticks, then a short one: a leader that stood through a long tick may finish its walk on the short one.
    for (const seed of SEEDS)
      for (const money of [SHORT, {}, flushMoney()]) {
        const { state, hands } = landAuction(seed, { money, keepBack: money === SHORT });
        for (const s of play(state, hands, [300, 300, 37]).samples) expect(s.price, `seed ${seed}, ${s.id} on ${s.lot.id}`).toBeLessThanOrEqual(Math.max(s.limit, s.lo));
      }
    expect(reserveCapped, 'in some short run an AI bid a plot up to money − reserve').toBeGreaterThan(0);
    expect(roomCapped, 'in some short run an AI bid a plot up to plotRoom').toBeGreaterThan(0);
    expect(valueCapped, 'in every flush run some AI bid a MULE up to its value').toBe(SEEDS.length);
    // It replays thirty auctions tick by tick: half a second here, but over the 5 s default on CI's shared runner while every package's suite runs at once.
  }, 30_000);

  it('B-AC-7: an AI whose money − reserve is under the minimum never moves, and presses Done', () => {
    for (const seed of [3, 7, 11]) {
      // a3 (cautious, the largest reserve) holds no idle plot, so plotRoom keeps back one MULE and the reserve, the
      // larger, is what stops it.
      const probe = landAuction(seed, { bare: ['a3'], glut: true });
      const mind = probe.seats[2]!.mind;
      const reserve = cashReserve(observe(probe.state, mind.me), mind);
      const mule = mulePriceFor(probe.state, 'a3');
      expect(reserve, `seed ${seed}`).toBeGreaterThan(mule);
      // A buyer by the engine's rule (money ≥ minimum) with a MULE to spare, but short once it keeps its reserve.
      const money = PLOT_MIN + mule + Math.floor((reserve - mule) / 2);
      const { state, hands } = landAuction(seed, { money: { a3: money }, bare: ['a3'], glut: true });
      const mine = play(state, hands).samples.filter((s) => s.id === 'a3' && s.lot.item.kind === 'plot');
      expect(mine.length).toBeGreaterThan(0);
      for (const s of mine) {
        expect(s.room).toBeGreaterThanOrEqual(PLOT_MIN);
        expect(s.limit).toBeLessThan(PLOT_MIN);
        expect(s.price, `seed ${seed}`).toBe(s.lo);
        expect(s.dir).toBe(0);
      }
      expect(mine.some((s) => s.done)).toBe(true);
    }
  });

  it('B-AC-7: a lone AI buyer opens at the minimum and, leading, stands still: it wins within one step of it', () => {
    for (const seed of SEEDS) {
      // The others can't pay the minimum, so they sit both lots out.
      const { state, hands, plot } = landAuction(seed, { money: { a1: 100, a3: 100 } });
      const longestStep = (state.landAuction!.speed * Math.max(...DTS)) / 1000;
      const { bells } = play(state, hands);
      const sale = bells.find((b) => b.lot.item.kind === 'plot')!.result;
      expect(sale).toMatchObject({ kind: 'sold', buyer: 'a2' });
      expect(plot.owner).toBe('a2');
      if (sale.kind === 'sold') expect(sale.price - PLOT_MIN, `seed ${seed}`).toBeLessThanOrEqual(longestStep);
    }
  });

  it('B-AC-7: with only AI buyers, an AI-led lot rings its bell well before LOTS.walkMs once the others are done (AM-4)', () => {
    let sold = 0;
    for (const seed of SEEDS) {
      // Limits in reach of the clock, so the bidding can settle and the others give up.
      const { state, hands } = landAuction(seed, { money: SHORT, keepBack: true });
      for (const bell of play(state, hands).bells) {
        if (bell.result.kind !== 'sold') continue;
        if (bell.lot.item.kind === 'plot') sold++;
        expect(bell.walkMs, `seed ${seed}, ${bell.lot.id}`).toBeLessThan(LOTS.walkMs * 0.75);
      }
    }
    expect(sold, "the plot sold in every seed").toBe(SEEDS.length);
  });

  it('B-AC-7: an overtake aims at min(limit, leaderBid + 1 + overshoot), never past the limit (AM-4): 504/370/0.1 → 384, 372/370/0.5 → 371', () => {
    expect(overtakeTarget(504, 370, 0.1)).toBe(384);
    expect(overtakeTarget(372, 370, 0.5)).toBe(371);
    for (const limit of [250, 371, 372, 400, 504, 999])
      for (const leaderBid of [200, 250, 369, 370, 371])
        for (const share of [0, LOTS.aiOvershoot[0], 0.5, LOTS.aiOvershoot[1], 1]) {
          if (leaderBid + 1 > limit) continue;
          const target = overtakeTarget(limit, leaderBid, share);
          expect(target, `${limit}/${leaderBid}/${share}`).toBeLessThanOrEqual(limit);
          expect(target).toBeGreaterThan(leaderBid);
          expect(Number.isInteger(target)).toBe(true);
        }
  });

  it('B-AC-7: against a bid one under its limit an AI ends at exactly its limit; against a bid at its limit it presses Done and never moves', () => {
    const SMALL = 5;
    for (const gap of [1, 0]) {
      // a1 bids by hand; a3 can't pay the minimum; a2 is the AI, short enough that its limit is in reach.
      const { state, hands, seats } = landAuction(7, { money: { a1: FLUSH, a2: 360, a3: 100 }, keepBack: true });
      const ai = hands[1]!;
      const { limit } = worthOf(state, seats[1]!.mind, state.listings[0]!);
      const a = state.landAuction!;
      const price = (id: string) => Math.round(a.walkers.find((w) => w.id === id)!.price);
      lotDone(state, 'a1');
      while (a.stage === 'intro') {
        ai.tick(state, SMALL, actFor(state, 'a2'));
        stepLandAuction(state, SMALL);
      }
      setLotWalk(state, 'a1', 1);
      while (price('a1') < limit - gap) stepLandAuction(state, SMALL);
      setLotWalk(state, 'a1', 0);
      lotDone(state, 'a1');
      expect(price('a1')).toBe(limit - gap);
      const start = price('a2');
      let result: LotResult | null = null;
      for (let t = 0; !result && t < 20_000; t++) {
        ai.tick(state, SMALL, actFor(state, 'a2'));
        result = stepLandAuction(state, SMALL);
      }
      if (gap === 1) expect(result).toEqual({ kind: 'sold', buyer: 'a2', price: limit });
      else {
        expect(price('a2')).toBe(start);
        expect(result).toEqual({ kind: 'sold', buyer: 'a1', price: limit });
      }
    }
  });

  it('UBER-AC-2 / B-AC-7: on long ticks an AI never steps past its limit: against a bid one under it, and when a rival climbing past the board\'s top doubles the speed with its limit just past that top', () => {
    const LONG = WALK.tickMs * 3;
    for (const seed of SEEDS) {
      const { state, hands, seats } = landAuction(seed, { money: { a1: FLUSH, a2: 360, a3: 100 }, keepBack: true });
      const ai = hands[1]!;
      const { limit } = worthOf(state, seats[1]!.mind, state.listings[0]!);
      const a = state.landAuction!;
      const price = (id: string) => Math.round(a.walkers.find((w) => w.id === id)!.price);
      lotDone(state, 'a1');
      while (a.stage === 'intro') {
        ai.tick(state, LONG, actFor(state, 'a2'));
        stepLandAuction(state, LONG);
      }
      setLotWalk(state, 'a1', 1);
      while (price('a1') < limit - 1) stepLandAuction(state, 1);
      setLotWalk(state, 'a1', 0);
      lotDone(state, 'a1');
      let result: LotResult | null = null;
      for (let t = 0; !result && t < 20_000; t++) {
        ai.tick(state, LONG, actFor(state, 'a2'));
        result = stepLandAuction(state, LONG);
        expect(price('a2'), `seed ${seed}`).toBeLessThanOrEqual(limit);
      }
      expect(result?.kind).toBe('sold');
    }
    // The plot's board runs from 140 to 400 and crosses it in 6 s. The AI's limit is 405; a1 climbs alongside from the
    // start and through it, so the step that carries a1 past 400 is the one that doubles the speed under the AI.
    const BASE = (400 - 140) / 6;
    for (const seed of [7, 12]) {
      const probe = landAuction(seed);
      const reserve = cashReserve(observe(probe.state, probe.seats[1]!.mind.me), probe.seats[1]!.mind);
      const { state, hands, seats } = landAuction(seed, { money: { a1: FLUSH, a2: 405 + Math.max(reserve, 2 * mulePriceFor(probe.state, 'a2')), a3: 100 } });
      const ai = hands[1]!;
      const { limit } = worthOf(state, seats[1]!.mind, state.listings[0]!);
      expect(limit).toBe(405);
      const a = state.landAuction!;
      const price = (id: string) => Math.round(a.walkers.find((w) => w.id === id)!.price);
      lotDone(state, 'a1');
      while (a.stage === 'intro') {
        ai.tick(state, LONG, actFor(state, 'a2'));
        stepLandAuction(state, LONG);
      }
      setLotWalk(state, 'a1', 1);
      let result: LotResult | null = null;
      for (let t = 0; !result && t < 20_000; t++) {
        if (price('a1') >= limit - 1) setLotWalk(state, 'a1', 0);
        ai.tick(state, LONG, actFor(state, 'a2'));
        result = stepLandAuction(state, LONG);
        expect(price('a2'), `seed ${seed}`).toBeLessThanOrEqual(limit);
      }
      expect(a.speed, `seed ${seed}`).toBeCloseTo(2 * BASE);
      expect(result).toMatchObject({ kind: 'sold', buyer: 'a1' });
    }
  });
});

// Brix at the table with three AI seats, in seat order.
const TABLE = [{ id: SELLER, name: 'Brix', isAi: false, color: 0 }, ...AIS.map(({ id, name }, i) => ({ id, name, isAi: true, color: i + 1 }))];
type Plot = { x: number; y: number };

/**
 * Plays month 1 through the moves Brix's phone sends, the AI seats playing
 * themselves: Brix claims the first two plots that light up and fits a Food
 * MULE to the first, then goes to the pub and stays Done in the auction.
 * The game stops in month 2's planning.
 */
function toMonth2Planning(game: MuleGame, advance: (ms: number) => void): Plot[] {
  const phase = () => game.viewFor(null).phase;
  game.handle(SELLER, { type: 'ready' });
  const plots: Plot[] = [];
  while (phase() === 'landGrant') {
    const lit = game.viewFor(SELLER).lit;
    if (lit && plots.length < 2) {
      game.handle(SELLER, { type: 'claim', x: lit.x, y: lit.y });
      plots.push(lit);
    }
    if (phase() === 'landGrant') advance(GRANT_TICK_MS);
  }
  expect(plots).toHaveLength(2);
  expect(phase()).toBe('development');
  game.handle(SELLER, { type: 'buyMule' });
  game.handle(SELLER, { type: 'outfit', outfit: 'food' });
  game.handle(SELLER, { type: 'install', ...plots[0]! });
  game.handle(SELLER, { type: 'pub' });
  for (let i = 0; i < 1_000 && phase() !== 'auction'; i++) advance(1_000);
  for (let i = 0; i < 10_000 && phase() === 'auction'; i++) {
    game.handle(SELLER, { type: 'ready' });
    advance(WALK.tickMs);
  }
  advance(PHASE_MS.upkeep);
  expect(phase()).toBe('planning');
  expect(game.viewFor(null).month).toBe(2);
  return plots;
}

describe('AI seats at the land auction, on the server', () => {
  let savedKey: string | undefined;
  beforeEach(() => {
    savedKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });
  afterEach(() => {
    if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
    vi.restoreAllMocks();
  });

  it('UBER-AC-2 / T-AC-4: 3 AI seats, a listed plot and a listed MULE, ANTHROPIC_API_KEY unset: winners paid ≤ their value, the phase reached development on its own clocks, no LLM call', () => {
    // Each AI's value and limit for each lot, from the state its hand sees on the lot's first tick.
    const worth = new Map<string, { value: number; limit: number }>();
    const tick = LotHand.prototype.tick;
    vi.spyOn(LotHand.prototype, 'tick').mockImplementation(function (this: LotHand, state, dt, act) {
      const lot = state.landAuction?.lot;
      if (lot && !worth.has(`${lot.id}:${this.mind.me}`)) worth.set(`${lot.id}:${this.mind.me}`, worthOf(state, this.mind, lot));
      tick.call(this, state, dt, act);
    });
    // The brain's ask is the only way to a decider, and so to a language model.
    const asked: string[] = [];
    const ask = Brain.prototype.ask;
    vi.spyOn(Brain.prototype, 'ask').mockImplementation(function (this: Brain, ...args) {
      asked.push(args[2].phase);
      return ask.apply(this, args) as never;
    });

    const { ctx, advance } = fakeContext();
    const game = new MuleGame(ctx, 5);
    game.start(TABLE);
    const plots = toMonth2Planning(game, advance);
    game.handle(SELLER, { type: 'list', item: { kind: 'plot', ...plots[1]! }, minimum: PLOT_MIN, unsold: 'keep' });
    game.handle(SELLER, { type: 'list', item: { kind: 'mule', ...plots[0]! }, minimum: MULE_LOT_MIN, unsold: 'keep' });
    game.handle(SELLER, { type: 'ready' });
    while (game.viewFor(null).phase === 'landGrant') advance(GRANT_TICK_MS);
    expect(game.viewFor(null).phase).toBe('landAuction');
    const askedBefore = asked.length;

    // Nobody touches a phone from here on. Uneven waits, so the hands only stay under their limits if they see the dt the step uses.
    const waits = [100, 300, 120, 300, 100];
    const before = game.viewFor(null);
    const results = new Map<string, NonNullable<MuleView['landAuction']>>();
    // Seconds left on each lot's intro and walk clock when last seen: every buyer is an AI, so each ends early (AM-4).
    const left = new Map<string, number>();
    const longest = 2 * (LOTS.introMs + LOTS.walkMs + LOTS.resultMs);
    let elapsed = 0;
    for (let i = 0; elapsed <= longest && game.viewFor(null).phase === 'landAuction'; i++) {
      const wait = waits[i % waits.length]!;
      advance(wait);
      elapsed += wait;
      const la = game.viewFor(null).landAuction;
      if (!la) continue;
      if (la.stage === 'result') results.set(la.lot.id, la);
      else left.set(`${la.lot.id}:${la.stage}`, la.seconds);
      for (const w of la.walkers) {
        if (w.side !== 'buyer' || w.price < la.lot.minimum) continue;
        expect(w.price, `${w.id} on ${la.lot.id}`).toBeLessThanOrEqual(worth.get(`${la.lot.id}:${w.id}`)!.limit);
      }
    }

    const after = game.viewFor(null);
    expect(after.phase).toBe('development');
    expect(elapsed).toBeLessThanOrEqual(longest);
    expect(asked.slice(askedBefore).filter((phase) => phase === 'landAuction')).toEqual([]);
    const longestWait = Math.max(...waits) / 1_000;
    // A lot still contested at the bell (someone else could pay more) may run its full walk; AM-4's early bell is for a lot the others have given up.
    const contested = (id: string) => {
      const r = results.get(id)?.result;
      return r?.kind === 'sold' && AIS.some((a) => a.id !== r.buyer && (worth.get(`${id}:${a.id}`)?.limit ?? 0) >= r.price + 1);
    };
    for (const lot of before.listings) {
      expect(left.get(`${lot.id}:intro`), `${lot.id}'s intro ends before LOTS.introMs`).toBeGreaterThan(longestWait);
      if (!contested(lot.id)) expect(left.get(`${lot.id}:walk`), `${lot.id}'s walk ends before LOTS.walkMs`).toBeGreaterThan(longestWait);
    }
    expect(before.listings.some((lot) => !contested(lot.id)), 'at least one lot is settled early, so AM-4 is still asserted').toBe(true);
    const sold = [...results.values()].flatMap((la) => (la.result?.kind === 'sold' ? [{ lot: la.lot.id, ...la.result }] : []));
    expect(sold.length, 'an AI bought a lot').toBeGreaterThan(0);
    const paid = (v: MuleView, id: string) => v.players.find((p) => p.id === id)!.money;
    for (const s of sold) {
      expect(AIS.map((a) => a.id)).toContain(s.buyer);
      const w = worth.get(`${s.lot}:${s.buyer}`)!;
      expect(s.price).toBeLessThanOrEqual(w.value);
      expect(s.price).toBeLessThanOrEqual(w.limit);
    }
    for (const id of new Set(sold.map((s) => s.buyer))) expect(paid(before, id) - paid(after, id)).toBe(sold.filter((s) => s.buyer === id).reduce((n, s) => n + s.price, 0));
  });
});
