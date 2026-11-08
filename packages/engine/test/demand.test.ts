import { describe, expect, it } from 'vitest';
import { advancePhase, cloneForSim, colonistMedicineNeed, createGame, exportDemand, HEALTH, monthlyDemand, POLLUTION, RECIPES, UPKEEP, type GameState } from '../src/index.js';
import { game, to, worked } from './fixtures/food-month.js';

/** Month 1's production with `colonists` in the colony and no Electronics works. */
function colonyOf(colonists: number): GameState {
  const state = game();
  to(state, 'production');
  state.colonists = colonists;
  expect(state.tiles.some((t) => t.outfit === 'electronics'), 'the premise: no Electronics works').toBe(false);
  return state;
}

/** What the colonists add to the Electronics, Rare earth, Alloy and Energy demand over a colony of none, all else equal. */
function colonistsAdd(state: GameState): { electronics: number; rareEarth: number; alloy: number; energy: number } {
  const none = cloneForSim(state);
  none.colonists = 0;
  const [d, d0] = [monthlyDemand(state), monthlyDemand(none)];
  // Energy also carries the colonists' own Energy want, in full since they have no wages (needs C2), so it is compared
  // with that part taken out.
  const ownEnergy = (s: GameState) => (s.colonists / UPKEEP.colonistsPerUnit) * UPKEEP.colonistEnergyShare;
  const energy = d.energy - ownEnergy(state) - (d0.energy - ownEnergy(none));
  return { electronics: d.electronics - d0.electronics, rareEarth: d.rareEarth - d0.rareEarth, alloy: d.alloy - d0.alloy, energy };
}

describe('needs C17: the colonists want Electronics, and so its inputs', () => {
  it('needs B-AC-15: 200 colonists add 4 Electronics, 4 Rare earth and 4 Alloy to the demand, and Electronics leaves the off-world band', () => {
    const { rareEarth, alloy } = RECIPES.electronics.inputs;
    expect({ rareEarth, alloy }, 'the premise: one Rare earth and one Alloy per Electronics, so 4 each').toEqual({ rareEarth: 1, alloy: 1 });
    const state = colonyOf(200);

    advancePhase(state);
    expect(state.phase, 'the premise: the store has posted').toBe('auction');

    expect(colonistsAdd(state)).toEqual({ electronics: 4, rareEarth: 4, alloy: 4, energy: 0 });
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
    expect(colonistsAdd(colonyOf(colonists))).toEqual({ electronics: want, rareEarth: want, alloy: want, energy: 0 });
  });

  it('needs T-AC-25: the want follows UPKEEP.colonistsPerElectronics and the inputs RECIPES.electronics.inputs under a test override', () => {
    const state = colonyOf(200);
    const [savedPer, savedInputs] = [UPKEEP.colonistsPerElectronics, RECIPES.electronics.inputs];
    UPKEEP.colonistsPerElectronics = 25;
    RECIPES.electronics.inputs = { ...savedInputs, rareEarth: 2, alloy: 0 };
    try {
      expect(colonistsAdd(state)).toEqual({ electronics: 8, rareEarth: 16, alloy: 0, energy: 0 });
    } finally {
      UPKEEP.colonistsPerElectronics = savedPer;
      RECIPES.electronics.inputs = savedInputs;
    }
  });

  /** The Electronics, Rare earth and Alloy the colony asks a month with `colonists` and `works` Electronics works, the export ship's part taken out. */
  function asked(colonists: number, works: number): { electronics: number; rareEarth: number; alloy: number } {
    const state = game();
    to(state, 'production');
    state.colonists = colonists;
    worked(state, 'electronics', works);
    expect(state.tiles.filter((t) => t.outfit === 'electronics'), 'the premise: the works stand').toHaveLength(works);
    const [d, off] = [monthlyDemand(state), exportDemand(state)];
    return { electronics: d.electronics - off.electronics, rareEarth: d.rareEarth - off.rareEarth, alloy: d.alloy - off.alloy };
  }

  it.each([
    { name: '0 works 4', works: 0, rareEarth: 1, output: 1, want: { electronics: 4, rareEarth: 4, alloy: 4 } },
    { name: '4 works 4', works: 4, rareEarth: 1, output: 1, want: { electronics: 4, rareEarth: 4, alloy: 4 } },
    { name: '6 works 6', works: 6, rareEarth: 1, output: 1, want: { electronics: 4, rareEarth: 6, alloy: 6 } },
    { name: '6 works taking 2 Rare earth each ask 12', works: 6, rareEarth: 2, output: 1, want: { electronics: 4, rareEarth: 12, alloy: 6 } },
    { name: 'a recipe making 2 needs 2 batches for E = 4', works: 0, rareEarth: 1, output: 2, want: { electronics: 4, rareEarth: 2, alloy: 2 } },
  ])('needs C17 AM-2: with 200 colonists the inputs ask max(works, E ÷ output) × recipe, and Electronics stays E: $name', ({ works, rareEarth, output, want }) => {
    const saved = RECIPES.electronics;
    RECIPES.electronics = { inputs: { ...saved.inputs, rareEarth, alloy: 1 }, output };
    try {
      expect(asked(200, works)).toEqual(want);
    } finally {
      RECIPES.electronics = saved;
    }
  });
});

describe("needs C13: the colonists' Medicine demand reads colony health (RULE-11, RULE-8)", () => {
  /** The colonists' part of the store's Medicine demand: a politics colony of 400 at sick share `sick`, all else the same with none. */
  function colonistsMedicine(sick: number, air: number): number {
    const state = createGame({ seed: 7, politics: true, players: ['p0', 'p1', 'p2', 'p3'].map((id) => ({ id, name: id, isAi: false })) });
    state.colonists = 400;
    state.colony!.sick = sick;
    state.air = air;
    const none = cloneForSim(state);
    none.colonists = 0;
    return monthlyDemand(state).medicine - monthlyDemand(none).medicine;
  }
  const today = 400 / UPKEEP.colonistsPerMedicine;
  const SMOG = POLLUTION.bands.find((b) => b.name === 'smoggy')!.from;

  it("needs B-AC-12 (the Medicine case): health on, h at the cap gives the colonists' Medicine demand +40%; health off gives today's", () => {
    expect(colonistsMedicine(HEALTH.cap, 0), 'health off: one per colonistsPerMedicine').toBeCloseTo(today, 9);
    HEALTH.enabled = true;
    try {
      expect(colonistsMedicine(HEALTH.cap, 0)).toBeCloseTo(today * 1.4, 9);
      expect(colonistsMedicine(HEALTH.cap, SMOG), 'dirty air still multiplies it').toBeCloseTo(today * 1.4 * POLLUTION.sickMedicineDemand, 9);
      expect(colonistsMedicine(0, 0), 'h 0: today\'s').toBeCloseTo(today, 9);
    } finally {
      HEALTH.enabled = false;
    }
    expect(colonistsMedicine(HEALTH.cap, SMOG), "health off in dirty air: today's dirty-air demand").toBeCloseTo(today * POLLUTION.sickMedicineDemand, 9);
  });
});

describe("needs C13: the store's demand is players + crews + colonists (RULE-11)", () => {
  /** 4 seats each working 3 farms and a well, 100 colonists, Food posted at 300, the month as the store posts it. */
  function farmers(): GameState {
    const state = createGame({ seed: 7, players: ['p0', 'p1', 'p2', 'p3'].map((id) => ({ id, name: id, isAi: false })) });
    const free = state.tiles.filter((t) => t.terrain !== 'store' && !t.owner);
    state.players.forEach((p, i) => {
      (['food', 'food', 'food', 'water'] as const).forEach((outfit, k) => Object.assign(free[i * 4 + k]!, { owner: p.id, outfit }));
    });
    state.colonists = 100;
    state.store.posted.food = 300;
    state.monthEvents = [];
    return state;
  }
  const festival = (units: number) =>
    ({ key: 'festival', effects: [{ on: 'store', what: 'food', delta: units }] }) as unknown as GameState['monthEvents'][number];

  it('needs B-AC-12: 4 seats of "3 farms + well" and 100 colonists, Food posted at 300, give a store Food demand of 17', () => {
    const state = farmers();
    expect(exportDemand(state).food, 'the premise: no ship wants Food').toBe(0);
    // 4 seats × (2 + ⌈4 × ¼⌉) + 100 ÷ 20, at any price: no wage cap.
    expect(monthlyDemand(state).food).toBe(17);
  });

  it('needs B-AC-12 (negative): a festival month adds its Food on top', () => {
    const state = farmers();
    state.monthEvents = [festival(2)];
    expect(monthlyDemand(state).food).toBe(19);
  });

  /** The players' part of the store's Medicine demand: all of it but the colonists' need and the export ship's take. */
  function playersMedicine(sick: number): number {
    const state = createGame({ seed: 7, politics: true, players: ['p0', 'p1', 'p2', 'p3'].map((id) => ({ id, name: id, isAi: false })) });
    state.colonists = 400;
    state.colony!.sick = sick;
    state.air = 0;
    for (const p of state.players) p.stock.medicine = 0;
    return monthlyDemand(state).medicine - colonistMedicineNeed(state) - exportDemand(state).medicine;
  }

  it("needs B-AC-12 (the Medicine case): health on, h 0.3, 4 seats holding no Medicine: the crews' cure adds 4; health off, today's", () => {
    expect(playersMedicine(0.3), 'health off: no crew falls sick').toBeCloseTo(0, 9);
    HEALTH.enabled = true;
    try {
      expect(0.3, 'the premise: h at or over crewSickFrom').toBeGreaterThanOrEqual(HEALTH.crewSickFrom);
      expect(playersMedicine(0.3)).toBeCloseTo(4, 9);
      expect(playersMedicine(0), "h 0: no crew falls sick, today's").toBeCloseTo(0, 9);
    } finally {
      HEALTH.enabled = false;
    }
  });
});
