import { BRAIN } from '@mule/engine';
import { usd, type Ledger } from './ledger.js';

export interface Budget {
  /** Dollars the next call could cost at worst: the prompt as input, a full reply as output. */
  worstCase(prompt: string | readonly string[]): number;
  /** RULE-3: may this seat make a call costing up to `nextUsd`? A refusal locks the seat for the rest of the game. */
  allow(game: string, seat: string, nextUsd: number): boolean;
  /** Forgets a finished game's locks. */
  release(game: string): void;
}

/** Pure decision over the ledger's in-memory totals; no I/O. */
export function createBudget(ledger: Pick<Ledger, 'seatSpent'>): Budget {
  // game -> seats locked out. A locked seat never calls again, so it cannot flip between Smart and Classic.
  const locked = new Map<string, Set<string>>();

  return {
    worstCase(prompt) {
      const chars = typeof prompt === 'string' ? prompt.length : prompt.reduce((n, p) => n + p.length, 0);
      return usd({ input: Math.ceil(chars / 4), cached_read: 0, cache_write: 0, output: BRAIN.maxTokens });
    },

    // RULE-3 row 1 (no API key, no decider at all) lives in createBrain, not here.
    allow(game, seat, nextUsd) {
      if (locked.get(game)?.has(seat)) return false;
      if (ledger.seatSpent(game, seat) + nextUsd > BRAIN.seatBudgetUsd) {
        const seats = locked.get(game) ?? new Set<string>();
        seats.add(seat);
        locked.set(game, seats);
        return false;
      }
      return true;
    },

    release(game) {
      locked.delete(game);
    },
  };
}
