import { describe, expect, it } from 'vitest';
import { advancePhase, createGame, lineOf, RuleError, shipLine, shipPrice, storeBuyLine, storeSellLine, stepAuction, WALK, type GameState, type Good, type Trade } from '@mule/engine';
import type { AiAction } from '../src/actions.js';
import { applyAction } from '../src/play.js';
import { AiSeat } from '../src/seat.js';

/**
 * The auto-trade amendment's C4 (docs/specs/2026-11-05-ws3-auction-auto-trade.md): at the store's or the ship's line
 * units trade by themselves, so the AI hands stand there while they move and step off once they have about what they
 * wanted; and every seat takes part as a buyer, switching only to sell, never passing.
 */
interface Sent {
  seat: string;
  good: Good;
  action: AiAction;
  refused: boolean;
}

/** One month's auction with four AI seats, every action logged with whether the rules refused it. */
function auction(seed: number, arrange: (state: GameState) => void) {
  const state = createGame({ seed, players: [0, 1, 2, 3].map((i) => ({ id: `ai${i}`, name: `AI${i}`, isAi: true })) });
  const seats = state.players.map((p, i) => new AiSeat({ id: p.id, name: p.name, persona: 'trader', level: 'trader', seed: seed * 10 + i }));
  while (state.phase !== 'auction') advancePhase(state);
  arrange(state);
  const sent: Sent[] = [];
  const trades: Trade[] = [];
  /** Per seat and good: the most units it said it wanted to end with during the walk, and what it ended with. */
  const goals = new Map<string, { goal: number; end: number }>();
  /** Steps off a house line while the units it would still trade there had not moved: each one a unit given up. */
  const abandoned: { seat: string; good: Good; wanted: number }[] = [];
  const wantAtLine = new Map<string, { want: number; house: string; price: number }>();
  const unitsAt = (s: AiSeat, line: { house: string; price: number }, side: string) => {
    const hand = (s as unknown as { auction: { unitsAt: (st: GameState, side: string, l: typeof line) => number } }).auction;
    return hand.unitsAt(state, side, line);
  };
  for (let i = 0; i < 40_000 && state.auction!.stage !== 'over'; i++) {
    for (const s of seats)
      s.auctionTick(state, WALK.tickMs, (action) => {
        const good = state.auction!.good!;
        try {
          applyAction(state, s.id, action);
          sent.push({ seat: s.id, good, action, refused: false });
          return true;
        } catch (err) {
          if (!(err instanceof RuleError)) throw err;
          sent.push({ seat: s.id, good, action, refused: true });
          return false;
        }
      });
    const a = state.auction!;
    if (a.stage === 'walk' && a.good)
      for (const s of seats) {
        const goal = s.debug().auction?.goal;
        const key = `${s.id}:${a.good}`;
        const end = state.players.find((p) => p.id === s.id)!.stock[a.good];
        if (goal !== null && goal !== undefined) goals.set(key, { goal: Math.max(goal, goals.get(key)?.goal ?? 0), end });
        else if (goals.has(key)) goals.get(key)!.end = end;
      }
    trades.push(...stepAuction(state, WALK.tickMs));
    const b = state.auction!;
    if (b.stage !== 'walk' || !b.good) continue;
    for (const s of seats) {
      const w = b.walkers.find((x) => x.id === s.id)!;
      const line = lineOf(state, s.id);
      const before = wantAtLine.get(s.id);
      // Only a walk off a line that is still there counts: a house selling out or a good closing is not the hand's stop.
      const stillThere = before && (before.house === 'store' ? (w.side === 'buyer' ? storeSellLine(state) : storeBuyLine(state)) : shipLine(state)) === before.price;
      if (!line && before && before.want > 0 && stillThere) abandoned.push({ seat: s.id, good: b.good, wanted: before.want });
      wantAtLine.set(s.id, line ? { want: unitsAt(s, line, w.side), ...line } : { want: 0, house: '', price: 0 });
    }
  }
  return { sent, trades, goals, abandoned };
}

describe('C4: the AI hands play the self-trading auction', () => {
  it('B-AC-2 (AI): an AI short of Food buys it from the store by standing at its line, with nothing to choose', () => {
    const { sent, trades, goals } = auction(5, (state) => {
      state.store.stock.food = 200;
      for (const p of state.players) p.stock.food = 0;
      for (const p of state.players) p.money = 2_000;
    });
    const fromStore = trades.filter((t) => t.good === 'food' && t.seller === 'store');
    expect(fromStore.length).toBeGreaterThan(0);
    // It steps off about where it meant to: never more than a few units past the most it wanted to end with.
    for (const seat of new Set(fromStore.map((t) => t.buyer))) {
      const g = goals.get(`${seat}:food`)!;
      expect(g.end, `${seat} wanted to end with ${g.goal}`).toBeLessThanOrEqual(g.goal + 3);
    }
    expect(sent.some((s) => s.action.type === 'declare' && s.refused)).toBe(false);
  });

  for (const seed of [5, 7, 11]) {
    it(`C4: an AI stays at a house's line until the units it still wants there have traded, never stepping off first (seed ${seed})`, () => {
      const { abandoned } = auction(seed, (state) => {
        state.store.stock.food = 200;
        for (const p of state.players) p.stock.food = 0;
        for (const p of state.players) p.money = 2_000;
      });
      expect(abandoned).toEqual([]);
    });
  }

  it('B-AC-1 (AI): an AI with spare Smithore switches to sell and sells to the store at its line', () => {
    const { sent, trades } = auction(6, (state) => {
      state.players[0]!.stock.smithore = 40;
    });
    expect(sent.some((s) => s.seat === 'ai0' && s.good === 'smithore' && s.action.type === 'declare' && s.action.side === 'seller')).toBe(true);
    expect(trades.some((t) => t.seller === 'ai0' && t.buyer === 'store')).toBe(true);
  });

  for (const seed of [1, 2, 3, 4]) {
    it(`RULE-2 (AI): no seat ever declares Pass, and none sends a refused side (seed ${seed})`, () => {
      const { sent } = auction(seed, (state) => {
        state.store.stock.food = 200;
        state.players[1]!.money = 1;
        state.players[0]!.stock.smithore = 25;
      });
      const declares = sent.filter((s) => s.action.type === 'declare');
      expect(declares.filter((s) => s.action.type === 'declare' && s.action.side === 'pass')).toEqual([]);
      expect(declares.filter((s) => s.refused)).toEqual([]);
    });
  }

  it("sells to the export ship at its line as the ship's price falls, on every seed tried", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { trades } = auction(seed, (state) => {
        state.ship = { arrives: state.month, goods: ['crystite', 'smithore'], hold: { crystite: 20, smithore: 20 }, bought: {} };
        for (const p of state.players) {
          p.stock.crystite = 15;
          p.stock.smithore = 15;
        }
      });
      expect(trades.some((t) => t.buyer === 'ship'), `seed ${seed}: the ship buys`).toBe(true);
    }
  });

  it("F3: at the ship's line a seller counts the ship's falling price per unit, never meaning to sell a unit below what it is worth", () => {
    const state = createGame({ seed: 3, players: [0, 1, 2, 3].map((i) => ({ id: `ai${i}`, name: `AI${i}`, isAi: true })) });
    while (state.phase !== 'auction') advancePhase(state);
    state.treasury.salesTax = 0;
    state.ship = { arrives: state.month, goods: ['crystite'], hold: { crystite: 10 }, bought: {} };
    state.store.offWorld.crystite = 200;
    state.auction!.good = 'crystite';
    state.players[0]!.stock.crystite = 5;
    const seat = new AiSeat({ id: 'ai0', name: 'AI0', persona: 'trader', level: 'trader', seed: 1 });
    const hand = (seat as unknown as { auction: Record<string, unknown> }).auction;
    const prices = [0, 1, 2, 3, 4].map((k) => shipPrice({ ...state, ship: { ...state.ship, bought: { crystite: k } } }, 'crystite')!);
    // Each unit is worth just under the ship's 3rd price: it means to sell 3 at the falling prices, not all 5 at the first.
    const worth = prices[2]! - 0.5;
    hand.plan = { values: { keep: [worth, worth, worth, worth, worth] } };
    hand.trade = { side: 'seller', keep: 0 };
    const unitsAt = (hand.unitsAt as (s: GameState, side: string, line: { house: string; price: number }) => number).bind(hand);
    expect(unitsAt(state, 'seller', { house: 'ship', price: prices[0]! })).toBe(3);
    // At the store the price holds for every unit.
    expect(unitsAt(state, 'seller', { house: 'store', price: prices[0]! })).toBe(5);
  });
});
