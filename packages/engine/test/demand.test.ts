import { describe, expect, it } from 'vitest';
import { advancePhase, cloneForSim, exportDemand, monthlyDemand, RECIPES, UPKEEP, type GameState } from '../src/index.js';
import { game, to } from './fixtures/food-month.js';

/** Month 1's production with `colonists` in the colony and no Electronics works. */
function colonyOf(colonists: number): GameState {
  const state = game();
  to(state, 'production');
  state.colonists = colonists;
  expect(state.tiles.some((t) => t.outfit === 'electronics'), 'the premise: no Electronics works').toBe(false);
  return state;
}

/** What the colonists add to the Electronics, Rare earth and Alloy demand over a colony of none, all else equal. */
function colonistsAdd(state: GameState): { electronics: number; rareEarth: number; alloy: number } {
  const none = cloneForSim(state);
  none.colonists = 0;
  const [d, d0] = [monthlyDemand(state), monthlyDemand(none)];
  return { electronics: d.electronics - d0.electronics, rareEarth: d.rareEarth - d0.rareEarth, alloy: d.alloy - d0.alloy };
}

describe('needs C17: the colonists want Electronics, and so its inputs', () => {
  it('needs B-AC-15: 200 colonists add 4 Electronics, 4 Rare earth and 4 Alloy to the demand, and Electronics leaves the off-world band', () => {
    const { rareEarth, alloy } = RECIPES.electronics.inputs;
    expect({ rareEarth, alloy }, 'the premise: one Rare earth and one Alloy per Electronics, so 4 each').toEqual({ rareEarth: 1, alloy: 1 });
    const state = colonyOf(200);

    advancePhase(state);
    expect(state.phase, 'the premise: the store has posted').toBe('auction');

    expect(colonistsAdd(state)).toEqual({ electronics: 4, rareEarth: 4, alloy: 4 });
    expect(state.store.band?.electronics).not.toBe('offWorld');
  });

  it('needs B-AC-15: 0 colonists add nothing, and Electronics stays in the off-world band', () => {
    const state = colonyOf(0);
    const off = exportDemand(state);

    advancePhase(state);

    const d = monthlyDemand(state);
    expect({ electronics: d.electronics, rareEarth: d.rareEarth, alloy: d.alloy }).toEqual({
      electronics: off.electronics,
      rareEarth: off.rareEarth,
      alloy: off.alloy,
    });
    expect(state.store.band?.electronics).toBe('offWorld');
  });

  it.each([
    { name: '200 colonists want 4', colonists: 200, want: 4 },
    { name: '75 colonists want 1.5, unrounded', colonists: 75, want: 1.5 },
    { name: '0 colonists want none', colonists: 0, want: 0 },
  ])('needs T-AC-25: RULE-13, $name Electronics a month', ({ colonists, want }) => {
    expect(UPKEEP.colonistsPerElectronics, 'the premise: one Electronics per 50 colonists').toBe(50);
    expect(colonistsAdd(colonyOf(colonists))).toEqual({ electronics: want, rareEarth: want, alloy: want });
  });

  it('needs T-AC-25: the inputs follow RECIPES.electronics.inputs under a test override', () => {
    const state = colonyOf(200);
    const saved = RECIPES.electronics.inputs;
    RECIPES.electronics.inputs = { ...saved, rareEarth: 2, alloy: 0 };
    try {
      expect(colonistsAdd(state)).toEqual({ electronics: 4, rareEarth: 8, alloy: 0 });
    } finally {
      RECIPES.electronics.inputs = saved;
    }
  });
});
