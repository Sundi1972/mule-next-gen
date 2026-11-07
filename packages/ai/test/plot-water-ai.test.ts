import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { advancePhase, createGame, GROWN_BASE, monthNeeds, needsOf, observe, runProduction, runUpkeep, UPKEEP, type GameState, type Outfit, type Tile } from '@mule/engine';
import { canFeed, keptUnits, unfedInputs, wholeNextMonth } from '../src/value.js';

/**
 * AM-18 for the AI: canFeed counts every plot's Water, as the engine takes it at production, so it predicts the turn-off
 * the engine makes. ai0 owns a farm (5 Food), a well and an idle plot for a new Alloy works, holding only its drink in
 * Water and Smithore for the works. Its plots use 2 (farm) + 1 (well) + 1 (the works' recipe) a month; with a well
 * making 4, the stock runs dry by the second month and the farm goes off. (An Alloy works, not a Medicine works: canFeed
 * lets a Medicine works through whatever its inputs, STRATEGIST.medicineDespiteInputs.)
 */

/** AM-18 is off by default (farm Water 0, PM ruling 8 Nov); this file pins it on at Heiko's 2 and restores it after. */
const farmWater = UPKEEP.waterUse.food;
beforeAll(() => {
  UPKEEP.waterUse.food = 2;
});
afterAll(() => {
  UPKEEP.waterUse.food = farmWater;
});

const ME = 'ai0';
const flatGround = { food: 0, water: 0, energy: 0, smithore: 0, crystite: 0, rareEarth: 0 };

/** Development, ai0's farm on column 0, its well (making `well`) on column 2, an idle plot on column 4; others hold nothing. */
function colony(well: number): GameState {
  const state = createGame({ seed: 7, players: ['ai0', 'ai1', 'ai2', 'ai3'].map((id) => ({ id, name: id, isAi: true, species: 'zipwing' as const })) });
  while (state.phase !== 'development') advancePhase(state);
  for (const t of state.tiles) if (t.owner) Object.assign(t, { owner: null, outfit: null });
  const plots: [number, Outfit | null, Partial<Tile['ground']>][] = [
    [0, 'food', { food: 5 - GROWN_BASE }],
    [2, 'water', { water: well - GROWN_BASE }],
    [4, null, {}],
  ];
  const me = state.players.find((p) => p.id === ME)!;
  for (const [x, outfit, ground] of plots) {
    const tile = state.tiles[x]!;
    Object.assign(tile, { terrain: 'plains', traits: [], ground: { ...flatGround, ...ground }, owner: ME, outfit, pollution: 0, runMonths: 0 } satisfies Partial<Tile>);
    delete tile.special;
    me.analysed.push(x);
  }
  me.money = 5000;
  Object.assign(me.stock, { food: 10, energy: 30, smithore: 20, water: 0 });
  // Only the drink, counted with the works' crew in: the plots' Water must come from the well.
  state.tiles[4]!.outfit = 'alloy';
  me.stock.water = needsOf(state, ME).water;
  state.tiles[4]!.outfit = null;
  return state;
}

/** The engine's answer: the works installed, two productions with the month end between; the farm's second line. */
function farmInMonthTwo(well: number): string[] {
  const state = colony(well);
  state.tiles[4]!.outfit = 'alloy';
  runProduction(state);
  runUpkeep(state);
  const second = runProduction(state);
  return second.lines.find((l) => l.tile === 0)!.parts.map((p) => p.why);
}

describe('AM-18: canFeed predicts the Water turn-off the engine makes', () => {
  it("a well making 4 can't water the farm, the well and the works: the engine turns the farm off, and canFeed says no for Water", () => {
    expect(farmInMonthTwo(4), 'the engine, month 2').toContain('waterOff');

    const obs = observe(colony(4), ME);
    expect(canFeed(obs, ME, 'alloy')).toBe(false);
    expect(unfedInputs(obs, ME, 'alloy')).toEqual(['water']);
  });

  it('a well making 8 waters all three: the engine turns nothing off, and canFeed says yes', () => {
    expect(farmInMonthTwo(8), 'the engine, month 2').not.toContain('waterOff');

    const obs = observe(colony(8), ME);
    expect(canFeed(obs, ME, 'alloy')).toBe(true);
    expect(unfedInputs(obs, ME, 'alloy')).toEqual([]);
  });
});

describe('AM-18: a seat with no farm still needs Water for its plots', () => {
  it('a seat with only a Smithore mine holds its drink and next month\'s Water: the drink again and the mine\'s 1', () => {
    const state = colony(4);
    for (const x of [0, 2]) Object.assign(state.tiles[x]!, { owner: null, outfit: null });
    state.tiles[4]!.outfit = 'smithore';
    const obs = observe(state, ME);
    const drink = needsOf(obs, ME).water;
    expect(monthNeeds(obs, ME).water, 'next production: the drink kept back and the mine\'s 1').toBe(drink + 1);

    expect(wholeNextMonth(obs, ME, 'water')).toBe(drink + keptUnits('water', drink + 1));
  });
});
