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
  neighbours,
  planEvent,
  playerEventChance,
  playerEventReason,
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

/** Runs `body` with some EVENTS numbers changed, and puts them back. */
function withEvents(change: Partial<typeof EVENTS>, body: () => void) {
  const saved = { ...EVENTS };
  Object.assign(EVENTS, change);
  try {
    body();
  } finally {
    Object.assign(EVENTS, saved);
  }
}

/** Pretends last month's report recorded this event. */
function lastMonthHad(state: GameState, key: EventKey) {
  state.history.push({ month: state.month - 1, events: [{ key } as MonthEvent] } as MonthReport);
}

describe('the event planner', () => {
  it('T-AC-2: no event in month 1, and never the same event two months running', () => {
    withEvents({ chance: 1 }, () => {
      for (let seed = 1; seed <= 40; seed++) {
        const state = developedColony(seed);
        expect(state.month).toBe(1);
        expect(planEvent(state)).toBeNull();
        state.month = 3;
        const key = (['drought', 'dustStorm', 'pestSwarm', 'bumperHarvest'] as EventKey[])[seed % 4]!;
        lastMonthHad(state, key);
        const next = planEvent(state);
        expect(next).not.toBeNull();
        expect(next!.key).not.toBe(key);
      }
    });
  });

  it('T-AC-4: a pest swarm spreads from its start to adjacent Food plots, in order, up to four plots', () => {
    withEvents({ targetBias: 1 }, () => {
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
      state.players[0]!.money = 10_000; // p0 leads, so the swarm starts on its land
      const event = buildEvent(state, 'pestSwarm', createRng(7))!;
      expect(event.plots.map((p) => p.order)).toEqual([0, 1, 2, 3]);
      const hit = event.plots.map((p) => state.tiles[p.index]!);
      expect(hit.every((t) => t.outfit === 'food' && cluster.includes(t))).toBe(true);
      hit.slice(1).forEach((t, k) => expect(hit.slice(0, k + 1).some((h) => neighbours(state.tiles, state.width, h).includes(t))).toBe(true));
      expect(hit).not.toContain(far);
    });
  });

  it('T-AC-6: a bad personal event starts on the leader’s land, a good one on the trailing player’s', () => {
    const run = (bias: number, key: EventKey) =>
      Array.from({ length: 20 }, (_, i) => {
        let player: string | undefined;
        withEvents({ targetBias: bias }, () => {
          const state = developedColony(i + 1);
          state.month = 3;
          state.players[2]!.money = 10_000; // the leader
          state.players[3]!.money = 0; // the trailing player
          player = buildEvent(state, key, createRng(i + 11))?.player;
        });
        return player;
      });
    for (const key of ['pestSwarm', 'wildfire'] as EventKey[]) expect(run(1, key).every((p) => p === 'p2')).toBe(true);
    expect(run(1, 'bumperHarvest').every((p) => p === 'p3')).toBe(true);
    // Negative case: with no bias, the leader isn't always the one hit.
    expect(run(0, 'pestSwarm').some((p) => p !== 'p2')).toBe(true);
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
};

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

describe('events in production', () => {
  it('T-AC-3: each event changes exactly the plots it hits, by RULE-3, and the report says so', () => {
    for (const key of Object.keys(EVENTS.weights) as EventKey[]) {
      const weights = Object.fromEntries(Object.keys(EVENTS.weights).map((k) => [k, k === key ? 1 : 0])) as typeof EVENTS.weights;
      withEvents({ chance: 1, weights }, () => {
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

describe('what-if copies', () => {
  it('T-AC-2: no event is ever rolled on a what-if copy of the game', () => {
    withEvents({ chance: 1 }, () => {
      for (let seed = 1; seed <= 10; seed++) {
        const state = colonyForEvents(seed);
        state.month = 3;
        expect(planEvent(state)).not.toBeNull();
        expect(planEvent(cloneForSim(state))).toBeNull();
      }
    });
  });
});
