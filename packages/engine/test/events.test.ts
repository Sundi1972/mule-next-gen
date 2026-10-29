import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  buildEvent,
  cloneForSim,
  createGame,
  createRng,
  eventChance,
  EVENTS,
  GAME,
  GOODS,
  GROWN_BASE,
  neighbours,
  playerEventChance,
  playerEventReason,
  rollPhase,
  rollPlayerEvent,
  type EventKey,
  type EventRow,
  type GameState,
  type MonthEvent,
  type MonthReport,
  type Outfit,
  type Phase,
  type Tile,
} from '../src/index.js';

const OUTFITS: Outfit[] = ['food', 'water', 'energy', 'smithore', 'food', 'crystite', 'alloy'];

/** A colony where every player already works several plots of mixed kinds, with uneven Energy and Water. */
function developedColony(seed: number): GameState {
  const state = createGame({ seed, players: [0, 1, 2, 3].map((i) => ({ id: `p${i}`, name: `P${i}`, isAi: false })) });
  const free = state.tiles.filter((t) => t.terrain !== 'store');
  state.players.forEach((p, i) => {
    for (let k = 0; k < OUTFITS.length; k++) Object.assign(free[i * OUTFITS.length + k]!, { owner: p.id, outfit: OUTFITS[k] });
    p.stock.energy = i; // some players run short of Energy, so plots halve
    p.stock.water = i % 2 ? 6 : 0; // some are dry, so farms halve again
    p.stock.smithore = 4;
  });
  return state;
}

/** Plays productions until month `months`, calling `check` with the state after each one. */
function playProductions(state: GameState, months: number, check: (s: GameState) => void) {
  while (state.month <= months && state.phase !== 'gameOver') {
    advancePhase(state);
    if (state.phase === 'production') check(state); // production runs as the phase is entered
  }
}

describe('production lines', () => {
  it('T-AC-5: every working plot’s line sums to what it made, and per owner to what was produced', () => {
    let lines = 0;
    for (let seed = 1; seed <= 10; seed++) {
      playProductions(developedColony(seed), 4, (s) => {
        const report = s.history.at(-1)!;
        const made: Record<string, Record<string, number>> = {};
        for (const line of report.lines ?? []) {
          lines++;
          expect(line.parts.reduce((n, p) => n + p.delta, 0)).toBe(line.made);
          const owner = s.tiles[line.tile]!.owner!;
          made[owner] ??= {};
          made[owner]![line.good] = (made[owner]![line.good] ?? 0) + line.made;
        }
        for (const [owner, stock] of Object.entries(report.produced)) {
          for (const good of GOODS) expect(made[owner]?.[good] ?? 0).toBe(stock[good]);
        }
      });
    }
    expect(lines).toBeGreaterThan(100);
  });
});

describe('how an event spreads', () => {
  it('T-AC-4: a pest swarm spreads from its start to adjacent Food plots, in order, up to four plots', () => {
    const state = createGame({ seed: 4, players: [0, 1, 2, 3].map((i) => ({ id: `p${i}`, name: `P${i}`, isAi: false })) });
    state.month = 3;
    const land = (t: Tile) => t.terrain !== 'store';
    const centre = state.tiles.find((t) => land(t) && neighbours(state.tiles, state.width, t).filter(land).length === 4)!;
    const cluster = [centre, ...neighbours(state.tiles, state.width, centre)];
    cluster.push(neighbours(state.tiles, state.width, cluster[1]!).find((t) => land(t) && !cluster.includes(t))!);
    for (const t of cluster) Object.assign(t, { owner: 'p0', outfit: 'food' });
    // Far from the cluster, another player's Food plot: no Food links it to the swarm.
    const far = state.tiles.find((t) => land(t) && cluster.every((c) => Math.max(Math.abs(c.x - t.x), Math.abs(c.y - t.y)) >= 3))!;
    Object.assign(far, { owner: 'p1', outfit: 'food' });
    const event = buildEvent(state, 'pestSwarm', createRng(7), 'p0')!;
    expect(event.plots.map((p) => p.order)).toEqual([0, 1, 2, 3]);
    const hit = event.plots.map((p) => state.tiles[p.index]!);
    expect(hit.every((t) => t.outfit === 'food' && cluster.includes(t))).toBe(true);
    hit.slice(1).forEach((t, k) => expect(hit.slice(0, k + 1).some((h) => neighbours(state.tiles, state.width, h).includes(t))).toBe(true));
    expect(hit).not.toContain(far);
  });
});

/** RULE-3: what a hit plot makes after the event, from what it made before; `first` is the event's first plot. */
const RULE_3: Record<EventKey, (before: number, first: boolean) => number> = {
  dustStorm: (b) => Math.floor(b * 0.5),
  drought: (b) => b - 1,
  acidRain: (b) => b - 1,
  solarFlare: (b) => b + 2,
  cometPass: (b) => b + 2,
  flood: () => 0,
  volcanicAsh: (b) => b - 1,
  pestSwarm: (b) => Math.floor(b * 0.5),
  wildfire: (b, first) => (first ? 0 : b - 1),
  bumperHarvest: (b) => b * 2,
  cavernCollapse: (b) => b,
};

/** The row an event key names, in EVENTS.colony or EVENTS.player. */
const tableRow = (key: string): EventRow | undefined => ({ ...EVENTS.colony, ...EVENTS.player } as Record<string, EventRow>)[key];
/** RULE_3's keys whose rows rollPhase rolls at the phase start; a per-plot row rolls after output instead. */
const drawnKeys = () => (Object.keys(RULE_3) as EventKey[]).filter((key) => !tableRow(key)?.perPlot);

/** A developed colony that also has Food on a river and a working plot next to a volcano or mountain. */
function colonyForEvents(seed: number): GameState {
  const state = developedColony(seed);
  const river = state.tiles.find((t) => t.terrain === 'river' && !t.owner);
  if (river) Object.assign(river, { owner: 'p1', outfit: 'food' });
  const peak = state.tiles.find((t) => t.terrain === 'volcanic' || t.terrain === 'mountains');
  const nearPeak = peak && neighbours(state.tiles, state.width, peak).find((t) => t.terrain !== 'store' && !t.owner);
  if (nearPeak) Object.assign(nearPeak, { owner: 'p2', outfit: 'energy' });
  return state;
}

const rows = (): EventRow[] => [...Object.values(EVENTS.colony), ...Object.values(EVENTS.player)];
/** Gives a row exactly these fields, dropping any others it had. */
const reset = (row: EventRow, fields: EventRow) => {
  for (const key of Object.keys(row) as (keyof EventRow)[]) delete (row as Partial<EventRow>)[key];
  Object.assign(row, fields);
};
/**
 * Runs `body` with every event row at `chance` in production, capped at 1, with no raises or lowers (a per-plot row
 * stays per plot), and the excluded pairs as configured unless `excludes` is false; then puts the rows and the pairs back.
 */
const withEveryRowAt = (chance: number, body: () => void, { excludes = true } = {}) => {
  const saved = rows().map((row) => ({ ...row }));
  const pairs = [...EVENTS.excludes];
  for (const row of rows()) reset(row, { phases: { production: chance }, cap: 1, ...(row.perPlot && { perPlot: row.perPlot }) });
  if (!excludes) EVENTS.excludes.length = 0;
  try {
    body();
  } finally {
    rows().forEach((row, i) => reset(row, saved[i]!));
    EVENTS.excludes.splice(0, EVENTS.excludes.length, ...pairs);
  }
};

describe('events in production', () => {
  /** Makes `key` the one event that fires: its colony row certain, or its player row certain for the richest seat alone. */
  const forceOnly = (key: EventKey) => {
    const colony: Record<string, EventRow> = EVENTS.colony;
    const player: Record<string, EventRow> = EVENTS.player;
    if (colony[key]) colony[key].phases = { production: 1 };
    else reset(player[key]!, { phases: { production: 0 }, wealth: { richest: 1 }, cap: 1 });
  };

  it('T-AC-3: each event changes exactly the plots it hits, by RULE-3, and the report says so', () => {
    for (const key of drawnKeys()) {
      withEveryRowAt(0, () => {
        forceOnly(key);
        let seen = 0;
        for (let seed = 1; seed <= 5 && seen === 0; seed++) {
          playProductions(colonyForEvents(seed), 3, (s) => {
            const report = s.history.at(-1)!;
            const event = report.events?.[0];
            if (s.month < 2) return expect(event).toBeUndefined();
            if (!event) return;
            expect(event.key).toBe(key);
            for (const e of report.events ?? []) expect([e.key, e.phase]).toEqual([e.key, 'production']);
            seen++;
            if (key === 'bumperHarvest') expect(event.plots.map((p) => p.order)).toEqual([0]);
            const hit = new Map(event.plots.map((p) => [p.index, p]));
            for (const line of report.lines ?? []) {
              const part = line.parts.find((p) => p.why === 'event');
              const plot = hit.get(line.tile);
              if (!plot) {
                expect(part).toBeUndefined(); // negative case: an untargeted plot is untouched
                continue;
              }
              const before = line.made - (part?.delta ?? 0);
              const after = Math.max(0, RULE_3[key](before, plot.order === 0));
              expect([key, line.tile, line.made]).toEqual([key, line.tile, after]);
              expect(plot.delta).toBe(after - before);
              expect(part?.event).toBe(key);
            }
          });
        }
        expect([key, seen > 0]).toEqual([key, true]);
      });
    }
  });
});

/** Plays a production from development, and returns the month report it files. */
const produce = (state: GameState) => {
  state.phase = 'development';
  advancePhase(state);
  return state.history.at(-1)!;
};

describe('several events in one production', () => {
  /**
   * At the first month events may roll, p0's lone farm growing `grown`: no special, trait, pollution or neighbour, and
   * Energy to spare. p0 holds `water` Water; at 0 it is short, and the farm halves.
   */
  const loneFarm = ({ grown = 1, water = 10 } = {}) => {
    const state = createGame({ seed: 4, players: [0, 1, 2, 3].map((i) => ({ id: `p${i}`, name: `P${i}`, isAi: false })) });
    state.month = EVENTS.firstMonth;
    for (const t of state.tiles) delete t.special;
    const farm = state.tiles.find((t) => t.terrain !== 'store')!;
    Object.assign(farm, { owner: 'p0', outfit: 'food', traits: [], pollution: 0 });
    farm.ground.food = grown - GROWN_BASE;
    Object.assign(state.players[0]!.stock, { energy: 10, water });
    return { state, farm: state.tiles.indexOf(farm) };
  };
  const lineOf = (report: MonthReport, tile: number) => report.lines!.find((l) => l.tile === tile)!;

  const colonyRows: Record<string, EventRow> = EVENTS.colony;

  it("EM-T-AC-3: the table holds what the roller relies on: rows it rolls, colony-row pairs, one phase a row", () => {
    // Every pair the excludes name, and every key a row follows, is a row: a misspelt key would never fire.
    const named = [...EVENTS.excludes.flat(), ...rows().flatMap((row) => Object.keys(row.follows ?? {}))];
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((key) => !Object.hasOwn(EVENTS.colony, key) && !Object.hasOwn(EVENTS.player, key))).toEqual([]);
    // ...and a row rollPhase rolls at the phase start: sickness makes no MonthEvent, and the cavern rolls per plot after output.
    const rolled = (table: object) => Object.keys(table).filter((key) => (drawnKeys() as string[]).includes(key));
    expect(rolled(EVENTS.colony)).not.toContain('cavernCollapse');
    expect(named.filter((key) => ![...rolled(EVENTS.colony), ...rolled(EVENTS.player)].includes(key))).toEqual([]);
    // rollPhase resolves the excludes after the colony rows and before the player rows: a player-row pair would never
    // resolve, and a colony row following a member this phase would read one the dice may yet drop.
    const excluded = EVENTS.excludes.flat();
    expect(excluded.filter((key) => !rolled(EVENTS.colony).includes(key))).toEqual([]);
    const readsThisPhase = Object.entries(colonyRows).flatMap(([key, row]) =>
      Object.entries(row.follows ?? {}).flatMap(([follows, f]) => (f.thisPhase && excluded.includes(follows) ? [[key, follows]] : [])),
    );
    expect(readsThisPhase).toEqual([]);
    // A row rolls once a month only while it lists one phase (RULE-2 step 5 holds by construction).
    const table: Record<string, EventRow> = { ...EVENTS.colony, ...EVENTS.player };
    expect(Object.entries(table).flatMap(([key, row]) => (Object.keys(row.phases).length === 1 ? [] : [key]))).toEqual([]);
  });

  it('EM-T-AC-3: two events on one plot both apply in order, never below 0, and an excluded pair keeps one', () => {
    withEveryRowAt(0, () => {
      const calm = loneFarm();
      expect(lineOf(produce(calm.state), calm.farm).made).toBe(1);

      // A drought, then acid rain, on the farm that makes 1: each works on what the one before left.
      EVENTS.colony.drought.phases = { production: 1 };
      EVENTS.colony.acidRain.phases = { production: 1 };
      const { state, farm } = loneFarm();
      const report = produce(state);
      expect(report.events!.map((e) => [e.key, e.phase, e.plots.map((p) => [p.index, p.delta])])).toEqual([
        ['drought', 'production', [[farm, -1]]],
        ['acidRain', 'production', [[farm, 0]]],
      ]);
      const line = lineOf(report, farm);
      expect(line.made).toBe(0);
      expect(line.parts.filter((p) => p.why === 'event')).toEqual([
        { why: 'event', delta: -1, event: 'drought' },
        { why: 'event', delta: 0, event: 'acidRain' },
      ]);
      expect(line.parts.reduce((n, p) => n + p.delta, 0)).toBe(line.made);
      expect(line.parts.slice(-2)).toEqual([
        { why: 'event', delta: -1, event: 'drought' },
        { why: 'event', delta: 0, event: 'acidRain' },
      ]);

      // A dry farm growing 4 halves to 2 first; then the drought takes it to 1 and acid rain to 0.
      const dry = loneFarm({ grown: 4, water: 0 });
      const dryLine = lineOf(produce(dry.state), dry.farm);
      expect(dryLine.parts).toEqual([
        { why: 'ground', delta: 4 },
        { why: 'noWater', delta: -2 },
        { why: 'event', delta: -1, event: 'drought' },
        { why: 'event', delta: -1, event: 'acidRain' },
      ]);
      expect(dryLine.made).toBe(0);
    });

    withEveryRowAt(0, () => {
      // A drought and a flood both certain, and a wildfire only during a drought: the pair's dice keep one.
      EVENTS.colony.drought.phases = { production: 1 };
      EVENTS.colony.flood.phases = { production: 1 };
      reset(EVENTS.player.wildfire, { phases: { production: 0 }, follows: { drought: { points: 1, thisPhase: true } }, cap: 1 });
      const month = (seed: number) => {
        const state = colonyForEvents(3);
        state.month = EVENTS.firstMonth;
        state.seed = seed;
        return produce(state);
      };
      const keepers = new Set<EventKey>();
      for (let seed = 1; seed <= 20; seed++) {
        const report = month(seed);
        const keys = report.events!.map((e) => e.key);
        const pair = keys.filter((key) => key === 'drought' || key === 'flood');
        expect([seed, pair.length]).toEqual([seed, 1]);
        keepers.add(pair[0]!);
        // The dropped one never fired: no line shows it, and it raises no wildfire.
        const shown = new Set(report.lines!.flatMap((l) => l.parts.flatMap((p) => p.event ?? [])));
        expect([seed, [...shown].sort()]).toEqual([seed, [...new Set(keys)].sort()]);
        expect([seed, keys.includes('wildfire')]).toEqual([seed, pair[0] === 'drought']);
        expect(month(seed).events).toEqual(report.events);
      }
      // Kept by the dice, not by the table's order.
      expect([...keepers].sort()).toEqual(['drought', 'flood']);
    });

    const seeds = Array.from({ length: 20 }, (_, i) => i + 1);
    for (const pair of EVENTS.excludes) {
      withEveryRowAt(0, () => {
        const row = (key: string) => colonyRows[key]!;
        /** The pair's members the month report lists, for colonyForEvents(3) at `month` on dice seeded from `seed`. */
        const listed = (seed: number, month = EVENTS.firstMonth) => {
          const state = colonyForEvents(3);
          Object.assign(state, { seed, month });
          return produce(state).events!.flatMap((e) => (pair.includes(e.key) ? [e.key] : []));
        };
        const both = new Set(pair);

        // Both certain: one is listed, and the dice keep either, seed by seed and, on one seed, month by month.
        for (const key of pair) row(key).phases = { production: 1 };
        const bySeed = seeds.map((seed) => listed(seed));
        expect([pair, bySeed.filter((keys) => keys.length !== 1)]).toEqual([pair, []]);
        expect([pair, new Set(bySeed.flat())]).toEqual([pair, both]);
        const byMonth = Array.from({ length: 12 }, (_, i) => listed(1, EVENTS.firstMonth + i));
        expect([pair, byMonth.filter((keys) => keys.length !== 1)]).toEqual([pair, []]);
        expect([pair, new Set(byMonth.flat())]).toEqual([pair, both]);

        // One alone: listed on every seed, whatever the pair's dice would say.
        for (const [alone, partner] of [pair, [pair[1], pair[0]]] satisfies [string, string][]) {
          row(alone).phases = { production: 1 };
          row(partner).phases = { production: 0 };
          expect([alone, seeds.map((seed) => listed(seed))]).toEqual([alone, seeds.map(() => [alone])]);
        }

        // The pair's dice are neither member's own: where one fires alone at 0.5, a certain partner still lets either be kept.
        for (const [alone, partner] of [pair, [pair[1], pair[0]]] satisfies [string, string][]) {
          row(alone).phases = { production: 0.5 };
          row(partner).phases = { production: 0 };
          const firesAlone = seeds.filter((seed) => listed(seed).length > 0);
          expect([alone, firesAlone.length > 0]).toEqual([alone, true]);
          row(partner).phases = { production: 1 };
          expect([alone, new Set(firesAlone.flatMap((seed) => listed(seed)))]).toEqual([alone, both]);
        }
      });
    }
  });
});

describe('player events', () => {
  const sickness = EVENTS.player.sickness;
  /** Four players, the air at `air`, and last month's report crediting each with these pollution points. */
  const colony = (air: number, pollutionBy: number[] = [0, 0, 0, 0], seed = 7) => {
    const state = createGame({ seed, players: [0, 1, 2, 3].map((i) => ({ id: `p${i}`, name: `P${i}`, isAi: false })) });
    state.air = air;
    state.history.push({ month: 1, pollutionBy: Object.fromEntries(pollutionBy.map((n, i) => [`p${i}`, n])) } as MonthReport);
    return state;
  };
  const chance = (state: GameState, id: string) => playerEventChance(state, 'sickness', 'development', id);
  /** Runs `body` with the sickness row changed, then puts it back. */
  const withSickness = (change: Partial<typeof sickness>, body: () => void) => {
    const saved = { ...sickness };
    Object.assign(sickness, change);
    try {
      body();
    } finally {
      Object.assign(sickness, saved);
    }
  };

  it('T-AC-24: sickness is a seeded roll per player at development start, likelier in bad air and for a big polluter, cured by a Medicine', () => {
    const base = sickness.phases.development;
    const bands: [number, number][] = [
      [0, 0],
      [30, sickness.air.smoggy],
      [60, sickness.air.toxic],
      [80, sickness.air.collapse],
    ];
    // By the air band, for a player who caused none of last month's pollution.
    for (const [air, bonus] of bands) expect(chance(colony(air, [5, 20, 3, 0]), 'p3'), `air ${air}`).toBeCloseTo(base + bonus, 9);
    // By the air points its own plots caused last month: 5 points add 5 x perPoint; 20 points hit the most it adds.
    const polluted = colony(0, [5, 20, 3, 0]);
    expect(5 * sickness.pollution.perPoint).toBeLessThan(sickness.pollution.max);
    expect(20 * sickness.pollution.perPoint).toBeGreaterThan(sickness.pollution.max);
    expect(chance(polluted, 'p0')).toBeCloseTo(base + 5 * sickness.pollution.perPoint, 9);
    expect(chance(polluted, 'p1')).toBeCloseTo(base + sickness.pollution.max, 9);
    // Never above the cap: the biggest polluter in Collapse.
    expect(base + sickness.air.collapse + sickness.pollution.max).toBeGreaterThan(sickness.cap);
    expect(chance(colony(80, [20, 0, 0, 0]), 'p0')).toBeCloseTo(sickness.cap, 9);
    // Why: the biggest raise in the roll wins, so the screens can say it; with no raise it is plain chance.
    const why = (air: number, points: number) => playerEventReason(colony(air, [points, 0, 0, 0]), 'sickness', 'development', 'p0');
    expect(why(0, 5)).toBe('pollution');
    expect(why(30, 0)).toBe('air');
    expect(why(30, 20)).toBe('pollution');
    expect(why(60, 5)).toBe('air');
    expect(why(0, 0)).toBe('chance');
    // No roll in another phase, and none on a what-if copy.
    expect(playerEventChance(colony(80), 'sickness', 'production', 'p0')).toBe(0);
    expect(rollPlayerEvent(cloneForSim(colony(80, [12, 0, 0, 0])), 'sickness', 'development', 'p0')).toBe(false);

    // Seeded: the same game rolls the same, and over many games about as often as the chance says.
    const rolls = (seed: number) => {
      const state = colony(30, [0, 0, 0, 0], seed);
      return [0, 1, 2, 3].map((i) => rollPlayerEvent(state, 'sickness', 'development', `p${i}`));
    };
    expect(rolls(11)).toEqual(rolls(11));
    let sick = 0;
    for (let seed = 1; seed <= 250; seed++) sick += rolls(seed).filter(Boolean).length;
    expect(sick / 1_000).toBeGreaterThan(base + sickness.air.smoggy - 0.05);
    expect(sick / 1_000).toBeLessThan(base + sickness.air.smoggy + 0.05);

    // At development start: certain sickness makes a player without Medicine sick; one with a Medicine takes it.
    const start = (body: (state: GameState) => void, pollutionBy?: number[]) => {
      const state = colony(0, pollutionBy);
      state.players[0]!.stock.medicine = 1;
      state.players[1]!.stock.medicine = 0;
      state.players[1]!.sick = true;
      while (state.phase !== 'development') advancePhase(state);
      body(state);
    };
    withSickness({ phases: { development: 1 }, cap: 1 }, () =>
      start((state) => {
        expect([state.players[0]!.sick, state.players[0]!.stock.medicine]).toEqual([false, 0]);
        expect(state.players[1]!.sick).toBe(true);
      }),
    );
    // With no chance nobody falls sick, not even last month's sick player, and nobody uses a Medicine.
    withSickness({ phases: { development: 0 } }, () =>
      start((state) => {
        expect(state.players.map((p) => p.sick)).toEqual([false, false, false, false]);
        expect(state.players[0]!.stock.medicine).toBe(1);
      }),
    );
    // Each player rolls on its own risk: only last month's polluter falls sick.
    withSickness({ phases: { development: 0 }, pollution: { perPoint: 1, max: 1 }, cap: 1 }, () =>
      start((state) => expect(state.players.map((p) => p.sick)).toEqual([false, true, false, false]), [0, 5, 0, 0]),
    );
  });
});

describe('the event table', () => {
  /** p1's wealth: four plots and no cash. */
  const land = 4 * GAME.plotScore;
  interface World {
    air?: number;
    /** Air points p0's plots caused last month. */
    points?: number;
    lastMonth?: EventKey[];
    /** Events in month 1's report, filed before last month's. */
    earlier?: EventKey[];
    p0Money?: number;
    /** Whose roll it is; none for a colony row. */
    player?: string;
    fired?: EventKey[];
  }
  /** Four players at month 3: p0 has the most cash, but p1 is the richest by its land; p3 is the poorest. */
  const chanceIn = (row: EventRow, phase: Phase, { air = 0, points = 0, lastMonth = [], earlier = [], p0Money = land - 100, player, fired }: World) => {
    const state = createGame({ seed: 5, players: [0, 1, 2, 3].map((i) => ({ id: `p${i}`, name: `P${i}`, isAi: false })) });
    state.month = 3;
    state.air = air;
    [p0Money, 0, 100, 50].forEach((money, i) => (state.players[i]!.money = money));
    for (const t of state.tiles.filter((t) => t.terrain !== 'store').slice(0, 4)) t.owner = 'p1';
    const events = (keys: EventKey[]) => keys.map((key) => ({ key }) as MonthEvent);
    const reports: Partial<MonthReport>[] = [
      { month: 1, events: events(earlier) },
      { month: 2, pollutionBy: { p0: points }, events: events(lastMonth) },
    ];
    state.history.push(...(reports as MonthReport[]));
    return eventChance(state, row, phase, { player, firedThisPhase: fired });
  };
  /** Rows shaped like the catalogue's wave-1 examples, here rather than read from EVENTS, so a retune is one row edit. */
  const like = {
    dustStorm: { phases: { production: 0.05 }, cap: 0.9 },
    drought: { phases: { production: 0.05 }, air: { toxic: 0.02, collapse: 0.04 }, cap: 0.9 },
    acidRain: { phases: { production: 0.01 }, air: { smoggy: 0.04, toxic: 0.08, collapse: 0.12 }, cap: 0.9 },
    flood: { phases: { production: 0.05 }, follows: { drought: { points: 0.1, lastMonth: true } }, cap: 0.9 },
    pestSwarm: { phases: { production: 0.015 }, wealth: { richest: 0.01, poorest: -0.01 }, cap: 0.9 },
    wildfire: { phases: { production: 0.015 }, wealth: { richest: 0.01 }, follows: { drought: { points: 0.03, thisPhase: true, lastMonth: true } }, cap: 0.9 },
    bumperHarvest: { phases: { production: 0.015 }, wealth: { poorest: 0.015, richest: -0.01 }, cap: 0.9 },
    sickness: { phases: { development: 0.03 }, air: { clean: 0, smoggy: 0.15, toxic: 0.3, collapse: 0.5 }, pollution: { perPoint: 0.03, max: 0.4 }, cap: 0.9 },
    below0: { phases: { production: 0.01 }, wealth: { richest: -0.05 }, cap: 0.9 },
  } satisfies Record<string, EventRow>;
  const cases: [string, EventRow, Phase, World, number][] = [
    ['a dust-storm-like row in Collapse air: 5', like.dustStorm, 'production', { air: 80 }, 0.05],
    ['a drought-like row in Toxic air: 5 + 2', like.drought, 'production', { air: 60 }, 0.07],
    ['an acid-rain-like row in Collapse air: 1 + 12', like.acidRain, 'production', { air: 80 }, 0.13],
    ['a flood-like row the month after a drought: 5 + 10', like.flood, 'production', { lastMonth: ['drought'] }, 0.15],
    ['a flood-like row two months after a drought: 5', like.flood, 'production', { earlier: ['drought'] }, 0.05],
    ['a pest-swarm-like row, the richest by land: 1.5 + 1', like.pestSwarm, 'production', { player: 'p1' }, 0.025],
    ['a pest-swarm-like row, the poorest: 1.5 - 1', like.pestSwarm, 'production', { player: 'p3' }, 0.005],
    ['a pest-swarm-like row, a tie for the richest goes to the first seat: 1.5', like.pestSwarm, 'production', { p0Money: land, player: 'p1' }, 0.015],
    ['a bumper-harvest-like row, the poorest: 1.5 + 1.5', like.bumperHarvest, 'production', { player: 'p3' }, 0.03],
    ['a bumper-harvest-like row, the richest: 1.5 - 1', like.bumperHarvest, 'production', { player: 'p1' }, 0.005],
    ['a bumper-harvest-like row, a tie for the poorest goes to the first seat: 1.5', like.bumperHarvest, 'production', { p0Money: 50, player: 'p3' }, 0.015],
    ['a wildfire-like row, the richest during a drought: 1.5 + 1 + 3', like.wildfire, 'production', { player: 'p1', fired: ['drought'] }, 0.055],
    ['a wildfire-like row the month after a drought: 1.5 + 3', like.wildfire, 'production', { lastMonth: ['drought'], player: 'p2' }, 0.045],
    ['a wildfire-like row during and after a drought: 1.5 + 3 once', like.wildfire, 'production', { lastMonth: ['drought'], player: 'p2', fired: ['drought'] }, 0.045],
    ['a sickness-like row, clean air, 5 points of its own: 3 + 15', like.sickness, 'development', { points: 5, player: 'p0' }, 0.18],
    ['a sickness-like row, Collapse, 20 points: 3 + 50 + 40 = 93, capped', like.sickness, 'development', { air: 80, points: 20, player: 'p0' }, 0.9],
    ['a row summing below 0: 1 - 5', like.below0, 'production', { player: 'p1' }, 0],
    ["a phase the row doesn't list, whatever its raises", like.drought, 'development', { air: 80 }, 0],
  ];

  it.each(cases)("EM-T-AC-1: an event's chance is its phase's base plus its raises minus its lowers, between 0 and its cap: %s", (_, row, phase, world, expected) => {
    expect(chanceIn(row, phase, world)).toBeCloseTo(expected, 9);
  });
});

describe('the roller', () => {
  const PERSONAL = ['pestSwarm', 'wildfire', 'bumperHarvest'] as const;
  /** colonyForEvents(seed) at the first month events may roll. */
  const ready = (seed: number) => {
    const state = colonyForEvents(seed);
    state.month = EVENTS.firstMonth;
    return state;
  };
  /** What fires in production over 40 months of one colony, its dice seeded from `seed`. */
  const fortyMonths = (seed: number) => {
    const state = ready(3);
    state.seed = seed;
    return Array.from({ length: 40 }, (_, i) => {
      state.month = EVENTS.firstMonth + i;
      return rollPhase(state, 'production');
    });
  };
  const keys = (months: MonthEvent[][]) => months.map((events) => events.map((e) => e.key));

  it('EM-T-AC-2: no event in month 1 or on a what-if copy, and a seed replays the same events', () => {
    // Its property is each row's own dice, not RULE-2 step 4: with every pair able to fire, the excludes would drop one.
    const ownDice = { excludes: false };
    withEveryRowAt(1, () => {
      const first = colonyForEvents(3);
      expect(first.month).toBe(1);
      expect(rollPhase(first, 'production')).toEqual([]);

      const state = ready(3);
      expect(rollPhase(cloneForSim(state), 'production')).toEqual([]);
      const fired = rollPhase(state, 'production');
      expect(fired.map((e) => e.key)).toEqual([
        ...['dustStorm', 'drought', 'acidRain', 'solarFlare', 'cometPass', 'flood', 'volcanicAsh'],
        ...state.players.flatMap(() => ['pestSwarm', 'wildfire', 'bumperHarvest']),
      ]);
      expect(rollPhase(state, 'production')).toEqual(fired);
      expect(rollPhase(ready(3), 'production')).toEqual(fired);
      // Negative cases: another seed fires the same rows, shaped by other dice; each seat's swarm has its own.
      const reseeded = ready(3);
      reseeded.seed += 1;
      const other = rollPhase(reseeded, 'production');
      expect(other.map((e) => e.key)).toEqual(fired.map((e) => e.key));
      expect(other).not.toEqual(fired);
      const swarms = fired.filter((e) => e.key === 'pestSwarm');
      expect(new Set(swarms.map((e) => JSON.stringify(e))).size).toBeGreaterThan(1);
      // Sickness is no MonthEvent and keeps its own roll: even a certain one fires nothing here.
      EVENTS.player.sickness.phases = { development: 1 };
      expect(rollPhase(state, 'development')).toEqual([]);
    }, ownDice);

    withEveryRowAt(0.5, () => {
      // Player rows lean on wealth here, so a seat rolling at another seat's chance, or at the bare base, shows.
      for (const key of PERSONAL) Object.assign(EVENTS.player[key], { wealth: { richest: 0.3, poorest: -0.3 } });
      const months = fortyMonths(11);
      expect(fortyMonths(11)).toEqual(months);
      // Negative cases: another seed, or another month, rolls other dice.
      expect(keys(fortyMonths(12))).not.toEqual(keys(months));
      expect(new Set(keys(months).map((k) => k.join())).size).toBeGreaterThan(1);
      // The shape is drawn after the roll: at 0.5 a sweep reusing the roll's draw would only come from the north or east.
      const sides = new Set(months.flat().flatMap((e) => (e.direction ? [e.direction] : [])));
      expect([...sides].sort()).toEqual(['e', 'n', 's', 'w']);
      // Each seat rolls each of its rows, in seat order, on the dice rollPlayerEvent uses for that row and seat.
      const state = ready(3);
      state.seed = 11;
      for (let i = 0; i < 40; i++) {
        state.month = EVENTS.firstMonth + i;
        const personal = rollPhase(state, 'production').filter((e) => e.scope === 'personal').map((e) => e.key);
        const own = state.players.flatMap((p) => PERSONAL.filter((key) => rollPlayerEvent(state, key, 'production', p.id)));
        expect([state.month, personal]).toEqual([state.month, own]);
      }
      // Each row on its own dice: no dust storms moves no other row's fate or shape.
      EVENTS.colony.dustStorm.phases = { production: 0 };
      expect(fortyMonths(11)).toEqual(months.map((events) => events.filter((e) => e.key !== 'dustStorm')));
    }, ownDice);

    withEveryRowAt(0, () => {
      // During a drought: colony rows roll first, and each seat's later roll reads what fired this phase.
      Object.assign(EVENTS.player.wildfire, { follows: { drought: { points: 1, thisPhase: true } } });
      EVENTS.colony.drought.phases = { production: 1 };
      expect(rollPhase(ready(3), 'production').map((e) => e.key)).toEqual(['drought', 'wildfire', 'wildfire', 'wildfire', 'wildfire']);
      EVENTS.colony.drought.phases = { production: 0 };
      expect(rollPhase(ready(3), 'production')).toEqual([]);
    }, ownDice);
  });

  /**
   * Four players' farms at the first month events may roll: p2's one Food plot, a p3 Food plot joined to it, and far
   * off two Food plots each for p0 and p1 and one more for p3. p2 is the richest by cash plus land, p3 the poorest.
   */
  const farms = () => {
    const state = createGame({ seed: 4, players: [0, 1, 2, 3].map((i) => ({ id: `p${i}`, name: `P${i}`, isAi: false })) });
    state.month = EVENTS.firstMonth;
    const land = (t: Tile) => t.terrain !== 'store';
    const near = (t: Tile) => neighbours(state.tiles, state.width, t);
    const p2Food = state.tiles.find((t) => land(t) && near(t).filter(land).length === 4)!;
    const joined = near(p2Food)[0]!;
    const around = [p2Food, ...near(p2Food)];
    const far = state.tiles.filter((t) => land(t) && around.every((c) => Math.max(Math.abs(c.x - t.x), Math.abs(c.y - t.y)) >= 3));
    const farmers: [Tile, string][] = [[p2Food, 'p2'], [joined, 'p3'], [far[0]!, 'p0'], [far[1]!, 'p0'], [far[2]!, 'p1'], [far[3]!, 'p1'], [far[4]!, 'p3']];
    for (const [t, owner] of farmers) Object.assign(t, { owner, outfit: 'food' });
    [1_000, 1_000, 10_000, 0].forEach((money, i) => (state.players[i]!.money = money));
    return { state, p2Food, joined };
  };
  /** Each event's key, whose it is, and who owns the plot it starts on. */
  const whose = (state: GameState, events: MonthEvent[]) => events.map((e) => [e.key, e.player, state.tiles[e.plots[0]!.index]!.owner]);

  it("EM-T-AC-4: a personal event starts on its own player's plots, and the richest and poorest read their rows' points", () => {
    withEveryRowAt(0, () => {
      // Only the rank's points lift a row above 0: the richest's bad rows, the poorest's good one.
      for (const key of ['pestSwarm', 'wildfire'] as const) reset(EVENTS.player[key], { phases: { production: 0 }, wealth: { richest: 1 }, cap: 1 });
      reset(EVENTS.player.bumperHarvest, { phases: { production: 0 }, wealth: { poorest: 1 }, cap: 1 });
      const { state, p2Food, joined } = farms();
      const fired = rollPhase(state, 'production');
      expect(whose(state, fired)).toEqual([
        ['pestSwarm', 'p2', 'p2'],
        ['wildfire', 'p2', 'p2'],
        ['bumperHarvest', 'p3', 'p3'],
      ]);
      // The spread: the swarm crosses onto p3's joined Food, the fire stays on its owner's.
      const hit = (key: EventKey) => fired.find((e) => e.key === key)!.plots.map((p) => state.tiles[p.index]!);
      expect(hit('pestSwarm')).toContain(joined);
      expect(hit('wildfire')).toEqual([p2Food]);
      // The start is drawn among the roller's own plots: over 20 seeds p3's bumper harvest starts on both of p3's.
      const starts = new Set(
        Array.from({ length: 20 }, (_, seed) => {
          const { state: reseeded } = farms();
          reseeded.seed = seed;
          return rollPhase(reseeded, 'production').find((e) => e.key === 'bumperHarvest')!.plots[0]!.index;
        }),
      );
      expect(starts.size).toBe(2);

      // Negative case: p1 works only Energy, so even certain rows fire it no pest swarm or wildfire, nor one elsewhere.
      for (const key of PERSONAL) reset(EVENTS.player[key], { phases: { production: 1 }, cap: 1 });
      const { state: dry } = farms();
      for (const t of dry.tiles) if (t.owner === 'p1') t.outfit = 'energy';
      const all = (p: string) => PERSONAL.map((key) => [key, p, p]);
      expect(whose(dry, rollPhase(dry, 'production'))).toEqual([...all('p0'), ['bumperHarvest', 'p1', 'p1'], ...all('p2'), ...all('p3')]);
    });
  });
});

describe('cavern collapse', () => {
  /**
   * At `month`, crystal caverns and one ruin, and no other special field: p0 and p1 each mine a cavern for Crystite, p2
   * mines one on Crystite 0 and p3 farms one, which a drought reaches; p0's ruin settles in production, and doesn't
   * collapse. Every seat has Energy and Water to spare.
   */
  const caverns = (month: number) => {
    const state = createGame({ seed: 4, players: [0, 1, 2, 3].map((i) => ({ id: `p${i}`, name: `P${i}`, isAi: false })) });
    state.month = month;
    for (const t of state.tiles) delete t.special;
    const land = state.tiles.filter((t) => t.terrain !== 'store');
    const plots: [string, Outfit, number][] = [['p0', 'crystite', 3], ['p1', 'crystite', 3], ['p2', 'crystite', 0], ['p3', 'food', 3]];
    const [one, two, empty, farmed] = plots.map(([owner, outfit, crystite], i) => {
      const tile = land[i * 6]!;
      Object.assign(tile, { owner, outfit, traits: [], pollution: 0, special: { kind: 'crystalCavern' } });
      tile.ground.crystite = crystite;
      return state.tiles.indexOf(tile);
    }) as [number, number, number, number];
    Object.assign(land[24]!, { owner: 'p0', special: { kind: 'ruins', salvage: 'alloy' } });
    for (const p of state.players) Object.assign(p.stock, { energy: 10, water: 10 });
    return { state, mined: [one, two], empty, farmed };
  };
  const kindAt = (state: GameState, index: number) => state.tiles[index]!.special?.kind;
  const linesOf = (report: MonthReport, at: number[]) => at.map((index) => report.lines!.find((l) => l.tile === index)!);

  it("EM-T-AC-5: cavern collapse rolls on its row, with today's effect", () => {
    withEveryRowAt(0, () => {
      const calm = caverns(EVENTS.firstMonth);
      const calmReport = produce(calm.state);
      expect([...calm.mined, calm.empty, calm.farmed].map((i) => kindAt(calm.state, i))).toEqual(Array(4).fill('crystalCavern'));
      expect(calmReport.events).toEqual([]);

      EVENTS.colony.cavernCollapse.phases = { production: 1 };
      EVENTS.colony.drought.phases = { production: 1 };
      for (const month of [1, EVENTS.firstMonth]) {
        const { state, mined, empty, farmed } = caverns(month);
        const report = produce(state);
        expect([month, mined.map((i) => kindAt(state, i))]).toEqual([month, [undefined, undefined]]);
        expect([month, [empty, farmed].map((i) => kindAt(state, i))]).toEqual([month, ['crystalCavern', 'crystalCavern']]);
        expect(linesOf(report, [empty])[0]!.made).toBe(0);
        // This month's Crystite is already made: the mined caverns' lines are the ones they make at 0.
        expect(linesOf(report, mined)).toEqual(linesOf(calmReport, calm.mined));

        const output = month < EVENTS.firstMonth ? [] : ['drought'];
        expect(report.events!.map((e) => e.key)).toEqual([...output, 'cavernCollapse', 'cavernCollapse']);
        expect(report.events!.slice(output.length)).toEqual(
          mined.map((index) => {
            const tile = state.tiles[index]!;
            return {
              key: 'cavernCollapse',
              kind: 'quake',
              title: expect.stringMatching(/^\S+( \S+){1,3}$/),
              line: expect.stringMatching(/^[^.\d]+\.$/),
              scope: 'personal',
              origin: { x: tile.x, y: tile.y },
              // The plot was a cavern and becomes plain: the screens keep the badge until the hit lands.
              plots: [{ index, order: 0, good: 'crystite', delta: 0, was: 'crystalCavern', becomes: 'plain' }],
              player: tile.owner,
              sign: 'bad',
              phase: 'production',
            };
          }),
        );
      }

      const { state, mined } = caverns(EVENTS.firstMonth);
      const whatIf = cloneForSim(state);
      expect(produce(whatIf).events).toEqual([]);
      expect(mined.map((i) => kindAt(whatIf, i))).toEqual(['crystalCavern', 'crystalCavern']);

      EVENTS.colony.cavernCollapse.cap = 0;
      const capped = caverns(EVENTS.firstMonth);
      expect(produce(capped.state).events!.map((e) => e.key)).toEqual(['drought']);
      expect(capped.mined.map((i) => kindAt(capped.state, i))).toEqual(['crystalCavern', 'crystalCavern']);
    });
  });
});
