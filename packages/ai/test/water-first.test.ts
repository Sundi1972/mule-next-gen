import { afterEach, describe, expect, it } from 'vitest';
import { AI_LEVELS, AI_PERSONAS, createGame, observe, STRATEGIST, type GameState, type Tile } from '@mule/engine';
import { developDecision } from '../src/strategist.js';
import type { Mind } from '../src/value.js';

/**
 * PR-5b's Water lever, Energy first's twin: once a seat has its Energy plant (or may not install one), while its wells
 * don't cover its drink and its plots' Water and it may install one, its next MULE is a well. Every other install and
 * "Keep the cash" are ruled out. STRATEGIST.waterFirst switches the rule.
 */

const mind: Mind = { me: 'ai0', personaId: 'trader', persona: AI_PERSONAS.trader, levelId: 'trader', level: AI_LEVELS.trader };
const saved = STRATEGIST.waterFirst;
afterEach(() => {
  STRATEGIST.waterFirst = saved;
});

/** Rich farmland, dry ground for a well: left to itself, the seat would rather farm. */
const FARMLAND = { food: 4, water: -2, energy: 0, smithore: 0, crystite: 0, rareEarth: 0 };

/** Four AI seats; ai0 owns an Energy plant, three idle analysed plots of FARMLAND, and `well` an analysed well on a fifth (ground 6: 8 a month). */
function game(well: boolean, wellWater = 6): GameState {
  const state = createGame({ seed: 3, players: [0, 1, 2, 3].map((i) => ({ id: `ai${i}`, name: `AI${i}`, isAi: true })) });
  const free = state.tiles.filter((t) => t.owner === null && t.terrain === 'plains');
  const me = state.players.find((p) => p.id === 'ai0')!;
  free.slice(0, 3).forEach((t) => {
    Object.assign(t, { owner: 'ai0', traits: [], ground: { ...FARMLAND }, pollution: 0 } satisfies Partial<Tile>);
    delete t.special;
    me.analysed.push(state.tiles.indexOf(t));
  });
  Object.assign(free[5]!, { owner: 'ai0', outfit: 'energy' } satisfies Partial<Tile>);
  if (well) {
    Object.assign(free[7]!, { owner: 'ai0', outfit: 'water', traits: [], pollution: 0, ground: { ...FARMLAND, water: wellWater } } satisfies Partial<Tile>);
    me.analysed.push(state.tiles.indexOf(free[7]!));
  }
  me.money = 3000;
  return state;
}

function decide(well: boolean, waterFirst: boolean, wellWater?: number) {
  STRATEGIST.waterFirst = waterFirst;
  return developDecision(observe(game(well, wellWater), 'ai0'), mind, 0);
}

describe('STRATEGIST.waterFirst: a seat with its plant and its Water not covered installs a well next', () => {
  it('on: a seat with no well has only well installs left, and installs one', () => {
    const { all, options } = decide(false, true);

    expect(options[0]!.action).toMatchObject({ kind: 'install', outfit: 'water' });
    for (const c of all.filter((c) => !c.veto)) expect(c.action, c.key).toMatchObject({ kind: 'install', outfit: 'water' });
    expect(all.find((c) => c.action.kind === 'stop')!.veto).toBe("my wells don't cover my Water yet");
  });

  it('off: the same seat makes its old choice, which is not a well', () => {
    const { all, options } = decide(false, false);

    expect(options[0]!.action).not.toMatchObject({ kind: 'install', outfit: 'water' });
    expect(all.filter((c) => c.veto === "my wells don't cover my Water yet")).toEqual([]);
  });

  it('on: a seat whose one well nets less than its Water still has only well installs left', () => {
    // Ground -2: the well makes 1 and drinks it; the seat's drink and its plant's Water stay uncovered.
    const { all, options } = decide(true, true, -2);

    expect(options[0]!.action).toMatchObject({ kind: 'install', outfit: 'water' });
    for (const c of all.filter((c) => !c.veto)) expect(c.action, c.key).toMatchObject({ kind: 'install', outfit: 'water' });
  });

  it('a seat whose well covers its Water decides the same with the rule on or off', () => {
    const keys = (waterFirst: boolean) => decide(true, waterFirst).all.map((c) => [c.key, c.veto, c.utility]);

    expect(keys(true)).toEqual(keys(false));
  });
});
