import { afterEach, describe, expect, it } from 'vitest';
import {
  createGame,
  createRng,
  energyUseOf,
  EVENTS,
  factoryFit,
  GROWN_BASE,
  isFactory,
  RECIPES,
  runProduction,
  type GameState,
  type Good,
  type Outfit,
  type Species,
  type Tile,
} from '../src/index.js';

/**
 * AM-17 (Energy shortage), observed where the owner receives it: their stock after production and the month report's
 * lines that runProduction returns (game.ts files them as the month's history lines verbatim). Month 1, so no event
 * fires unless a test forces one; no special field; plots two tiles apart, so no cluster and no feeder saving.
 */

const flatGround = { food: 0, water: 0, energy: 0, smithore: 0, crystite: 0, rareEarth: 0 };
// No species perk touches mining, farming or factories for Zipwing or Gearling.
const SPECIES: Species[] = ['zipwing', 'gearling', 'zipwing', 'gearling'];

function colony(): GameState {
  const state = createGame({ seed: 42, players: SPECIES.map((species, i) => ({ id: `p${i}`, name: `P${i}`, isAi: false, species })) });
  for (const t of state.tiles) delete t.special;
  // Water in hand, so no farm is cut for Water; no Energy unless a row gives some.
  for (const p of state.players) Object.assign(p.stock, { energy: 0, water: 50 });
  return state;
}

interface PlotSpec {
  good: Outfit;
  /** What the plot makes in full: a raw plot's ground is set so it makes this. A factory takes its fit from terrain. */
  out?: number;
  owner?: string;
  terrain?: Tile['terrain'];
  runMonths?: number;
}

/** The k-th plot sits at (2·(k mod 7), 2·⌊k/7⌋): no two plots touch, so no cluster and no feeder. */
function lay(state: GameState, specs: PlotSpec[]): Tile[] {
  return specs.map((spec, k) => {
    const tile = state.tiles[2 * Math.floor(k / 7) * state.width + 2 * (k % 7)]!;
    expect(tile.terrain).not.toBe('store');
    const ground = { ...flatGround };
    if (spec.good === 'food' || spec.good === 'water' || spec.good === 'energy') ground[spec.good] = (spec.out ?? 0) - GROWN_BASE;
    else if (!isFactory(spec.good) && spec.good !== 'greenBelt') ground[spec.good] = spec.out ?? 0;
    Object.assign(tile, {
      terrain: spec.terrain ?? 'plains',
      traits: [],
      peaks: 0,
      ground,
      owner: spec.owner ?? 'p0',
      outfit: spec.good,
      pollution: 0,
      filter: false,
      runMonths: spec.runMonths ?? 0,
    });
    return tile;
  });
}

const p = (state: GameState, id = 'p0') => state.players.find((x) => x.id === id)!;
const lineOf = (run: ReturnType<typeof runProduction>, state: GameState, tile: Tile) => run.lines.find((l) => l.tile === state.tiles.indexOf(tile));
const isOff = (run: ReturnType<typeof runProduction>, state: GameState, tile: Tile) => lineOf(run, state, tile)?.parts.some((x) => x.why === 'energyOff') ?? false;

describe('AM-17: an owner short of Energy turns plots off, biggest use first', () => {
  const rows: {
    name: string;
    plots: PlotSpec[];
    energy: number;
    posted?: Partial<Record<Good, number>>;
    made: number[];
    off: boolean[];
    energyAfter: number;
  }[] = [
    {
      name: 'exactly enough: nothing is turned off',
      plots: [{ good: 'food', out: 3 }, { good: 'smithore', out: 4 }],
      energy: 3,
      made: [3, 4],
      off: [false, false],
      energyAfter: 0,
    },
    {
      name: 'one short: the Smithore mine (use 2) goes off before the farm (use 1)',
      plots: [{ good: 'food', out: 3 }, { good: 'smithore', out: 4 }],
      energy: 2,
      made: [3, 1],
      off: [false, true],
      energyAfter: 1,
    },
    {
      name: 'tie on use: the plot worth least at the posted price goes off, even when it comes later in tile order',
      plots: [{ good: 'crystite', out: 4 }, { good: 'smithore', out: 4 }],
      energy: 2,
      posted: { crystite: 100, smithore: 50 },
      made: [4, 1],
      off: [false, true],
      energyAfter: 0,
    },
    {
      name: 'tie on use and worth: the first in tile order goes off',
      plots: [{ good: 'smithore', out: 4 }, { good: 'smithore', out: 4 }],
      energy: 2,
      made: [1, 4],
      off: [true, false],
      energyAfter: 0,
    },
    {
      name: 'two short: both mines go off, the farm and the well stay on',
      plots: [{ good: 'food', out: 3 }, { good: 'smithore', out: 4 }, { good: 'water', out: 3 }, { good: 'crystite', out: 5 }],
      energy: 2,
      posted: { crystite: 100, smithore: 50 },
      made: [3, 1, 3, 1],
      off: [false, true, false, true],
      energyAfter: 0,
    },
    {
      name: 'output 3 and 4 turned off make 1 each (rounded half up)',
      plots: [{ good: 'smithore', out: 3 }, { good: 'crystite', out: 4 }],
      energy: 0,
      made: [1, 1],
      off: [true, true],
      energyAfter: 0,
    },
    {
      name: 'output 2 turned off makes 0',
      plots: [{ good: 'food', out: 2 }],
      energy: 0,
      made: [0],
      off: [true],
      energyAfter: 0,
    },
    {
      name: 'the Energy plot powers first: it nets 2 of its 3, which covers the farm but not the mine too',
      plots: [{ good: 'energy', out: 3 }, { good: 'food', out: 3 }, { good: 'smithore', out: 4 }],
      energy: 0,
      made: [3, 3, 1],
      off: [false, false, true],
      energyAfter: 1,
    },
  ];

  it.each(rows)('B-AC-energy-off: $name', ({ plots, energy, posted, made, off, energyAfter }) => {
    const state = colony();
    const tiles = lay(state, plots);
    Object.assign(state.store.posted, posted ?? {});
    p(state).stock.energy = energy;
    const before = { ...p(state).stock };

    const run = runProduction(state);

    expect(tiles.map((t) => lineOf(run, state, t)?.made)).toEqual(made);
    expect(tiles.map((t) => isOff(run, state, t))).toEqual(off);
    // A turned-off line says by how much: the energyOff part takes it from full to 20%.
    for (const [i, t] of tiles.entries()) {
      const cut = lineOf(run, state, t)!.parts.find((x) => x.why === 'energyOff');
      if (off[i] && made[i]! < (plots[i]!.out ?? 0)) expect(cut?.delta).toBe(made[i]! - plots[i]!.out!);
    }
    expect(p(state).stock.energy).toBe(energyAfter);
    // Every other good lands in the owner's stock as its lines made it.
    for (const good of new Set(tiles.map((t) => t.outfit as Good).filter((g) => g !== 'energy'))) {
      const lines = tiles.flatMap((t, i) => (t.outfit === good ? [made[i]!] : []));
      expect(p(state).stock[good] - before[good], good).toBe(lines.reduce((n, m) => n + m, 0));
    }
  });

  it('B-AC-energy-off: owners are judged apart: one owner short of Energy turns nothing of another off', () => {
    const state = colony();
    const [mine0, mine1] = lay(state, [{ good: 'smithore', out: 4, owner: 'p0' }, { good: 'smithore', out: 4, owner: 'p1' }]);
    p(state, 'p1').stock.energy = 2;

    const run = runProduction(state);

    expect([lineOf(run, state, mine0!)!.made, lineOf(run, state, mine1!)!.made]).toEqual([1, 4]);
    expect([p(state, 'p0').stock.energy, p(state, 'p1').stock.energy]).toEqual([0, 0]);
  });
});

describe('AM-17: Energy plots pay their own use', () => {
  it('FM-energy-plot-net: an Energy plot pays 1 from its own output, never draws the stock, and is never turned off', () => {
    const state = colony();
    const [plant, farm] = lay(state, [{ good: 'energy', out: 2 }, { good: 'food', out: 3 }]);
    p(state).stock.energy = 0;

    const run = runProduction(state);

    // 2 made, 1 paid by the plant itself: 1 left, which runs the farm (use 1) in full.
    expect(lineOf(run, state, plant!)!.made).toBe(2);
    expect(isOff(run, state, plant!)).toBe(false);
    expect(lineOf(run, state, farm!)!.made).toBe(3);
    expect(p(state).stock.energy).toBe(0);
  });

  it('FM-energy-plot-net: an Energy plot alone with an empty stock nets its output less 1, and is not turned off', () => {
    const state = colony();
    const [plant] = lay(state, [{ good: 'energy', out: 4 }]);

    const run = runProduction(state);

    expect(lineOf(run, state, plant!)!.made).toBe(4);
    expect(isOff(run, state, plant!)).toBe(false);
    expect(p(state).stock.energy).toBe(3);
  });
});

describe('AM-17: a turned-off factory', () => {
  const saved = { ...RECIPES.alloy.inputs };
  afterEach(() => {
    RECIPES.alloy.inputs = { ...saved };
  });

  /** Alloy on hills (+1) after 3 months' running (+1): a full run makes 4; no Energy, so it is turned off. */
  const furnace = (state: GameState) => lay(state, [{ good: 'alloy', terrain: 'hills', runMonths: 3 }])[0]!;

  it('FM-factory-off: it makes 20% of its output from 20% of its non-Energy inputs, rounded half up, consuming only those', () => {
    const state = colony();
    RECIPES.alloy.inputs = { smithore: 5, energy: 2 };
    const tile = furnace(state);
    expect(factoryFit(state, tile, 'alloy', 'p0').output).toBe(4);
    p(state).stock.smithore = 5;

    const run = runProduction(state);

    expect(lineOf(run, state, tile)?.made).toBe(1);
    expect(isOff(run, state, tile)).toBe(true);
    expect(p(state).stock.smithore).toBe(4);
    expect(p(state).stock.alloy).toBe(1);
    expect(p(state).stock.energy).toBe(0);
  });

  it('FM-factory-off: with today\'s recipe (Smithore 2 → 20% rounds to 0) it makes 1 and takes no Smithore', () => {
    const state = colony();
    const tile = furnace(state);
    p(state).stock.smithore = 2;

    const run = runProduction(state);

    expect(lineOf(run, state, tile)?.made).toBe(1);
    expect(p(state).stock.smithore).toBe(2);
  });

  it('FM-factory-off: with its 20% of inputs missing it makes 0 and takes nothing', () => {
    const state = colony();
    RECIPES.alloy.inputs = { smithore: 5, energy: 2 };
    const tile = furnace(state);
    p(state).stock.smithore = 0;

    const run = runProduction(state);

    expect(lineOf(run, state, tile)?.made ?? 0).toBe(0);
    expect(p(state).stock.alloy).toBe(0);
    expect(p(state).stock.smithore).toBe(0);
  });

  it('B-AC-energy-off: a factory and a mine in one list: the factory (use 2) and the mine (use 2) tie, the one worth less goes off', () => {
    const state = colony();
    const [mine, tile] = lay(state, [{ good: 'smithore', out: 2 }, { good: 'alloy', terrain: 'hills', runMonths: 3 }]);
    Object.assign(state.store.posted, { smithore: 50, alloy: 100 });
    p(state).stock.energy = 2;
    p(state).stock.smithore = 2;

    const run = runProduction(state);

    // The mine is worth 2 × 50, the furnace 4 × 100: the mine goes off (makes round(0.4) = 0), the furnace runs in full.
    expect(isOff(run, state, mine!)).toBe(true);
    expect(lineOf(run, state, mine!)!.made).toBe(0);
    expect(lineOf(run, state, tile)!.made).toBe(4);
    expect(p(state).stock.energy).toBe(0);
  });
});

describe('AM-17: a cold snap', () => {
  type Row = { phases: Record<string, number>; cap: number };
  const rows = (): [string, Row][] => [...Object.entries(EVENTS.colony), ...Object.entries(EVENTS.player)] as [string, Row][];
  const saved = rows().map(([, row]) => ({ row, phases: { ...row.phases }, cap: row.cap }));
  const firstMonth = EVENTS.firstMonth;
  afterEach(() => {
    for (const { row, phases, cap } of saved) Object.assign(row, { phases, cap });
    EVENTS.firstMonth = firstMonth;
  });
  const forceColdSnap = () => {
    for (const [k, row] of rows()) {
      row.phases = Object.fromEntries(Object.keys(row.phases).map((ph) => [ph, k === 'coldSnap' ? 1 : 0]));
      if (k === 'coldSnap') row.cap = 1;
    }
    EVENTS.firstMonth = 1;
  };

  it('FM-cold-snap-off: the snap multiplies every use, the Energy plot\'s too, before the turn-off list is built', () => {
    const plots: PlotSpec[] = [{ good: 'energy', out: 3 }, { good: 'food', out: 3 }, { good: 'smithore', out: 4 }];
    // Without the snap: the plant nets 3 − 1 = 2, stock 4 + 2 = 6 covers 1 + 2: nothing off.
    const mild = colony();
    const calm = lay(mild, plots);
    p(mild).stock.energy = 4;
    const runMild = runProduction(mild);
    expect(runMild.events.map((e) => e.key)).not.toContain('coldSnap');
    expect(calm.map((t) => isOff(runMild, mild, t))).toEqual([false, false, false]);
    expect(p(mild).stock.energy).toBe(3);

    // With it (factor 2): the plant nets 3 − 2 = 1, stock 4 + 1 = 5 cannot cover 2 + 4: the mine goes off, the farm pays 2.
    forceColdSnap();
    const cold = colony();
    const snapped = lay(cold, plots);
    p(cold).stock.energy = 4;
    const runCold = runProduction(cold);
    expect(runCold.events.map((e) => e.key)).toContain('coldSnap');
    expect(snapped.map((t) => isOff(runCold, cold, t))).toEqual([false, false, true]);
    expect(snapped.map((t) => lineOf(runCold, cold, t)!.made)).toEqual([3, 3, 1]);
    expect(p(cold).stock.energy).toBe(3);
  });

  it('FM-energy-plot-net: in a cold snap an Energy plot making 1 pays 1 of its use of 2 and leaves the stock alone', () => {
    forceColdSnap();
    const state = colony();
    const [plant] = lay(state, [{ good: 'energy', out: 1 }]);
    p(state).stock.energy = 3;

    const run = runProduction(state);

    expect(run.events.map((e) => e.key)).toContain('coldSnap');
    expect(isOff(run, state, plant!)).toBe(false);
    expect(p(state).stock.energy).toBe(3);
  });
});

describe('AM-17: invariants over generated owners', () => {
  const RAW: Outfit[] = ['food', 'water', 'smithore', 'crystite', 'rareEarth', 'energy'];

  /** A seeded colony: up to four owners with up to six plots each, random outputs, stocks and posted prices. */
  function generated(seed: number): GameState {
    const rng = createRng(seed);
    const state = colony();
    const specs: PlotSpec[] = [];
    for (const owner of ['p0', 'p1', 'p2', 'p3'].slice(0, rng.int(1, 4))) {
      for (let n = rng.int(1, 6); n > 0; n--) {
        const good = rng.next() < 0.15 ? 'alloy' : rng.pick(RAW);
        specs.push({ good, owner, out: rng.int(1, 6), terrain: good === 'alloy' ? rng.pick(['plains', 'hills'] as const) : 'plains', runMonths: rng.int(0, 4) });
      }
    }
    lay(state, specs.slice(0, 28));
    for (const pl of state.players) Object.assign(pl.stock, { energy: rng.int(0, 8), smithore: rng.int(0, 4) });
    for (const g of ['food', 'water', 'smithore', 'crystite', 'rareEarth', 'alloy'] as Good[]) state.store.posted[g] = rng.int(1, 4) * 25;
    return state;
  }

  it('INV-energy-off: uses paid never exceed the Energy available; the turned-off plots are a minimal prefix of biggest-use-first; a replay is identical', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const state = generated(seed);
      const replay = structuredClone(state);
      const before = new Map(state.players.map((pl) => [pl.id, pl.stock.energy]));
      const uses = new Map(state.tiles.map((t) => [t, energyUseOf(state, t)]));

      const run = runProduction(state);

      for (const pl of state.players) {
        const own = state.tiles.filter((t) => t.owner === pl.id && t.outfit);
        const plants = own.filter((t) => t.outfit === 'energy');
        const net = plants.reduce((n, t) => n + Math.max(0, lineOf(run, state, t)!.made - uses.get(t)!), 0);
        const available = before.get(pl.id)! + net;
        expect(pl.stock.energy, `seed ${seed} ${pl.id}: never negative`).toBeGreaterThanOrEqual(0);
        expect(plants.some((t) => isOff(run, state, t)), `seed ${seed}: an Energy plot is never off`).toBe(false);

        // The list: every other working plot, biggest use first, then least worth (posted × full output), then tile order.
        const full = (t: Tile) => (isFactory(t.outfit!) ? factoryFit(state, t, t.outfit, pl.id).output : lineOf(run, state, t)!.parts.filter((x) => x.why !== 'energyOff' && x.why !== 'noWater' && x.why !== 'event').reduce((n, x) => n + x.delta, 0));
        const list = own
          .filter((t) => t.outfit !== 'energy')
          .map((t) => ({ t, use: uses.get(t)!, worth: state.store.posted[t.outfit as Good] * full(t), at: state.tiles.indexOf(t) }))
          .sort((a, b) => b.use - a.use || a.worth - b.worth || a.at - b.at);
        // A factory left on without its inputs files no line, as before AM-17; with today's recipes a turned-off one always
        // has its 20% of inputs (they round to 0), so it always files a line.
        const offAt = list.map((e) => isOff(run, state, e.t));
        const k = offAt.filter(Boolean).length;
        expect(offAt.slice(0, k).every(Boolean), `seed ${seed} ${pl.id}: off is a prefix (${offAt})`).toBe(true);
        const onUse = list.slice(k).reduce((n, e) => n + e.use, 0);
        expect(onUse, `seed ${seed} ${pl.id}: the plots left on fit`).toBeLessThanOrEqual(available);
        if (k > 0) expect(onUse + list[k - 1]!.use, `seed ${seed} ${pl.id}: no plot went off that need not`).toBeGreaterThan(available);
        // What was paid is the uses of the plots left on that ran (a factory without its inputs runs not and pays not).
        const paid = list.slice(k).filter((e) => lineOf(run, state, e.t)).reduce((n, e) => n + e.use, 0);
        expect(available - pl.stock.energy, `seed ${seed} ${pl.id}: paid`).toBe(paid);
      }

      expect(runProduction(replay)).toEqual(run);
      expect(replay.players.map((pl) => pl.stock)).toEqual(state.players.map((pl) => pl.stock));
    }
  });
});
