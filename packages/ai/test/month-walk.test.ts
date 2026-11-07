import { describe, expect, it } from 'vitest';
import { advancePhase, createGame, tileAt, type GameState } from '@mule/engine';
import { draftGoodPlaybook } from '../src/playbook/draft.js';
import { AiSeat } from '../src/seat.js';
import { monthWalkSeconds } from '../src/value.js';

/** Seed 4's month-1 auction: no seat holds a plot yet, and plot (10,0) is a lake ringed by lake. */
function auction(): GameState {
  const state = createGame({ seed: 4, players: [0, 1, 2, 3].map((i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
  while (state.phase !== 'auction') advancePhase(state);
  return state;
}

describe('monthWalkSeconds: a plot-less seat on a map with a lake no shore reaches', () => {
  it('seed 4: its month of walking is finite, and its Food walkAway is not its whole purse', () => {
    const state = auction();
    expect(tileAt(state.tiles, state.width, 10, 0)!.terrain).toBe('lake');
    expect(state.tiles.some((t) => t.owner === 'ai0')).toBe(false);
    const me = state.players.find((p) => p.id === 'ai0')!;
    me.stock.food = 0;
    me.money = 2_000;
    const seat = new AiSeat({ id: 'ai0', name: 'AI 1', persona: 'trader', level: 'trader', seed: 40 });
    expect(Number.isFinite(monthWalkSeconds(state, seat.mind))).toBe(true);
    const food = draftGoodPlaybook({ state, seat: 'ai0', mind: seat.mind, seed: 40 }, 'food').auction!.food!;
    expect(food.walkAway).toBeLessThan(me.money);
  });
});
