import { describe, expect, it } from 'vitest';
import { AI_LEVELS, AI_PERSONAS, createGame, observe } from '@mule/engine';
import { developDecision } from '../src/strategist.js';
import type { Mind } from '../src/value.js';

const mind: Mind = { me: 'ai0', personaId: 'trader', persona: AI_PERSONAS.trader, levelId: 'trader', level: AI_LEVELS.trader };

/** Four AI seats, ai0 owning three free plots, the emission cap at 50 in force or not, the air at 55. */
function game(cap: boolean) {
  const state = createGame({ seed: 3, players: [0, 1, 2, 3].map((i) => ({ id: `ai${i}`, name: `AI${i}`, isAi: true })) });
  for (const t of state.tiles.filter((t) => t.owner === null && t.terrain !== 'store').slice(0, 3)) t.owner = 'ai0';
  state.politics = { ...state.politics!, laws: cap ? { emissionCap: { setting: 50, since: 1 } } : {} };
  state.air = 55;
  return state;
}

const installs = (cap: boolean, outfit: string) => developDecision(observe(game(cap), 'ai0'), mind, 0).all.filter((c) => c.key.startsWith(`install:${outfit}:`));

describe('C42: the strategist and the emission cap', () => {
  it('T-AC-48: under a cap the air is above, the strategist never plans a Rare earth mine or a smelter; without one it weighs them', () => {
    expect(installs(false, 'rareEarth').length + installs(false, 'alloy').length).toBeGreaterThan(0);
    expect(installs(true, 'rareEarth')).toEqual([]);
    expect(installs(true, 'alloy')).toEqual([]);
    expect(installs(true, 'food').length).toBeGreaterThan(0);
  });
});
