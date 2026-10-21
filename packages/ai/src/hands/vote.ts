import type { GameState, Rng } from '@mule/engine';
import type { Act } from '../actions.js';
import type { Mind } from '../value.js';

export function nextTax(current: number, target: number, fund: number, bounds: { low: number; high: number }): number {
  throw new Error('NotImplemented: nextTax');
}

export class VoteHand {
  constructor(
    readonly mind: Mind,
    private readonly rng: Rng,
  ) {}

  tick(state: GameState, dt: number, act: Act): void {
    throw new Error('NotImplemented: VoteHand.tick');
  }
}
