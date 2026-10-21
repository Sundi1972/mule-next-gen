import type { Prompt } from '@mule/ai';
import { BRAIN } from '@mule/engine';
import { usd, type Ledger } from './ledger.js';

export interface Budget {
  /** Dollars the next call could cost at worst: the prompt as input, a full reply as output. */
  worstCase(prompt: Prompt): number;
  /**
   * RULE-3: may this seat make a call costing up to `nextUsd`? A refusal locks the seat for the rest of the game;
   * `lockedNow` is true only for the refusal that locked it.
   */
  allow(game: string, seat: string, nextUsd: number): { allowed: boolean; lockedNow: boolean };
  /** Forgets a finished game's locks. */
  release(game: string): void;
}

/** Pure decision over the ledger's in-memory totals; no I/O. */
export function createBudget(ledger: Pick<Ledger, 'seatSpent'>): Budget {
  // game -> seats locked out. A locked seat never calls again, so it cannot flip between Smart and Classic.
  const locked = new Map<string, Set<string>>();

  return {
    worstCase(prompt) {
      const chars = prompt.system.length + prompt.user.length + JSON.stringify(prompt.schema).length;
      const tokens = Math.ceil(chars / BRAIN.charsPerToken);
      // A first call writes the cache, which can cost more than plain input: price at the dearer of the two.
      const p = BRAIN.pricesPerMTok;
      const asWrite = p.cacheWrite >= p.input;
      return usd({
        input: asWrite ? 0 : tokens,
        cached_read: 0,
        cache_write: asWrite ? tokens : 0,
        output: BRAIN.maxTokens,
      });
    },

    // RULE-3 row 1 (no API key, no decider at all) lives in createBrain, not here.
    allow(game, seat, nextUsd) {
      if (locked.get(game)?.has(seat)) return { allowed: false, lockedNow: false };
      // Written as !(<=) so a NaN in either number refuses instead of slipping through.
      if (!(ledger.seatSpent(game, seat) + nextUsd <= BRAIN.seatBudgetUsd)) {
        const seats = locked.get(game) ?? new Set<string>();
        seats.add(seat);
        locked.set(game, seats);
        return { allowed: false, lockedNow: true };
      }
      return { allowed: true, lockedNow: false };
    },

    release(game) {
      locked.delete(game);
    },
  };
}
