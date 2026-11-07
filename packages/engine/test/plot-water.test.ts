import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createGame,
  energyOffOrder,
  GROWN_BASE,
  isFactory,
  monthNeeds,
  needsOf,
  playersUse,
  RECIPES,
  runProduction,
  UPKEEP,
  type GameState,
  type Good,
  type Outfit,
  type Tile,
} from '../src/index.js';

/**
 * AM-18 (Heiko, 5 Nov; PM ruling for PR-5): every working plot uses Water at production, as it uses Energy. A farm
 * drinks 2, every other raw plot 1, a factory what its recipe says. The household's drink is kept back first; an owner
 * short of the rest turns plots off, biggest Water user first, after the Energy pass; a plot turned off makes
 * UPKEEP.offOutputShare and uses neither. Wells and plants pay their own good from their own output, are never turned
 * off, and take the other good last. Observed where the owner receives it: stock after production and the lines.
 * Month 1, no special field, plots two tiles apart (no cluster, no feeder saving).
 */

/** AM-18 is off by default (farm Water 0, PM ruling 8 Nov); this file pins it on at Heiko's 2 and restores it after. */
const farmWater = UPKEEP.waterUse.food;
beforeAll(() => {
  UPKEEP.waterUse.food = 2;
});
afterAll(() => {
  UPKEEP.waterUse.food = farmWater;
});

const flatGround = { food: 0, water: 0, energy: 0, smithore: 0, crystite: 0, rareEarth: 0 };

function colony(): GameState {
  const state = createGame({ seed: 42, players: ['zipwing', 'gearling', 'zipwing', 'gearling'].map((species, i) => ({ id: `p${i}`, name: `P${i}`, isAi: false, species: species as 'zipwing' })) });
  for (const t of state.tiles) delete t.special;
  for (const p of state.players) Object.assign(p.stock, { energy: 20, water: 0 });
  return state;
}

/** Lays p0's plots, the k-th at (2·(k mod 7), 2·⌊k/7⌋); a raw plot's ground set so it makes `out`. */
function lay(state: GameState, plots: { good: Outfit; out?: number }[]): Tile[] {
  return plots.map(({ good, out = 0 }, k) => {
    const tile = state.tiles[2 * Math.floor(k / 7) * state.width + 2 * (k % 7)]!;
    expect(tile.terrain).not.toBe('store');
    const ground = { ...flatGround };
    if (good === 'food' || good === 'water' || good === 'energy') ground[good] = out - GROWN_BASE;
    else if (!isFactory(good)) ground[good as 'smithore'] = out;
    Object.assign(tile, { terrain: 'plains', traits: [], peaks: 0, ground, owner: 'p0', outfit: good, pollution: 0, filter: false, runMonths: 0 });
    return tile;
  });
}

const p0 = (state: GameState) => state.players.find((x) => x.id === 'p0')!;
/** What the household and crews drink at upkeep: production keeps it back. */
const drink = (state: GameState) => needsOf(state, 'p0').water;
const lineOf = (run: ReturnType<typeof runProduction>, state: GameState, tile: Tile) => run.lines.find((l) => l.tile === state.tiles.indexOf(tile))!;
const offFor = (run: ReturnType<typeof runProduction>, state: GameState, tile: Tile) =>
  lineOf(run, state, tile).parts.find((x) => x.why === 'waterOff' || x.why === 'energyOff')?.why ?? null;

/** Lays the plots, gives p0 its drink plus `spare` Water (and `stock`), runs production. */
function produce(plots: { good: Outfit; out?: number }[], spare: number, stock: Partial<Record<Good, number>> = {}) {
  const state = colony();
  const tiles = lay(state, plots);
  Object.assign(p0(state).stock, stock, { water: drink(state) + spare });
  const run = runProduction(state);
  return { state, tiles, run, waterLeft: p0(state).stock.water - drink(state) };
}

describe('AM-18: every plot uses Water at production, and turns off without it', () => {
  it('the numbers are config: a farm 2 (the switch, pinned on here), every other raw plot 1, a factory 1', () => {
    expect(UPKEEP.waterUse).toEqual({ food: 2, water: 1, energy: 1, smithore: 1, crystite: 1, rareEarth: 1 });
    expect(UPKEEP.factoryWaterUse).toEqual({ alloy: 1, electronics: 1, medicine: 1 });
    // Medicine's 1 Water is in its recipe: with AM-18 on it is the factory's use, not an input taken twice.
    expect(RECIPES.medicine.inputs.water).toBe(UPKEEP.factoryWaterUse.medicine);
  });

  it('a farm with Water takes 2 and makes its full output', () => {
    const { state, tiles, run, waterLeft } = produce([{ good: 'food', out: 4 }], 2);

    expect(lineOf(run, state, tiles[0]!).made).toBe(4);
    expect(offFor(run, state, tiles[0]!)).toBeNull();
    expect(waterLeft).toBe(0);
  });

  it('a farm short of Water (1 spare of its 2) is turned off: it makes 20% and takes no Water', () => {
    const { state, tiles, run, waterLeft } = produce([{ good: 'food', out: 5 }], 1);

    expect(offFor(run, state, tiles[0]!)).toBe('waterOff');
    expect(lineOf(run, state, tiles[0]!).made).toBe(Math.round(5 * UPKEEP.offOutputShare));
    expect(waterLeft).toBe(1);
  });

  it('the household drinks first: Water only for the drink leaves the farm off', () => {
    const { state, tiles, run, waterLeft } = produce([{ good: 'food', out: 5 }], 0);

    expect(offFor(run, state, tiles[0]!)).toBe('waterOff');
    expect(waterLeft).toBe(0);
  });

  it('any other raw plot takes 1: a Smithore mine runs on 1 spare Water', () => {
    const { state, tiles, run, waterLeft } = produce([{ good: 'smithore', out: 3 }], 1);

    expect(lineOf(run, state, tiles[0]!).made).toBe(3);
    expect(waterLeft).toBe(0);
  });

  it("a factory takes its recipe's Water: an Alloy works runs on 1 spare, and is off on none", () => {
    const on = produce([{ good: 'alloy' }], 1, { smithore: 2 });
    expect(offFor(on.run, on.state, on.tiles[0]!)).toBeNull();
    expect(lineOf(on.run, on.state, on.tiles[0]!).made).toBeGreaterThan(0);
    expect(on.waterLeft).toBe(0);
    expect(p0(on.state).stock.smithore).toBe(0);

    const off = produce([{ good: 'alloy' }], 0, { smithore: 2 });
    expect(offFor(off.run, off.state, off.tiles[0]!)).toBe('waterOff');
    expect(off.waterLeft).toBe(0);
  });

  it('biggest Water user first: with 2 spare, the farm (2) goes off and the mine (1) runs', () => {
    const { state, tiles, run, waterLeft } = produce([{ good: 'food', out: 4 }, { good: 'smithore', out: 3 }], 2);

    expect(offFor(run, state, tiles[0]!)).toBe('waterOff');
    expect(offFor(run, state, tiles[1]!)).toBeNull();
    expect(waterLeft).toBe(1);
  });

  it('Energy is settled first and a plot is never cut twice: the mine off for Energy leaves the farm its Water', () => {
    // Energy 1: the mine (use 2) goes off for Energy; the farm (use 1) runs. The mine then uses no Water, so 2 spare
    // is the farm's.
    const { state, tiles, run, waterLeft } = produce([{ good: 'food', out: 4 }, { good: 'smithore', out: 3 }], 2, { energy: 1 });

    expect(offFor(run, state, tiles[1]!)).toBe('energyOff');
    expect(offFor(run, state, tiles[0]!)).toBeNull();
    expect(waterLeft).toBe(0);
  });

  it('a well pays its own Water from its output, and is never turned off, for Water or Energy', () => {
    const { state, tiles, run } = produce([{ good: 'water', out: 4 }], 0, { energy: 0 });

    expect(offFor(run, state, tiles[0]!)).toBeNull();
    expect(lineOf(run, state, tiles[0]!).made).toBe(4);
    expect(p0(state).stock.water).toBe(drink(state) + 4 - UPKEEP.waterUse.water);
    expect(energyOffOrder(state, 'p0', 1)).toEqual([]);
  });

  it('a plant takes its Water last, from what the other plots leave; short, it still runs', () => {
    const { state, tiles, run, waterLeft } = produce([{ good: 'energy', out: 3 }, { good: 'food', out: 4 }], 2);

    expect(offFor(run, state, tiles[1]!)).toBeNull();
    expect(offFor(run, state, tiles[0]!)).toBeNull();
    expect(lineOf(run, state, tiles[0]!).made).toBe(3);
    expect(waterLeft).toBe(0);
  });

  it("monthNeeds counts the plots' Water on top of the drink, a well's own aside", () => {
    const state = colony();
    lay(state, [{ good: 'food', out: 4 }, { good: 'smithore', out: 3 }, { good: 'water', out: 3 }, { good: 'alloy' }]);

    expect(monthNeeds(state, 'p0').water).toBe(drink(state) + 2 + 1 + 1);
  });

  it("the store counts the plots' Water as the players' use, on top of their drink, a well's own aside", () => {
    const state = colony();
    const drinks = () => state.players.reduce((n, p) => n + needsOf(state, p.id).water, 0);
    lay(state, [{ good: 'food', out: 4 }, { good: 'smithore', out: 3 }, { good: 'water', out: 3 }, { good: 'alloy' }]);

    expect(playersUse(state).water).toBe(drinks() + 2 + 1 + 1);
  });
});
