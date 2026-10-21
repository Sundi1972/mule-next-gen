import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  castVote,
  cloneForSim,
  createGame,
  electionDone,
  player,
  POLITICS,
  RuleError,
  runFor,
  setSalesTax,
  stepElection,
  TAX,
  taxSale,
  voteWeight,
  type Election,
  type GameState,
  type Politics,
} from '../src/index.js';

const SEATS = ['lena', 'brix', 'ossa', 'ai1'];

function newGame(options: { politics?: boolean; seats?: string[] } = {}): GameState {
  const seats = options.seats ?? SEATS;
  return createGame({ seed: 7, players: seats.map((id) => ({ id, name: id, isAi: false })), politics: options.politics });
}

function politicsOf(state: GameState): Politics {
  expect(state.politics).not.toBeNull();
  return state.politics!;
}

/** Plays the rest of the month with nobody acting, up to the next planning phase. */
function toNextPlanning(state: GameState): void {
  const month = state.month;
  do advancePhase(state);
  while (state.phase !== 'planning' && state.phase !== 'gameOver');
  expect(state.month).toBe(month + 1);
}

function electionOf(state: GameState): Election {
  const election = politicsOf(state).election;
  expect(election).not.toBeNull();
  return election!;
}

/** Ends the stage on its clock. Returns what stepElection returned. */
function runOutClock(state: GameState) {
  return stepElection(state, electionOf(state).clockMs);
}

/** Month 1 with lena and brix running for Governor, in the ballot stage. */
function governorBallot(): GameState {
  const state = newGame();
  runFor(state, 'lena', 'governor');
  runFor(state, 'brix', 'governor');
  runOutClock(state);
  expect(electionOf(state).stage).toBe('ballot');
  return state;
}

/** Month 1: `id` runs alone for Governor and takes office when the reveal ends. */
function seatGovernor(state: GameState, id: string): void {
  runFor(state, id, 'governor');
  runOutClock(state);
  runOutClock(state);
  expect(politicsOf(state).governor).toBe(id);
}

/** Hands `count` more free plots to a player. */
function give(state: GameState, id: string, count: number): void {
  const free = state.tiles.filter((t) => t.owner === null && t.terrain !== 'store');
  for (const tile of free.slice(0, count)) tile.owner = id;
}

describe('C1, C2: the host option and the month opening', () => {
  it('C1: politics off leaves the game as before', () => {
    expect(newGame().politics).not.toBeNull();

    const state = newGame({ politics: false });
    expect(state.politics).toBeNull();
    expect(state.treasury.salesTax).toBe(TAX.salesTax);

    state.treasury.money = 500;
    toNextPlanning(state);
    const taxesPaid = Object.values(state.treasury.paid).reduce((sum, paid) => sum + paid, 0);
    expect(state.politics).toBeNull();
    expect(state.treasury.salesTax).toBe(TAX.salesTax);
    expect(state.treasury.money).toBe(500 + taxesPaid);
  });

  it('RULE-5 row 1: the one player with strictly the most plots becomes the Land Baron when planning opens', () => {
    const state = newGame();
    expect(politicsOf(state).baron).toBeNull();
    give(state, 'lena', 3);
    give(state, 'brix', 2);
    expect(politicsOf(state).baron).toBeNull();

    toNextPlanning(state);
    expect(politicsOf(state).baron).toBe('lena');
  });

  it('RULE-5 row 2: in a tie for most plots the current Baron keeps the title', () => {
    const state = newGame();
    give(state, 'brix', 3);
    toNextPlanning(state);
    expect(politicsOf(state).baron).toBe('brix');

    give(state, 'lena', 3);
    toNextPlanning(state);
    expect(politicsOf(state).baron).toBe('brix');
  });

  it('RULE-5 row 3: a tie without the current Baron, or nobody owning land, leaves no Baron', () => {
    const state = newGame();
    toNextPlanning(state);
    expect(politicsOf(state).baron).toBeNull();

    give(state, 'lena', 3);
    toNextPlanning(state);
    expect(politicsOf(state).baron).toBe('lena');

    give(state, 'brix', 4);
    give(state, 'ossa', 4);
    toNextPlanning(state);
    expect(politicsOf(state).baron).toBeNull();
  });
});

describe('C4: vote weight', () => {
  it('RULE-4: vote weight parts', () => {
    const state = newGame();
    give(state, 'lena', 23);
    give(state, 'brix', 9);
    toNextPlanning(state);
    expect(politicsOf(state).baron).toBe('lena');
    state.treasury.paid = { lena: 650, ossa: 900 };

    expect(voteWeight(state, 'lena')).toEqual({ total: 6, parts: { base: 1, land: 2, reputation: 0, baron: 1, taxes: 2 } });
    expect(voteWeight(state, 'brix')).toEqual({ total: 1, parts: { base: 1, land: 0, reputation: 0, baron: 0, taxes: 0 } });
    expect(voteWeight(state, 'ossa').parts.taxes).toBe(2);

    for (const [reputation, part] of [[70, 1], [69, 0], [30, 0], [29, -1]] as const) {
      player(state, 'brix').reputation = reputation;
      expect(voteWeight(state, 'brix').parts.reputation).toBe(part);
      expect(voteWeight(state, 'brix').total).toBe(1 + part);
    }
  });
});

describe('C3: the election', () => {
  it('T-AC-1: the election steps nominate → ballot → reveal → over on its clocks', () => {
    const state = newGame();
    expect(electionOf(state)).toMatchObject({ stage: 'nominate', clockMs: POLITICS.nominateMs, result: null });
    runFor(state, 'lena', 'governor');
    runFor(state, 'brix', 'governor');
    electionDone(state, 'lena');

    expect(stepElection(state, POLITICS.nominateMs - 1)).toBeNull();
    expect(electionOf(state).stage).toBe('nominate');
    expect(stepElection(state, 1)).toBeNull();
    expect(electionOf(state)).toMatchObject({ stage: 'ballot', clockMs: POLITICS.ballotMs, done: [] });

    castVote(state, 'ossa', 'governor', 'brix');
    expect(stepElection(state, POLITICS.ballotMs - 1)).toBeNull();
    const result = stepElection(state, 1);
    expect(result?.governor).toMatchObject({ winner: 'brix', how: 'votes' });
    expect(electionOf(state)).toMatchObject({ stage: 'reveal', clockMs: POLITICS.revealMs, result });
    expect(politicsOf(state).governor).toBeNull();

    // The result is fixed when the ballot closes: weight gained later changes nothing.
    give(state, 'lena', 30);
    expect(stepElection(state, POLITICS.revealMs - 1)).toBeNull();
    expect(electionOf(state).stage).toBe('reveal');
    expect(stepElection(state, 1)).toBeNull();
    expect(electionOf(state)).toMatchObject({ stage: 'over', result });
    expect(politicsOf(state)).toMatchObject({ governor: 'brix', termStart: 1, governorRun: { id: 'brix', terms: 1 } });
    expect(politicsOf(state).terms.brix).toBe(1);
    expect(stepElection(state, POLITICS.revealMs)).toBeNull();
    expect(electionOf(state).stage).toBe('over');
  });

  it('T-AC-1: a stage ends early when every player is Done', () => {
    const state = newGame();
    runFor(state, 'lena', 'governor');
    runFor(state, 'brix', 'governor');
    for (const id of ['lena', 'brix', 'ossa']) electionDone(state, id);
    electionDone(state, 'ai1');
    electionDone(state, 'ai1', false);
    stepElection(state, 100);
    expect(electionOf(state).stage).toBe('nominate');

    electionDone(state, 'ai1');
    stepElection(state, 100);
    expect(electionOf(state)).toMatchObject({ stage: 'ballot', clockMs: POLITICS.ballotMs, done: [] });

    for (const id of SEATS) electionDone(state, id);
    expect(stepElection(state, 100)).not.toBeNull();
    expect(electionOf(state).stage).toBe('reveal');
  });

  it('T-AC-1: a vote after the ballot closed throws RuleError', () => {
    const state = governorBallot();
    castVote(state, 'ossa', 'governor', 'lena');
    runOutClock(state);
    expect(electionOf(state).stage).toBe('reveal');

    expect(() => castVote(state, 'ai1', 'governor', 'brix')).toThrow(RuleError);
    expect(() => castVote(state, 'ossa', 'governor', 'brix')).toThrow(RuleError);
    expect(electionOf(state).ballots).toEqual({ ossa: { governor: 'lena' } });
    expect(electionOf(state).result?.governor).toMatchObject({ winner: 'lena', how: 'votes' });
  });

  it('C3: a ballot outside the ballot stage, for an uncontested office or for a non-candidate is refused and nothing is stored', () => {
    const state = newGame();
    runFor(state, 'lena', 'governor');
    runFor(state, 'brix', 'governor');
    runFor(state, 'ossa', 'sheriff');
    expect(() => castVote(state, 'ai1', 'governor', 'lena')).toThrow(RuleError);
    runOutClock(state);

    expect(() => castVote(state, 'ai1', 'sheriff', 'ossa')).toThrow(RuleError);
    expect(() => castVote(state, 'ai1', 'governor', 'ossa')).toThrow(RuleError);
    expect(electionOf(state).ballots).toEqual({});

    castVote(state, 'lena', 'governor', 'lena');
    castVote(state, 'ai1', 'governor', 'lena');
    castVote(state, 'ai1', 'governor', 'brix');
    castVote(state, 'ossa', 'governor', 'brix');
    castVote(state, 'ossa', 'governor', null);
    expect(electionOf(state).ballots).toEqual({ lena: { governor: 'lena' }, ai1: { governor: 'brix' }, ossa: {} });
  });

  it('RULE-1 row 2: no contested office skips the ballot', () => {
    const state = newGame();
    runFor(state, 'lena', 'governor');
    const result = runOutClock(state);
    expect(electionOf(state).stage).toBe('reveal');
    expect(result?.governor).toEqual({ winner: 'lena', how: 'unopposed', tallies: [{ id: 'lena', votes: 0 }] });
    expect(result?.sheriff.how).toBe('appointed');
  });

  it('AM-1: leaving planning closes an open election and seats the winners', () => {
    const state = governorBallot();
    castVote(state, 'ossa', 'governor', 'brix');

    advancePhase(state);
    expect(state.phase).toBe('landGrant');
    expect(electionOf(state).stage).toBe('over');
    expect(electionOf(state).result?.governor).toMatchObject({ winner: 'brix', how: 'votes' });
    expect(politicsOf(state)).toMatchObject({ governor: 'brix', termStart: 1 });
    expect(politicsOf(state).sheriff).not.toBeNull();

    toNextPlanning(state);
    expect(politicsOf(state).election).toBeNull();
    expect(politicsOf(state).governor).toBe('brix');
  });
});

describe('RULE-2: who may run', () => {
  it('RULE-2 row 1: candidates are closed once nominate ends', () => {
    const state = governorBallot();
    expect(() => runFor(state, 'ossa', 'sheriff')).toThrow(new RuleError('Candidates are closed'));
    expect(() => runFor(state, 'lena', null)).toThrow(RuleError);
    expect(electionOf(state).candidates).toEqual({ governor: ['lena', 'brix'], sheriff: [] });
  });

  it('RULE-2 row 2: two Governor terms in a row refuse a third Governor run', () => {
    const state = newGame();
    for (const month of [1, 4]) {
      while (state.month < month) toNextPlanning(state);
      runFor(state, 'lena', 'governor');
      advancePhase(state);
      expect(politicsOf(state).governor).toBe('lena');
    }
    while (state.month < 7) toNextPlanning(state);
    expect(politicsOf(state).governorRun).toEqual({ id: 'lena', terms: 2 });

    expect(() => runFor(state, 'lena', 'governor')).toThrow(new RuleError('Two Governor terms in a row'));
    expect(electionOf(state).candidates.governor).toEqual([]);
    runFor(state, 'lena', 'sheriff');
    expect(electionOf(state).candidates.sheriff).toEqual(['lena']);
    expect(politicsOf(state).terms.lena).toBe(2);
  });

  it('RULE-2 row 3: running for the other office moves the candidacy', () => {
    const state = newGame();
    runFor(state, 'lena', 'governor');
    runFor(state, 'lena', 'sheriff');
    expect(electionOf(state).candidates).toEqual({ governor: [], sheriff: ['lena'] });
    runFor(state, 'lena', 'sheriff');
    expect(electionOf(state).candidates).toEqual({ governor: [], sheriff: ['lena'] });
  });

  it('RULE-2 withdraw: run(null) in nominate removes the candidacy', () => {
    const state = newGame();
    runFor(state, 'lena', 'governor');
    runFor(state, 'brix', 'governor');
    runFor(state, 'lena', null);
    expect(electionOf(state).candidates).toEqual({ governor: ['brix'], sheriff: [] });
  });
});

describe('RULE-3: tally and winner', () => {
  it('B-AC-3: nobody runs → the richest player is Governor and the richest other player Sheriff, both appointed', () => {
    const state = newGame();
    for (const [id, money] of [['lena', 900], ['brix', 1200], ['ossa', 1000], ['ai1', 1000]] as const) player(state, id).money = money;
    const result = runOutClock(state);
    expect(result).toEqual({
      governor: { winner: 'brix', how: 'appointed', tallies: [] },
      sheriff: { winner: 'ossa', how: 'appointed', tallies: [] },
    });
    runOutClock(state);
    expect(politicsOf(state)).toMatchObject({ governor: 'brix', sheriff: 'ossa', terms: { brix: 1, ossa: 1 } });
  });

  it('T-AC-2 RULE-3 row 4: the strictly highest weighted total wins, and every candidate is tallied highest first', () => {
    const state = newGame();
    give(state, 'lena', 23);
    toNextPlanning(state);
    while (state.month < 4) toNextPlanning(state);
    expect(voteWeight(state, 'lena').total).toBe(4);
    runFor(state, 'lena', 'governor');
    runFor(state, 'brix', 'governor');
    runOutClock(state);
    castVote(state, 'lena', 'governor', 'lena');
    for (const id of ['brix', 'ossa', 'ai1']) castVote(state, id, 'governor', 'brix');

    const result = runOutClock(state);
    expect(result?.governor).toEqual({ winner: 'lena', how: 'votes', tallies: [{ id: 'lena', votes: 4 }, { id: 'brix', votes: 3 }] });
  });

  it('B-AC-4: a 2–2 tie goes to the candidate the Land Baron voted for', () => {
    const state = newGame();
    give(state, 'ossa', 3);
    toNextPlanning(state);
    while (state.month < 4) toNextPlanning(state);
    expect(politicsOf(state).baron).toBe('ossa');
    runFor(state, 'lena', 'governor');
    runFor(state, 'brix', 'governor');
    runOutClock(state);
    castVote(state, 'lena', 'governor', 'lena');
    castVote(state, 'ai1', 'governor', 'lena');
    castVote(state, 'ossa', 'governor', 'brix');

    const result = runOutClock(state);
    expect(result?.governor).toEqual({ winner: 'brix', how: 'baron', tallies: [{ id: 'lena', votes: 2 }, { id: 'brix', votes: 2 }] });
  });

  it.each([
    { plots: { lena: 1, brix: 2 }, winner: 'brix' },
    { plots: { lena: 2, brix: 2 }, winner: 'lena' },
  ])('B-AC-4: a tie the Baron did not vote in goes to the most plots, then the lower seat: $winner', ({ plots, winner }) => {
    const state = newGame();
    give(state, 'ossa', 3);
    give(state, 'lena', plots.lena);
    give(state, 'brix', plots.brix);
    toNextPlanning(state);
    while (state.month < 4) toNextPlanning(state);
    expect(politicsOf(state).baron).toBe('ossa');
    runFor(state, 'brix', 'governor');
    runFor(state, 'lena', 'governor');
    runOutClock(state);
    castVote(state, 'lena', 'governor', 'lena');
    castVote(state, 'brix', 'governor', 'brix');

    const result = runOutClock(state);
    expect(result?.governor).toMatchObject({ winner, how: 'tieRule' });
  });

  it('T-AC-2 invariant: one player never holds both offices — the Sheriff race excludes the new Governor', () => {
    const state = newGame();
    for (const [id, money] of [['lena', 2000], ['brix', 900], ['ossa', 1000], ['ai1', 800]] as const) player(state, id).money = money;
    runFor(state, 'lena', 'sheriff');
    const result = runOutClock(state);
    expect(result?.governor).toMatchObject({ winner: 'lena', how: 'appointed' });
    expect(result?.sheriff).toMatchObject({ winner: 'ossa', how: 'appointed' });
    runOutClock(state);
    expect(politicsOf(state).governor).not.toBe(politicsOf(state).sheriff);
  });
});

describe('FM-WS3-4: what-if copies', () => {
  it('FM-WS3-4: playing a month forward on a cloneForSim copy leaves the real game\'s election and offices untouched', () => {
    const state = governorBallot();
    castVote(state, 'ossa', 'governor', 'brix');
    const before = structuredClone(state.politics);

    const sim = cloneForSim(state);
    castVote(sim, 'ai1', 'governor', 'lena');
    toNextPlanning(sim);
    expect(sim.politics?.governor).not.toBeNull();

    expect(state.politics).toEqual(before);
  });
});

describe('C5: the Governor sets the sales tax', () => {
  it('T-AC-3: tax bounds from the month\'s starting rate', () => {
    const state = newGame();
    seatGovernor(state, 'lena');
    expect(() => setSalesTax(state, 'lena', 11)).toThrow(RuleError);
    expect(() => setSalesTax(state, 'lena', 7.5)).toThrow(RuleError);
    expect(state.treasury.salesTax).toBe(0.05);
    setSalesTax(state, 'lena', 0);
    expect(state.treasury.salesTax).toBe(0);
    setSalesTax(state, 'lena', 10);
    expect(state.treasury.salesTax).toBe(0.1);

    toNextPlanning(state);
    setSalesTax(state, 'lena', 15);
    toNextPlanning(state);
    expect(politicsOf(state).taxAtStart).toBe(0.15);
    for (const refused of [9, 16]) expect(() => setSalesTax(state, 'lena', refused)).toThrow(RuleError);
    setSalesTax(state, 'lena', 10);
    expect(state.treasury.salesTax).toBe(0.1);
    setSalesTax(state, 'lena', 15);
    expect(state.treasury.salesTax).toBe(0.15);
  });

  it('T-AC-3: only the Governor, only in planning, not during the election', () => {
    const state = newGame();
    expect(() => setSalesTax(state, 'lena', 6)).toThrow(RuleError);
    seatGovernor(state, 'lena');
    expect(() => setSalesTax(state, 'brix', 6)).toThrow(new RuleError('Only the Governor sets the tax'));
    advancePhase(state);
    expect(() => setSalesTax(state, 'lena', 6)).toThrow(RuleError);
    while (state.month < 4) toNextPlanning(state);
    expect(electionOf(state).stage).toBe('nominate');
    expect(() => setSalesTax(state, 'lena', 6)).toThrow(RuleError);
    expect(state.treasury.salesTax).toBe(TAX.salesTax);

    const off = newGame({ politics: false });
    expect(() => setSalesTax(off, 'lena', 6)).toThrow(RuleError);
    expect(off.treasury.salesTax).toBe(TAX.salesTax);
  });

  it('C5: a sale after setTax is taxed at the new rate', () => {
    const state = newGame();
    seatGovernor(state, 'lena');
    setSalesTax(state, 'lena', 8);
    const fund = state.treasury.money;

    expect(taxSale(state, 'brix', 1000)).toBe(920);
    expect(state.treasury.money).toBe(fund + 80);
    expect(state.treasury.paid.brix).toBe(80);
  });
});
