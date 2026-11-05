import { describe, expect, it } from 'vitest';
import { DEV_WALK, createGame, foodShare, needsOf, pace, walkSeconds, type DevPlace, type GameState } from '../src/index.js';

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
      ['zip', plot, 'corral', 2.4],
      ['zip', 'corral', plot, 1.6],
    ];
    for (const [id, from, to, seconds] of rows) {
      expect(walkSeconds(state, id, from, to), `${id} ${from} -> ${to}`).toBeCloseTo(seconds, 9);
    }
  });

  it('T-AC-22: hunger and sickness slow the walk, and multiply', () => {
    // Pace = 1 − (1 − DEV_WALK.hungerPaceMin) × (1 − share of the month's Food held), times DEV_WALK.sickPace when
    // sick: the two multiply. The corral to the plot is 2 s at full pace for the Bramblet.
    const { state, plot } = walkers();
    const bram = state.players.find((p) => p.id === 'bram')!;
    const need = needsOf(state, 'bram').food;
    const fed = (share: number) => 1 - (1 - DEV_WALK.hungerPaceMin) * (1 - share);
    const rows: [string, number, boolean, number][] = [
      ['fed and well', need, false, 1],
      ['5 of 10 Food', need * 0.5, false, fed(0.5)],
      ['2 of 10 Food', need * 0.2, false, fed(0.2)],
      ['no Food', 0, false, DEV_WALK.hungerPaceMin],
      ['sick and fed', need, true, DEV_WALK.sickPace],
      ['2 of 10 Food and sick', need * 0.2, true, fed(0.2) * DEV_WALK.sickPace],
      ['no Food and sick', 0, true, DEV_WALK.hungerPaceMin * DEV_WALK.sickPace],
    ];
    for (const [label, food, sick, expected] of rows) {
      bram.stock.food = food;
      bram.sick = sick;
      expect(pace(state, 'bram'), label).toBeCloseTo(expected, 9);
      expect(walkSeconds(state, 'bram', 'corral', plot), label).toBeCloseTo(2 / expected, 9);
    }
    // The share of the month's Food it holds, for the screens to show the level of hunger.
    bram.stock.food = need * 0.2;
    expect(foodShare(state, 'bram')).toBeCloseTo(0.2, 9);
    // A hungry Zipwing: both paces at once.
    const zip = state.players.find((p) => p.id === 'zip')!;
    zip.stock.food = 0;
    zip.sick = false;
    expect(walkSeconds(state, 'zip', 'corral', plot)).toBeCloseTo(1.6 / DEV_WALK.hungerPaceMin, 9);
  });
});
