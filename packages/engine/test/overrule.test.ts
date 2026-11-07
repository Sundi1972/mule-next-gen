import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  callOverrule,
  canOverrule,
  closeVotes,
  createGame,
  isVotesDone,
  openOverrule,
  POLITICS,
  RuleError,
  setSalesTax,
  stepVotes,
  voteOverrule,
  votesDone,
  votesOpen,
  voteWeight,
  type GameState,
  type OverruleTarget,
  type OverruleWhy,
} from '../src/index.js';

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

/** Brix called a tax overrule against Lena's 5% -> 10%. */
function called(): GameState {
  const state = raised();
  callOverrule(state, 'brix', 'tax');
  return state;
}

describe('S5-C5: the overrule ballot as planning ends', () => {
  it('S5-T-AC-7: S5-RULE-7\'s transitions — no call opens nothing; called → ballot → reveal → over; a withdrawn call holds no ballot; a call never opened lapses on leaving planning; an open ballot is tallied', () => {
    // No call: nothing opens and nothing changes.
    const none = raised();
    const untouched = structuredClone(none.politics);
    expect(openOverrule(none)).toBe(false);
    expect(none.politics).toEqual(untouched);

    // A call that is withdrawn holds no ballot.
    const withdrawn = called();
    callOverrule(withdrawn, 'brix', null);
    expect(openOverrule(withdrawn)).toBe(false);
    expect(withdrawn.politics!.overrule).toBeNull();

    // Called -> ballot: the caller's yes and the Governor's no are preset, and neither is Done.
    const state = called();
    expect(votesOpen(state)).toBe(false);
    expect(openOverrule(state)).toBe(true);
    expect(state.politics!.overrule).toMatchObject({ stage: 'ballot', ballots: { brix: true, lena: false }, done: [], result: null });
    expect(votesOpen(state)).toBe(true);
    for (const id of SEATS) expect(isVotesDone(state, id), `${id} has not cast`).toBe(false);
    expect(openOverrule(state)).toBe(false);
    stepVotes(state, 0);
    expect(state.politics!.overrule!.stage).toBe('ballot');

    // Ready is Done for the ballot; a cast ballot is Done; nobody closes it until every player is Done.
    votesDone(state, 'lena');
    voteOverrule(state, 'brix', true);
    voteOverrule(state, 'ossa', false);
    expect(SEATS.map((id) => isVotesDone(state, id))).toEqual([true, true, true, false]);
    stepVotes(state, POLITICS.overrule.revealMs);
    expect(state.politics!.overrule!.stage).toBe('ballot');
    voteOverrule(state, 'kai', false);
    voteOverrule(state, 'kai', true);
    expect(state.politics!.overrule!.ballots.kai).toBe(true);
    stepVotes(state, 0);
    expect(state.politics!.overrule).toMatchObject({ stage: 'reveal', clockMs: 0 });
    expect(votesOpen(state)).toBe(true);

    // The reveal runs on the overrule's own clock, not the council's.
    const council = POLITICS.council as { revealMs: number };
    const overrule = POLITICS.overrule as { revealMs: number };
    const kept = { council: council.revealMs, overrule: overrule.revealMs };
    try {
      council.revealMs = 1;
      overrule.revealMs = 5_000;
      stepVotes(state, 4_999);
      expect(state.politics!.overrule!.stage).toBe('reveal');
      stepVotes(state, 1);
      expect(state.politics!.overrule!.stage).toBe('over');
    } finally {
      council.revealMs = kept.council;
      overrule.revealMs = kept.overrule;
    }
    expect(votesOpen(state)).toBe(false);

    // A call that never got its ballot lapses on leaving planning; the tax is not restored.
    const lapsed = called();
    closeVotes(lapsed);
    expect(lapsed.politics!.overrule).toBeNull();
    expect(lapsed.treasury.salesTax).toBe(0.1);

    // An open ballot is tallied when planning ends, and a ballot in its reveal takes effect.
    const open = called();
    openOverrule(open);
    voteOverrule(open, 'brix', true);
    closeVotes(open);
    expect(open.politics!.overrule).toMatchObject({ stage: 'over', result: { total: 4, needed: 3, yes: 1, no: 1, passed: false } });
    const revealing = called();
    openOverrule(revealing);
    for (const id of SEATS) voteOverrule(revealing, id, id !== 'lena');
    stepVotes(revealing, 0);
    expect(revealing.treasury.salesTax).toBe(0.1);
    closeVotes(revealing);
    expect(revealing.politics!.overrule!.stage).toBe('over');
    expect(revealing.treasury.salesTax).toBe(0.05);

    // Done reaches the overrule only once the election is over: with an election open, Ready is the election's.
    const both = called();
    openOverrule(both);
    const election = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })) }).politics!.election!;
    both.politics = { ...both.politics!, election };
    votesDone(both, 'ossa');
    expect(both.politics!.election!.done).toEqual(['ossa']);
    expect(both.politics!.overrule!.done).toEqual([]);
  });

  it('S5-T-AC-8: S5-RULE-8\'s examples — total 9 needs 5; yes 6 and yes 5 overrule, yes 4 stands; the two-player case needs 2; a passed tax overrule restores taxAtStart', () => {
    // Weights from plots and reputation: lena 2 (10 plots), brix 3 (20 plots), ossa 2 and kai 2 (reputation 80).
    const weighted = (): GameState => {
      const state = called();
      const own = (id: string, n: number) => state.tiles.filter((t) => t.owner === null).slice(0, n).forEach((t) => (t.owner = id));
      own('lena', 10);
      own('brix', 20);
      for (const id of ['ossa', 'kai']) state.players.find((p) => p.id === id)!.reputation = 80;
      return state;
    };
    const total = (state: GameState) => SEATS.reduce((sum, id) => sum + voteWeight(state, id).total, 0);
    const decide = (state: GameState, yes: string[]) => {
      openOverrule(state);
      for (const id of SEATS) voteOverrule(state, id, yes.includes(id));
      stepVotes(state, 0);
      stepVotes(state, POLITICS.overrule.revealMs);
      expect(state.politics!.overrule!.stage).toBe('over');
      return state.politics!.overrule!.result;
    };

    const sample = weighted();
    expect(total(sample)).toBe(9);
    const six = weighted();
    expect(decide(six, ['lena', 'ossa', 'kai'])).toEqual({ passed: true, yes: 6, no: 3, total: 9, needed: 5 });
    expect(six.treasury.salesTax).toBe(0.05);
    const five = weighted();
    expect(decide(five, ['brix', 'ossa'])).toEqual({ passed: true, yes: 5, no: 4, total: 9, needed: 5 });
    expect(five.treasury.salesTax).toBe(0.05);
    const four = weighted();
    expect(decide(four, ['ossa', 'kai'])).toEqual({ passed: false, yes: 4, no: 5, total: 9, needed: 5 });
    expect(four.treasury.salesTax).toBe(0.1);

    // An absent ballot is an abstention, not a no: only the two preset ballots count at the close.
    const absent = weighted();
    openOverrule(absent);
    closeVotes(absent);
    expect(absent.politics!.overrule!.result).toEqual({ passed: false, yes: 3, no: 2, total: 9, needed: 5 });
    expect(absent.treasury.salesTax).toBe(0.1);

    // Four players of one vote each: total 4 needs 3, so half is not enough.
    const flat = called();
    expect(decide(flat, ['brix', 'ossa'])).toEqual({ passed: false, yes: 2, no: 2, total: 4, needed: 3 });
    const flatPass = called();
    expect(decide(flatPass, ['brix', 'ossa', 'kai'])).toMatchObject({ passed: true, yes: 3, needed: 3 });
    expect(flatPass.treasury.salesTax).toBe(0.05);

    // Two players, caller 1 vote and Governor 2: total 3, needed 2, the caller alone can't pass it.
    const two = createGame({ seed: 7, players: ['lena', 'brix'].map((id) => ({ id, name: id, isAi: false })) });
    two.month = 2;
    two.politics = { ...two.politics!, governor: 'lena', election: null };
    two.tiles.filter((t) => t.owner === null).slice(0, 10).forEach((t) => (t.owner = 'lena'));
    setSalesTax(two, 'lena', 10);
    callOverrule(two, 'brix', 'tax');
    openOverrule(two);
    voteOverrule(two, 'brix', true);
    voteOverrule(two, 'lena', false);
    stepVotes(two, 0);
    expect(two.politics!.overrule!.result).toEqual({ passed: false, yes: 1, no: 2, total: 3, needed: 2 });
  });

  it('S5-T-AC-8: the Governor\'s cap promise is checked on the tax that stands as planning ends — an overrule that passes keeps it, one that fails breaks it, on the normal path and on the host\'s Continue', () => {
    // Lena promised a 6% cap and raised the tax to 10%; Brix called the overrule.
    const promised = (): GameState => {
      const state = called();
      state.politics!.promise = { kind: 'cap', percent: 6 };
      state.politics!.promiseFrom = 5;
      return state;
    };
    const open = (yes: string[]): GameState => {
      const state = promised();
      openOverrule(state);
      for (const id of SEATS) voteOverrule(state, id, yes.includes(id));
      return state;
    };
    const record = (state: GameState) => state.colony!.promises.map((p) => p.kept);
    const YES = ['brix', 'ossa', 'kai'];

    // (a) Normal path: the vote is tallied and revealed, then the month moves on.
    const passedA = open(YES);
    stepVotes(passedA, 0);
    stepVotes(passedA, POLITICS.overrule.revealMs);
    advancePhase(passedA);
    expect(passedA.treasury.salesTax).toBe(0.05);
    expect(record(passedA)).toEqual([true]);
    const failedA = open(['brix']);
    stepVotes(failedA, 0);
    stepVotes(failedA, POLITICS.overrule.revealMs);
    advancePhase(failedA);
    expect(record(failedA)).toEqual([false]);

    // (b) Host Continue: the ballot is still open when the phase advances, and the close tallies it after the promise is checked.
    const passedB = open(YES);
    expect(passedB.politics!.overrule!.stage).toBe('ballot');
    advancePhase(passedB);
    expect(passedB.treasury.salesTax).toBe(0.05);
    expect(record(passedB)).toEqual([true]);
    const failedB = open(['brix']);
    advancePhase(failedB);
    expect(failedB.treasury.salesTax).toBe(0.1);
    expect(record(failedB)).toEqual([false]);

    // A call that never got its ballot lapses: the raised tax stands and the promise is broken.
    const lapsed = promised();
    advancePhase(lapsed);
    expect(record(lapsed)).toEqual([false]);
  });
});
