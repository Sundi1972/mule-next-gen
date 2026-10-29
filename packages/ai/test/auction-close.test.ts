import { describe, expect, it } from 'vitest';
import { advancePhase, createGame, stepAuction, WALK } from '@mule/engine';
import type { AiAction } from '../src/actions.js';
import { applyAction } from '../src/play.js';
import { AiSeat } from '../src/seat.js';

describe('A-5: the AI hands in the close stage after each good', () => {
  it('T-AC-A5-9: no hand acts while a good is closed, and the auction still runs to its end', () => {
    const state = createGame({ seed: 5, players: [0, 1, 2, 3].map((i) => ({ id: `ai${i}`, name: `AI${i}`, isAi: true })) });
    const seats = state.players.map((p, i) => new AiSeat({ id: p.id, name: p.name, persona: 'trader', level: 'trader', seed: 100 + i }));
    while (state.phase !== 'auction') advancePhase(state);
    state.players[0]!.stock.food = 30;
    state.players[1]!.stock.food = 0;
    const inClose: AiAction[] = [];
    let closeTicks = 0;
    let ticks = 0;
    for (; ticks < 20_000 && state.auction!.stage !== 'over'; ticks++) {
      if (state.auction!.stage === 'close') closeTicks++;
      for (const s of seats) {
        s.auctionTick(state, WALK.tickMs, (a) => {
          if (state.auction!.stage === 'close') inClose.push(a);
          return applyAction(state, s.id, a);
        });
      }
      stepAuction(state, WALK.tickMs);
    }
    expect(state.auction!.stage).toBe('over');
    expect(closeTicks, 'the hands met at least one close stage').toBeGreaterThanOrEqual(WALK.closeMs / WALK.tickMs);
    expect(inClose).toEqual([]);
  });
});
