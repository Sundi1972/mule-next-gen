import { describe, expect, it } from 'vitest';
import {
  castLawVote,
  closeVotes,
  councilDone,
  createGame,
  openPlanning,
  POLITICS,
  proposeLaw,
  RuleError,
  stepVotes,
  votesDone,
  votesOpen,
  type GameState,
  type LawId,
  type LawProposal,
} from '../src/index.js';

const SEATS = ['lena', 'brix', 'ossa', 'kai'];
const LAND_10: LawProposal = { kind: 'enact', law: 'landTax', setting: 10 };

/** Month 2's planning, no election, Lena governing; `laws` in force. */
function governed(laws: Partial<Record<LawId, number>> = {}): GameState {
  const state = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })) });
  state.month = 2;
  const inForce = Object.fromEntries(Object.entries(laws).map(([law, setting]) => [law, { setting, since: 1 }]));
  state.politics = { ...state.politics!, governor: 'lena', election: null, laws: inForce };
  return state;
}

function refused(run: () => void): string {
  try {
    run();
  } catch (err) {
    if (err instanceof RuleError) return err.message;
    throw err;
  }
  return 'valid';
}

/** The proposal made this month comes to its ballot when the next planning opens. */
function toTheBallot(state: GameState): void {
  state.month++;
  openPlanning(state);
}

/** Every player casts as given (Lena, the Governor, keeps her starting yes when not named), then the step closes the ballot. */
function vote(state: GameState, ballots: Record<string, boolean>): void {
  for (const [id, yes] of Object.entries(ballots)) castLawVote(state, id, yes);
  for (const id of SEATS) councilDone(state, id);
  stepVotes(state, 0);
}

describe("C40: the council — the Governor proposes in planning, the next planning's ballot decides", () => {
  it.each([
    { row: 1, why: 'a vote is open', make: () => {
      const s = governed();
      s.politics = { ...s.politics!, election: { ...createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })) }).politics!.election!, stage: 'ballot' } };
      return s;
    }, by: 'lena', proposal: LAND_10, then: 'Propose once the votes are over' },
    { row: 1, why: 'not planning', make: () => Object.assign(governed(), { phase: 'auction' }), by: 'lena', proposal: LAND_10, then: 'Propose once the votes are over' },
    { row: 2, why: 'not the Governor', make: () => governed(), by: 'kai', proposal: LAND_10, then: 'Only the Governor proposes a law' },
    { row: 3, why: 'not in the book', make: () => governed(), by: 'lena', proposal: { kind: 'enact', law: 'windfallTax', setting: 10 } as unknown as LawProposal, then: "That law is not in the colony's book" },
    { row: 4, why: 'failed in month 2, now month 4', make: () => {
      const s = governed();
      s.month = 4;
      s.politics = { ...s.politics!, failed: { 'enact:landTax': 2 } };
      return s;
    }, by: 'lena', proposal: LAND_10, then: `That proposal failed in month 2; it can come back in month ${2 + POLITICS.council.retryMonths + 1}` },
    { row: 5, why: 'repeal of a law not in force', make: () => governed(), by: 'lena', proposal: { kind: 'repeal', law: 'landTax' } as LawProposal, then: 'That law is not in force' },
    { row: 6, why: 'repeal', make: () => governed({ landTax: 10 }), by: 'lena', proposal: { kind: 'repeal', law: 'landTax' } as LawProposal, then: 'valid' },
    { row: 7, why: 'a setting not in the book', make: () => governed(), by: 'lena', proposal: { kind: 'enact', law: 'landTax', setting: 15 } as LawProposal, then: 'Land tax is set to 5, 10 or 20' },
    { row: 8, why: 'already in force at that setting', make: () => governed({ landTax: 10 }), by: 'lena', proposal: LAND_10, then: 'That law is already in force at that setting' },
    { row: 9, why: 'a new setting of a law in force, with three in force', make: () => governed({ landTax: 5, exportTax: 10, pollutionTax: 10 }), by: 'lena', proposal: LAND_10, then: 'valid' },
    { row: 10, why: 'room for another law', make: () => governed(), by: 'lena', proposal: LAND_10, then: 'valid' },
    { row: 11, why: 'a fourth law naming the one it replaces', make: () => governed({ exportTax: 10, pollutionTax: 10, emissionCap: 50 }), by: 'lena', proposal: { ...LAND_10, replaces: 'exportTax' } as LawProposal, then: 'valid' },
    { row: 12, why: 'a fourth law naming none', make: () => governed({ exportTax: 10, pollutionTax: 10, emissionCap: 50 }), by: 'lena', proposal: LAND_10, then: `${POLITICS.council.maxInForce} laws are in force: pick the one this replaces` },
    { row: 12, why: 'a fourth law naming a law not in force', make: () => governed({ exportTax: 10, pollutionTax: 10, emissionCap: 50 }), by: 'lena', proposal: { ...LAND_10, replaces: 'landTax' } as LawProposal, then: `${POLITICS.council.maxInForce} laws are in force: pick the one this replaces` },
    { row: 12, why: "a fourth law naming a name every object has (WS3's finding)", make: () => governed({ exportTax: 10, pollutionTax: 10, emissionCap: 50 }), by: 'lena', proposal: { ...LAND_10, replaces: 'toString' } as unknown as LawProposal, then: `${POLITICS.council.maxInForce} laws are in force: pick the one this replaces` },
  ])('T-AC-40: RULE-41 row $row ($why)', ({ make, by, proposal, then }) => {
    const state = make();
    expect(refused(() => proposeLaw(state, by, proposal))).toBe(then);
    if (then === 'valid') expect(state.politics!.proposal).toEqual({ by, month: state.month, proposal });
  });

  it('T-AC-40: a proposal is kept as its known fields only, so nothing else reaches the screens or the record', () => {
    const state = governed();
    proposeLaw(state, 'lena', { ...LAND_10, note: 'not a field' } as unknown as LawProposal);
    expect(state.politics!.proposal?.proposal).toStrictEqual(LAND_10);
  });

  it('T-AC-40: a new proposal replaces the pending one, and null withdraws it; the month after, it comes to its ballot', () => {
    const state = governed();
    proposeLaw(state, 'lena', { kind: 'enact', law: 'exportTax', setting: 20 });
    proposeLaw(state, 'lena', LAND_10);
    expect(state.politics!.proposal?.proposal).toEqual(LAND_10);
    expect(state.politics!.council).toBeNull();
    proposeLaw(state, 'lena', null);
    expect(state.politics!.proposal).toBeNull();

    proposeLaw(state, 'lena', LAND_10);
    toTheBallot(state);
    expect(state.politics!.council).toMatchObject({ stage: 'ballot', proposal: LAND_10, proposer: 'lena', ballots: { lena: true }, done: [] });
    expect(state.politics!.proposal).toBeNull();
    expect(votesOpen(state)).toBe(true);
  });

  it('T-AC-40: a proposal whose proposer no longer governs is dropped when the next planning opens', () => {
    const state = governed();
    proposeLaw(state, 'lena', LAND_10);
    state.politics = { ...state.politics!, governor: 'kai' };
    toTheBallot(state);
    expect(state.politics!.council).toBeNull();
    expect(state.politics!.proposal).toBeNull();
  });

  it('T-AC-40: in an election month the law ballot opens only once the election is over', () => {
    const state = governed();
    state.month = POLITICS.electionMonths[1]! - 1;
    proposeLaw(state, 'lena', LAND_10);
    toTheBallot(state);
    expect(state.politics!.election?.stage).toBe('announce');
    expect(state.politics!.council).toBeNull();
    for (const id of SEATS) votesDone(state, id);
    for (let i = 0; i < 100 && state.politics!.election!.stage !== 'over'; i++) stepVotes(state, POLITICS.council.revealMs);
    expect(state.politics!.election!.stage).toBe('over');
    expect(state.politics!.governor).toBe('lena');
    expect(state.politics!.council).toMatchObject({ stage: 'ballot', proposal: LAND_10 });
    expect(votesOpen(state)).toBe(true);
  });

  it("T-AC-40 (RULE-40): a cast ballot is Done, so the ballot closes once every player has voted", () => {
    const state = governed();
    proposeLaw(state, 'lena', LAND_10);
    toTheBallot(state);
    for (const id of SEATS) castLawVote(state, id, true);
    stepVotes(state, 0);
    expect(state.politics!.council!.stage).toBe('reveal');
  });

  it('T-AC-40 (RULE-40): a proposal not balloted by the time its next planning closes is dropped, not carried to a later month', () => {
    const state = governed();
    state.month = POLITICS.electionMonths[1]! - 1;
    proposeLaw(state, 'lena', LAND_10);
    toTheBallot(state);
    expect(state.politics!.election?.stage).toBe('announce');
    closeVotes(state);
    expect(state.politics!.proposal).toBeNull();
    toTheBallot(state);
    expect(state.politics!.council).toBeNull();
  });

  it.each([
    { ballots: { brix: true, ossa: true, kai: false }, passed: true, tie: false },
    { ballots: { brix: false, ossa: false, kai: false }, passed: false, tie: false },
    { ballots: { brix: true, ossa: false, kai: false }, passed: true, tie: true },
    { ballots: { lena: false, brix: true, ossa: false, kai: true }, passed: false, tie: true },
  ])('T-AC-41: RULE-42 — $ballots gives passed $passed (tie $tie); the Governor breaks a tie', ({ ballots, passed, tie }) => {
    const state = governed();
    proposeLaw(state, 'lena', LAND_10);
    toTheBallot(state);
    vote(state, ballots as Record<string, boolean>);
    const council = state.politics!.council!;
    expect(council.stage).toBe('reveal');
    expect(council.result).toMatchObject({ passed, tie });
    expect(council.result!.yes + council.result!.no).toBe(SEATS.length);
    expect(state.politics!.laws.landTax).toBeUndefined();

    stepVotes(state, POLITICS.council.revealMs);
    expect(state.politics!.council!.stage).toBe('over');
    expect(votesOpen(state)).toBe(false);
    if (passed) expect(state.politics!.laws.landTax).toEqual({ setting: 10, since: state.month });
    else expect(state.politics!.failed['enact:landTax']).toBe(state.month);
  });

  it('T-AC-41: a passed repeal removes the law; a passed fourth law removes the one it replaces', () => {
    const repeal = governed({ landTax: 10 });
    proposeLaw(repeal, 'lena', { kind: 'repeal', law: 'landTax' });
    toTheBallot(repeal);
    vote(repeal, {});
    stepVotes(repeal, POLITICS.council.revealMs);
    expect(repeal.politics!.laws).toEqual({});

    const fourth = governed({ exportTax: 10, pollutionTax: 10, emissionCap: 50 });
    proposeLaw(fourth, 'lena', { ...LAND_10, replaces: 'exportTax' });
    toTheBallot(fourth);
    vote(fourth, {});
    stepVotes(fourth, POLITICS.council.revealMs);
    expect(Object.keys(fourth.politics!.laws).sort()).toEqual(['emissionCap', 'landTax', 'pollutionTax']);
  });

  it('T-AC-46: leaving planning with the ballot open tallies it and the law takes effect; in the reveal, it takes effect; with no proposal, nothing', () => {
    const open = governed();
    proposeLaw(open, 'lena', LAND_10);
    toTheBallot(open);
    closeVotes(open);
    expect(open.politics!.council!.stage).toBe('over');
    expect(open.politics!.laws.landTax?.setting).toBe(10);

    const revealing = governed();
    proposeLaw(revealing, 'lena', LAND_10);
    toTheBallot(revealing);
    vote(revealing, {});
    closeVotes(revealing);
    expect(revealing.politics!.laws.landTax?.setting).toBe(10);

    const none = governed();
    toTheBallot(none);
    closeVotes(none);
    expect(none.politics!.council).toBeNull();
    expect(none.politics!.laws).toEqual({});
  });
});
