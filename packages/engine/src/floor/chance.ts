import { createRng, type Rng } from '../rng.js';
import type { GameState } from '../types.js';

/**
 * A seeded draw for one of the floor's moments at one tick: from the game's seed, its month, the moment's names and
 * the tick (FNV-1a, as events.ts seeds its rolls). Nothing is carried from tick to tick, so the floor stays a function
 * of the seed and the per-tick inputs (HC-1, HC-4), and the same draw is the same in the server, the sim and a test.
 */
export function momentRng(state: GameState, tick: number, ...names: string[]): Rng {
  let h = 2_166_136_261; // literal-ok: FNV-1a offset basis
  for (const part of [String(state.seed), String(state.month), ...names, String(tick)]) {
    for (let i = 0; i < part.length; i++) h = Math.imul(h ^ part.charCodeAt(i), 16_777_619); // literal-ok: FNV-1a prime
    h = Math.imul(h ^ 0, 16_777_619); // literal-ok: FNV-1a prime, a separator between parts
  }
  return createRng(h >>> 0);
}

/** A full turn, in radians. */
export const TURN = 2 * Math.PI; // literal-ok: geometry, a full turn

/** A player's name, for a beat. */
export const nameOf = (state: GameState, id: string): string => state.players.find((p) => p.id === id)?.name ?? id;
