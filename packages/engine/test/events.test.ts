import { describe, expect, it } from 'vitest';
import { advancePhase, createGame, GOODS, type GameState, type Outfit } from '../src/index.js';

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
