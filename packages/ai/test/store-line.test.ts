import { describe, expect, it } from 'vitest';
import { advancePhase, createGame, RuleError, stepAuction, WALK, type GameState, type Good, type Trade } from '@mule/engine';
import type { AiAction } from '../src/actions.js';
import { applyAction } from '../src/play.js';
import { AiSeat } from '../src/seat.js';

/**
 * A-6 (UX audit G-1): at the store's or the ship's line nothing trades until a seat says how many. The AI hands say
 * how many at the line, or step off; and a refused choice is not sent again and again.
 */
interface Sent {
  seat: string;
  good: Good;
  action: AiAction;
  refused: boolean;
}

/** One month's auction with four AI seats, every action logged with whether the rules refused it. `refuse` stands in for rules that refuse an action. */
function auction(seed: number, arrange: (state: GameState) => void, refuse: (action: AiAction) => boolean = () => false) {
  const state = createGame({ seed, players: [0, 1, 2, 3].map((i) => ({ id: `ai${i}`, name: `AI${i}`, isAi: true })) });
  const seats = state.players.map((p, i) => new AiSeat({ id: p.id, name: p.name, persona: 'trader', level: 'trader', seed: seed * 10 + i }));
  while (state.phase !== 'auction') advancePhase(state);
  arrange(state);
  const sent: Sent[] = [];
  const trades: Trade[] = [];
  for (let i = 0; i < 40_000 && state.auction!.stage !== 'over'; i++) {
    for (const s of seats)
      s.auctionTick(state, WALK.tickMs, (action) => {
        const good = state.auction!.good!;
        try {
          if (refuse(action)) throw new RuleError('refused by the test');
          applyAction(state, s.id, action);
          sent.push({ seat: s.id, good, action, refused: false });
          return true;
        } catch (err) {
          if (!(err instanceof RuleError)) throw err;
          sent.push({ seat: s.id, good, action, refused: true });
          return false;
        }
      });
    trades.push(...stepAuction(state, WALK.tickMs));
  }
  return { sent, trades };
}

describe('A-6: the AI says how many at a house line', () => {
  it('B-AC: an AI short of Food buys it from the store by choosing how many at its line', () => {
    const { sent, trades } = auction(5, (state) => {
      state.store.stock.food = 200;
      for (const p of state.players) p.stock.food = 0;
      for (const p of state.players) p.money = 2_000;
    });
    const fromStore = trades.filter((t) => t.good === 'food' && t.seller === 'store');
    expect(fromStore.length).toBeGreaterThan(0);
    const chose = sent.filter((s) => s.good === 'food' && s.action.type === 'lineTrade' && !s.refused);
    expect(chose.length).toBeGreaterThan(0);
    // Every seat that bought from the store chose at its line first, and none bought more than it chose.
    for (const seat of new Set(fromStore.map((t) => t.buyer))) {
      const units = chose.filter((s) => s.seat === seat).reduce((n, s) => n + (s.action.type === 'lineTrade' ? s.action.units : 0), 0);
      expect(fromStore.filter((t) => t.buyer === seat).length).toBeLessThanOrEqual(units);
    }
  });

  it('B-AC: an AI with spare Smithore sells to the store by choosing how many at its line', () => {
    const { trades } = auction(6, (state) => {
      state.players[0]!.stock.smithore = 40;
    });
    expect(trades.some((t) => t.seller === 'ai0' && t.buyer === 'store')).toBe(true);
  });

  for (const seed of [1, 2, 3, 4]) {
    it(`no AI loops on a refusal: a refused choice at the line is not sent again until something changed (seed ${seed})`, () => {
      const { sent } = auction(seed, (state) => {
        state.store.stock.food = 200;
        state.players[1]!.money = 1; // can't pay for one: walks to the line? then it must not ask over and over
        state.players[0]!.stock.smithore = 25;
      });
      const lineTrades = sent.filter((s) => s.action.type === 'lineTrade');
      const refused = lineTrades.filter((s) => s.refused);
      expect(refused.length, JSON.stringify(refused.slice(0, 5))).toBeLessThanOrEqual(2);
      // A seat chooses a handful of times per good at most, never once a tick.
      const per = new Map<string, number>();
      for (const s of lineTrades) per.set(`${s.seat}:${s.good}`, (per.get(`${s.seat}:${s.good}`) ?? 0) + 1);
      for (const [k, n] of per) expect(n, k).toBeLessThanOrEqual(20);
    });
  }

  it('no AI loops on a refusal: when the rules refuse every choice at the line, a seat asks once for each state it stands in, never once a tick', () => {
    const { sent } = auction(
      5,
      (state) => {
        state.store.stock.food = 200;
        for (const p of state.players) p.stock.food = 0;
      },
      (action) => action.type === 'lineTrade',
    );
    const asked = sent.filter((s) => s.action.type === 'lineTrade');
    expect(asked.length).toBeGreaterThan(0);
    const per = new Map<string, number>();
    for (const s of asked) per.set(`${s.seat}:${s.good}`, (per.get(`${s.seat}:${s.good}`) ?? 0) + 1);
    for (const [k, n] of per) expect(n, k).toBeLessThanOrEqual(2);
  });
});
