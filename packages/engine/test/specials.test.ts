import { describe, expect, it } from 'vitest';
import {
  createGame,
  EVENTS,
  factoryFit,
  formMeteorCrater,
  MAP,
  MINERAL_ODDS,
  MINERAL_ODDS_MIN,
  PROCESSED_GOODS,
  RAW_GOODS,
  ratingsOf,
  rawOutputParts,
  RuleError,
  runProduction,
  type EventRow,
  type GameState,
  type SpecialField,
  type Species,
  type Tile,
} from '../src/index.js';
import { specialBonus } from '../src/specials.js';

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
    // A farm of 2 between two relics, neither owned by the farmer, and a third relic only diagonal to it.
    const farm = worked(plot(state, 1, 0, 'plains'), 'food', 'p0');
    // The relic on the left is itself a farm of 2: it touches no relic, and its own does not count.
    const relicFarm = worked(plot(state, 0, 0, 'plains'), 'food', 'p1', { kind: 'relic' });
    plot(state, 2, 0, 'plains').special = { kind: 'relic' };
    plot(state, 2, 1, 'plains').special = { kind: 'relic' };
    // An Alloy factory on plains (2 a run) with one relic below it, and one with two.
    const factory = worked(plot(state, 6, 0, 'plains'), 'alloy', 'p2');
    plot(state, 6, 1, 'plains').special = { kind: 'relic' };
    const twoRelics = worked(plot(state, 10, 4, 'plains'), 'alloy', 'p3');
    plot(state, 10, 3, 'plains').special = { kind: 'relic' };
    plot(state, 11, 4, 'plains').special = { kind: 'relic' };
    const relicLines = (tile: Tile, owner: string) =>
      factoryFit(state, tile, 'alloy', owner).lines.filter((l) => /relic/i.test(l.text));
    const lines = relicLines(factory, 'p2');
    const lines2 = relicLines(twoRelics, 'p3');
    const run = runProduction(state);
    expect(madeOn(run, state, farm)).toBe(4);
    expect(run.produced.p0!.food).toBe(4);
    expect(madeOn(run, state, relicFarm)).toBe(2);
    expect(run.produced.p1!.food).toBe(2);
    expect(run.produced.p2!.alloy).toBe(3);
    expect(run.produced.p3!.alloy).toBe(4);
    expect(lines).toEqual([{ tone: 'good', text: 'Next to an alien relic: +1' }]);
    expect(lines2).toEqual([{ tone: 'good', text: 'Next to 2 alien relics: +2' }]);
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
  /** A game with two mined caverns, owned apart so neither earns a neighbour bonus; varying the seed and month changes only the draws. */
  function cavernGame(): { base: GameState; caverns: number[] } {
    const base = colony();
    const one = worked(plot(base, 0, 0, 'hills', { crystite: 3 }), 'crystite', 'p0', { kind: 'crystalCavern' });
    const two = worked(plot(base, 6, 0, 'hills', { crystite: 3 }), 'crystite', 'p1', { kind: 'crystalCavern' });
    return { base, caverns: [indexOf(base, one), indexOf(base, two)] };
  }

  function produceAt(base: GameState, caverns: number[], seed: number, month: number, whatIf = false) {
    const state = structuredClone(base);
    Object.assign(state, { seed, month }, whatIf ? { whatIf: true } : {});
    const run = runProduction(state);
    return {
      // A month has an event when an output event fired; a collapse is the cavern's own, not another event.
      event: run.events.some((e) => e.key !== 'cavernCollapse'),
      caverns: caverns.map((at) => {
        const made = madeOn(run, state, state.tiles[at]!);
        return { made, produced: (made ?? 0) > 0, collapsed: state.tiles[at]!.special === undefined };
      }),
    };
  }

  /**
   * Seeds the rate is measured on, 10 months each: 200 in CI, 400 with MULE_FULL=1. At 200, each event bucket holds
   * about 1,700 mined caverns, so its ±30% band still reaches over 3 standard deviations either side of 6%.
   */
  const RATE_SEEDS = process.env.MULE_FULL === '1' ? 400 : 200;

  // Thousands of production runs, to measure the rate; past vitest's 5 s default on a CI runner.
  it('T-AC-6: a cavern’s collapse is the same on replay, and comes about 6 times in 100', () => {
    // About half the months have an event, one draw a month: volcanic ash at 0.5, every other row that production's
    // start rolls at 0. A per-plot row, the cavern's own, keeps its odds.
    const rows = [...Object.values(EVENTS.colony), ...Object.values(EVENTS.player)].filter((row: EventRow) => 'production' in row.phases && !row.perPlot);
    const saved = rows.map((row) => ({ ...row }));
    const reset = (row: object, fields: object) => {
      for (const key of Object.keys(row)) delete (row as Record<string, unknown>)[key];
      Object.assign(row, fields);
    };
    for (const row of rows) reset(row, { phases: { production: row === EVENTS.colony.volcanicAsh ? 0.5 : 0 }, cap: 1 });
    try {
      const { base, caverns } = cavernGame();
      let produced = 0;
      let collapsed = 0;
      // From the first month that can have an event: mined caverns and their collapses, in months with an event and without.
      const byEvent = { with: { produced: 0, collapsed: 0 }, without: { produced: 0, collapsed: 0 } };
      // Months where both caverns produced and only one collapsed.
      let apart = 0;
      for (let seed = 1; seed <= RATE_SEEDS; seed++) {
        for (let month = 1; month <= 10; month++) {
          const first = produceAt(base, caverns, seed, month);
          expect(produceAt(base, caverns, seed, month), `seed ${seed}, month ${month}`).toEqual(first);
          const bucket = month >= EVENTS.firstMonth ? byEvent[first.event ? 'with' : 'without'] : undefined;
          for (const cavern of first.caverns) {
            if (!cavern.produced) {
              // A cavern that made no Crystite this month never collapses.
              expect(cavern.collapsed, `seed ${seed}, month ${month}`).toBe(false);
              continue;
            }
            produced++;
            if (bucket) bucket.produced++;
            if (!cavern.collapsed) continue;
            collapsed++;
            if (bucket) bucket.collapsed++;
          }
          const [one, two] = first.caverns as [(typeof first.caverns)[number], (typeof first.caverns)[number]];
          if (one.produced && two.produced && one.collapsed !== two.collapsed) apart++;
          if (one.collapsed || two.collapsed) {
            // An AI's what-if copy can't know the real draw, so it imagines no collapse (as with events and colony lots).
            const whatIf = produceAt(base, caverns, seed, month, true);
            expect(whatIf.caverns.map((c) => c.collapsed), `what-if, seed ${seed}, month ${month}`).toEqual([false, false]);
          }
        }
      }
      // The sample is big enough: over 15 mined caverns a seed (6,000 at 400 seeds), over 5 a seed in each bucket below.
      expect(produced).toBeGreaterThan(15 * RATE_SEEDS);
      const rate = collapsed / produced;
      expect(rate).toBeGreaterThan(0.06 * 0.7);
      expect(rate).toBeLessThan(0.06 * 1.3);
      // The collapse draw is apart from the event draw, so it comes as often in a month with an event as in one without.
      for (const [when, { produced: n, collapsed: c }] of Object.entries(byEvent)) {
        expect(n, `months ${when} an event`).toBeGreaterThan(5 * RATE_SEEDS);
        expect(c / n, `months ${when} an event`).toBeGreaterThan(0.06 * 0.7);
        expect(c / n, `months ${when} an event`).toBeLessThan(0.06 * 1.3);
      }
      // Each plot draws its own collapse: two caverns mined the same month don't always share their fate.
      expect(apart).toBeGreaterThan(0);

      // A cavern farmed for Food is not mined, and one mined on Crystite 0 makes nothing: neither ever collapses.
      const [farmed, empty] = caverns as [number, number];
      base.tiles[farmed]!.outfit = 'food';
      base.tiles[empty]!.ground.crystite = 0;
      for (let seed = 1; seed <= 200; seed++) {
        const month = produceAt(base, caverns, seed, 1);
        expect(month.caverns[1]!.made, `mined on 0, seed ${seed}`).toBe(0);
        expect(month.caverns.map((c) => c.collapsed), `farmed and mined on 0, seed ${seed}`).toEqual([false, false]);
      }
    } finally {
      rows.forEach((row, i) => reset(row, saved[i]!));
    }
  }, 30_000);
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

describe('a meteor crater, formed in play', () => {
  /** Heiko's "Crystite at the top of the scale", read from the mined scale itself. */
  const TOP_MINED = Math.max(...ratingsOf(MINERAL_ODDS.none, MINERAL_ODDS_MIN));
  const at = (state: GameState, x: number, y: number) => state.tiles[y * state.width + x]!;
  /** What a destroyed MULE could have gone back to: every player's holdings and the store's corral. */
  const holdings = (state: GameState) => structuredClone({ players: state.players, corral: state.store.mules });

  it('B-AC-10: an owned, worked plot becomes a meteor crater: the owner keeps it, the MULE and its filter are gone, Crystite is rated at the top', () => {
    const state = colony();
    const tile = worked(plot(state, 3, 2, 'mountains', { food: -1, energy: 2, smithore: 3, crystite: 1, rareEarth: 2 }), 'smithore', 'p0');
    Object.assign(tile, { peaks: 2, traits: ['toxic'], pollution: 2, filter: true, runMonths: 5 });
    const before = structuredClone(tile);
    const held = holdings(state);

    formMeteorCrater(state, 3, 2);

    expect(tile).toEqual({
      ...before,
      outfit: null,
      runMonths: 0,
      filter: false,
      ground: { ...before.ground, crystite: TOP_MINED },
      special: { kind: 'meteorCrater' },
    });
    // Destroyed: no player or corral gets the MULE back.
    expect(holdings(state)).toEqual(held);
    expect(madeOn(runProduction(state), state, tile)).toBeUndefined();
  });

  it('B-AC-10: an unowned, empty plot still becomes a meteor crater, and stays unowned', () => {
    const state = colony();
    const tile = plot(state, 12, 7, 'plains', { food: 2, smithore: 1 });
    const before = structuredClone(tile);

    formMeteorCrater(state, 12, 7);

    expect(tile).toEqual({ ...before, ground: { ...before.ground, crystite: TOP_MINED }, special: { kind: 'meteorCrater' } });
  });

  it('B-AC-10: a meteor crater replaces any earlier special field, and struck ruins never pay their salvage', () => {
    const earlier = {
      ruins: { kind: 'ruins', salvage: 'electronics' },
      crystalCavern: { kind: 'crystalCavern' },
      geyser: { kind: 'geyser' },
      oasis: { kind: 'oasis' },
      relic: { kind: 'relic' },
    } satisfies Record<Exclude<SpecialField['kind'], 'meteorCrater'>, SpecialField>;
    for (const special of Object.values(earlier)) {
      const state = colony();
      const tile = worked(plot(state, 3, 2, 'hills', { crystite: 2 }), null, 'p0', { ...special });
      const electronics = state.players[0]!.stock.electronics;

      formMeteorCrater(state, 3, 2);
      runProduction(state);

      expect(tile.special, special.kind).toEqual({ kind: 'meteorCrater' });
      expect(state.players[0]!.stock.electronics, special.kind).toBe(electronics);
    }
  });

  it('B-AC-10: a relic struck by a meteor stops adding to its working neighbour', () => {
    const state = colony();
    plot(state, 3, 2, 'plains').special = { kind: 'relic' };
    const farm = worked(plot(state, 4, 2, 'plains', { food: 1 }), 'food', 'p1');
    const bonus = specialBonus(state, farm, 'food');
    const made = madeOn(runProduction(structuredClone(state)), state, farm)!;

    formMeteorCrater(state, 3, 2);

    expect(specialBonus(state, farm, 'food')).toBe(bonus - MAP.specialEffect.relic);
    expect(madeOn(runProduction(state), state, farm)).toBe(made - MAP.specialEffect.relic);
  });

  it('B-AC-10: the store and a plot off the map are refused with a RuleError, and nothing changes', () => {
    const state = colony();
    const store = state.tiles.find((t) => t.terrain === 'store')!;
    const before = structuredClone(state);
    const refused = [[store.x, store.y], [-1, 0], [state.width, 0], [0, -1], [0, state.height], [0.5, 0.5]] as const;
    for (const [x, y] of refused) expect(() => formMeteorCrater(state, x, y), `${x},${y}`).toThrow(RuleError);
    expect(state).toEqual(before);
  });

  it('B-AC-10: a meteor crater adds nothing to production: a Crystite mine on it makes its rating and no more', () => {
    const state = colony();
    plot(state, 3, 2, 'crater');
    formMeteorCrater(state, 3, 2);
    const mine = worked(at(state, 3, 2), 'crystite', 'p0');

    for (const good of RAW_GOODS) expect(specialBonus(state, mine, good), good).toBe(0);
    const run = runProduction(state);
    expect(madeOn(run, state, mine)).toBe(TOP_MINED);
    expect(run.lines.find((l) => l.tile === indexOf(state, mine))!.parts.map((p) => p.why)).not.toContain('special');
  });
});
