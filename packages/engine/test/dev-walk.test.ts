import { describe, expect, it } from 'vitest';
import { createGame, walkSeconds, type DevPlace, type GameState } from '../src/index.js';

/** A game with a Zipwing and a Bramblet, and two plots: one 3 across and 2 down from the store, one a step diagonal from it. */
function walkers(): { state: GameState; plot: number; diagonal: number } {
  const state = createGame({
    seed: 11,
    players: [
      { id: 'zip', name: 'zip', isAi: false, species: 'zipwing' },
      { id: 'bram', name: 'bram', isAi: false, species: 'bramblet' },
    ],
  });
  const store = state.tiles.find((t) => t.terrain === 'store')!;
  const sx = store.x + 4 < state.width ? 1 : -1;
  const sy = store.y + 2 < state.height ? 1 : -1;
  const at = (x: number, y: number) => {
    expect(x >= 0 && x < state.width && y >= 0 && y < state.height, `(${x}, ${y}) is on the map`).toBe(true);
    return y * state.width + x;
  };
  return { state, plot: at(store.x + 3 * sx, store.y + 2 * sy), diagonal: at(store.x + 4 * sx, store.y + sy) };
}

describe('walking in development', () => {
  it('T-AC-18: walkSeconds is grid steps x DEV_WALK.tileSeconds, + DEV_WALK.floorSeconds into the corral, / the Zipwing\'s pace', () => {
    const { state, plot, diagonal } = walkers();
    const rows: [string, DevPlace, DevPlace, number][] = [
      ['bram', 'store', 'store', 0],
      ['bram', 'store', 'corral', 1],
      ['bram', 'corral', 'corral', 0],
      ['bram', 'corral', 'store', 0],
      ['bram', 'corral', plot, 2],
      ['bram', plot, 'corral', 3],
      ['bram', plot, 'store', 2],
      ['bram', plot, diagonal, 0.8],
      ['zip', plot, 'corral', 2],
      ['zip', 'corral', plot, 2 / 1.5],
    ];
    for (const [id, from, to, seconds] of rows) {
      expect(walkSeconds(state, id, from, to), `${id} ${from} -> ${to}`).toBeCloseTo(seconds, 9);
    }
  });
});
