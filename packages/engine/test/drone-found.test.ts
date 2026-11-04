import { describe, expect, it } from 'vitest';
import { advancePhase, createGame, orderGeoDrone, type GameState } from '../src/index.js';

/**
 * H-3 (WS6 UX audit): the land grant's "Your drone: …" line. At the grant the drone's plots are analysed and its
 * order is emptied, so the engine keeps what it surveyed, per player, for that month: `droneFound`.
 */
const SEATS = ['brix', 'ossa', 'lena'];

function newGame(): GameState {
  return createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })) });
}

function toPhase(state: GameState, phase: GameState['phase']): void {
  for (let steps = 0; state.phase !== phase && steps < 10; steps++) advancePhase(state);
}

const ossa = (state: GameState) => state.players.find((p) => p.id === 'ossa')!;

/** Two free plots, as the phone's drone tool offers them. */
function twoFree(state: GameState): { x: number; y: number }[] {
  return state.tiles
    .filter((t) => t.owner === null && t.terrain !== 'store')
    .slice(0, 2)
    .map((t) => ({ x: t.x, y: t.y }));
}

describe("H-3: what the drone surveyed survives the land grant (droneFound)", () => {
  it('H-3: after the grant, droneFound holds exactly what droneOrder held, and droneOrder is empty', () => {
    const state = newGame();
    orderGeoDrone(state, 'ossa', twoFree(state));
    const ordered = ossa(state).droneOrder.slice();
    expect(ordered).toHaveLength(2);
    expect(ossa(state).droneFound, 'nothing found before the grant').toEqual([]);

    toPhase(state, 'landGrant');

    expect(ossa(state).droneFound).toEqual(ordered);
    expect(ossa(state).droneOrder).toEqual([]);
    for (const p of state.players.filter((q) => q.id !== 'ossa')) expect(p.droneFound, `${p.id} sent no drone`).toEqual([]);
  });

  it('H-3: it lasts the month, and is cleared when the next month opens', () => {
    const state = newGame();
    orderGeoDrone(state, 'ossa', twoFree(state));
    const ordered = ossa(state).droneOrder.slice();
    toPhase(state, 'landGrant');
    toPhase(state, 'development');
    expect(ossa(state).droneFound, 'still there in development').toEqual(ordered);

    toPhase(state, 'planning');
    expect(state.month).toBe(2);
    expect(ossa(state).droneFound).toEqual([]);
    toPhase(state, 'landGrant');
    expect(ossa(state).droneFound, 'no drone in month 2').toEqual([]);
  });
});
