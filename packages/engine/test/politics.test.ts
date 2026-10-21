import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  canRun,
  castVote,
  cloneForSim,
  createGame,
  createRng,
  electionDone,
  player,
  POLITICS,
  RuleError,
  runFor,
  scoreParts,
  setSalesTax,
  stepElection,
  TAX,
  taxSale,
  voteWeight,
  type Election,
  type GameState,
  type Office,
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

    // The same month with politics on differs only by the offices' pay.
    const on = newGame();
    on.treasury.money = 500;
    toNextPlanning(on);
    expect(on.treasury.money).toBe(state.treasury.money - POLITICS.pay.governor - POLITICS.pay.sheriff);
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
    state.treasury.paid = { lena: 650, ossa: 900, ai1: 299 };

    expect(voteWeight(state, 'lena')).toEqual({ total: 6, parts: { base: 1, land: 2, reputation: 0, baron: 1, taxes: 2 } });
    expect(voteWeight(state, 'brix')).toEqual({ total: 1, parts: { base: 1, land: 0, reputation: 0, baron: 0, taxes: 0 } });
    expect(voteWeight(state, 'ossa').parts.taxes).toBe(2);
    expect(voteWeight(state, 'ai1').parts.taxes).toBe(0);

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
    expect(electionOf(state).ballots).toEqual({ lena: { governor: 'lena' }, ai1: { governor: 'brix' } });
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

    // Closed during the reveal, the result already fixed stands, whatever changed since.
    const revealing = governorBallot();
    castVote(revealing, 'lena', 'governor', 'lena');
    castVote(revealing, 'brix', 'governor', 'brix');
    castVote(revealing, 'ossa', 'governor', 'brix');
    const result = runOutClock(revealing);
    expect(result?.governor).toMatchObject({ winner: 'brix', how: 'votes' });
    give(revealing, 'lena', 30);
    advancePhase(revealing);
    expect(electionOf(revealing)).toMatchObject({ stage: 'over', result });
    expect(politicsOf(revealing).governor).toBe('brix');
  });
});

describe('RULE-2: who may run', () => {
  it('RULE-2 row 1: candidates are closed once nominate ends', () => {
    const state = governorBallot();
    expect(canRun(state, 'ossa')).toEqual({ governor: 'closed', sheriff: 'closed' });
    expect(() => runFor(state, 'ossa', 'sheriff')).toThrow(new RuleError('Candidates are closed'));
    expect(() => runFor(state, 'lena', null)).toThrow(RuleError);
    expect(electionOf(state).candidates).toEqual({ governor: ['lena', 'brix'], sheriff: [] });

    toNextPlanning(state);
    expect(politicsOf(state).election).toBeNull();
    expect(canRun(state, 'ossa')).toEqual({ governor: 'closed', sheriff: 'closed' });
  });

  it('RULE-2 row 2: two Governor terms in a row refuse a third Governor run', () => {
    const state = newGame();
    for (const month of [1, 4]) {
      while (state.month < month) toNextPlanning(state);
      runFor(state, 'lena', 'governor');
      advancePhase(state);
      expect(politicsOf(state)).toMatchObject({ governor: 'lena', termStart: month });
    }
    while (state.month < 7) toNextPlanning(state);
    expect(politicsOf(state).governorRun).toEqual({ id: 'lena', terms: 2 });

    expect(canRun(state, 'lena')).toEqual({ governor: 'termLimit', sheriff: true });
    expect(canRun(state, 'brix')).toEqual({ governor: true, sheriff: true });
    expect(() => runFor(state, 'lena', 'governor')).toThrow(new RuleError('Two Governor terms in a row'));
    expect(electionOf(state).candidates.governor).toEqual([]);
    runFor(state, 'brix', 'governor');
    runFor(state, 'lena', 'sheriff');
    expect(electionOf(state).candidates).toEqual({ governor: ['brix'], sheriff: ['lena'] });
    expect(politicsOf(state).terms.lena).toBe(2);
  });

  it('RULE-2 row 3: running for the other office moves the candidacy', () => {
    const state = newGame();
    expect(canRun(state, 'lena')).toEqual({ governor: true, sheriff: true });
    runFor(state, 'lena', 'governor');
    expect(canRun(state, 'lena')).toEqual({ governor: true, sheriff: true });
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
  ])('B-AC-4: a tie the Baron\'s ballot does not break goes to the most plots, then the lower seat: $winner', ({ plots, winner }) => {
    const state = newGame();
    give(state, 'ossa', 3);
    give(state, 'lena', plots.lena);
    give(state, 'brix', plots.brix);
    toNextPlanning(state);
    while (state.month < 4) toNextPlanning(state);
    expect(politicsOf(state).baron).toBe('ossa');
    state.treasury.paid = { lena: 600, brix: 600 };
    runFor(state, 'brix', 'governor');
    runFor(state, 'lena', 'governor');
    runFor(state, 'ai1', 'governor');
    runOutClock(state);
    castVote(state, 'lena', 'governor', 'lena');
    castVote(state, 'brix', 'governor', 'brix');
    // The Baron votes for the trailing candidate: their ballot names none of the tied pair.
    castVote(state, 'ossa', 'governor', 'ai1');

    const result = runOutClock(state);
    expect(result?.governor.tallies).toEqual([
      { id: 'lena', votes: 3 },
      { id: 'brix', votes: 3 },
      { id: 'ai1', votes: 2 },
    ]);
    expect(result?.governor).toMatchObject({ winner, how: 'tieRule' });
  });

  it('T-AC-2 invariant: one player never holds both offices and the fund never goes below 0, over 150 seeded games of random candidacies, ballots, Done presses and AM-1 closes', () => {
    const choices: (Office | null)[] = ['governor', 'sheriff', null, null];
    const offices: Office[] = ['governor', 'sheriff'];
    const broken: string[] = [];
    const hows = new Set<string>();
    for (let seed = 1; seed <= 150; seed++) {
      const rng = createRng(seed);
      const seats = Array.from({ length: rng.int(2, 6) }, (_, i) => `p${i}`);
      const state = newGame({ seats });
      for (const p of state.players) p.money = rng.int(0, 3) * 500 + rng.int(0, 1);
      for (const t of state.tiles) if (t.terrain !== 'store' && rng.chance(0.05)) t.owner = rng.pick(seats);
      const check = (when: string) => {
        const { governor, sheriff } = politicsOf(state);
        if (governor !== null && governor === sheriff) broken.push(`seed ${seed} ${when}: ${governor} holds both offices`);
        if (state.treasury.money < 0) broken.push(`seed ${seed} ${when}: fund ${state.treasury.money}`);
      };
      while (state.phase !== 'gameOver') {
        const election = politicsOf(state).election;
        if (state.phase === 'planning' && election) {
          state.treasury.money += rng.int(0, 100);
          for (const id of seats) {
            try {
              runFor(state, id, rng.pick(choices));
            } catch (e) {
              if (!(e instanceof RuleError)) throw e;
            }
          }
          // Each round may be the last: the rest is closed by AM-1 when planning ends.
          for (let round = 0; round < 50 && electionOf(state).stage !== 'over' && !rng.chance(0.1); round++) {
            const e = electionOf(state);
            if (e.stage === 'ballot') {
              for (const id of seats) for (const o of offices) if (e.candidates[o].length > 1 && rng.chance(0.7)) castVote(state, id, o, rng.pick(e.candidates[o]));
            }
            for (const id of seats) if (rng.chance(0.5)) electionDone(state, id);
            stepElection(state, rng.int(1, 25_000));
            check(`month ${state.month} ${electionOf(state).stage}`);
          }
        }
        advancePhase(state);
        check(`month ${state.month} ${state.phase}`);
        const result = politicsOf(state).election?.result;
        if (result) for (const o of offices) hows.add(result[o].how);
      }
    }
    expect(broken).toEqual([]);
    expect([...hows].sort()).toEqual(['appointed', 'baron', 'tieRule', 'unopposed', 'votes']);
  });

  it('AM-2: nobody runs for Governor and the richest runs alone for Sheriff → they are Sheriff (\'unopposed\') and the richest other player is appointed Governor', () => {
    const state = newGame();
    for (const [id, money] of [['lena', 2000], ['brix', 900], ['ossa', 1000], ['ai1', 800]] as const) player(state, id).money = money;
    runFor(state, 'lena', 'sheriff');

    const result = runOutClock(state);
    expect(result).toEqual({
      governor: { winner: 'ossa', how: 'appointed', tallies: [] },
      sheriff: { winner: 'lena', how: 'unopposed', tallies: [{ id: 'lena', votes: 0 }] },
    });
    runOutClock(state);
    expect(politicsOf(state)).toMatchObject({ governor: 'ossa', sheriff: 'lena' });
  });

  it('AM-2: every player runs for Sheriff → the richest is appointed Governor and the Sheriff race excludes them', () => {
    const state = newGame();
    for (const [id, money] of [['lena', 2000], ['brix', 900], ['ossa', 1000], ['ai1', 800]] as const) player(state, id).money = money;
    for (const id of SEATS) runFor(state, id, 'sheriff');
    runOutClock(state);
    castVote(state, 'lena', 'sheriff', 'lena');
    castVote(state, 'brix', 'sheriff', 'ossa');
    castVote(state, 'ossa', 'sheriff', 'ossa');

    const result = runOutClock(state);
    expect(result).toEqual({
      governor: { winner: 'lena', how: 'appointed', tallies: [] },
      sheriff: { winner: 'ossa', how: 'votes', tallies: [{ id: 'ossa', votes: 2 }, { id: 'brix', votes: 0 }, { id: 'ai1', votes: 0 }] },
    });
  });
});

describe('FM-WS3-4: what-if copies', () => {
  it('FM-WS3-4: playing a month forward on a cloneForSim copy leaves the real game\'s election and offices untouched', () => {
    const state = newGame();
    runFor(state, 'lena', 'governor');
    runFor(state, 'brix', 'governor');
    const nominated = structuredClone(state.politics);
    const nominating = cloneForSim(state);
    runFor(nominating, 'ossa', 'governor');
    runFor(nominating, 'lena', 'sheriff');
    expect(state.politics).toEqual(nominated);

    runOutClock(state);
    castVote(state, 'ossa', 'governor', 'brix');
    const before = structuredClone(state.politics);

    const sim = cloneForSim(state);
    castVote(sim, 'ossa', 'governor', 'lena');
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

    // Near the bottom the bounds stop at POLITICS.tax.min.
    const low = newGame();
    seatGovernor(low, 'lena');
    setSalesTax(low, 'lena', 3);
    toNextPlanning(low);
    for (const refused of [-1, 9]) expect(() => setSalesTax(low, 'lena', refused)).toThrow(RuleError);
    expect(low.treasury.salesTax).toBe(0.03);
    setSalesTax(low, 'lena', 0);
    expect(low.treasury.salesTax).toBe(0);
    setSalesTax(low, 'lena', 8);
    expect(low.treasury.salesTax).toBe(0.08);
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

describe('C6, C7: office pay and the term score', () => {
  it.each([
    { fund: 20, governor: 20, sheriff: 0, left: 0 },
    { fund: 100, governor: 50, sheriff: 30, left: 20 },
  ])('T-AC-5: pay never takes the fund below 0: fund $fund → Governor $governor, Sheriff $sheriff', ({ fund, governor, sheriff, left }) => {
    const state = newGame();
    seatGovernor(state, 'lena');
    expect(politicsOf(state).sheriff).toBe('brix');
    while (state.phase !== 'auction') advancePhase(state);
    state.treasury.money = fund;
    const money = { lena: player(state, 'lena').money, brix: player(state, 'brix').money };

    advancePhase(state);
    expect(state.phase).toBe('upkeep');
    expect(player(state, 'lena').money - money.lena).toBe(governor);
    expect(player(state, 'brix').money - money.brix).toBe(sheriff);
    expect(state.treasury.money).toBe(left);
    expect(state.history.at(-1)?.colonyFund).toBe(left);
  });

  it('T-AC-5: the office score line is 0 with politics off', () => {
    const state = newGame({ politics: false });
    toNextPlanning(state);
    for (const id of SEATS) expect(scoreParts(state, id).office).toBe(0);
  });
});
