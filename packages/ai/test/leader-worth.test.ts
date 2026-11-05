import { describe, expect, it } from 'vitest';
import { createGame, observe, POLITICS, score } from '@mule/engine';
import { leaderOf } from '../src/strategist.js';

/** Four AI seats with equal money, politics on; ai0 is the one asking. */
function table() {
  const state = createGame({ seed: 11, players: [0, 1, 2, 3].map((i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
  for (const p of state.players) p.money = 1000;
  return state;
}

describe('the leader is the rival with the highest Worth the seat can see (FM-leader-worth)', () => {
  it('FM-leader-worth: a rival ahead only by its terms in office leads a richer rival with none', () => {
    const state = table();
    state.politics!.terms['ai2'] = 1;
    state.players.find((p) => p.id === 'ai1')!.money += POLITICS.termScore / 2;
    const obs = observe(state, 'ai0');
    expect(score(obs, 'ai2')).toBeGreaterThan(score(obs, 'ai1'));
    expect(leaderOf(obs, 'ai0')).toBe('ai2');
  });

  it('FM-leader-worth: with no terms served, the richest rival leads, and the seat never names itself', () => {
    const state = table();
    state.players.find((p) => p.id === 'ai3')!.money += 1;
    state.players.find((p) => p.id === 'ai0')!.money += 5000;
    expect(leaderOf(observe(state, 'ai0'), 'ai0')).toBe('ai3');
  });
});
