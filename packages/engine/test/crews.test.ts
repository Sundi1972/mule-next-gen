import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  createGame,
  crewFactor,
  GROWN_BASE,
  hardship,
  isFactory,
  needsOf,
  runProduction,
  runUpkeep,
  UPKEEP,
  type GameState,
  type Outfit,
  type ProductionLine,
  type Tile,
} from '../src/index.js';

/**
 * needs C14, RULE-12: a crew left short at last month's end works slower next production. At upkeep the household eats
 * first, then the crews, from the player's stock; the crews' shortfall of Food and of Water is recorded, and the next
 * production scales every plot of that player but Energy plants by f = (1 − crewDrop × g(sF)) × (1 − crewDrop × g(sW)),
 * g the colonists' hardship curve, rounded half up, before any turn-off.
 */

const flatGround = { food: 0, water: 0, energy: 0, smithore: 0, crystite: 0, rareEarth: 0 };

function newGame(): GameState {
  const state = createGame({ seed: 42, players: ['p0', 'p1', 'p2', 'p3'].map((id) => ({ id, name: id, isAi: false, species: 'gearling' as const })) });
  for (const t of state.tiles) delete t.special;
  return state;
}

function toPhase(state: GameState, phase: GameState['phase']): void {
  for (let steps = 0; state.phase !== phase && steps < 10; steps++) advancePhase(state);
  expect(state.phase).toBe(phase);
}

/** Lays p0's plots two tiles apart (no cluster, no feeder), skipping the store; a raw plot's ground set so it makes `out`. */
function lay(state: GameState, plots: { good: Outfit; out?: number }[]): Tile[] {
  const free = state.tiles.filter((t) => t.terrain !== 'store' && t.x % 2 === 0 && t.y % 2 === 0);
  expect(free.length, 'the premise: room for every plot').toBeGreaterThanOrEqual(plots.length);
  return plots.map(({ good, out = 0 }, k) => {
    const tile = free[k]!;
    const ground = { ...flatGround };
    if (good === 'food' || good === 'water' || good === 'energy') ground[good] = out - GROWN_BASE;
    else if (!isFactory(good)) ground[good as 'smithore'] = out;
    Object.assign(tile, { terrain: 'plains', traits: [], peaks: 0, ground, owner: 'p0', outfit: good, pollution: 0, filter: false, runMonths: 0 });
    return tile;
  });
}

const p0 = (state: GameState) => state.players.find((p) => p.id === 'p0')!;
/** What p0's household needs of Food at upkeep; its crews need the rest of needsOf. */
const household = UPKEEP.baseFood;

/**
 * Lays p0's plots at month 1's auction, gives p0 `food` Food for the month's end (Water in full), runs the month end,
 * then fills p0's stock so nothing is short at production, and plays month 2 to its production. Returns p0's lines from
 * the month report.
 */
function monthAfter(plots: { good: Outfit; out?: number }[], food: (state: GameState) => number) {
  const state = newGame();
  toPhase(state, 'auction');
  const tiles = lay(state, plots);
  Object.assign(p0(state).stock, { food: food(state), water: needsOf(state, 'p0').water + 5 });
  toPhase(state, 'upkeep');
  // Production runs before the month's market: p0 now holds plenty of everything, so stock in hand reads nobody short.
  toPhase(state, 'development');
  Object.assign(p0(state).stock, { food: 50, water: 200, energy: 200, smithore: 20 });
  toPhase(state, 'production');
  const report = state.history.at(-1)!;
  expect(report.month, 'the premise: month 2 produced').toBe(2);
  const lineOf = (tile: Tile) => report.lines!.find((l) => l.tile === state.tiles.indexOf(tile))!;
  const lines = tiles.map(lineOf);
  for (const line of lines) expect(line.parts.some((p) => p.why === 'event'), `the premise: no event reaches plot ${line.tile}`).toBe(false);
  return { state, tiles, lines };
}

const crewPart = (line: ProductionLine) => line.parts.find((p) => p.why === 'crewShort');

describe('needs C14: a crew left short works slower next month (RULE-12)', () => {
  // A farm making 3, a well 10, a Smithore mine 3, an Alloy works (2) and an Energy plant 4: 6 crew, who need 2 Food.
  const ESTATE: { good: Outfit; out?: number }[] = [
    { good: 'food', out: 3 },
    { good: 'water', out: 10 },
    { good: 'smithore', out: 3 },
    { good: 'alloy' },
    { good: 'energy', out: 4 },
  ];

  it('needs B-AC-13: crews given half their Food at last month\'s end: each plot but Energy plants makes 85% of its output, rounded half up', () => {
    const fed = monthAfter(ESTATE, (state) => needsOf(state, 'p0').food);
    const half = monthAfter(ESTATE, (state) => household + (needsOf(state, 'p0').food - household) / 2);
    expect(needsOf(fed.state, 'p0').food - household, 'the premise: the crews need 2 Food, so half is 1').toBe(2);

    const made = (run: typeof fed) => run.lines.map((l) => l.made);
    expect(made(fed), 'the premise: fed, each plot makes its full output').toEqual([3, 10, 3, 2, 4]);
    expect(made(half), "85% rounded half up: 2.55 → 3, 8.5 → 9, 1.7 → 2; the Energy plant's 4 unchanged").toEqual([3, 9, 3, 2, 4]);
    fed.lines.forEach((line, i) => {
      const cut = half.lines[i]!;
      const energy = ESTATE[i]!.good === 'energy';
      expect(cut.made, `plot ${i}`).toBe(energy ? line.made : Math.round(line.made * 0.85));
      expect(crewPart(cut)?.delta ?? 0, `plot ${i}'s line names the cut`).toBe(cut.made - line.made);
    });
  });

  it('needs B-AC-13 (negative): a crew 10% short loses nothing', () => {
    // 37 farms: 37 crew need 10 Food; 9 of them is 10% short.
    const farms = Array.from({ length: 37 }, () => ({ good: 'food' as const, out: 3 }));
    const fed = monthAfter(farms, (state) => needsOf(state, 'p0').food);
    const short = monthAfter(farms, (state) => needsOf(state, 'p0').food - 1);
    expect(needsOf(short.state, 'p0').food - household, 'the premise: the crews need 10 Food').toBe(10);

    expect(short.lines.map((l) => l.made)).toEqual(fed.lines.map((l) => l.made));
    expect(short.lines.filter(crewPart)).toEqual([]);
  });

  it('needs T-AC-24: RULE-12\'s examples: sF 0.1 → 1 · sF 0.5 → 0.85 · sF 1 → 0.5 · sF 1 and sW 1 → 0.25', () => {
    expect(crewFactor({ food: 0.1, water: 0 })).toBe(1);
    expect(crewFactor({ food: 0.5, water: 0 })).toBeCloseTo(0.85, 2);
    expect(crewFactor({ food: 1, water: 0 })).toBe(0.5);
    expect(crewFactor({ food: 0, water: 1 })).toBe(0.5);
    expect(crewFactor({ food: 1, water: 1 })).toBe(0.25);
    expect(UPKEEP.crewDrop).toBe(0.5);
  });

  it('needs T-AC-24: the curve is colony.ts::hardship, imported, never copied', () => {
    for (const s of [0, 0.1, 0.11, 0.3, 0.5, 0.75, 1]) {
      expect(crewFactor({ food: s, water: 0 }), `sF ${s}`).toBe(1 - UPKEEP.crewDrop * hardship(s));
    }
    const source = readFileSync(fileURLToPath(new URL('../src/production.ts', import.meta.url)), 'utf8');
    expect(source, 'production.ts imports the curve').toMatch(/import \{[^}]*\bhardship\b[^}]*\} from '\.\/colony\.js'/);
    expect(source, 'and holds no copy of its numbers').not.toMatch(/\bHARDSHIP\b/);
  });

  it("needs T-AC-24: crews' need 0 → no shortfall, f 1: a player with no crews and no Food records nothing short for them", () => {
    const state = newGame();
    Object.assign(p0(state).stock, { food: 0, water: 0 });
    expect(needsOf(state, 'p0'), 'the premise: no plots, the household alone').toEqual({ food: UPKEEP.baseFood, water: UPKEEP.baseWater });
    runUpkeep(state);
    expect(p0(state).crewShort).toEqual({ food: 0, water: 0 });
    expect(crewFactor(p0(state).crewShort!)).toBe(1);
  });

  it('needs T-AC-24: Energy plants are never cut; every other plot is, before the Energy turn-off', () => {
    const state = newGame();
    const [plant, farm, mine] = lay(state, [
      { good: 'energy', out: 2 },
      { good: 'food', out: 5 },
      { good: 'smithore', out: 5 },
    ]);
    // Wholly short crews (f 0.25). The plant keeps 1 of its 2 after its own use: the farm's 1 but not the mine's 2, so
    // the mine is turned off.
    p0(state).crewShort = { food: 1, water: 1 };
    Object.assign(p0(state).stock, { food: 20, water: 50, energy: 0 });
    const run = runProduction(state);
    const lineOf = (tile: Tile) => run.lines.find((l) => l.tile === state.tiles.indexOf(tile))!;

    expect(lineOf(plant!).made, 'the plant makes its 2').toBe(2);
    expect(crewPart(lineOf(plant!))).toBeUndefined();
    expect(lineOf(farm!).made, '5 × 0.25 = 1.25 → 1').toBe(1);
    expect(lineOf(mine!).parts.map((p) => p.why), 'the crew cut comes before the turn-off').toEqual(['ground', 'crewShort', 'energyOff']);
  });

  it('needs T-AC-24 (AM-4): the farm halving does not run while AM-18 is on', () => {
    const state = newGame();
    const [farm] = lay(state, [{ good: 'food', out: 4 }]);
    Object.assign(p0(state).stock, { energy: 20, water: 0 });
    const run = runProduction(state);
    const line = run.lines.find((l) => l.tile === state.tiles.indexOf(farm!))!;
    expect(line.parts.map((p) => p.why), 'turned off for want of Water, never halved').not.toContain('noWater');
  });
});
