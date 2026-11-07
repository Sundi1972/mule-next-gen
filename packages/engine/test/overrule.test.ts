import { describe, expect, it } from 'vitest';
import { callOverrule, canOverrule, createGame, RuleError, setSalesTax, type GameState, type OverruleTarget, type OverruleWhy } from '../src/index.js';

const SEATS = ['lena', 'brix', 'ossa', 'kai'];

/** Month 2's planning, no election open, Lena governing, the tax at its start (5%). */
function governed(politics = true): GameState {
  const state = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })), politics });
  state.month = 2;
  if (state.politics) state.politics = { ...state.politics, governor: 'lena', election: null };
  return state;
}

/** Lena raises the tax from 5% to 10%. */
function raised(): GameState {
  const state = governed();
  setSalesTax(state, 'lena', 10);
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

describe('S5-C4: any player but the Governor calls one tax overrule a month', () => {
  it("S5-T-AC-6: callOverrule's S5-RULE-6 rows 1-8a, 8c and 9 for the tax, and canOverrule gives the same reason as each refusal", () => {
    const calledByBrix = () => {
      const state = raised();
      callOverrule(state, 'brix', 'tax');
      return state;
    };
    const rows: { row: string; make: () => GameState; by: string; target: OverruleTarget; why: OverruleWhy; says: string }[] = [
      { row: '1', make: () => governed(false), by: 'brix', target: 'tax', why: 'politicsOff', says: "This game plays without the colony's council" },
      { row: '2 phase', make: () => Object.assign(raised(), { phase: 'auction' as const }), by: 'brix', target: 'tax', why: 'notNow', says: 'Call an overrule once the votes are over' },
      {
        row: '2 vote open',
        make: () => {
          const state = raised();
          const election = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })) }).politics!.election!;
          state.politics = { ...state.politics!, election: { ...election, stage: 'ballot' } };
          return state;
        },
        by: 'brix',
        target: 'tax',
        why: 'notNow',
        says: 'Call an overrule once the votes are over',
      },
      { row: '5', make: () => Object.assign(governed(), { politics: { ...governed().politics!, governor: null } }), by: 'brix', target: 'tax', why: 'noGovernor', says: 'There is no Governor to overrule' },
      { row: '6', make: raised, by: 'lena', target: 'tax', why: 'governor', says: "The Governor can't overrule themself" },
      { row: '7', make: calledByBrix, by: 'ossa', target: 'tax', why: 'called', says: "brix already called this month's vote" },
      { row: '8a', make: raised, by: 'brix', target: 'budget', why: 'notYet', says: 'Only the tax can be overruled in this version' },
      { row: '8c', make: governed, by: 'brix', target: 'tax', why: 'unchanged', says: 'The tax is as it was when the month began' },
    ];
    for (const r of rows) {
      const state = r.make();
      const before = state.politics?.overrule ?? null;
      expect(refused(() => callOverrule(state, r.by, r.target)), `row ${r.row}: ${r.says}`).toBe(r.says);
      expect(state.politics?.overrule ?? null, `row ${r.row} stores nothing`).toEqual(before);
      expect(canOverrule(state, r.by)[r.target], `row ${r.row}: canOverrule gives the same reason`).toBe(r.why);
    }

    // 8c is about the rate, not the touch: raised and put back, the tax is as it began.
    const back = raised();
    setSalesTax(back, 'lena', 5);
    expect(canOverrule(back, 'brix').tax).toBe('unchanged');

    // In RC only the Sheriff's inquiry will open a confidence vote, and the budget is not yet.
    expect(canOverrule(raised(), 'brix')).toEqual({ tax: true, budget: 'notYet', confidence: 'sheriffOnly' });

    // Row 9: Brix calls after Lena raised 5 -> 10.
    const state = raised();
    expect(canOverrule(state, 'brix').tax).toBe(true);
    expect(refused(() => callOverrule(state, 'brix', 'tax'))).toBe('accepted');
    expect(state.politics!.overrule).toEqual({ month: 2, target: 'tax', caller: 'brix', stage: 'called', clockMs: 0, ballots: {}, done: [], result: null });
    expect(canOverrule(state, 'ossa').tax).toBe('called');

    // Rows 3 and 4: the caller withdraws a call before the ballot (target null), nobody else can.
    const wd = raised();
    expect(refused(() => callOverrule(wd, 'brix', null))).toBe('There is no call of yours to withdraw');
    callOverrule(wd, 'brix', 'tax');
    expect(refused(() => callOverrule(wd, 'ossa', null))).toBe('There is no call of yours to withdraw');
    expect(wd.politics!.overrule?.caller).toBe('brix');
    callOverrule(wd, 'brix', null);
    expect(wd.politics!.overrule).toBeNull();
    expect(refused(() => callOverrule(wd, 'ossa', 'tax'))).toBe('accepted');
    expect(wd.politics!.overrule?.caller).toBe('ossa');
  });
});

describe('S5-C4: the call freezes the tax', () => {
  it('S5-T-AC-1: setSalesTax is refused once an overrule on the tax is called this month', () => {
    const state = raised();
    callOverrule(state, 'brix', 'tax');
    expect(refused(() => setSalesTax(state, 'lena', 7))).toBe('An overrule vote on the tax is called: it holds until it is settled');
    expect(state.treasury.salesTax).toBe(0.1);

    // Withdrawn, the tax is the Governor's to change again; with no call, the change succeeds.
    callOverrule(state, 'brix', null);
    expect(refused(() => setSalesTax(state, 'lena', 7))).toBe('accepted');
    expect(state.treasury.salesTax).toBe(0.07);
  });
});
