import { monthNeeds, type GameState } from '@mule/engine';
import { describe, expect, it } from 'vitest';
import { MuleGame } from '../src/mule-game.js';
import { fakeContext, seats } from './fake-context.js';

/**
 * Planning, month 1: s1 works two farms and a Smithore mine (Energy 1 + 1 + 2 = 4 a month), s2 one mine (2).
 * Mines and farms burn a fixed Energy (UPKEEP.energyUse); factories would vary with their fit, so none here.
 */
function planningWithKnownEnergyUse() {
  const { ctx } = fakeContext();
  const game = new MuleGame(ctx, 7);
  game.start(seats);
  const state = (game as unknown as { state: GameState }).state;
  const free = state.tiles.filter((t) => t.terrain !== 'store' && t.owner === null);
  const [farm1, farm2, mine1, mine2] = free;
  Object.assign(farm1!, { owner: 's1', outfit: 'food' });
  Object.assign(farm2!, { owner: 's1', outfit: 'food' });
  Object.assign(mine1!, { owner: 's1', outfit: 'smithore' });
  Object.assign(mine2!, { owner: 's2', outfit: 'smithore' });
  expect(state.phase).toBe('planning');
  return { game, state };
}

describe("the view's monthNeeds (C17, RULE-8)", () => {
  it("T-AC-10: each seat's view carries the engine's monthNeeds for that seat; the TV view has none (HC-2)", () => {
    const { game, state } = planningWithKnownEnergyUse();
    // The fixture's Energy use is what the plots burn, so a mapping that drops or swaps it shows.
    expect(monthNeeds(state, 's1').energy).toBe(4);
    expect(monthNeeds(state, 's2').energy).toBe(2);
    for (const id of ['s1', 's2']) {
      const view = game.viewFor(id);
      expect(view.me, `${id}'s own view`).toHaveProperty('monthNeeds', monthNeeds(state, id));
    }

    const tv = game.viewFor(null);
    expect(tv.me).toBeNull();
    expect(JSON.stringify(tv)).not.toContain('monthNeeds');
  });
});
