import { describe, expect, it, vi } from 'vitest';
import {
  advancePhase,
  createGame,
  EXPORT_DEMAND,
  GOOD_CONFIG,
  GOODS,
  OFF_WORLD,
  seedOf,
  stepOffWorld,
  type GameState,
  type Good,
  type Stock,
} from '../src/index.js';

interface Draw {
  seed: number;
  method: string;
  out: number | null;
}

/** Every call on every rng the engine makes, in order, with the seed the rng was made from. */
const draws = vi.hoisted((): Draw[] => []);

vi.mock('../src/rng.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/rng.js')>();
  return {
    ...real,
    createRng(seed: number) {
      const rng = real.createRng(seed);
      const logged = Object.entries(rng).map(([method, fn]) => [
        method,
        (...args: unknown[]) => {
          const out = (fn as (...a: unknown[]) => unknown)(...args);
          draws.push({ seed, method, out: typeof out === 'number' ? out : null });
          return out;
        },
      ]);
      return Object.fromEntries(logged) as typeof rng;
    },
  };
});

const EXPORTS = Object.keys(EXPORT_DEMAND) as Good[];

function newGame(seed: number): GameState {
  return createGame({ seed, players: [0, 1, 2, 3].map((i) => ({ id: `p${i}`, name: `P${i}`, isAi: false })) });
}

/** The seeds the walk is keyed on for every month of a game. */
function walkSeeds(seed: number, months: number): Set<number> {
  const out = new Set<number>();
  for (let month = 1; month <= months; month++) for (const good of EXPORTS) out.add(seedOf(seed, month, 'offWorld', good));
  return out;
}

/** A game nobody plays in: every phase passes untouched until the game is over. Its off-world price as each month opens. */
function idleGame(seed: number): { state: GameState; path: Stock[]; startTiles: string } {
  const state = newGame(seed);
  const startTiles = JSON.stringify(state.tiles);
  const path: Stock[] = [{ ...state.store.offWorld }];
  while (state.phase !== 'gameOver') {
    const month = state.month;
    advancePhase(state);
    if (state.month !== month) path.push({ ...state.store.offWorld });
  }
  return { state, path, startTiles };
}

function withSigmaZero<T>(run: () => T): T {
  const saved = { crystite: OFF_WORLD.crystite.sigma, others: OFF_WORLD.others.sigma };
  try {
    OFF_WORLD.crystite.sigma = 0;
    OFF_WORLD.others.sigma = 0;
    return run();
  } finally {
    OFF_WORLD.crystite.sigma = saved.crystite;
    OFF_WORLD.others.sigma = saved.others;
  }
}

describe('pricing G-3: the export goods walk off-world', () => {
  it('price T-AC-1: the same seed gives the same off-world path, and every other draw is unchanged', () => {
    const seed = 7;
    const once = idleGame(seed);
    const again = idleGame(seed);
    expect(again.path, 'the same seed, the same path').toEqual(once.path);
    expect(new Set(once.path.map((p) => p.crystite)).size, 'the premise: Crystite moved').toBeGreaterThan(3);
    expect(idleGame(seed + 1).path, 'another seed, another path').not.toEqual(once.path);

    // The walk draws only from its own keyed rngs, one per export good, as the month opens.
    const ownSeeds = walkSeeds(seed, once.state.maxMonths);
    const state = newGame(seed);
    state.month++;
    draws.length = 0;
    stepOffWorld(state);
    expect(draws.length, 'the premise: the walk drew').toBeGreaterThan(0);
    expect(draws.filter((d) => !ownSeeds.has(d.seed)), 'draws outside the walk\'s own rngs').toEqual([]);
    expect(new Set(draws.map((d) => d.seed))).toEqual(new Set(EXPORTS.map((g) => seedOf(seed, state.month, 'offWorld', g))));

    // A game with the walk and one without draw every other number alike: the map, the events, every other rng.
    draws.length = 0;
    const walked = idleGame(seed);
    const walkedDraws = draws.filter((d) => !ownSeeds.has(d.seed));
    draws.length = 0;
    const still = withSigmaZero(() => idleGame(seed));
    const stillDraws = draws.filter((d) => !ownSeeds.has(d.seed));
    expect(still.path.every((p) => EXPORTS.every((g) => p[g] === still.path[0]![g])), 'the premise: sigma 0 holds the prices').toBe(true);
    expect(walked.path, 'the premise: the walk moved the prices').not.toEqual(still.path);
    expect(walked.startTiles, 'the map').toBe(still.startTiles);
    expect(walked.state.history.map((r) => r.events), 'every month\'s events').toEqual(still.state.history.map((r) => r.events));
    expect(JSON.stringify(walked.state.tiles), 'the map at the end').toBe(JSON.stringify(still.state.tiles));
    expect(walkedDraws.length, 'the premise: the game drew').toBeGreaterThan(0);
    expect(walkedDraws).toEqual(stillDraws);
  }, 60_000);

  it('price B-AC-5 (rule): Crystite stays in 40–300; the others within ±50% of their reference', () => {
    const MONTHS = 1_000;
    const state = newGame(1);
    expect(state.store.offWorld.crystite, 'the first month starts at the centre (RULE-3)').toBe(90);
    const crystite = new Set<number>();
    const moved = new Set<Good>();
    for (let i = 0; i < MONTHS; i++) {
      const before = { ...state.store.offWorld };
      state.month++;
      stepOffWorld(state);
      const price = state.store.offWorld;
      crystite.add(price.crystite);
      expect(price.crystite, `Crystite, month ${state.month}`).toBeGreaterThanOrEqual(40);
      expect(price.crystite, `Crystite, month ${state.month}`).toBeLessThanOrEqual(300);
      for (const good of EXPORTS) {
        if (price[good] !== before[good]) moved.add(good);
        if (good === 'crystite') continue;
        const ref = GOOD_CONFIG[good].refPrice;
        expect(price[good], `${good}, month ${state.month}`).toBeGreaterThanOrEqual(ref * 0.5);
        expect(price[good], `${good}, month ${state.month}`).toBeLessThanOrEqual(ref * 1.5);
      }
      for (const good of GOODS.filter((g) => !EXPORTS.includes(g))) expect(price[good], `${good} is not exported and stays`).toBe(before[good]);
    }
    expect(crystite.size, 'the premise: Crystite walked').toBeGreaterThan(50);
    expect([...moved].sort(), 'the premise: every export good walked').toEqual([...EXPORTS].sort());
  });
});
