/** A 4-seat colony whose Food a test arranges (its shelf, depots and farms) before the store posts its prices. */
import { expect } from 'vitest';
import {
  advancePhase,
  createGame,
  factoryFit,
  GROWN_BASE,
  monthlyDemand,
  neighbours,
  rawOutput,
  type GameState,
  type Good,
  type Phase,
  type Tile,
} from '../../src/index.js';

// No Bramblet: its farms make more than their ground says.
const SPECIES = ['zipwing', 'gearling', 'mollox', 'glimmer'] as const;

export function game(): GameState {
  return createGame({ seed: 11, players: SPECIES.map((species, i) => ({ id: `p${i}`, name: `P${i}`, isAi: false, species })) });
}

export function to(state: GameState, phase: Phase): void {
  while (state.phase !== phase) advancePhase(state);
}

/** Puts p0's MULEs on free plots of `good`, apart from each other and from any special field, so no bonus adds to them. */
export function worked(state: GameState, good: Good, count: number): Tile[] {
  const chosen: Tile[] = [];
  for (const t of state.tiles) {
    if (chosen.length === count) break;
    if (t.terrain === 'store' || t.owner || t.special) continue;
    if (neighbours(state.tiles, state.width, t).some((n) => chosen.includes(n) || n.special)) continue;
    chosen.push(t);
  }
  for (const t of chosen) Object.assign(t, { owner: 'p0', outfit: good, traits: [], pollution: 0 });
  return chosen;
}

/** More farms of p0, making `outputs`, one farm per entry. */
export function farms(state: GameState, outputs: number[]): void {
  const before = made(state, 'food');
  worked(state, 'food', outputs.length).forEach((t, i) => (t.ground = { ...t.ground, food: outputs[i]! - GROWN_BASE }));
  expect(made(state, 'food') - before, 'the premise: what the new farms make').toBe(outputs.reduce((n, x) => n + x, 0));
}

/** This month's expected output of `good`, plot by plot, before Energy and events. */
export function made(state: GameState, good: Good): number {
  return state.tiles
    .filter((t) => t.owner && t.outfit === good)
    .reduce((n, t) => n + (good === 'medicine' ? factoryFit(state, t, good, t.owner!).output : rawOutput(state, t)), 0);
}

/** The colony's Food: `shelf` on the store's shelf and `depots` in the players' depots, from p0's on. */
export function hold(state: GameState, shelf: number, ...depots: number[]): void {
  state.store.stock.food = shelf;
  state.players.forEach((p, i) => (p.stock.food = depots[i] ?? 0));
}

/** Month 1, production run: the colony holds `holds` Food in p0's depot and farms make `farmOutputs`. Demand is 14. */
export function foodMonth(holds: number, farmOutputs: number[]): GameState {
  const state = game();
  to(state, 'production');
  farms(state, farmOutputs);
  hold(state, 0, holds);
  expect(monthlyDemand(state).food, 'the premise: the colony eats 14 Food a month').toBe(14);
  return state;
}

/** Enters the auction, where the store posts its prices, and returns the posted Food price. */
export function post(state: GameState): number {
  advancePhase(state);
  expect(state.phase).toBe('auction');
  return state.store.posted.food;
}

