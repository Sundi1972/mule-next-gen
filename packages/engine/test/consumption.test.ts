import { describe, expect, it } from 'vitest';
import * as engine from '../src/index.js';
import {
  createGame,
  crewUpkeep,
  GOOD_CONFIG,
  GOODS,
  GROWN_BASE,
  isFactory,
  needsOf,
  RECIPES,
  runProduction,
  runUpkeep,
  UPKEEP,
  type GameState,
  type Outfit,
  type Stock,
  type Tile,
} from '../src/index.js';

/**
 * needs C10, C11, RULE-10 with AM-3: each kind of plot's crew eats its own Food and each plot burns its own Energy, from
 * one CONSUMPTION table in config.ts. A player's Food is the household's plus the table's Food summed over their plots
 * and rounded up once; their Water is the household's alone (plot Water is AM-18's production input). A factory burns
 * its recipe's Energy plus the table's.
 */

/** The table as the engine exports it; read through the namespace so this file loads before the table exists. */
const table = () => (engine as unknown as { CONSUMPTION: Record<Outfit, Record<string, number>> }).CONSUMPTION;

const OUTFITS: Outfit[] = [...GOODS, 'greenBelt'];
const flatGround = { food: 0, water: 0, energy: 0, smithore: 0, crystite: 0, rareEarth: 0 };

/** Month 1 (no event fires), no special field, nobody holding anything. */
function colony(): GameState {
  const state = createGame({ seed: 42, players: ['p0', 'p1', 'p2', 'p3'].map((id) => ({ id, name: id, isAi: false, species: 'gearling' as const })) });
  for (const t of state.tiles) delete t.special;
  for (const p of state.players) p.stock = Object.fromEntries(GOODS.map((g) => [g, 0])) as Stock;
  return state;
}

/**
 * Gives `owner` a plot of each outfit, two tiles apart (no cluster, no feeder saving), on plains, new; a raw plot's
 * ground set so it makes `out`.
 */
function lay(state: GameState, owner: string, outfits: readonly Outfit[], out = 2): Tile[] {
  const free = state.tiles.filter((t) => t.terrain !== 'store' && !t.owner && t.x % 2 === 0 && t.y % 2 === 0);
  expect(free.length, 'the premise: room for every plot').toBeGreaterThanOrEqual(outfits.length);
  return outfits.map((outfit, k) => {
    const ground = { ...flatGround };
    if (outfit === 'food' || outfit === 'water' || outfit === 'energy') ground[outfit] = out - GROWN_BASE;
    else if (outfit !== 'greenBelt' && !isFactory(outfit)) ground[outfit] = out;
    return Object.assign(free[k]!, { terrain: 'plains', traits: [], peaks: 0, ground, owner, outfit, pollution: 0, filter: false, runMonths: 0 });
  });
}

const player = (state: GameState, id: string) => state.players.find((p) => p.id === id)!;

const MINER: Outfit[] = ['smithore', 'smithore', 'crystite', 'energy'];
const FARMER: Outfit[] = ['food', 'food', 'food', 'water'];

describe('needs C10: each kind of plot eats its own Food (RULE-10, AM-3)', () => {
  // RULE-10's examples. The spec's Water figures (3, 3, 2) predate AM-3, which drops the table's Water column: Water is
  // the household's 1 in every case.
  it.each<[string, number, Outfit[]]>([
    ['no plots', 2, []],
    ['three farms and a well', 3, FARMER],
    ['two Smithore mines, a Crystite mine and a plant', 4, MINER],
    ['a lone green belt', 2, ['greenBelt']],
  ])('needs T-AC-20: RULE-10, %s needs %i Food and 1 Water', (_name, food, outfits) => {
    const state = colony();
    lay(state, 'p0', outfits);
    expect(needsOf(state, 'p0')).toEqual({ food, water: 1, medicine: 0 });
  });

  it('needs T-AC-20: every CONSUMPTION row sums exactly in quarters: four plots of it add four times its Food', () => {
    for (const outfit of OUTFITS) {
      const state = colony();
      lay(state, 'p0', [outfit, outfit, outfit, outfit]);
      expect(needsOf(state, 'p0').food, outfit).toBe(UPKEEP.baseFood + 4 * table()[outfit]!.food!);
    }
  });

  it("needs T-AC-20: HC-10's guard: one row per Outfit, Food and Energy only, each a whole number of quarters and never below 0", () => {
    expect(Object.keys(table()).sort()).toEqual([...OUTFITS].sort());
    // The approved table (production.html#plot-consumption, Heiko 6 Nov); a works' Energy is its draw on top of its recipe.
    expect(table(), 'the approved numbers').toEqual({
      food: { food: 0.25, energy: 1 },
      water: { food: 0.25, energy: 1 },
      energy: { food: 0.25, energy: 1 },
      smithore: { food: 0.5, energy: 2 },
      crystite: { food: 0.75, energy: 2 },
      rareEarth: { food: 0.5, energy: 2 },
      alloy: { food: 0.5, energy: 1 },
      electronics: { food: 0.5, energy: 2 },
      medicine: { food: 0.5, energy: 1 },
      greenBelt: { food: 0, energy: 0 },
    });
    for (const outfit of OUTFITS) {
      const row = table()[outfit]!;
      expect(Object.keys(row).sort(), `${outfit}: no Water column (AM-3)`).toEqual(['energy', 'food']);
      for (const [what, value] of Object.entries(row)) {
        expect(value, `${outfit}.${what}`).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(value * 4), `${outfit}.${what} in quarters`).toBe(true);
      }
    }
  });
});

describe('needs C10: households and crews eat at upkeep', () => {
  it("needs B-AC-10: the miner's household ate 4 Food, the farmer's 3, a seat with no plots 2, and each drank 1 Water", () => {
    const state = colony();
    lay(state, 'p0', MINER);
    lay(state, 'p1', FARMER);
    for (const p of state.players) Object.assign(p.stock, { food: 10, water: 10 });
    const saved = { food: GOOD_CONFIG.food.spoilage, water: GOOD_CONFIG.water.spoilage };
    // Spoilage runs after the meal; off, the depot after upkeep is what the meal left.
    GOOD_CONFIG.food.spoilage = 0;
    GOOD_CONFIG.water.spoilage = 0;
    try {
      runUpkeep(state);
    } finally {
      GOOD_CONFIG.food.spoilage = saved.food;
      GOOD_CONFIG.water.spoilage = saved.water;
    }
    const ate = (id: string) => ({ food: 10 - player(state, id).stock.food, water: 10 - player(state, id).stock.water });
    expect(ate('p0'), 'the miner').toEqual({ food: 4, water: 1 });
    expect(ate('p1'), 'the farmer').toEqual({ food: 3, water: 1 });
    expect(ate('p2'), 'no plots').toEqual({ food: 2, water: 1 });
  });
});

describe('needs C11: a factory burns its recipe and a running draw on top', () => {
  /** p0 with one works of `good`, its inputs and `energy` Energy in stock, Water for its use and the household. */
  function works(good: 'alloy' | 'electronics', energy: number) {
    const state = colony();
    const [tile] = lay(state, 'p0', [good]);
    Object.assign(player(state, 'p0').stock, { ...RECIPES[good].inputs, energy, water: 10 });
    const run = runProduction(state);
    const line = run.lines.find((l) => l.tile === state.tiles.indexOf(tile!))!;
    return { state, line, stock: player(state, 'p0').stock, off: line.parts.some((x) => x.why === 'energyOff') };
  }

  it('needs B-AC-11: an Electronics works that runs costs its owner the recipe Energy plus 2', () => {
    const use = RECIPES.electronics.inputs.energy! + 2;
    const { stock, off, line } = works('electronics', 10);
    expect(off, 'the premise: it runs').toBe(false);
    expect(stock.energy).toBe(10 - use);
    expect(stock.electronics, 'what it made reached the depot').toBe(line.made);
    expect(line.made).toBeGreaterThan(0);
  });

  it('needs B-AC-11 (negative): a works turned off for want of Energy draws only its share (AM-17): no Energy', () => {
    const use = RECIPES.electronics.inputs.energy! + 2;
    const { stock, off } = works('electronics', use - 1);
    expect(off).toBe(true);
    expect(stock.energy, 'a works turned off uses no Energy').toBe(use - 1);
  });

  // The use at this state: the recipe's 2 + the table's 1. Plains, nothing beside it, so no fit or feeder changes it; the
  // brief's stock of 3 and 2 match that use as they stand.
  it('needs T-AC-22: an Alloy works with 3 Energy in stock and a use of 3 runs', () => {
    expect(RECIPES.alloy.inputs.energy! + table().alloy!.energy!, 'the premise: a use of 3').toBe(3);
    const { stock, off } = works('alloy', 3);
    expect(off).toBe(false);
    expect(stock.energy, 'the run draws its whole use').toBe(0);
    expect(stock.alloy).toBe(RECIPES.alloy.output);
  });

  it('needs T-AC-22: with 2 Energy the Alloy works is turned off (AM-17)', () => {
    const { stock, off } = works('alloy', 2);
    expect(off).toBe(true);
    expect(stock.energy).toBe(2);
  });

  it("needs T-AC-22: production's second pass checks the same use: an Alloy works fed by this month's Smithore", () => {
    /** p0's mine makes the 2 Smithore the works needs this month; nothing in stock, so the works runs in the second pass. */
    const secondPass = (energy: number) => {
      const state = colony();
      const [mine, tile] = lay(state, 'p0', ['smithore', 'alloy'], RECIPES.alloy.inputs.smithore!);
      Object.assign(player(state, 'p0').stock, { energy, water: 10 });
      const run = runProduction(state);
      const of = (t: Tile) => run.lines.find((l) => l.tile === state.tiles.indexOf(t))!;
      expect(of(mine!).made, 'the premise: the mine made the Smithore').toBe(RECIPES.alloy.inputs.smithore);
      return { off: of(tile!).parts.some((x) => x.why === 'energyOff'), energy: player(state, 'p0').stock.energy };
    };
    const mine = table().smithore!.energy!;
    expect(secondPass(mine + 3), 'Energy for the mine and the whole use runs').toEqual({ off: false, energy: 0 });
    expect(secondPass(mine + 2).off, 'one short of the use is turned off').toBe(true);
  });
});

describe('needs C12: crewUpkeep, one plot crew\'s Food and Water a month, unrounded', () => {
  it('needs C12: crewUpkeep is the CONSUMPTION row\'s Food for every outfit and no Water (AM-3); the AI weighs a plot by this rate, not the stepped marginal', () => {
    for (const o of Object.keys(engine.CONSUMPTION) as (keyof typeof engine.CONSUMPTION)[]) {
      expect(crewUpkeep(o), o).toEqual({ food: engine.CONSUMPTION[o].food, water: 0 });
    }
    expect(crewUpkeep('crystite'), 'the hungriest crew').toEqual({ food: 0.75, water: 0 });
    expect(crewUpkeep('greenBelt')).toEqual({ food: 0, water: 0 });
  });
});
