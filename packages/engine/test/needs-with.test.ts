import { describe, expect, it } from 'vitest';
import { createGame, HEALTH, needsOf, needsWith, type GameState, type Outfit } from '../src/index.js';
import { withHealth } from './health-switch.js';

/**
 * needs C12: the AI asks the engine for a player's needs with one more plot (needsWith) instead of copying needsOf's
 * formula (HC-11). needsWith(s, p, o) is needsOf of the same state with one more plot of `o` worked by p.
 */

function newGame(politics = false): GameState {
  const state = createGame({ seed: 42, politics, players: ['p0', 'p1', 'p2', 'p3'].map((id) => ({ id, name: id, isAi: false, species: 'gearling' as const })) });
  for (const t of state.tiles) delete t.special;
  return state;
}

/** Gives p0 a plot of each outfit in `outfits` on free land; returns the state. */
function work(state: GameState, outfits: readonly Outfit[]): GameState {
  const free = state.tiles.filter((t) => t.terrain !== 'store' && !t.owner);
  expect(free.length, 'the premise: room for every plot').toBeGreaterThanOrEqual(outfits.length);
  outfits.forEach((outfit, k) => Object.assign(free[k]!, { owner: 'p0', outfit }));
  return state;
}

/** Four farms: one more raw plot or a factory tips the Food round-up today and with the consumption table alike. */
const ESTATE: Outfit[] = ['food', 'food', 'food', 'food'];

describe('needs C12: needsWith gives a player needs with one more plot', () => {
  it.each<[string, Outfit]>([
    ['a raw plot', 'smithore'],
    ['a factory', 'alloy'],
    ['a green belt', 'greenBelt'],
  ])('needs C12: needsWith of %s equals needsOf with that plot worked', (_name, outfit) => {
    const state = work(newGame(), ESTATE);
    const added = work(structuredClone(state), [outfit]);
    expect(needsWith(state, 'p0', outfit)).toEqual(needsOf(added, 'p0'));
  });

  it('needs C12: one more raw plot or factory raises the Food need from four farms, a green belt does not', () => {
    const state = work(newGame(), ESTATE);
    const now = needsOf(state, 'p0').food;
    expect(needsWith(state, 'p0', 'smithore').food).toBeGreaterThan(now);
    expect(needsWith(state, 'p0', 'alloy').food).toBeGreaterThan(now);
    expect(needsWith(state, 'p0', 'greenBelt').food).toBe(now);
  });

  it('needs C12: needsOf is unchanged by asking needsWith, and the state is not touched', () => {
    const state = work(newGame(), ESTATE);
    const before = needsOf(state, 'p0');
    const tiles = structuredClone(state.tiles);
    needsWith(state, 'p0', 'alloy');
    expect(needsOf(state, 'p0')).toEqual(before);
    expect(state.tiles).toEqual(tiles);
  });

  it('needs C12: from three farms one more farm leaves Food at 3, a factory raises it to 4', () => {
    const state = work(newGame(), ['food', 'food', 'food']);
    expect(needsOf(state, 'p0').food, 'the premise').toBe(3);
    expect(needsWith(state, 'p0', 'food').food).toBe(3);
    expect(needsWith(state, 'p0', 'alloy').food).toBe(4);
  });

  it("needs C12: needsWith keeps RULE-15's Medicine: with the crews sick it asks 1, as needsOf does", () => {
    const state = work(newGame(true), ESTATE);
    state.colony!.sick = HEALTH.crewSickFrom;
    withHealth(() => {
      expect(needsOf(state, 'p0').medicine, 'the premise: the crews fall sick').toBe(1);
      expect(needsWith(state, 'p0', 'alloy').medicine).toBe(1);
    });
  });
});
