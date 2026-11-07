import { afterEach, describe, expect, it } from 'vitest';
import { AI_LEVELS, AI_PERSONAS, createGame, observe, STRATEGIST, type GameState, type Tile } from '@mule/engine';
import { draftMulePick } from '../src/playbook/draft.js';
import { developDecision } from '../src/strategist.js';
import type { Mind } from '../src/value.js';

/**
 * Spike S1's lever (c), ruled in by the PM: while a seat has no Energy plant and may install one, its next MULE is that
 * plant. Every other install and "Keep the cash" are ruled out. STRATEGIST.energyFirst switches the rule.
 */

const mind: Mind = { me: 'ai0', personaId: 'trader', persona: AI_PERSONAS.trader, levelId: 'trader', level: AI_LEVELS.trader };
const saved = STRATEGIST.energyFirst;
afterEach(() => {
  STRATEGIST.energyFirst = saved;
});

/** Rich farmland, poor ground for power: left to itself, the seat would rather farm. */
const FARMLAND = { food: 4, water: 0, energy: -2, smithore: 0, crystite: 0, rareEarth: 0 };

/** Four AI seats; ai0 owns three idle analysed plots of FARMLAND, and `plant` an Energy plant on a fourth. */
function game(plant: boolean): GameState {
  const state = createGame({ seed: 3, players: [0, 1, 2, 3].map((i) => ({ id: `ai${i}`, name: `AI${i}`, isAi: true })) });
  const free = state.tiles.filter((t) => t.owner === null && t.terrain === 'plains');
  const me = state.players.find((p) => p.id === 'ai0')!;
  free.slice(0, 3).forEach((t) => {
    Object.assign(t, { owner: 'ai0', traits: [], ground: { ...FARMLAND }, pollution: 0 } satisfies Partial<Tile>);
    delete t.special;
    me.analysed.push(state.tiles.indexOf(t));
  });
  if (plant) Object.assign(free[5]!, { owner: 'ai0', outfit: 'energy' } satisfies Partial<Tile>);
  me.money = 3000;
  return state;
}

function decide(plant: boolean, energyFirst: boolean) {
  STRATEGIST.energyFirst = energyFirst;
  return developDecision(observe(game(plant), 'ai0'), mind, 0);
}

describe('STRATEGIST.energyFirst: a seat with no Energy plant installs one first', () => {
  it('on: a seat with no Energy plant has only Energy installs left, and installs one', () => {
    const { all, options } = decide(false, true);

    expect(options[0]!.action).toMatchObject({ kind: 'install', outfit: 'energy' });
    const live = all.filter((c) => !c.veto);
    expect(live.length).toBeGreaterThan(0);
    for (const c of live) expect(c.action, c.key).toMatchObject({ kind: 'install', outfit: 'energy' });
    expect(all.find((c) => c.action.kind === 'stop')!.veto).toBe('no Energy plant of my own yet');
  });

  it('off: the same seat makes its old choice, which is not an Energy plant', () => {
    const { all, options } = decide(false, false);

    expect(options[0]!.action).not.toMatchObject({ kind: 'install', outfit: 'energy' });
    expect(all.filter((c) => c.veto === 'no Energy plant of my own yet')).toEqual([]);
  });

  it('a seat that already has an Energy plant decides the same with the rule on or off', () => {
    const keys = (energyFirst: boolean) => decide(true, energyFirst).all.map((c) => [c.key, c.veto, c.utility]);

    expect(keys(true)).toEqual(keys(false));
    expect(decide(true, true).options[0]!.action).not.toMatchObject({ kind: 'install', outfit: 'energy' });
  });

  it('on, but no Energy install is allowed (an empty corral): nothing else is ruled out for it', () => {
    const run = (energyFirst: boolean) => {
      STRATEGIST.energyFirst = energyFirst;
      const state = game(false);
      state.store.mules = 0;
      return developDecision(observe(state, 'ai0'), mind, 0).all.map((c) => [c.key, c.veto]);
    };

    expect(run(true)).toEqual(run(false));
  });

  it("on, leading a fitted MULE none of its plots may take (a smelter under an emission cap the air is over): the pick is 'stop', never an empty shortlist", () => {
    const pick = (energyFirst: boolean) => {
      STRATEGIST.energyFirst = energyFirst;
      const state = game(false);
      state.politics = { ...state.politics!, laws: { emissionCap: { setting: 50, since: 1 } } };
      state.air = 55;
      state.players.find((p) => p.id === 'ai0')!.carriedMule = 'alloy';
      return draftMulePick({ state, seat: 'ai0', mind, seed: 1, phase: 'development' }, 0, undefined, null);
    };
    // The case: Energy installs are allowed, so the rule is live and rules out "Keep the cash".
    expect(decide(false, true).all.some((c) => c.action.kind === 'install' && c.action.outfit === 'energy' && !c.veto)).toBe(true);

    expect(pick(true)).toEqual({ kind: 'stop' });
    expect(pick(false)).toEqual({ kind: 'stop' });
  });
});
