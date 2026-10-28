import { describe, expect, it } from 'vitest';
import { createGame, DEV_WALK, needsOf, POLLUTION, walkSeconds, type DevPlace, type GameState } from '../src/index.js';

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

  it('T-AC-22: hunger and sickness slow the walk, and multiply', () => {
    // The corral to the plot is 2 s at full pace for the Bramblet; the Zipwing's is 2 / 1.5.
    const { state, plot } = walkers();
    const bram = state.players.find((p) => p.id === 'bram')!;
    const zip = state.players.find((p) => p.id === 'zip')!;
    const need = needsOf(state, 'bram').food;
    const smoggy = POLLUTION.bands.find((b) => b.name === 'smoggy')!;
    state.air = smoggy.from;
    const walk = (id: string) => walkSeconds(state, id, 'corral', plot);
    const min = DEV_WALK.hungerPaceMin;
    const rows: [string, () => void, number][] = [
      ['fed and well', () => ((bram.stock.food = need), (bram.sick = false)), 2],
      ['half fed', () => (bram.stock.food = need / 2), 2 / (1 - (1 - min) / 2)],
      ['no Food', () => (bram.stock.food = 0), 2 / min],
      ['no Food and sick', () => (bram.sick = true), 2 / (min * smoggy.sickPace)],
      ['fed and sick', () => (bram.stock.food = need), 2 / smoggy.sickPace],
    ];
    for (const [label, arrange, seconds] of rows) {
      arrange();
      expect(walk('bram'), label).toBeCloseTo(seconds, 9);
    }
    // A hungry Zipwing: both paces at once.
    zip.stock.food = 0;
    zip.sick = false;
    expect(walk('zip')).toBeCloseTo(2 / (1.5 * min), 9);
    // The slowdown is real, and the worst case is about a tenth of normal pace, as Heiko asked.
    expect(min).toBeLessThan(1);
    const collapse = POLLUTION.bands.find((b) => b.name === 'collapse')!;
    expect(min * collapse.sickPace).toBeGreaterThanOrEqual(0.05);
    expect(min * collapse.sickPace).toBeLessThanOrEqual(0.15);
  });
});
