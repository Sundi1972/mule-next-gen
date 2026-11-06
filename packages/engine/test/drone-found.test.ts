import { describe, expect, it } from 'vitest';
import { advancePhase, cloneForSim, createGame, DEVELOPMENT, observe, orderGeoDrone, type GameState } from '../src/index.js';

/**
 * H-3 (WS6 UX audit): the land grant's "Your drone: …" line. The drone's plots are analysed when it is sent, and the
 * grant empties its order, so the engine keeps what it surveyed, per player, for that month: `droneFound`.
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
    expect(ossa(state).droneFound, 'found at Scan, before the grant').toEqual(ordered);

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

  it("H-3: an AI seat's observation never carries another player's droneFound; a what-if copy does not share it", () => {
    const state = newGame();
    orderGeoDrone(state, 'ossa', twoFree(state));
    toPhase(state, 'landGrant');
    const found = ossa(state).droneFound.slice();

    const seenByBrix = observe(state, 'brix');
    expect(seenByBrix.players.find((p) => p.id === 'ossa')!.droneFound).toEqual([]);
    expect(observe(state, 'ossa').players.find((p) => p.id === 'ossa')!.droneFound, 'her own stays hers').toEqual(found);

    const sim = cloneForSim(state);
    sim.players.find((p) => p.id === 'ossa')!.droneFound.push(-1);
    expect(ossa(state).droneFound).toEqual(found);
  });
});

describe('T-AC-1: the drone\'s ground lands at Scan', () => {
  it('T-AC-1: the drone adds its plots to analysed and droneFound at once, charges once, refuses a second order until the land grant clears droneOrder', () => {
    const state = newGame();
    const plots = twoFree(state);
    const indices = plots.map(({ x, y }) => y * state.width + x);
    const money = ossa(state).money;
    const capital = state.store.capital;

    orderGeoDrone(state, 'ossa', plots);

    expect(ossa(state).analysed, 'known at once, in planning, each plot once').toEqual(indices);
    expect(ossa(state).droneFound).toEqual(indices);
    expect(ossa(state).money).toBe(money - DEVELOPMENT.droneFee);
    expect(state.store.capital).toBe(capital + DEVELOPMENT.droneFee);
    for (const p of state.players.filter((q) => q.id !== 'ossa')) expect(p.analysed, `${p.id} learns nothing`).toEqual([]);
    const seenByBrix = observe(state, 'brix').players.find((p) => p.id === 'ossa')!;
    expect([seenByBrix.analysed, seenByBrix.droneFound], 'another seat sees none of it in planning').toEqual([[], []]);

    expect(() => orderGeoDrone(state, 'ossa', plots)).toThrow('A drone is already on its way');
    expect(ossa(state).money, 'charged once').toBe(money - DEVELOPMENT.droneFee);

    const analysed = ossa(state).analysed.slice();
    toPhase(state, 'landGrant');
    expect(ossa(state).droneOrder, 'the land grant clears the order').toEqual([]);
    expect(ossa(state).analysed, 'the land grant adds nothing').toEqual(analysed);
    expect(ossa(state).droneFound, 'and keeps what Scan found').toEqual(indices);
  });

  it('T-AC-1: an owned plot that is not listed is refused with today\'s words, and nothing is charged or learned', () => {
    const state = newGame();
    const owned = state.tiles.find((t) => t.owner === null && t.terrain !== 'store')!;
    owned.owner = 'brix';
    const money = ossa(state).money;

    expect(() => orderGeoDrone(state, 'ossa', [{ x: owned.x, y: owned.y }])).toThrow('The drone only flies over free or listed plots');
    expect(ossa(state).money).toBe(money);
    expect(ossa(state).analysed).toEqual([]);
    expect(ossa(state).droneFound).toEqual([]);
    expect(ossa(state).droneOrder).toEqual([]);
  });
});
