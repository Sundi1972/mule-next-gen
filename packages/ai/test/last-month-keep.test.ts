import { describe, expect, it } from 'vitest';
import { advancePhase, createGame, type GameState } from '@mule/engine';
import { draftPlaybook } from '../src/playbook/draft.js';
import { validatorFor } from '../src/playbook/validate.js';
import { AiSeat } from '../src/seat.js';

const players = ['cautious', 'aggressive', 'trader', 'saboteur'].map((_, i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true }));
const mind = new AiSeat({ id: 'ai2', name: 'AI 3', persona: 'trader', level: 'trader', seed: 102 }).mind;

/** Seed 11's auction with Food up, ai2 holding a farm and `food` Food (20: a seller), in month `month` of the game. */
function foodUpIn(month: 'last' | 'before last', food = 20): GameState {
  const state = createGame({ seed: 11, players });
  const plains = state.tiles.flatMap((t, i) => (t.terrain === 'plains' && t.owner === null ? [i] : []));
  Object.assign(state.tiles[plains[0]!]!, { owner: 'ai2', outfit: 'food' });
  while (state.phase !== 'auction') advancePhase(state);
  expect(state.auction!.good).toBe('food');
  state.month = month === 'last' ? state.maxMonths : state.maxMonths - 1;
  state.players.find((p) => p.id === 'ai2')!.stock.food = food;
  return state;
}

/** What Claude's edit of ai2's Food hold to 0 plays as, and why. */
function holdZero(state: GameState) {
  const draft = draftPlaybook({ state, seat: 'ai2', mind, seed: 102, phase: 'auction' });
  const r = validatorFor({ mind, seed: 102 })(state, 'ai2', draft, [{ path: '/auction/food/hold', to: 0, reason: 'a test edit' }]);
  return { plays: r.playbook.auction!.food!.hold, why: r.rejected.find((x) => x.path === '/auction/food/hold')?.why ?? null };
}

describe('in the last month nothing is held back for a month that does not come (PM, 7 Nov; deep4 D3)', () => {
  it('FM-last-month-keep: Claude selling all its Food in the last month plays; a month earlier the hold is raised to next month\'s', () => {
    const before = holdZero(foodUpIn('before last'));
    expect(before.plays).toBeGreaterThan(0);
    expect(before.why).toMatch(/^clamped/);
    expect(holdZero(foodUpIn('last'))).toEqual({ plays: 0, why: null });
  });

  it("FM-last-month-keep: a seat short of next month's Food buys it a month before the last, and not in the last", () => {
    const play = (month: 'last' | 'before last') => draftPlaybook({ state: foodUpIn(month, 2), seat: 'ai2', mind, seed: 102, phase: 'auction' }).auction!.food!;
    expect(play('before last')).toMatchObject({ role: 'buyer' });
    expect(play('last').role).not.toBe('buyer');
  });
});
