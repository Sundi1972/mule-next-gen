import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  advancePhase,
  createGame,
  createRng,
  list,
  LOTS,
  lotDone,
  observe,
  RuleError,
  setLotWalk,
  stepLandAuction,
  WALK,
  type AiPersonaId,
  type GameState,
  type Listing,
  type Tile,
} from '@mule/engine';
import { AiSeat, Brain, cashReserve, LotHand, muleValue, plotValue, type Act, type Mind } from '@mule/ai';
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
const MULE_LOT_MIN = 100;
const SEEDS = [3, 7, 11, 19, 23, 42];
/** Within one long tick's step of the limit: the hand won't take a step that would round past it. */
const NEAR = 30;

/** The limit RULE-6 sets, worked out here from the seat's own observation. */
function limitOf(state: GameState, mind: Mind, lot: Listing): number {
  const obs = observe(state, mind.me);
  const money = obs.players.find((p) => p.id === mind.me)!.money;
  const value = lot.item.kind === 'plot' ? plotValue(obs, mind, lot.item.y * obs.width + lot.item.x) : muleValue(obs, mind);
  return Math.max(0, Math.min(money - cashReserve(obs, mind), value));
}

/**
 * Brix and three AI seats in month 1's planning. Brix owns a plot and a
 * Food MULE on another; each AI owns one idle plot, so a MULE is worth
 * something to it. Brix lists both, and the land auction opens.
 */
function landAuction(seed: number, money: Record<string, number> = {}) {
  const state = createGame({ seed, players: [{ id: SELLER, name: 'Brix', isAi: false }, ...AIS.map(({ id, name }) => ({ id, name, isAi: true }))] });
  const free = state.tiles.filter((t) => t.terrain !== 'store' && t.owner === null);
  const own = (tile: Tile, owner: string, outfit: Tile['outfit'] = null) => Object.assign(tile, { terrain: 'plains', owner, outfit, runMonths: outfit ? 2 : 0 });
  const plot = own(free[0]!, SELLER);
  const mule = own(free[1]!, SELLER, 'food');
  AIS.forEach(({ id }, i) => own(free[2 + i]!, id));
  for (const p of state.players) p.money = money[p.id] ?? p.money;
  list(state, SELLER, { item: { kind: 'plot', x: plot.x, y: plot.y }, minimum: PLOT_MIN, unsold: 'keep' });
  list(state, SELLER, { item: { kind: 'mule', x: mule.x, y: mule.y }, minimum: MULE_MIN, unsold: 'keep' });
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

interface Sample {
  lot: Listing;
  id: string;
  limit: number;
  lo: number;
  price: number;
  dir: -1 | 0 | 1;
  done: boolean;
}

/** Runs the land auction to its end, the hands ticking before each step with the same dt. Every AI walker on every walk tick. */
function play(state: GameState, hands: LotHand[]): Sample[] {
  const samples: Sample[] = [];
  const limits = new Map<string, number>();
  for (let t = 0; state.phase === 'landAuction' && t < 5_000; t++) {
    const a = state.landAuction!;
    if (a.stage === 'over') break;
    if (a.lot) for (const h of hands) if (!limits.has(`${a.lot.id}:${h.mind.me}`)) limits.set(`${a.lot.id}:${h.mind.me}`, limitOf(state, h.mind, a.lot));
    const dt = DTS[t % DTS.length]!;
    for (const h of hands) h.tick(state, dt, actFor(state, h.mind.me));
    const lot = a.lot!;
    stepLandAuction(state, dt);
    if (a.stage !== 'walk' && a.stage !== 'result') continue;
    for (const w of a.walkers) {
      if (w.id === SELLER || w.side !== 'buyer') continue;
      samples.push({ lot, id: w.id, limit: limits.get(`${lot.id}:${w.id}`)!, lo: a.lo, price: Math.round(w.price), dir: w.dir, done: a.done.includes(w.id) });
    }
  }
  return samples;
}

describe('AI seats at the land auction', () => {
  it('B-AC-7: an AI never bids above min(money − cashReserve, value)', () => {
    // Short of money, the plot's bidding stops at money − reserve; flush, the MULE's stops at its value.
    const tables: Record<string, number>[] = [{ a1: 300, a2: 340, a3: 380 }, {}];
    let capped = 0;
    for (const seed of SEEDS)
      for (const money of tables) {
        const { state, hands } = landAuction(seed, money);
        const samples = play(state, hands);
        for (const s of samples) expect(s.price, `seed ${seed}, ${s.id} on ${s.lot.id}`).toBeLessThanOrEqual(Math.max(s.limit, s.lo));
        const best = new Map<string, Sample>();
        for (const s of samples) if (s.price > (best.get(`${s.lot.id}:${s.id}`)?.price ?? -1)) best.set(`${s.lot.id}:${s.id}`, s);
        if ([...best.values()].some((s) => s.price >= s.lot.minimum && s.limit - s.price <= NEAR)) capped++;
      }
    expect(capped, 'in every run some AI bid up to its limit').toBe(SEEDS.length * tables.length);
  });

  it('B-AC-7: an AI whose money − reserve is under the minimum never moves, and presses Done', () => {
    for (const seed of [3, 7, 11]) {
      const probe = landAuction(seed);
      const mind = probe.seats[1]!.mind;
      const reserve = cashReserve(observe(probe.state, mind.me), mind);
      // A buyer by the engine's rule (money ≥ minimum), but short once it keeps its reserve.
      const money = PLOT_MIN + Math.floor(reserve / 2);
      const { state, hands } = landAuction(seed, { a2: money });
      const mine = play(state, hands).filter((s) => s.id === 'a2' && s.lot.item.kind === 'plot');
      expect(mine.length).toBeGreaterThan(0);
      for (const s of mine) {
        expect(s.limit).toBeLessThan(PLOT_MIN);
        expect(s.price, `seed ${seed}`).toBe(s.lo);
        expect(s.dir).toBe(0);
      }
      expect(mine.some((s) => s.done)).toBe(true);
    }
  });
});

// Brix at the table with three AI seats, in seat order.
const TABLE = [{ id: SELLER, name: 'Brix', isAi: false }, ...AIS.map(({ id, name }) => ({ id, name, isAi: true }))];
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
      const key = lot && `${lot.id}:${this.mind.me}`;
      if (lot && key && !worth.has(key)) {
        const obs = observe(state, this.mind.me);
        const value = lot.item.kind === 'plot' ? plotValue(obs, this.mind, lot.item.y * obs.width + lot.item.x) : muleValue(obs, this.mind);
        worth.set(key, { value, limit: limitOf(state, this.mind, lot) });
      }
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

    // Nobody touches a phone from here on.
    const before = game.viewFor(null);
    const results = new Map<string, NonNullable<MuleView['landAuction']>>();
    const longest = 2 * (LOTS.introMs + LOTS.walkMs + LOTS.resultMs);
    let elapsed = 0;
    for (; elapsed <= longest && game.viewFor(null).phase === 'landAuction'; elapsed += WALK.tickMs) {
      advance(WALK.tickMs);
      const la = game.viewFor(null).landAuction;
      if (la?.stage === 'result') results.set(la.lot.id, la);
    }

    const after = game.viewFor(null);
    expect(after.phase).toBe('development');
    expect(elapsed).toBeLessThanOrEqual(longest);
    expect(asked.slice(askedBefore).filter((phase) => phase === 'landAuction')).toEqual([]);
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
