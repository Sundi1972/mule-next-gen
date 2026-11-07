import { afterEach, describe, expect, it } from 'vitest';
import { AI_LEVELS, AI_PERSONAS, advancePhase, createGame, observe, STRATEGIST, type GameState, type Tile } from '@mule/engine';
import { developDecision } from '../src/strategist.js';
import { canFeed } from '../src/value.js';
import type { Mind } from '../src/value.js';

/**
 * Spike S2's lever B, ruled in by the PM: canFeed no longer blocks a Medicine works for want of Food or Water, so a
 * hungry seat can still build the colony's Medicine (without it, hungry seats never built one: a spiral).
 * STRATEGIST.medicineDespiteInputs switches the exemption; other factories keep the block.
 */

const ME = 'ai0';
const mind: Mind = { me: ME, personaId: 'trader', persona: AI_PERSONAS.trader, levelId: 'trader', level: AI_LEVELS.trader };
const saved = { medicine: STRATEGIST.medicineDespiteInputs, energy: STRATEGIST.energyFirst };
afterEach(() => {
  STRATEGIST.medicineDespiteInputs = saved.medicine;
  STRATEGIST.energyFirst = saved.energy;
});

/** Development; ai0 owns an Energy plant and an idle plot, and holds no Food, no Water, no Smithore. */
function hungry(): GameState {
  const state = createGame({ seed: 3, players: [0, 1, 2, 3].map((i) => ({ id: `ai${i}`, name: `AI${i}`, isAi: true })) });
  while (state.phase !== 'development') advancePhase(state);
  const free = state.tiles.filter((t) => t.owner === null && t.terrain === 'plains');
  Object.assign(free[0]!, { owner: ME, outfit: 'energy' } satisfies Partial<Tile>);
  Object.assign(free[2]!, { owner: ME, outfit: null } satisfies Partial<Tile>);
  const me = state.players.find((p) => p.id === ME)!;
  Object.assign(me.stock, { food: 0, water: 0, smithore: 0, energy: 10 });
  me.money = 5000;
  return state;
}

function medicineVeto(despite: boolean): string | null | undefined {
  STRATEGIST.medicineDespiteInputs = despite;
  const state = hungry();
  const at = state.tiles.findIndex((t) => t.owner === ME && !t.outfit);
  return developDecision(observe(state, ME), mind, 0).all.find((c) => c.key === `install:medicine:${at}`)?.veto;
}

describe('STRATEGIST.medicineDespiteInputs: a seat short of Food and Water may still build a Medicine works', () => {
  it('on: canFeed lets the Medicine works through, and the strategist does not rule it out for its inputs', () => {
    STRATEGIST.medicineDespiteInputs = true;
    expect(canFeed(observe(hungry(), ME), ME, 'medicine')).toBe(true);
    expect(medicineVeto(true) ?? '').not.toMatch(/nothing to feed/);
  });

  it('off: the old block returns', () => {
    STRATEGIST.medicineDespiteInputs = false;
    expect(canFeed(observe(hungry(), ME), ME, 'medicine')).toBe(false);
    expect(medicineVeto(false) ?? '').toMatch(/nothing to feed/);
  });

  it('on: another factory short of its inputs is still blocked', () => {
    STRATEGIST.medicineDespiteInputs = true;
    expect(canFeed(observe(hungry(), ME), ME, 'alloy')).toBe(false);
  });
});
