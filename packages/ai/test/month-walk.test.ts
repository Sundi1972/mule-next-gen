import { describe, expect, it } from 'vitest';
import { advancePhase, createGame, tileAt, type GameState } from '@mule/engine';
import { draftGoodPlaybook } from '../src/playbook/draft.js';
import { AiSeat } from '../src/seat.js';
import { monthWalkSeconds } from '../src/value.js';

/** Seed `seed`'s month-1 auction (seed 4: no seat holds a plot yet, and plot (10,0) is a lake ringed by lake). */
function auction(seed = 4): GameState {
  const state = createGame({ seed, players: [0, 1, 2, 3].map((i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
  while (state.phase !== 'auction') advancePhase(state);
  return state;
}

describe('monthWalkSeconds: a plot-less seat on a map with a lake no shore reaches', () => {
  // The rule food-short's cases hold the AI to: a seat with no land a walk reaches values Food beyond any price, so its
  // month of walking stays Infinity and its Food walkAway is its whole purse.
  it('seed 4: its month of walking is Infinity, and its Food walkAway is its whole purse', () => {
    const state = auction();
    expect(tileAt(state.tiles, state.width, 10, 0)!.terrain).toBe('lake');
    expect(state.tiles.some((t) => t.owner === 'ai0')).toBe(false);
    const me = state.players.find((p) => p.id === 'ai0')!;
    me.stock.food = 0;
    me.money = 2_000;
    const seat = new AiSeat({ id: 'ai0', name: 'AI 1', persona: 'trader', level: 'trader', seed: 40 });
    expect(monthWalkSeconds(state, seat.mind)).toBe(Infinity);
    const food = draftGoodPlaybook({ state, seat: 'ai0', mind: seat.mind, seed: 40 }, 'food').auction!.food!;
    expect(food.walkAway).toBe(me.money);
  });
});

describe('monthWalkSeconds: a seat whose lake has only its own land for a shore', () => {
  // Seed 5's lake (7,0) is the review's case; seed 1's map has no lake there, so its case is lake (1,4).
  it.each([
    [5, 7, 0],
    [1, 1, 4],
  ])('seed %i: holding lake (%i,%i) and every land plot around it, its month of walking is finite, and its Food walkAway is not its whole purse', (seed, x, y) => {
    // Reach offers the seat's own land underfoot before the lake, so no shore stands for its install: the lake's trip
    // is Infinity (floor-time.ts shoreStands), and it must not make the whole month Infinity.
    const state = auction(seed);
    const lake = tileAt(state.tiles, state.width, x, y)!;
    expect(lake.terrain).toBe('lake');
    for (const t of state.tiles) if (t.owner === 'ai0') t.owner = null;
    lake.owner = 'ai0';
    let shore = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const t = tileAt(state.tiles, state.width, x + dx, y + dy);
      if (t && t.terrain !== 'lake' && t.terrain !== 'store') {
        t.owner = 'ai0';
        shore++;
      }
    }
    expect(shore, 'land plots around the lake').toBeGreaterThan(0);
    const me = state.players.find((p) => p.id === 'ai0')!;
    me.stock.food = 0;
    me.money = 2_000;
    const seat = new AiSeat({ id: 'ai0', name: 'AI 1', persona: 'trader', level: 'trader', seed: 40 });
    expect(Number.isFinite(monthWalkSeconds(state, seat.mind)), 'monthWalkSeconds').toBe(true);
    const food = draftGoodPlaybook({ state, seat: 'ai0', mind: seat.mind, seed: 40 }, 'food').auction!.food!;
    expect(food.walkAway, "Food's walkAway").toBeLessThan(me.money);
  });
});
