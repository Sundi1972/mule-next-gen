import { describe, expect, it } from 'vitest';
import { advancePhase, DEV_WALK, createGame, foodShare, needsOf, pace, sickPace, UPKEEP, walkSeconds, type DevPlace, type GameState } from '../src/index.js';

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
    // Pace = 1 − (1 − DEV_WALK.hungerPaceMin) × (1 − share of its Food the household ate at the last month end), times
    // DEV_WALK.sickPace when sick: the two multiply (needs C15). The corral to the plot is 2 s at full pace for the Bramblet.
    const { state, plot } = walkers();
    const bram = state.players.find((p) => p.id === 'bram')!;
    const fed = (share: number) => 1 - (1 - DEV_WALK.hungerPaceMin) * (1 - share);
    const rows: [string, number, boolean, number][] = [
      ['fed and well', 1, false, 1],
      ['ate 5 of 10 Food', 0.5, false, fed(0.5)],
      ['ate 2 of 10 Food', 0.2, false, fed(0.2)],
      ['ate no Food', 0, false, DEV_WALK.hungerPaceMin],
      ['sick and fed', 1, true, DEV_WALK.sickPace],
      ['ate 2 of 10 Food and sick', 0.2, true, fed(0.2) * DEV_WALK.sickPace],
      ['ate no Food and sick', 0, true, DEV_WALK.hungerPaceMin * DEV_WALK.sickPace],
    ];
    for (const [label, ate, sick, expected] of rows) {
      bram.householdShort = 1 - ate;
      bram.sick = sick;
      expect(pace(state, 'bram'), label).toBeCloseTo(expected, 9);
      expect(walkSeconds(state, 'bram', 'corral', plot), label).toBeCloseTo(2 / expected, 9);
    }
    // The share of its Food the household ate, for the screens to show the level of hunger.
    bram.householdShort = 0.8;
    expect(foodShare(state, 'bram')).toBeCloseTo(0.2, 9);
    // A hungry Zipwing: both paces at once.
    const zip = state.players.find((p) => p.id === 'zip')!;
    zip.householdShort = 1;
    zip.sick = false;
    expect(walkSeconds(state, 'zip', 'corral', plot)).toBeCloseTo(1.6 / DEV_WALK.hungerPaceMin, 9);
  });
});

describe('needs C15: a player is hungry when their household went short at the last month end', () => {
  /** Month 1 played to its auction; bram holds `food` for the month end, which runs, then month 2's development starts. */
  function developAfter(food: number): GameState {
    const { state } = walkers();
    for (let steps = 0; state.phase !== 'auction' && steps < 10; steps++) advancePhase(state);
    const bram = state.players.find((p) => p.id === 'bram')!;
    expect(needsOf(state, 'bram').food, 'the premise: no plots, the household alone').toBe(UPKEEP.baseFood);
    bram.stock.food = food;
    for (let steps = 0; state.phase !== 'development' && steps < 10; steps++) advancePhase(state);
    expect(state.month, "the premise: month 2's development").toBe(2);
    return state;
  }
  /** The share of a fed, well colonist's pace hunger leaves bram: the pace less its sickness. */
  const hungerShare = (state: GameState) => pace(state, 'bram') / sickPace(state, 'bram');

  it('needs B-AC-14: a household that ate in full and whose stock then spoiled below their need is not hungry: it walks at full pace', () => {
    // 3 Food: the household eats its 2, the 1 left spoils to 0, below the 2 it needs at development.
    const state = developAfter(UPKEEP.baseFood + 1);
    const bram = state.players.find((p) => p.id === 'bram')!;
    expect(bram.stock.food, 'the premise: spoiled below the need').toBeLessThan(needsOf(state, 'bram').food);

    expect(hungerShare(state)).toBe(1);
    expect(bram.hungry).toBe(false);
  });

  it('needs B-AC-14 (negative): a household short at upkeep is hungry: 1 of its 2 Food walks at the half-fed pace', () => {
    const state = developAfter(1);

    expect(hungerShare(state)).toBeCloseTo(1 - (1 - DEV_WALK.hungerPaceMin) * 0.5, 9);
    expect(state.players.find((p) => p.id === 'bram')!.hungry).toBe(true);
  });
});
