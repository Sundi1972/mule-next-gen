import { describe, expect, it } from 'vitest';
import { advancePhase, createGame, setSalesTax, type GameState, type TaxPromise } from '../src/index.js';

const SEATS = ['lena', 'brix', 'ossa', 'kai'];

/** Month 1's planning with Lena governing under `promise`, judged against 5%, and no election open. */
function governedUnder(promise: TaxPromise | null, governor: string | null = 'lena'): GameState {
  const state = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })) });
  state.politics = { ...state.politics!, governor, promise, promiseFrom: 5, election: null };
  return state;
}

/** Lena sets the month's tax as Governor, then planning closes. */
function closePlanningAt(state: GameState, percent: number): void {
  setSalesTax(state, 'lena', percent);
  advancePhase(state);
}

describe("a Governor's tax promise, checked each month", () => {
  it.each([
    { promise: { kind: 'cap', percent: 6 } as TaxPromise, tax: 7, kept: false },
    { promise: { kind: 'cap', percent: 6 } as TaxPromise, tax: 6, kept: true },
    { promise: { kind: 'lower' } as TaxPromise, tax: 5, kept: false },
    { promise: { kind: 'lower' } as TaxPromise, tax: 4, kept: true },
    { promise: { kind: 'hold' } as TaxPromise, tax: 6, kept: false },
    { promise: { kind: 'hold' } as TaxPromise, tax: 5, kept: true },
  ])('T-AC-27: RULE-24 — $promise.kind at $tax% is kept: $kept', ({ promise, tax, kept }) => {
    const state = governedUnder(promise);
    closePlanningAt(state, tax);
    expect(state.colony!.promises).toEqual([{ month: 1, governor: 'lena', kind: promise.kind, kept }]);
  });

  it('T-AC-27: RULE-24 row 1 — an appointed Governor (no promise), no Governor, or politics off records nothing', () => {
    const appointed = governedUnder(null);
    closePlanningAt(appointed, 7);
    expect(appointed.colony!.promises).toEqual([]);

    const nobody = governedUnder({ kind: 'hold' }, null);
    advancePhase(nobody);
    expect(nobody.colony!.promises).toEqual([]);

    const off = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })), politics: false });
    advancePhase(off);
    expect(off.colony).toBeNull();
  });
});
