import { describe, expect, it } from 'vitest';
import {
  createGame,
  factoryFit,
  PROCESSED_GOODS,
  RAW_GOODS,
  rawOutputParts,
  runProduction,
  type GameState,
  type SpecialField,
  type Species,
  type Tile,
} from '../src/index.js';

/**
 * RULE-6, observed where the owner receives it: the month's `produced`
 * record and report lines that runProduction returns, and the owner's stock.
 * A full month is not played: the land grant and auction around production
 * add nothing these rules read.
 */

const flatGround = { food: 0, water: 0, energy: 0, smithore: 0, crystite: 0, rareEarth: 0 };
// No species perk touches mining, farming or factories for Zipwing or Gearling.
const SPECIES: Species[] = ['zipwing', 'gearling', 'zipwing', 'gearling'];

/** Month 1 (no production events), no special field anywhere, and owners stocked so nothing runs at half. */
function colony(seed = 42): GameState {
  const state = createGame({ seed, players: SPECIES.map((species, i) => ({ id: `p${i}`, name: `P${i}`, isAi: false, species })) });
  for (const t of state.tiles) delete t.special;
  for (const p of state.players) Object.assign(p.stock, { energy: 50, water: 50, smithore: 20 });
  return state;
}

function plot(state: GameState, x: number, y: number, terrain: Tile['terrain'], ground: Partial<Tile['ground']> = {}): Tile {
  const tile = state.tiles[y * state.width + x]!;
  Object.assign(tile, { terrain, traits: [], ground: { ...flatGround, ...ground }, owner: null, outfit: null, pollution: 0, filter: false, runMonths: 0 });
  return tile;
}

function worked(tile: Tile, outfit: Tile['outfit'], owner = 'p0', special?: SpecialField): Tile {
  Object.assign(tile, { owner, outfit });
  if (special) tile.special = special;
  return tile;
}

const indexOf = (state: GameState, tile: Tile) => state.tiles.indexOf(tile);
const madeOn = (run: ReturnType<typeof runProduction>, state: GameState, tile: Tile) => run.lines.find((l) => l.tile === indexOf(state, tile))?.made;

describe('RULE-6: what special fields do', () => {
  it('B-AC-6: a crystal cavern mined for Crystite makes 4 more, before adjacency', () => {
    const state = colony();
    // Crystite 3 under the cavern, no own neighbour: 3 + 4.
    const cavern = worked(plot(state, 0, 0, 'hills', { crystite: 3 }), 'crystite', 'p0', { kind: 'crystalCavern' });
    // The same cavern beside an own Crystite mine of 3: the pair gets the neighbour bonus on top, 3+4+1 and 3+1.
    const paired = worked(plot(state, 6, 0, 'hills', { crystite: 3 }), 'crystite', 'p1', { kind: 'crystalCavern' });
    const mate = worked(plot(state, 7, 0, 'hills', { crystite: 3 }), 'crystite', 'p1');
    const run = runProduction(state);
    expect(madeOn(run, state, cavern)).toBe(7);
    expect(run.produced.p0!.crystite).toBe(7);
    expect(madeOn(run, state, paired)).toBe(8);
    expect(madeOn(run, state, mate)).toBe(4);
    expect(run.produced.p1!.crystite).toBe(12);
  });

  it('B-AC-6: a geyser adds 2 to a Water or an Energy plot, and lets a plot that would make nothing join its cluster', () => {
    const state = colony();
    const well = worked(plot(state, 0, 0, 'tundra'), 'water', 'p0', { kind: 'geyser' });
    const power = worked(plot(state, 0, 4, 'volcanic'), 'energy', 'p1', { kind: 'geyser' });
    // Rated -1 (1 Water) on a hot spring (-1): 0 without the geyser, no neighbour bonus. With it, 2, and the own neighbour well adds 1.
    const spring = worked(plot(state, 6, 0, 'tundra', { water: -1 }), 'water', 'p2', { kind: 'geyser' });
    spring.traits = ['hotSpring'];
    const twin = worked(plot(state, 7, 0, 'tundra'), 'water', 'p2');
    const run = runProduction(state);
    expect(run.produced.p0!.water).toBe(4);
    expect(run.produced.p1!.energy).toBe(4);
    expect(madeOn(run, state, well)).toBe(4);
    expect(madeOn(run, state, power)).toBe(4);
    expect(madeOn(run, state, spring)).toBe(3);
    expect(madeOn(run, state, twin)).toBe(3);
  });

  it('B-AC-6: an oasis adds 3 to a farm, so even a toxic farm counts for its neighbour bonus', () => {
    const state = colony();
    const farm = worked(plot(state, 0, 0, 'desert'), 'food', 'p0', { kind: 'oasis' });
    // Toxic takes 2: 2 - 2 = 0, which makes nothing and earns no neighbour bonus.
    // The oasis lifts it to 3 before adjacency, so it and its own neighbour farm each get +1.
    const toxic = worked(plot(state, 6, 0, 'desert'), 'food', 'p1', { kind: 'oasis' });
    toxic.traits = ['toxic'];
    const neighbour = worked(plot(state, 7, 0, 'desert'), 'food', 'p1');
    const run = runProduction(state);
    expect(run.produced.p0!.food).toBe(5);
    expect(madeOn(run, state, farm)).toBe(5);
    expect(madeOn(run, state, toxic)).toBe(4);
    expect(madeOn(run, state, neighbour)).toBe(3);
    expect(run.produced.p1!.food).toBe(7);
  });

  it('B-AC-6: each alien relic touching a working plot adds 1, whoever owns it, and the phone lists it for a factory', () => {
    const state = colony();
    // A farm of 2 between two relics, neither owned by the farmer.
    const farm = worked(plot(state, 1, 0, 'plains'), 'food', 'p0');
    worked(plot(state, 0, 0, 'plains'), null, 'p1', { kind: 'relic' });
    plot(state, 2, 0, 'plains').special = { kind: 'relic' };
    // An Alloy factory on plains (2 a run) with a relic below it.
    const factory = worked(plot(state, 6, 0, 'plains'), 'alloy', 'p2');
    plot(state, 6, 1, 'plains').special = { kind: 'relic' };
    const lines = factoryFit(state, factory, 'alloy', 'p2').lines;
    const run = runProduction(state);
    expect(madeOn(run, state, farm)).toBe(4);
    expect(run.produced.p0!.food).toBe(4);
    expect(run.produced.p2!.alloy).toBe(3);
    expect(lines.filter((l) => l.tone === 'good' && /relic/i.test(l.text))).toHaveLength(1);
  });

  it('B-AC-6: ruins pay their salvage once, on the first production with an owner, and a later owner gets nothing', () => {
    const state = colony();
    const ruins = worked(plot(state, 0, 0, 'plains'), null, 'p0', { kind: 'ruins', salvage: 'alloy' });
    const worked2 = worked(plot(state, 6, 0, 'plains'), 'food', 'p1', { kind: 'ruins', salvage: 'electronics' });
    const unowned = plot(state, 0, 4, 'plains');
    unowned.special = { kind: 'ruins', salvage: 'alloy' };
    const [p0, p1, p2] = state.players as [GameState['players'][number], GameState['players'][number], GameState['players'][number]];
    const alloy0 = p0.stock.alloy;
    const electronics1 = p1.stock.electronics;

    const first = runProduction(state);
    expect(p0.stock.alloy).toBe(alloy0 + 2);
    expect(p1.stock.electronics).toBe(electronics1 + 1);
    // Salvage is not production.
    expect(first.produced.p0!.alloy).toBe(0);
    expect(first.produced.p1!.electronics).toBe(0);
    expect(ruins.special).toBeUndefined();
    expect(worked2.special).toBeUndefined();
    // Nobody owned this one, so it still waits.
    expect(unowned.special).toEqual({ kind: 'ruins', salvage: 'alloy' });

    ruins.owner = 'p2';
    const alloy2 = p2.stock.alloy;
    const later = runProduction(state);
    expect(p2.stock.alloy).toBe(alloy2);
    expect(later.produced.p2!.alloy).toBe(0);
  });

  it('B-AC-6: a special field outside its use does nothing', () => {
    const state = colony();
    const geyserFarm = worked(plot(state, 0, 0, 'tundra'), 'food', 'p0', { kind: 'geyser' });
    const oasisWell = worked(plot(state, 6, 0, 'desert'), 'water', 'p1', { kind: 'oasis' });
    const cavernOre = worked(plot(state, 0, 4, 'hills', { smithore: 2, crystite: 3 }), 'smithore', 'p2', { kind: 'crystalCavern' });
    const run = runProduction(state);
    expect(madeOn(run, state, geyserFarm)).toBe(2);
    expect(madeOn(run, state, oasisWell)).toBe(2);
    expect(madeOn(run, state, cavernOre)).toBe(2);
    for (const line of run.lines) expect(line.parts.map((p) => p.why)).not.toContain('special');
  });
});

describe('RULE-6: cavern collapse', () => {
  /** A game with one mined cavern; varying the seed and month changes only the draw. */
  function cavernGame(): { base: GameState; at: number } {
    const base = colony();
    const cavern = worked(plot(base, 0, 0, 'hills', { crystite: 3 }), 'crystite', 'p0', { kind: 'crystalCavern' });
    return { base, at: indexOf(base, cavern) };
  }

  function produceAt(base: GameState, at: number, seed: number, month: number) {
    const state = structuredClone(base);
    Object.assign(state, { seed, month });
    const run = runProduction(state);
    return { produced: (madeOn(run, state, state.tiles[at]!) ?? 0) > 0, collapsed: state.tiles[at]!.special === undefined };
  }

  it('T-AC-6: a cavern’s collapse is the same on replay, and comes about 6 times in 100', () => {
    const { base, at } = cavernGame();
    let produced = 0;
    let collapsed = 0;
    for (let seed = 1; seed <= 400; seed++) {
      for (let month = 1; month <= 10; month++) {
        const first = produceAt(base, at, seed, month);
        expect(produceAt(base, at, seed, month), `seed ${seed}, month ${month}`).toEqual(first);
        if (!first.produced) {
          // A cavern that made no Crystite this month never collapses.
          expect(first.collapsed, `seed ${seed}, month ${month}`).toBe(false);
          continue;
        }
        produced++;
        if (first.collapsed) collapsed++;
      }
    }
    expect(produced).toBeGreaterThan(3_000);
    const rate = collapsed / produced;
    expect(rate).toBeGreaterThan(0.06 * 0.7);
    expect(rate).toBeLessThan(0.06 * 1.3);

    // A cavern farmed for Food is not mined, so it never collapses.
    base.tiles[at]!.outfit = 'food';
    for (let seed = 1; seed <= 200; seed++) expect(produceAt(base, at, seed, 1).collapsed, `farmed, seed ${seed}`).toBe(false);
  });
});

describe('RULE-6: a plot without a special field', () => {
  it('T-AC-7: with no special, rawOutput and factoryFit are unchanged', () => {
    for (const [seed, players] of [[1, 2], [7, 4], [13, 6]] as const) {
      const state = createGame({ seed, players: Array.from({ length: players }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isAi: true })) });
      for (const t of state.tiles) delete t.special;
      for (const tile of state.tiles) {
        if (tile.terrain === 'store') continue;
        for (const good of RAW_GOODS) {
          const probe = { ...tile, owner: 'p0', outfit: good };
          expect(rawOutputParts(state, probe).map((p) => p.why), `seed ${seed}, ${good} at ${tile.x},${tile.y}`).not.toContain('special');
        }
        for (const good of PROCESSED_GOODS) {
          expect(factoryFit(state, tile, good, 'p0').lines.some((l) => /relic/i.test(l.text)), `seed ${seed}, ${good} at ${tile.x},${tile.y}`).toBe(false);
        }
      }
    }
  });
});
