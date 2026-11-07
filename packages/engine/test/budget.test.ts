import { describe, expect, it } from 'vitest';
import { advancePhase, budgetLines, budgetShares, createGame, POLITICS, RuleError, setBudget, type BudgetLine, type GameState } from '../src/index.js';

const SEATS = ['lena', 'brix', 'ossa', 'kai'];
const B = POLITICS.budget;

/** A politics game in planning with Lena governing and no election open. */
function governed(politics = true): GameState {
  const state = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })), politics });
  if (state.politics) state.politics = { ...state.politics, governor: 'lena', election: null };
  return state;
}

function refused(run: () => void): string {
  try {
    run();
  } catch (err) {
    if (err instanceof RuleError) return err.message;
    throw err;
  }
  return 'accepted';
}

const shares = (projects: number, welfare: number, security = 0): Record<BudgetLine, number> => ({ projects, welfare, security });

describe('S5-C1: the Governor sets a standing budget', () => {
  it('S5-T-AC-1: setBudget refuses by S5-RULE-2 rows 1-3 and 5-7 with their messages, and row 8 sets the budget', () => {
    const fine = shares(80, 10);
    const rows: { row: number; make: () => GameState; by: string; shares: Record<BudgetLine, number>; says: string }[] = [
      { row: 1, make: () => governed(false), by: 'lena', shares: fine, says: "This game plays without the colony's council" },
      { row: 2, make: () => Object.assign(governed(), { phase: 'auction' as const }), by: 'lena', shares: fine, says: 'Set the budget once the votes are over' },
      {
        row: 2,
        make: () => {
          const state = governed();
          const election = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })) }).politics!.election!;
          state.politics = { ...state.politics!, election: { ...election, stage: 'ballot' } };
          return state;
        },
        by: 'lena',
        shares: fine,
        says: 'Set the budget once the votes are over',
      },
      { row: 3, make: governed, by: 'kai', shares: fine, says: 'Only the Governor sets the budget' },
      // RC offers no Security whatever POLITICS.offices holds (AM-3), so a Security share is row 5.
      { row: 5, make: governed, by: 'lena', shares: shares(90, 0, 10), says: 'The colony has no security line yet' },
      { row: 6, make: governed, by: 'lena', shares: shares(80, B.welfare.maxShare + B.step), says: `Welfare is 0% to ${B.welfare.maxShare}%, in steps of ${B.step}` },
      { row: 6, make: governed, by: 'lena', shares: shares(80, B.step + 1), says: `Welfare is 0% to ${B.welfare.maxShare}%, in steps of ${B.step}` },
      { row: 6, make: governed, by: 'lena', shares: shares(-B.step, 0), says: `Projects is 0% to ${B.projects.maxShare}%, in steps of ${B.step}` },
      { row: 6, make: governed, by: 'lena', shares: shares(B.projects.maxShare + B.step, 0), says: `Projects is 0% to ${B.projects.maxShare}%, in steps of ${B.step}` },
      { row: 6, make: governed, by: 'lena', shares: shares(80.5, 0), says: `Projects is 0% to ${B.projects.maxShare}%, in steps of ${B.step}` },
      { row: 7, make: governed, by: 'lena', shares: shares(95, 10), says: 'The shares add up to 105%: at most 100%' },
    ];
    for (const r of rows) {
      const state = r.make();
      const before = state.politics?.budget ?? null;
      expect(refused(() => setBudget(state, r.by, r.shares)), `row ${r.row}: ${r.says}`).toBe(r.says);
      expect(state.politics?.budget ?? null, `row ${r.row} stores nothing`).toEqual(before);
    }

    const state = governed();
    expect(refused(() => setBudget(state, 'lena', fine))).toBe('accepted');
    expect(state.politics!.budget).toEqual({ month: state.month, setBy: 'lena', shares: fine });
    expect(budgetShares(state)).toEqual(fine);
  });

  it('S5-T-AC-1: openPlanning copies the budget in force to budgetAtStart, and budgetShares reads null as POLITICS.budget.default', () => {
    const state = governed();
    expect(state.politics!.budget).toBeNull();
    expect(budgetShares(state)).toEqual(B.default);
    expect(budgetLines(state)).toEqual(['projects', 'welfare']);

    setBudget(state, 'lena', shares(80, 10));
    expect(state.politics!.budgetAtStart, 'a budget set mid-planning leaves the month\'s start unchanged').toBeNull();

    do advancePhase(state);
    while (state.phase !== 'planning');
    expect(state.month).toBe(2);
    expect(state.politics!.budgetAtStart).toEqual({ month: 1, setBy: 'lena', shares: shares(80, 10) });
  });
});
