import { describe, expect, it } from 'vitest';
import { addPrestige, cloneForSim, colonyPrestige, createGame, POLITICS, reputationShift, START, type GameState } from '../src/index.js';

const SEATS = ['lena', 'brix', 'ossa', 'kai'];

function game(politics = true): GameState {
  return createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })), politics });
}

const rep = (state: GameState, id: string) => state.players.find((p) => p.id === id)!.reputation;

// The writers C26's events call (G-5 §3: a festival's permanent prestige, blamed's reputation). Named edits in WS7's
// colony.ts and politics.ts; these rows are their guards.
describe("C26's writers: addPrestige (colony.ts) and reputationShift (politics.ts)", () => {
  it('INV-prestige-write: addPrestige adds whole points to colony.permanentPrestige, and colonyPrestige counts them', () => {
    const state = game();
    addPrestige(state, 2);
    addPrestige(state, 2);
    expect(state.colony!.permanentPrestige).toBe(4);
    expect(colonyPrestige(state)).toBe(4);
  });

  it("INV-whatif (HC-21): addPrestige on a what-if copy never reaches the real game's colony", () => {
    const real = game();
    addPrestige(real, 1);
    const copy = cloneForSim(real);
    addPrestige(copy, 2);
    expect(copy.colony!.permanentPrestige).toBe(3);
    expect(real.colony!.permanentPrestige, "the copy's write stays in the copy").toBe(1);
    const later = cloneForSim(real);
    addPrestige(real, 5);
    expect(later.colony!.permanentPrestige, "the real game's later write stays out of a copy").toBe(1);
  });

  it('T-AC-22 (HC-22): with politics off there is no colony, and addPrestige does nothing', () => {
    const off = game(false);
    addPrestige(off, 2);
    expect(off.colony).toBeNull();
  });

  it('INV-1: reputationShift moves a player by whole points and clamps to POLITICS.reputation.min..max', () => {
    const state = game();
    reputationShift(state, 'kai', -1);
    expect(rep(state, 'kai')).toBe(START.reputation - 1);
    reputationShift(state, 'kai', -1_000);
    expect(rep(state, 'kai')).toBe(POLITICS.reputation.min);
    reputationShift(state, 'kai', 1_000);
    expect(rep(state, 'kai')).toBe(POLITICS.reputation.max);
    reputationShift(state, 'kai', -0.6);
    expect(rep(state, 'kai'), 'whole numbers only').toBe(POLITICS.reputation.max - 1);
    expect(['lena', 'brix', 'ossa'].map((id) => rep(state, id)), 'no other player moves').toEqual([START.reputation, START.reputation, START.reputation]);
  });

  it("INV-whatif (HC-21): reputationShift on a what-if copy never reaches the real game's player", () => {
    const real = game();
    const copy = cloneForSim(real);
    reputationShift(copy, 'kai', -3);
    expect(rep(copy, 'kai')).toBe(START.reputation - 3);
    expect(rep(real, 'kai')).toBe(START.reputation);
  });

  it('T-AC-22 (HC-22): with politics off reputationShift does nothing', () => {
    const off = game(false);
    reputationShift(off, 'kai', -1);
    expect(rep(off, 'kai')).toBe(START.reputation);
  });
});
