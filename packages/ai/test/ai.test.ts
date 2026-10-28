import { describe, expect, it } from 'vitest';
import { advancePhase, createGame, expectedGround, isGameOver, observe, stepAuction, WALK, type Trade } from '@mule/engine';
import { applyAction, playGame } from '../src/play.js';
import { AiSeat } from '../src/seat.js';
import type { DecisionRecord } from '../src/brain.js';
import type { Choice, Decider, ShortOption } from '../src/decider.js';
import { candidate, consider, shortlist } from '../src/utility.js';
import { simSeats } from '../src/lineup.js';

describe('utility scoring', () => {
  it('drops vetoed options and keeps the near-best few', () => {
    const c = (key: string, score: number, veto: string | null = null) => candidate(key, key, key, 0, [consider('x', score, 1, '')], veto);
    const list = shortlist([c('a', 0.9), c('b', 0.85), c('c', 0.2), c('d', 1, 'not allowed')], 5, 0.2);
    expect(list.options.map((o) => o.key)).toEqual(['a', 'b']);
    expect(list.all.at(-1)!.key).toBe('d');
    expect(list.all.at(-1)!.utility).toBe(0);
  });
});

describe('observation', () => {
  it('hides other players stock and unanalysed ground from a seat', () => {
    const state = createGame({ seed: 3, players: [0, 1, 2].map((i) => ({ id: `p${i}`, name: `P${i}`, isAi: true })) });
    state.players[1]!.stock.food = 40;
    state.players[2]!.stock.food = 0;
    const obs = observe(state, 'p0');
    // Only the colony's total shows: the two rivals look alike.
    expect(obs.players[1]!.stock.food).toBeLessThan(40);
    expect(Math.abs(obs.players[1]!.stock.food - obs.players[2]!.stock.food)).toBeLessThanOrEqual(1);
    for (const t of obs.tiles) if (t.terrain !== 'store') expect(t.ground).toEqual(expectedGround(t.terrain));
  });
});

describe('AI seats at the auction', () => {
  it('walk to their price, trade, and replay exactly from the seed', () => {
    const play = () => {
      const state = createGame({ seed: 5, players: [0, 1, 2, 3].map((i) => ({ id: `ai${i}`, name: `AI${i}`, isAi: true })) });
      const seats = state.players.map((p, i) => new AiSeat({ id: p.id, name: p.name, persona: 'trader', level: 'trader', seed: 100 + i }));
      while (state.phase !== 'auction') advancePhase(state);
      // More than the depot keeps: the surplus would spoil, so it sells.
      state.players[0]!.stock.food = 30;
      state.players[1]!.stock.food = 0;
      const trades: Trade[] = [];
      for (let i = 0; i < 20_000 && state.auction!.stage !== 'over'; i++) {
        for (const s of seats) s.auctionTick(state, WALK.tickMs, (a) => applyAction(state, s.id, a));
        trades.push(...stepAuction(state, WALK.tickMs));
      }
      return trades;
    };
    const trades = play();
    expect(trades.some((t) => t.good === 'food' && t.seller === 'ai0')).toBe(true);
    expect(trades.some((t) => t.good === 'food' && t.buyer === 'ai1')).toBe(true);
    expect(play()).toEqual(trades);
  });

  // 4 s is the PM's ruling of 2026-10-28 on the paid trial's latency (spec AM-17), so these times are pinned here.
  it.each([
    { answerMs: 3_900, by: 'llm', note: undefined },
    { answerMs: 4_100, by: 'fallback', note: 'decider too slow' },
  ])('T-AC-7 (AM-17): a trade answer $answerMs ms into the status screen is played by $by, declared before the walk', async ({ answerMs, by, note }) => {
    const state = createGame({ seed: 5, players: [0, 1, 2, 3].map((i) => ({ id: `ai${i}`, name: `AI${i}`, isAi: true })) });
    let now = 0;
    // Set inside the decider, so TypeScript must not narrow it to null here.
    let asked = null as { at: number; good: string; options: ShortOption[]; answer: (c: Choice) => void } | null;
    const slow: Decider = {
      name: 'slow',
      decide: (options) =>
        asked ? { optionId: options[0]!.id, line: null, by: 'llm' } : new Promise<Choice>((answer) => (asked = { at: now, good: state.auction!.good!, options, answer })),
    };
    const records: DecisionRecord[] = [];
    const seats = state.players.map(
      (p, i) => new AiSeat({ id: p.id, name: p.name, persona: 'trader', level: 'trader', seed: 100 + i, decider: i === 0 ? slow : null, onDecision: (r) => i === 0 && records.push(r) }),
    );
    while (state.phase !== 'auction') advancePhase(state);
    state.players[0]!.stock.food = 30;
    state.players[1]!.stock.food = 0;
    const declared: { good: string; stage: string }[] = [];
    let answered = false;
    for (let i = 0; i < 20_000 && state.auction!.stage !== 'over' && !(asked && declared.some((d) => d.good === asked!.good)); i++) {
      for (const s of seats)
        s.auctionTick(state, WALK.tickMs, (a) => {
          if (s.id === 'ai0' && a.type === 'declare') declared.push({ good: state.auction!.good!, stage: state.auction!.stage });
          return applyAction(state, s.id, a);
        });
      stepAuction(state, WALK.tickMs);
      now += WALK.tickMs;
      if (asked && !answered && now - asked.at >= answerMs) {
        answered = true;
        asked.answer({ optionId: asked.options.at(-1)!.id, line: null, by: 'llm' });
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    expect(asked, 'the seat asked its decider about a trade').not.toBeNull();
    const record = records.find((r) => r.kind === 'trade' && r.by !== 'top')!;
    expect({ by: record.by, note: record.note }).toEqual({ by, note });
    if (by === 'llm') expect(record.pick.id).toBe(asked!.options.at(-1)!.id);
    expect(declared.filter((d) => d.good === asked!.good)).toEqual([{ good: asked!.good, stage: 'status' }]);
  });
});

describe('headless games', () => {
  it('play a full game to the end without broken prices, and replay exactly from the seed', () => {
    const run = () => playGame(7, simSeats(4, 'trader', 7));
    const { state, decisions } = run();
    expect(isGameOver(state)).toBe(true);
    expect(state.phase).toBe('gameOver');
    expect(decisions).toBeGreaterThan(0);
    // The store never runs out of money, so its capital is a running total that may go negative, never broken.
    expect(Number.isFinite(state.store.capital)).toBe(true);
    for (const report of state.history) {
      for (const price of Object.values(report.prices)) {
        expect(price).toBeGreaterThan(0);
        expect(Number.isFinite(price)).toBe(true);
      }
    }
    expect(state.tiles.some((t) => t.owner && t.outfit)).toBe(true);
    const again = run().state;
    expect(again.players.map((p) => p.money)).toEqual(state.players.map((p) => p.money));
  }, 30_000); // plays two full games with look-ahead seats: about 4-5 s locally, so vitest's 5 s default flakes on slow runners
});
