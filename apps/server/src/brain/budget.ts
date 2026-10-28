import type { Prompt } from '@mule/ai';
import { BRAIN } from '@mule/engine';
import { usd, type Ledger } from './ledger.js';

/** Characters the model reads for a prompt: system, user and the schema's JSON. */
export function promptChars(prompt: Prompt): number {
  return prompt.system.length + prompt.user.length + JSON.stringify(prompt.schema).length;
}

/** The most a call with this prompt can cost: the whole prompt as input at the dearer rate, and a full reply. See RULE-3. */
export function worstCaseUsd(prompt: Prompt): number {
  const tokens = Math.ceil(promptChars(prompt) / BRAIN.charsPerToken);
  // A first call writes the cache, which can cost more than plain input: price at the dearer of the two.
  const p = BRAIN.pricesPerMTok;
  const asWrite = p.cacheWrite >= p.input;
  return usd({
    input: asWrite ? 0 : tokens,
    cached_read: 0,
    cache_write: asWrite ? tokens : 0,
    output: BRAIN.maxTokens,
  });
}

export interface Budget {
  /**
   * May this seat make a call costing up to `nextUsd`? A refusal locks the seat for the rest of the game;
   * `lockedNow` is true only for the refusal that locked it. See RULE-3.
   */
  allow(game: string, seat: string, nextUsd: number): { allowed: boolean; lockedNow: boolean };
  /** The seat's spend this game as allow() checks it: ledger dollars plus its unknown bills at their worst case. */
  spent(game: string, seat: string): number;
  /** Counts a call whose bill is unknown toward the seat's spend at its worst case; its ledger line is left as it is. */
  countUnknownBill(game: string, seat: string, worstUsd: number): void;
  /** Forgets a finished game's locks and unknown bills. */
  release(game: string): void;
}

export interface BudgetOptions {
  /** The most a game's Smart seats together may spend, in US dollars. */
  budgetUsd: number;
  /** The game's registered Smart seats; each holds an equal share of the budget. */
  seats: (game: string) => Iterable<string>;
}

/**
 * Spend checks over the ledger's in-memory totals plus unknown bills; never reads the file. A seat may call while its
 * own spend stays within its share and the table's stays within the game budget. See RULE-3, INV-table-budget.
 */
export function createBudget(ledger: Pick<Ledger, 'seatSpent'>, options: BudgetOptions): Budget {
  // game -> seats locked out. A locked seat never calls again, so it cannot flip between Smart and Classic.
  const locked = new Map<string, Set<string>>();
  // game -> seat -> worst cases of its calls whose bill is unknown.
  const unknown = new Map<string, Map<string, number>>();
  const spentBy = (game: string, seat: string) => ledger.seatSpent(game, seat) + (unknown.get(game)?.get(seat) ?? 0);

  return {
    allow(game, seat, nextUsd) {
      if (locked.get(game)?.has(seat)) return { allowed: false, lockedNow: false };
      // A seat that asks before it is registered still takes a share and puts its spend on the table.
      const table = new Set(options.seats(game)).add(seat);
      const share = options.budgetUsd / table.size;
      const spent = spentBy(game, seat);
      let tableSpent = 0;
      for (const s of table) tableSpent += spentBy(game, s);
      // A negative or infinite term could hide spend; !(<=) also refuses a NaN.
      const sane = Number.isFinite(spent) && Number.isFinite(tableSpent) && Number.isFinite(nextUsd) && nextUsd >= 0;
      // The table check holds the game budget even after a late seat shrinks the shares below what a seat has spent.
      if (!sane || !(spent + nextUsd <= share) || !(tableSpent + nextUsd <= options.budgetUsd)) {
        const seats = locked.get(game) ?? new Set<string>();
        seats.add(seat);
        locked.set(game, seats);
        return { allowed: false, lockedNow: true };
      }
      return { allowed: true, lockedNow: false };
    },

    spent: spentBy,

    countUnknownBill(game, seat, worstUsd) {
      const seats = unknown.get(game) ?? new Map<string, number>();
      seats.set(seat, (seats.get(seat) ?? 0) + worstUsd);
      unknown.set(game, seats);
    },

    release(game) {
      locked.delete(game);
      unknown.delete(game);
    },
  };
}
