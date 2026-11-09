import { describe, expect, it } from 'vitest';
import { advancePhase, createGame, outfitBlocked, outfitMule, player, reoutfitMule, RuleError, type GameState, type Outfit } from '../src/index.js';

const SEATS = ['lena', 'brix', 'ossa', 'kai'];

/** Development, Lena leading an empty MULE, the emission cap at `level` in force (or none) and the air at `air`. */
function capped(level: number | null, air: number): GameState {
  const state = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })) });
  state.politics = { ...state.politics!, election: null, laws: level === null ? {} : { emissionCap: { setting: level, since: 1 } } };
  while (state.phase !== 'development') advancePhase(state);
  state.air = air;
  Object.assign(player(state, 'lena'), { carriedMule: 'empty', money: 1_000 });
  return state;
}

function refused(run: () => void): string {
  try {
    run();
  } catch (err) {
    if (err instanceof RuleError) return err.message;
    throw err;
  }
  return 'allowed';
}

describe('C42: the emission cap', () => {
  it('B-AC-42: a cap of 50 with the air at 55 refuses a Rare earth outfit with the cap\'s message, before any money moves; at air 50 it is allowed', () => {
    const state = capped(50, 55);
    const money = player(state, 'lena').money;
    expect(refused(() => outfitMule(state, 'lena', 'rareEarth'))).toBe('The emission cap stops new Rare earth mines while the air is above 50 (now 55)');
    expect(player(state, 'lena')).toMatchObject({ money, carriedMule: 'empty' });

    const clear = capped(50, 50);
    expect(refused(() => outfitMule(clear, 'lena', 'rareEarth'))).toBe('allowed');
    expect(player(clear, 'lena').carriedMule).toBe('rareEarth');
  });

  it('B-AC-42: under the cap a MULE taken off a plot can\'t be re-outfitted as a smelter either; Food stays allowed', () => {
    const state = capped(50, 55);
    Object.assign(player(state, 'lena'), { carriedMule: 'energy', takenMule: true });
    const money = player(state, 'lena').money;
    expect(refused(() => reoutfitMule(state, 'lena', 'alloy'))).toBe('The emission cap stops new smelters while the air is above 50 (now 55)');
    expect(player(state, 'lena')).toMatchObject({ money, carriedMule: 'energy' });
    expect(refused(() => reoutfitMule(state, 'lena', 'food'))).toBe('allowed');
  });

  it.each([
    { level: null, air: 90, outfit: 'rareEarth', blocked: false },
    { level: 50, air: 55, outfit: 'food', blocked: false },
    { level: 50, air: 50, outfit: 'alloy', blocked: false },
    { level: 50, air: 51, outfit: 'alloy', blocked: true },
  ] as { level: number | null; air: number; outfit: Outfit; blocked: boolean }[])('B-AC-42: RULE-44 — cap $level, air $air, $outfit: blocked $blocked', ({ level, air, outfit, blocked }) => {
    expect(outfitBlocked(capped(level, air), outfit) !== null).toBe(blocked);
  });
});
