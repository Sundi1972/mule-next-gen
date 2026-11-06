import { describe, expect, it } from 'vitest';
import { advancePhase, createGame, runProduction, type GameState, type Tile } from '@mule/engine';
import { factoryIdleLine, idleFactories } from '../src/sim.js';

/**
 * The sim's count of factories that made nothing for want of an input: the engine files no production line for a
 * factory whose non-Energy inputs are not in stock (production.ts runProduction), so a factory with no line is idle,
 * and the inputs its owner held too few of, before production plus what it made, are what it wanted.
 */

const flatGround = { food: 0, water: 0, energy: 0, smithore: 0, crystite: 0, rareEarth: 0 };

/** Month 1, just before production: ai0 owns Medicine factories on the given columns of row 0 and holds `stock`. */
function table(columns: number[], stock: { food: number; water: number; energy: number }): GameState {
  const state = createGame({ seed: 7, players: ['ai0', 'ai1'].map((id) => ({ id, name: id, isAi: true, species: 'zipwing' as const })) });
  while (state.phase !== 'development') advancePhase(state);
  for (const t of state.tiles) if (t.owner) Object.assign(t, { owner: null, outfit: null });
  for (const x of columns) {
    const tile = state.tiles[x]!;
    Object.assign(tile, { terrain: 'plains', traits: [], ground: { ...flatGround }, owner: 'ai0', outfit: 'medicine', pollution: 0, runMonths: 0 } satisfies Partial<Tile>);
    delete tile.special;
  }
  Object.assign(state.players.find((p) => p.id === 'ai0')!.stock, stock);
  return state;
}

/** Runs the month's production as the engine's phase does, keeping what its report files. */
function produce(state: GameState) {
  const before = Object.fromEntries(state.players.map((p) => [p.id, { ...p.stock }]));
  const { lines, produced } = runProduction(state);
  return { lines, produced, before };
}

describe('the sim counts factories idle for want of an input', () => {
  it('FM-factory-input: a factory without its Food makes nothing and is counted idle, wanting Food', () => {
    const state = table([0], { food: 0, water: 5, energy: 5 });
    expect(idleFactories(state, produce(state))).toEqual({ factories: 1, idle: [['food']] });
  });

  it('FM-factory-input: a factory with its inputs runs and is not counted idle', () => {
    const state = table([0], { food: 5, water: 5, energy: 5 });
    expect(idleFactories(state, produce(state))).toEqual({ factories: 1, idle: [] });
  });

  it('FM-factory-input: of two factories sharing one Food, the one that ran is not idle and the other wants Food', () => {
    const state = table([0, 2], { food: 1, water: 5, energy: 5 });
    expect(idleFactories(state, produce(state))).toEqual({ factories: 2, idle: [['food']] });
  });

  it('FM-factory-input: the report line gives the share of factory-months idle and the inputs wanted', () => {
    expect(factoryIdleLine({ factories: 40, idle: 6, wanted: { food: 4, water: 3 } })).toBe(
      '     Factories idle for want of an input: 15% of 40 factory-months (wanting Food 4, Water 3) (no check)',
    );
    expect(factoryIdleLine({ factories: 0, idle: 0, wanted: {} })).toBe('     Factories idle for want of an input: 0% of 0 factory-months (no check)');
  });
});
