import { describe, expect, it, vi } from 'vitest';
import { advancePhase, createGame, createRng, startAuction, stepAuction, WALK, type AiLevelId, type AiPersonaId, type BoardZones, type GoodPlay } from '@mule/engine';
import type { AiAction } from '../src/actions.js';
import { AuctionHand } from '../src/hands/auction.js';
import { applyAction } from '../src/play.js';
import { AiSeat } from '../src/seat.js';
import type { GoodPlan } from '../src/strategist.js';

/**
 * RULE-7 AI, sold out: which buyer counts as short of the good, and when a buyer that can stand no higher presses Done.
 * Month 1's Food auction with the store holding none, played through the engine; ai1's plan is stubbed so its need is set.
 */

const stub = vi.hoisted(() => ({ need: null as { floorUnits: number; mustHold: number } | null, worth: 0 }));
vi.mock('../src/strategist.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/strategist.js')>();
  return {
    ...real,
    goodPlan: (...args: Parameters<typeof real.goodPlan>): GoodPlan => {
      const plan = real.goodPlan(...args);
      if (!stub.need) return plan;
      // Every unit is worth more than ai1's limit, so the limit is its ceiling. With no Food carry a unit past what
      // upkeep eats is worth only its resale, under the limit here (needs C15, PM ruling 8 Nov); the rows read the limit.
      const buy = plan.values.buy.map((v) => Math.max(v, stub.worth));
      return { ...plan, mustHold: stub.need.mustHold, values: { ...plan.values, buy, floorUnits: stub.need.floorUnits } };
    },
  };
});

const SEATS: { persona: AiPersonaId; level: AiLevelId }[] = [
  { persona: 'trader', level: 'trader' },
  { persona: 'cautious', level: 'tycoon' },
  { persona: 'aggressive', level: 'rookie' },
  { persona: 'saboteur', level: 'tycoon' },
];
const SEED = 1;
const BUYER = 'ai1';
const SELLERS = ['ai0', 'ai2'];
const MONEY = 3_000;

interface Setup {
  /** Food ai1 holds. */
  h: number;
  floorUnits: number;
  mustHold: number;
  /** ai1's walkAway: its ceiling, every unit being worth more. */
  limit: (zones: BoardZones) => number;
  /** Where each seller rests; every other seat is a broke buyer. */
  asks: (zones: BoardZones) => number[];
}

interface Walk {
  /** The highest price ai1 stood at. */
  top: number;
  /** One step under the lowest ask above the old line: the highest a buyer can stand. */
  reach: number;
  /** ai1's limit. */
  limit: number;
  /** Board ms at the walk's last step. */
  closedAt: number;
  bought: number;
}

/** Plays the sold-out Food good to its close: ai1 by its playbook hand, each seller resting where `asks` puts it and done. */
function play(setup: Setup): Walk {
  stub.need = { floorUnits: setup.floorUnits, mustHold: setup.mustHold };
  const state = createGame({ seed: SEED, players: SEATS.map((_, i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
  while (state.phase !== 'auction') advancePhase(state);
  state.store.stock.food = 0;
  for (const p of state.players) {
    p.money = p.id === BUYER || SELLERS.includes(p.id) ? MONEY : 0;
    p.stock.food = p.id === BUYER ? setup.h : 20; // literal-ok: a seller has Food to sell, more than one walk moves
  }
  startAuction(state, ['food']);
  const a = state.auction!;
  const limit = setup.limit(a.zones);
  stub.worth = limit + 1;
  const asks = setup.asks(a.zones);
  const seat = new AiSeat({ id: BUYER, name: 'AI 2', ...SEATS[1]!, seed: SEED * 10 + 1 });
  const part: GoodPlay = { role: 'buyer', hold: setup.h + 10, walkAway: limit, start: limit, concedeCrPerS: 0, bluff: false, vsRival: 'undercut1' }; // literal-ok: room to buy more than the walk can sell it
  const hand = new AuctionHand(seat.brain, createRng((seat.options.seed ^ 0x85ebca6b) >>> 0), () => ({ play: structuredClone(part), mind: seat.mind })); // literal-ok: AiSeat's salt for the auction hand's rng
  const act = (id: string) => (x: AiAction) => applyAction(state, id, x);
  const others = state.players.filter((p) => p.id !== BUYER).map((p) => p.id);
  for (const id of SELLERS) act(id)({ type: 'declare', side: 'seller' });
  for (const id of others) act(id)({ type: 'done', done: true });

  const walk: Walk = { top: -Infinity, reach: Math.min(a.zones.hi, ...asks.filter((p) => p > a.zones.sellersBottom)) - 1, limit, closedAt: 0, bought: 0 };
  let placed = false;
  for (let tick = 0; tick < 2_000; tick++) {
    const b = state.auction!;
    if (b.good !== 'food' || b.stage === 'close' || b.stage === 'over') break;
    if (b.stage === 'walk' && !placed) {
      placed = true;
      for (const [i, id] of SELLERS.entries()) Object.assign(b.walkers.find((w) => w.id === id)!, { price: asks[i], dir: 0 });
      for (const id of others) act(id)({ type: 'done', done: true });
    }
    hand.tick(state, WALK.tickMs, act(BUYER));
    if (b.stage === 'walk') walk.closedAt = b.elapsed;
    walk.bought += stepAuction(state, WALK.tickMs).filter((t) => t.buyer === BUYER).length;
    const c = state.auction!;
    if (c.stage === 'walk') walk.top = Math.max(walk.top, Math.round(c.walkers.find((w) => w.id === BUYER)!.price));
  }
  stub.need = null;
  stub.worth = 0;
  return walk;
}

/** Whether the walk ran to the end of its clock, rather than closing when every seat had pressed Done. */
const timedOut = (walk: Walk) => walk.closedAt >= WALK.goodMs - WALK.tickMs;

/** Two sellers resting above the old line, a step apart. */
const resting = (z: { sellersBottom: number }) => [z.sellersBottom + 8, z.sellersBottom + 9];

describe('RULE-7 AI, sold out: only a buyer short of the good bids straight to its limit', () => {
  it('RULE-7 AI: a buyer under max(floorUnits, mustHold) bids to its reach; at or over it, it edges toward the resting asks', () => {
    // [Food held, floorUnits, mustHold, short]
    const rows: [number, number, number, boolean][] = [
      [2, 3, 0, true],
      [2, 1, 3, true],
      [3, 3, 1, false],
      [3, 1, 3, false],
      [5, 3, 1, false],
    ];
    for (const [h, floorUnits, mustHold, short] of rows) {
      const walk = play({ h, floorUnits, mustHold, limit: (z) => z.sellersBottom + 20, asks: resting });
      const at = `holding ${h}, floorUnits ${floorUnits}, mustHold ${mustHold}`;
      expect(walk.limit, `${at}: the premise, its limit is past the resting asks`).toBeGreaterThan(walk.reach);
      if (short) expect(walk.top, `${at}: short, it bids to its reach`).toBe(walk.reach);
      else expect(walk.top, `${at}: not short, it stops short of its reach`).toBeLessThan(walk.reach);
      expect(walk.bought, `${at}: walking up never trades with a resting seller`).toBe(0);
    }
  });
});

describe('RULE-7 AI, sold out: a buyer that can stand no higher presses Done', () => {
  it('RULE-7 AI: a short buyer whose reach is under its limit presses Done at its reach, so the walk does not wait out its clock', () => {
    const walk = play({ h: 2, floorUnits: 3, mustHold: 0, limit: (z) => z.sellersBottom + 20, asks: resting });
    expect(walk.limit, 'the premise: its limit is past the resting asks').toBeGreaterThan(walk.reach);
    expect(walk.top, 'it bids to its reach').toBe(walk.reach);
    expect(timedOut(walk), 'it presses Done there, and the walk closes before its clock runs out').toBe(false);
  });

  it('RULE-7 AI: a short buyer with an ask at its reach that it can take walks on and buys it, rather than pressing Done', () => {
    const walk = play({ h: 2, floorUnits: 3, mustHold: 0, limit: (z) => z.sellersBottom + 20, asks: (z) => [z.sellersBottom + 1, z.sellersBottom] });
    expect(walk.reach, 'the premise: the ask at the old line is at its reach').toBe(walk.top);
    expect(walk.bought, 'it buys from the seller at the old line').toBeGreaterThan(0);
  });
});
