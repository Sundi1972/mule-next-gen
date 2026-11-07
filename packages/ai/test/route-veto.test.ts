import { describe, expect, it } from 'vitest';
import { advancePhase, createGame, tileAt, tileIndex, type GameState } from '@mule/engine';
import { simFloorConfig } from '../src/floor-turn.js';
import { unreachablePlot } from '../src/hands/develop.js';

const ME = 'ai0';

/** Month 1's development of seed `seed`'s four-seat game, as the sim plays it. */
function development(seed: number): GameState {
  const state = createGame({ seed, players: [0, 1, 2, 3].map((i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
  while (state.phase !== 'development') advancePhase(state);
  for (const t of state.tiles) if (t.owner === ME) t.owner = null;
  return state;
}

/** Gives ai0 the plot at (x, y) and returns its index. */
function own(state: GameState, x: number, y: number): number {
  tileAt(state.tiles, state.width, x, y)!.owner = ME;
  return tileIndex(state.width, x, y);
}

describe('unreachablePlot: a lake plot no shore reaches can never get a MULE', () => {
  it('a lake plot ringed by lake (seed 4, plot 10) is unreachable', () => {
    const state = development(4);
    const plot = own(state, 10, 0);
    expect(state.tiles[plot]!.terrain).toBe('lake');
    expect(unreachablePlot(state, plot, simFloorConfig())).toBe(true);
  });

  it("a lake plot whose only shore is the seat's own land (seed 4, plot 25) is unreachable for it", () => {
    const state = development(4);
    const plot = own(state, 10, 1);
    own(state, 9, 2);
    expect(unreachablePlot(state, plot, simFloorConfig())).toBe(true);
  });

  it('a lake plot with a shore a seat can stand on (seed 4, plot 25) is reachable', () => {
    const state = development(4);
    const plot = own(state, 10, 1);
    expect(state.tiles[plot]!.terrain).toBe('lake');
    expect(unreachablePlot(state, plot, simFloorConfig())).toBe(false);
  });

  it('ordinary land is reachable', () => {
    const state = development(4);
    const land = state.tiles.findIndex((t) => t.terrain === 'plains');
    own(state, state.tiles[land]!.x, state.tiles[land]!.y);
    expect(unreachablePlot(state, land, simFloorConfig())).toBe(false);
  });

  it('a lake plot nobody holds is judged as if a seat held it: ringed by lake, unreachable; with a free shore, reachable', () => {
    const state = development(4);
    expect(unreachablePlot(state, tileIndex(state.width, 10, 0))).toBe(true);
    expect(unreachablePlot(state, tileIndex(state.width, 10, 1))).toBe(false);
  });
});
