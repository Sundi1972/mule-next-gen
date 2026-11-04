/**
 * The colony as a shared project: the colony fund's ledger and every write to the fund. The only writer of
 * GameState.colony and, through fundIn and fundOut, of treasury.money. With politics off there is no colony, and
 * the fund moves exactly as it always has, with no ledger.
 */
import type { Colony, FundLedger, FundLine, FundSource, GameState } from './types.js';

/** The colony at the start of a game played with politics. */
export function newColony(month: number): Colony {
  return { ledger: emptyLedger(month), projects: [], promises: [], permanentPrestige: 0 };
}

function emptyLedger(month: number): FundLedger {
  return { month, in: {}, out: {} };
}

/** A what-if copy may share the colony, so every write copies it first; a new month's first write starts a fresh ledger. */
function edit(state: GameState): Colony {
  const colony = structuredClone(state.colony!);
  if (colony.ledger.month !== state.month) colony.ledger = emptyLedger(state.month);
  state.colony = colony;
  return colony;
}

/** Puts money into the colony fund, recorded under where it came from. */
export function fundIn(state: GameState, source: FundSource, amount: number): void {
  state.treasury.money += amount;
  if (!state.colony || amount === 0) return;
  const ledger = edit(state).ledger;
  ledger.in[source] = (ledger.in[source] ?? 0) + amount;
}

/** Pays out of the colony fund as far as it reaches, never below 0, recorded under what it paid for. Returns what it paid. */
export function fundOut(state: GameState, line: FundLine, amount: number): number {
  const paid = Math.max(0, Math.min(state.treasury.money, amount));
  state.treasury.money -= paid;
  if (state.colony && paid > 0) {
    const ledger = edit(state).ledger;
    ledger.out[line] = (ledger.out[line] ?? 0) + paid;
  }
  return paid;
}

/** This month's ledger for the month report: empty when nothing moved; undefined without a colony. */
export function monthLedger(state: GameState): FundLedger | undefined {
  if (!state.colony) return undefined;
  const { ledger } = state.colony;
  return ledger.month === state.month ? structuredClone(ledger) : emptyLedger(state.month);
}
