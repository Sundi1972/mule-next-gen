import type { createRng } from './rng.js';
import type { EventKey, GameState, MonthEvent } from './types.js';

type Rng = ReturnType<typeof createRng>;

export function planEvent(state: GameState): MonthEvent | null {
  throw new Error('NotImplemented: planEvent');
}

export function buildEvent(state: GameState, key: EventKey, rng: Rng): MonthEvent | null {
  throw new Error('NotImplemented: buildEvent');
}
