import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  buildEvent,
  createGame,
  createRng,
  EVENTS,
  GOODS,
  neighbours,
  planEvent,
  type EventKey,
  type GameState,
  type MonthEvent,
  type MonthReport,
  type Outfit,
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
