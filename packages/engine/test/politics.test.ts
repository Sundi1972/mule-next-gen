import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  advancePhase,
  canRun,
  castVote,
  closeElection,
  cloneForSim,
  createGame,
  createRng,
  electionDone,
  nextElectionMonth,
  player,
  POLITICS,
  RuleError,
  runFor,
  scoreParts,
  setSalesTax,
  stepElection,
  TAX,
  taxBounds,
  taxSale,
  voteWeight,
  type Election,
  type GameState,
  type Office,
  type Politics,
  type Rng,
  type TaxPromise,
} from '../src/index.js';

const SEATS = ['lena', 'brix', 'ossa', 'ai1'];
const OFFICES: Office[] = ['governor', 'sheriff'];
/** RULE-10: a Governor run carries a promise; tests about something else hold the tax. */
const HOLD: TaxPromise = { kind: 'hold' };
const CAP_8: TaxPromise = { kind: 'cap', percent: 8 };

function newGame(options: { politics?: boolean; seats?: string[]; seed?: number } = {}): GameState {
  const seats = options.seats ?? SEATS;
  return createGame({ seed: options.seed ?? 7, players: seats.map((id) => ({ id, name: id, isAi: false })), politics: options.politics });
}

/** One fixed game for the rows that play several months. */
const ROUND_SEED = 8;

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

/** Every player presses Done and the election steps: announce opens the ballot, or the ballot closes. Returns what stepElection returned. */
function everyoneDone(state: GameState) {
  for (const p of state.players) electionDone(state, p.id);
  return stepElection(state, 0);
}

/** Steps the ceremony to its end, one step's clock at a time. */
function throughCeremony(state: GameState): void {
  for (let i = 0; i < 20 && electionOf(state).stage === 'ceremony'; i++) stepElection(state, electionOf(state).ceremony!.clockMs);
  expect(electionOf(state).stage).toBe('over');
}

/** Month 1 with lena and brix running for Governor, in the ballot stage. */
function governorBallot(): GameState {
  const state = newGame();
  runFor(state, 'lena', 'governor', HOLD);
  runFor(state, 'brix', 'governor', HOLD);
  everyoneDone(state);
  expect(electionOf(state).stage).toBe('ballot');
  return state;
}

/** Month 1: `id` runs alone for Governor and takes office when the ceremony ends. */
function seatGovernor(state: GameState, id: string): void {
  runFor(state, id, 'governor', HOLD);
  everyoneDone(state);
  throughCeremony(state);
  expect(politicsOf(state).governor).toBe(id);
}

/** An hour of game time: far longer than any clock the election ever had. */
const HOUR_MS = 3_600_000;

/** The Sheriff path: each test of the calling block runs with both offices elected, and the config's list comes back after it. */
function bothOffices(): void {
  let saved: Office[];
  beforeEach(() => {
    saved = POLITICS.offices;
    POLITICS.offices = ['governor', 'sheriff'];
  });
  afterEach(() => {
    POLITICS.offices = saved;
  });
}

/** Runs `body` with POLITICS.offices set to `offices`, restoring the list after. */
function withOffices(offices: Office[], body: () => void): void {
  const saved = POLITICS.offices;
  POLITICS.offices = offices;
  try {
    body();
  } finally {
    POLITICS.offices = saved;
  }
}

/** Plays on, nobody acting, up to the planning phase of month `month`. */
function toMonth(state: GameState, month: number): void {
  while (state.month < month) toNextPlanning(state);
}

function setMoney(state: GameState, money: Record<string, number>): void {
  for (const [id, amount] of Object.entries(money)) player(state, id).money = amount;
}

/**
 * One election month played at random: candidacies, ballots, Done presses
 * and steps of random length. Yields after every step, naming a stage that
 * moved while someone was not Done. It may stop before the election is over,
 * so the rest is closed by AM-1 when planning ends.
 */
function* playRandomElection(state: GameState, rng: Rng, seats: string[]): Generator<string> {
  const choices: (Office | null)[] = ['governor', 'sheriff', null, null];
  state.treasury.money += rng.int(0, 100);
  for (const id of seats) {
    try {
      const office = rng.pick(choices);
      runFor(state, id, office, office === 'governor' ? HOLD : undefined);
    } catch (e) {
      if (!(e instanceof RuleError)) throw e;
    }
  }
  for (let round = 0; round < 50 && electionOf(state).stage !== 'over' && !rng.chance(0.1); round++) {
    const e = electionOf(state);
    if (e.stage === 'ballot') {
      for (const id of seats) for (const o of OFFICES) if (e.candidates[o].length > 1 && rng.chance(0.7)) castVote(state, id, o, rng.pick(e.candidates[o]));
    }
    for (const id of seats) if (rng.chance(0.5)) electionDone(state, id);
    const before = electionOf(state);
    const waiting = seats.filter((id) => !before.done.includes(id) && !coversContested(before, id));
    stepElection(state, rng.int(1, 25_000));
    const moved = electionOf(state).stage !== before.stage && (before.stage === 'announce' || before.stage === 'ballot');
    yield `month ${state.month} ${electionOf(state).stage}${moved && waiting.length > 0 ? `: ${before.stage} ended waiting for ${waiting.join(', ')}` : ''}`;
  }
}

/** In the ballot, whether the player's ballot names a candidate for every contested office. */
function coversContested(e: Election, id: string): boolean {
  const contested = OFFICES.filter((o) => e.candidates[o].length > 1);
  return e.stage === 'ballot' && contested.length > 0 && contested.every((o) => e.ballots[id]?.[o] !== undefined);
}

/** Hands `count` more free plots to a player. */
function give(state: GameState, id: string, count: number): void {
  const free = state.tiles.filter((t) => t.owner === null && t.terrain !== 'store');
  for (const tile of free.slice(0, count)) tile.owner = id;
}

describe('C1, C2: the host option and the month opening', () => {
  bothOffices();

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

describe('C61, C62: the election', () => {
  bothOffices();

  it('T-AC-61: an election month opens in announce, moves to the ballot once every player is Done and closes it once every player is Done; an hour of game time ends neither', () => {
    const state = newGame();
    expect(electionOf(state)).toMatchObject({ stage: 'announce', ceremony: null, done: [], result: null });
    expect(nextElectionMonth(state)).toBe(4);
    runFor(state, 'lena', 'governor', HOLD);
    runFor(state, 'brix', 'governor', HOLD);
    for (const id of ['lena', 'brix', 'ossa']) electionDone(state, id);

    expect(stepElection(state, HOUR_MS)).toBeNull();
    expect(electionOf(state).stage, 'announce waits for ai1').toBe('announce');
    electionDone(state, 'ai1');
    expect(stepElection(state, 0)).toBeNull();
    expect(electionOf(state)).toMatchObject({ stage: 'ballot', ceremony: null, done: [], candidates: { governor: ['lena', 'brix'], sheriff: [] } });

    castVote(state, 'ossa', 'governor', 'brix');
    for (const id of ['lena', 'brix']) electionDone(state, id);
    expect(stepElection(state, HOUR_MS)).toBeNull();
    expect(electionOf(state).stage, 'the ballot waits for ai1').toBe('ballot');
    electionDone(state, 'ai1');
    const result = stepElection(state, 0);
    expect(result?.governor).toMatchObject({ winner: 'brix', how: 'votes' });
    expect(electionOf(state)).toMatchObject({ stage: 'ceremony', done: [], result });
    expect(politicsOf(state).governor, 'the winner takes office when the ceremony ends').toBeNull();

    // The result is fixed when the ballot closes: weight gained later changes nothing.
    give(state, 'lena', 30);
    throughCeremony(state);
    expect(electionOf(state)).toMatchObject({ stage: 'over', ceremony: null, result });
    expect(politicsOf(state)).toMatchObject({ governor: 'brix', termStart: 1, governorRun: { id: 'brix', terms: 1 } });
    expect(politicsOf(state).terms.brix).toBe(1);
    expect(stepElection(state, HOUR_MS)).toBeNull();
    expect(electionOf(state).stage).toBe('over');
  });

  it('T-AC-61: Done is per player and may be taken back; in the ballot a ballot naming a candidate for every contested office counts as Done, and clearing it undoes that', () => {
    const state = newGame();
    for (const [id, office] of [['lena', 'governor'], ['brix', 'governor'], ['ossa', 'sheriff'], ['ai1', 'sheriff']] as const) runFor(state, id, office, office === 'governor' ? HOLD : undefined);
    for (const id of SEATS) electionDone(state, id);
    electionDone(state, 'ai1', false);
    stepElection(state, HOUR_MS);
    expect(electionOf(state).stage).toBe('announce');
    electionDone(state, 'ai1');
    stepElection(state, 0);
    expect(electionOf(state)).toMatchObject({ stage: 'ballot', done: [] });

    for (const id of ['lena', 'brix', 'ossa']) {
      castVote(state, id, 'governor', 'lena');
      castVote(state, id, 'sheriff', 'ossa');
    }
    castVote(state, 'ai1', 'governor', 'brix');
    stepElection(state, HOUR_MS);
    expect(electionOf(state).stage, "ai1's ballot covers one of two contested offices").toBe('ballot');
    castVote(state, 'brix', 'sheriff', null);
    castVote(state, 'ai1', 'sheriff', 'ai1');
    stepElection(state, HOUR_MS);
    expect(electionOf(state).stage, 'Brix cleared his Sheriff vote, so he is not Done').toBe('ballot');
    castVote(state, 'brix', 'sheriff', 'ai1');
    expect(stepElection(state, 0)?.governor).toMatchObject({ winner: 'lena', how: 'votes' });
    expect(electionOf(state).stage).toBe('ceremony');
  });

  it('T-AC-61: a vote after the ballot closed throws RuleError', () => {
    const state = governorBallot();
    castVote(state, 'ossa', 'governor', 'lena');
    everyoneDone(state);
    expect(electionOf(state).stage).toBe('ceremony');

    expect(() => castVote(state, 'ai1', 'governor', 'brix')).toThrow(new RuleError('The ballot is closed'));
    expect(() => castVote(state, 'ossa', 'governor', 'brix')).toThrow(RuleError);
    expect(electionOf(state).ballots).toEqual({ ossa: { governor: 'lena' } });
    expect(electionOf(state).result?.governor).toMatchObject({ winner: 'lena', how: 'votes' });
  });

  it('C3: a ballot outside the ballot stage, for an uncontested office or for a non-candidate is refused and nothing is stored', () => {
    const state = newGame();
    runFor(state, 'lena', 'governor', HOLD);
    runFor(state, 'brix', 'governor', HOLD);
    runFor(state, 'ossa', 'sheriff');
    expect(() => castVote(state, 'ai1', 'governor', 'lena')).toThrow(new RuleError('The ballot is not open yet'));
    everyoneDone(state);

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

  it('T-AC-61: no contested office skips the ballot: once every player is Done in announce, the ceremony starts', () => {
    const state = newGame();
    runFor(state, 'lena', 'governor', HOLD);
    const result = everyoneDone(state);
    expect(electionOf(state).stage).toBe('ceremony');
    expect(result?.governor).toEqual({ winner: 'lena', how: 'unopposed', tallies: [{ id: 'lena', votes: 0 }] });
    expect(result?.sheriff?.how).toBe('appointed');
  });

  it('T-AC-61 (AM-1): leaving planning closes an open election in announce, the ballot or the ceremony, and seats the winners', () => {
    const state = governorBallot();
    castVote(state, 'ossa', 'governor', 'brix');

    advancePhase(state);
    expect(state.phase).toBe('landGrant');
    expect(electionOf(state)).toMatchObject({ stage: 'over', ceremony: null });
    expect(electionOf(state).result?.governor).toMatchObject({ winner: 'brix', how: 'votes' });
    expect(politicsOf(state)).toMatchObject({ governor: 'brix', termStart: 1 });
    expect(politicsOf(state).sheriff).not.toBeNull();

    toNextPlanning(state);
    expect(politicsOf(state).election).toBeNull();
    expect(politicsOf(state).governor).toBe('brix');
    expect(nextElectionMonth(state)).toBe(4);
    const short = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })), maxMonths: 3 });
    expect(nextElectionMonth(short)).toBeNull();

    // Closed in announce, the candidacy so far is the election's and is decided.
    const announcing = newGame();
    runFor(announcing, 'ossa', 'governor', CAP_8);
    const announced = closeElection(announcing);
    expect(announced?.governor).toMatchObject({ winner: 'ossa', how: 'unopposed' });
    expect(electionOf(announcing)).toMatchObject({ stage: 'over', candidates: { governor: ['ossa'], sheriff: [] }, promises: { ossa: CAP_8 } });
    expect(politicsOf(announcing)).toMatchObject({ governor: 'ossa', candidates: { governor: [], sheriff: [] }, promises: {} });

    // Closed directly, it returns the result it fixed; a second close has nothing to close.
    const closing = governorBallot();
    castVote(closing, 'ossa', 'governor', 'brix');
    const closed = closeElection(closing);
    expect(closed?.governor).toMatchObject({ winner: 'brix', how: 'votes' });
    expect(closed).toEqual(electionOf(closing).result);
    expect(electionOf(closing).stage).toBe('over');
    expect(closeElection(closing)).toBeNull();

    // Closed during the ceremony, the result already fixed stands, whatever changed since.
    const revealing = governorBallot();
    castVote(revealing, 'lena', 'governor', 'lena');
    castVote(revealing, 'brix', 'governor', 'brix');
    castVote(revealing, 'ossa', 'governor', 'brix');
    const result = everyoneDone(revealing);
    expect(result?.governor).toMatchObject({ winner: 'brix', how: 'votes' });
    give(revealing, 'lena', 30);
    expect(closeElection(revealing)).toBeNull();
    expect(electionOf(revealing)).toMatchObject({ stage: 'over', ceremony: null, result });
    expect(politicsOf(revealing).governor).toBe('brix');
  });

  it("T-AC-62: the ceremony shows each office of POLITICS.offices in turn, intro, bars and winner, each on its POLITICS.ceremony clock; the winners take office when the last winner step ends", () => {
    const state = newGame();
    for (const [id, office] of [['lena', 'governor'], ['brix', 'governor'], ['ossa', 'sheriff'], ['ai1', 'sheriff']] as const) runFor(state, id, office, office === 'governor' ? HOLD : undefined);
    everyoneDone(state);
    castVote(state, 'lena', 'governor', 'lena');
    castVote(state, 'ossa', 'sheriff', 'ossa');
    const result = everyoneDone(state);
    expect(result).toMatchObject({ governor: { winner: 'lena' }, sheriff: { winner: 'ossa' } });

    const { introMs, barsMs, winnerMs } = POLITICS.ceremony;
    const seen: string[] = [];
    for (const [office, step, ms] of [
      ['governor', 'intro', introMs],
      ['governor', 'bars', barsMs],
      ['governor', 'winner', winnerMs],
      ['sheriff', 'intro', introMs],
      ['sheriff', 'bars', barsMs],
      ['sheriff', 'winner', winnerMs],
    ] as const) {
      expect(electionOf(state)).toMatchObject({ stage: 'ceremony', ceremony: { office, step, clockMs: ms } });
      stepElection(state, ms - 1);
      expect(electionOf(state).ceremony, `${office} ${step} runs its whole clock`).toMatchObject({ office, step, clockMs: 1 });
      expect(politicsOf(state).governor, `${office} ${step}: nobody is seated before the end`).toBeNull();
      stepElection(state, 1);
      seen.push(`${office} ${step}`);
    }
    expect(electionOf(state)).toMatchObject({ stage: 'over', ceremony: null, result });
    expect(politicsOf(state)).toMatchObject({ governor: 'lena', sheriff: 'ossa', terms: { lena: 1, ossa: 1 } });
  });

  it('T-AC-62: an office with fewer than two candidates skips its bars: unopposed and appointed offices go from intro to winner', () => {
    const state = newGame();
    runFor(state, 'lena', 'governor', HOLD);
    expect(everyoneDone(state)).toMatchObject({ governor: { how: 'unopposed' }, sheriff: { how: 'appointed' } });
    const steps: string[] = [];
    while (electionOf(state).stage === 'ceremony') {
      const { office, step, clockMs } = electionOf(state).ceremony!;
      steps.push(`${office} ${step}`);
      stepElection(state, clockMs);
    }
    expect(steps).toEqual(['governor intro', 'governor winner', 'sheriff intro', 'sheriff winner']);
  });

  it('T-AC-62: with a Governor-only POLITICS.offices the ceremony runs one office and the result names no Sheriff', () => {
    withOffices(['governor'], () => {
      const state = newGame();
      runFor(state, 'lena', 'governor', HOLD);
      runFor(state, 'brix', 'governor', HOLD);
      everyoneDone(state);
      castVote(state, 'brix', 'governor', 'brix');
      const result = everyoneDone(state);
      expect(Object.keys(result!)).toEqual(['governor']);
      expect(result!.governor).toMatchObject({ winner: 'brix', how: 'votes' });
      const steps: string[] = [];
      while (electionOf(state).stage === 'ceremony') {
        const { office, step, clockMs } = electionOf(state).ceremony!;
        steps.push(`${office} ${step}`);
        stepElection(state, clockMs);
      }
      expect(steps).toEqual(['governor intro', 'governor bars', 'governor winner']);
      expect(politicsOf(state)).toMatchObject({ governor: 'brix', sheriff: null, terms: { brix: 1 } });
    });
  });
});

describe('RULE-60: who may run, and when', () => {
  bothOffices();

  it('T-AC-60 row 1: outside planning, development among them, a run, a switch or a withdrawal is refused with "You can run for office in planning" and changes nothing', () => {
    const state = newGame();
    toMonth(state, 2);
    runFor(state, 'lena', 'governor', CAP_8);
    advancePhase(state);
    const refused = new RuleError('You can run for office in planning');
    const tried: string[] = [];
    while (state.phase !== 'planning') {
      tried.push(state.phase);
      const before = structuredClone(state.politics);
      expect(() => runFor(state, 'brix', 'governor', HOLD), state.phase).toThrow(refused);
      expect(() => runFor(state, 'lena', 'sheriff'), state.phase).toThrow(refused);
      expect(() => runFor(state, 'lena', null), state.phase).toThrow(refused);
      expect(canRun(state, 'brix'), state.phase).toEqual({ governor: 'closed', sheriff: 'closed' });
      expect(state.politics, state.phase).toEqual(before);
      advancePhase(state);
    }
    expect(tried).toEqual(expect.arrayContaining(['development', 'auction']));
    expect(politicsOf(state)).toMatchObject({ candidates: { governor: ['lena'], sheriff: [] }, promises: { lena: CAP_8 } });
  });

  it('T-AC-60 row 2: from the ballot until the result, a run, a switch or a withdrawal is refused with "Candidates are closed until the result", ahead of any promise check; once it is over, running is open for the next election', () => {
    const state = governorBallot();
    const closed = new RuleError('Candidates are closed until the result');
    for (const stage of ['ballot', 'ceremony']) {
      expect(electionOf(state).stage).toBe(stage);
      const before = structuredClone(state.politics);
      expect(canRun(state, 'ossa'), stage).toEqual({ governor: 'closed', sheriff: 'closed' });
      expect(() => runFor(state, 'ossa', 'sheriff'), stage).toThrow(closed);
      expect(() => runFor(state, 'ossa', 'governor'), stage).toThrow(closed);
      expect(() => runFor(state, 'ossa', 'governor', { kind: 'cap', percent: 16 }), stage).toThrow(closed);
      expect(() => runFor(state, 'ossa', 'sheriff', HOLD), stage).toThrow(closed);
      expect(() => runFor(state, 'lena', null), stage).toThrow(closed);
      expect(state.politics, stage).toEqual(before);
      everyoneDone(state);
    }

    throughCeremony(state);
    expect(canRun(state, 'ossa')).toEqual({ governor: true, sheriff: true });
    runFor(state, 'ossa', 'sheriff');
    expect(politicsOf(state).candidates).toEqual({ governor: [], sheriff: ['ossa'] });
    expect(electionOf(state).candidates, "month 1's election keeps its own").toEqual({ governor: ['lena', 'brix'], sheriff: [] });
  });

  it('T-AC-60 row 3: two Governor terms in a row refuse a third Governor run at declaration, in any month, ahead of any promise check', () => {
    const state = newGame();
    for (const month of [1, 4]) {
      toMonth(state, month);
      runFor(state, 'lena', 'governor', HOLD);
      advancePhase(state);
      expect(politicsOf(state)).toMatchObject({ governor: 'lena', termStart: month });
    }
    const termLimit = new RuleError(`${POLITICS.maxGovernorTermsInRow} Governor terms in a row`);
    for (const month of [5, 7]) {
      toMonth(state, month);
      expect(politicsOf(state).governorRun).toEqual({ id: 'lena', terms: 2 });
      expect(canRun(state, 'lena'), `month ${month}`).toEqual({ governor: 'termLimit', sheriff: true });
      expect(canRun(state, 'brix'), `month ${month}`).toEqual({ governor: true, sheriff: true });
      expect(() => runFor(state, 'lena', 'governor', HOLD), `month ${month}`).toThrow(termLimit);
      expect(() => runFor(state, 'lena', 'governor'), `month ${month}`).toThrow(termLimit);
      expect(() => runFor(state, 'lena', 'governor', { kind: 'cap', percent: 16 }), `month ${month}`).toThrow(termLimit);
      expect(politicsOf(state).candidates.governor, `month ${month}`).toEqual([]);
    }
    runFor(state, 'brix', 'governor', HOLD);
    runFor(state, 'lena', 'sheriff');
    expect(politicsOf(state).candidates).toEqual({ governor: ['brix'], sheriff: ['lena'] });
    expect(politicsOf(state).terms.lena).toBe(2);
  });

  it('T-AC-60 row 4: running for the other office moves the candidacy; running again for the same keeps it', () => {
    const state = newGame();
    expect(canRun(state, 'lena')).toEqual({ governor: true, sheriff: true });
    runFor(state, 'lena', 'governor', HOLD);
    runFor(state, 'brix', 'governor', HOLD);
    expect(canRun(state, 'lena')).toEqual({ governor: true, sheriff: true });
    runFor(state, 'lena', 'sheriff');
    expect(politicsOf(state).candidates).toEqual({ governor: ['brix'], sheriff: ['lena'] });
    runFor(state, 'lena', 'sheriff');
    expect(politicsOf(state).candidates).toEqual({ governor: ['brix'], sheriff: ['lena'] });
    runFor(state, 'lena', null);
    expect(politicsOf(state).candidates).toEqual({ governor: ['brix'], sheriff: [] });
  });

  it('T-AC-60 row 5: Ossa runs in month 2, changes her promise in month 3 and the month 4 announcement shows it; when the ballot opens the candidacy is the election\'s and Politics starts empty', () => {
    const state = newGame({ seed: ROUND_SEED });
    toMonth(state, 2);
    expect(politicsOf(state).election).toBeNull();
    runFor(state, 'ossa', 'governor', CAP_8);
    expect(politicsOf(state)).toMatchObject({ candidates: { governor: ['ossa'], sheriff: [] }, promises: { ossa: CAP_8 } });
    toMonth(state, 3);
    runFor(state, 'ossa', 'governor', { kind: 'cap', percent: 7 });
    runFor(state, 'ai1', 'sheriff');
    runFor(state, 'ai1', null);

    toMonth(state, 4);
    expect(electionOf(state)).toMatchObject({ stage: 'announce', candidates: { governor: [], sheriff: [] }, promises: {} });
    expect(politicsOf(state)).toMatchObject({ candidates: { governor: ['ossa'], sheriff: [] }, promises: { ossa: { kind: 'cap', percent: 7 } } });
    // The last call: Lena runs too.
    runFor(state, 'lena', 'governor', HOLD);
    everyoneDone(state);
    expect(electionOf(state)).toMatchObject({ stage: 'ballot', candidates: { governor: ['ossa', 'lena'], sheriff: [] }, promises: { ossa: { kind: 'cap', percent: 7 }, lena: HOLD } });
    expect(politicsOf(state)).toMatchObject({ candidates: { governor: [], sheriff: [] }, promises: {} });
  });
});

describe("RULE-10: a Governor candidate's tax promise (C12, AM-11)", () => {
  bothOffices();

  it('T-AC-8: RULE-10 row 1: a Sheriff run with a promise is refused and changes nothing', () => {
    const state = newGame();
    expect(politicsOf(state).promises).toEqual({});
    const before = structuredClone(state.politics);
    expect(() => runFor(state, 'lena', 'sheriff', HOLD)).toThrow(new RuleError('Sheriff candidates make no promise yet'));
    expect(state.politics).toEqual(before);

    runFor(state, 'lena', 'sheriff');
    expect(politicsOf(state)).toMatchObject({ candidates: { governor: [], sheriff: ['lena'] }, promises: {} });
  });

  it('T-AC-8: RULE-10 row 2: a Governor run without a promise is refused and leaves any candidacy as it was', () => {
    const state = newGame();
    expect(() => runFor(state, 'lena', 'governor')).toThrow(new RuleError('Pick a promise to run for Governor'));
    expect(politicsOf(state)).toMatchObject({ candidates: { governor: [], sheriff: [] }, promises: {} });

    runFor(state, 'lena', 'sheriff');
    expect(() => runFor(state, 'lena', 'governor')).toThrow(new RuleError('Pick a promise to run for Governor'));
    expect(politicsOf(state)).toMatchObject({ candidates: { governor: [], sheriff: ['lena'] }, promises: {} });

    // A kind not on RULE-10's list is no promise, whoever calls: the server's shape check is not the only guard.
    const before = structuredClone(state.politics);
    expect(() => runFor(state, 'lena', 'governor', { kind: 'free' } as never)).toThrow(new RuleError('Pick a promise to run for Governor'));
    expect(state.politics).toEqual(before);
  });

  it.each([-1, 16, 8.5])('T-AC-8: RULE-10 row 3: a cap of %s%% is refused', (percent) => {
    const state = newGame();
    runFor(state, 'lena', 'governor', { kind: 'cap', percent: 8 });
    const before = structuredClone(state.politics);
    expect(() => runFor(state, 'lena', 'governor', { kind: 'cap', percent })).toThrow(new RuleError('A tax promise is 0% to 15%'));
    expect(() => runFor(state, 'brix', 'governor', { kind: 'cap', percent })).toThrow(new RuleError('A tax promise is 0% to 15%'));
    expect(state.politics).toEqual(before);
  });

  it.each<TaxPromise>([{ kind: 'cap', percent: 0 }, { kind: 'cap', percent: 8 }, { kind: 'cap', percent: 15 }, { kind: 'lower' }, { kind: 'hold' }])(
    'T-AC-8: RULE-10 row 4: the candidacy carries the promise (%j)',
    (promise) => {
      const state = newGame();
      runFor(state, 'brix', 'governor', { kind: 'lower' });
      runFor(state, 'lena', 'governor', promise);
      expect(politicsOf(state).candidates.governor).toEqual(['brix', 'lena']);
      expect(politicsOf(state).promises).toEqual({ brix: { kind: 'lower' }, lena: promise });
    },
  );

  it('T-AC-8: running again for Governor replaces the promise and keeps the place in the list; the stored promise is its own closed copy', () => {
    const state = newGame();
    const mine = { kind: 'cap', percent: 8 } as TaxPromise;
    runFor(state, 'lena', 'governor', mine);
    // Before any other write: the next one copies politics, which would hide a shared object.
    (mine as { percent: number }).percent = 3;
    expect(politicsOf(state).promises.lena).toEqual({ kind: 'cap', percent: 8 });
    runFor(state, 'brix', 'governor', HOLD);

    runFor(state, 'lena', 'governor', { kind: 'lower', percent: 3 } as TaxPromise);
    expect(politicsOf(state).candidates.governor).toEqual(['lena', 'brix']);
    expect(politicsOf(state).promises.lena).toStrictEqual({ kind: 'lower' });
  });

  it('T-AC-8: switching to Sheriff drops the promise', () => {
    const state = newGame();
    runFor(state, 'lena', 'governor', { kind: 'cap', percent: 8 });
    runFor(state, 'brix', 'governor', HOLD);
    runFor(state, 'lena', 'sheriff');
    expect(politicsOf(state)).toMatchObject({ candidates: { governor: ['brix'], sheriff: ['lena'] }, promises: { brix: HOLD } });
    expect(politicsOf(state).promises).not.toHaveProperty('lena');
  });

  it('T-AC-8: withdrawing drops the promise', () => {
    const state = newGame();
    runFor(state, 'lena', 'governor', { kind: 'cap', percent: 8 });
    runFor(state, 'brix', 'governor', HOLD);
    // A promise sent with a withdrawal is ignored: nothing stays behind without a candidacy.
    runFor(state, 'lena', null, HOLD);
    expect(politicsOf(state)).toMatchObject({ candidates: { governor: ['brix'], sheriff: [] }, promises: { brix: HOLD } });
    expect(politicsOf(state).promises).not.toHaveProperty('lena');
  });
});

describe('RULE-3: tally and winner', () => {
  bothOffices();

  it('B-AC-3: nobody runs → the richest player is Governor and the richest other player Sheriff, both appointed', () => {
    const state = newGame();
    // Strictly richest each time, so no draw decides this one.
    setMoney(state, { lena: 900, brix: 1200, ossa: 1000, ai1: 950 });
    const result = everyoneDone(state);
    expect(result).toEqual({
      governor: { winner: 'brix', how: 'appointed', tallies: [] },
      sheriff: { winner: 'ossa', how: 'appointed', tallies: [] },
    });
    throughCeremony(state);
    expect(politicsOf(state)).toMatchObject({ governor: 'brix', sheriff: 'ossa', terms: { brix: 1, ossa: 1 } });
  });

  it('T-AC-2 RULE-3 row 4: the strictly highest weighted total wins, and every candidate is tallied highest first', () => {
    const state = newGame();
    give(state, 'lena', 23);
    toMonth(state, 4);
    expect(voteWeight(state, 'lena').total).toBe(4);
    runFor(state, 'lena', 'governor', HOLD);
    runFor(state, 'brix', 'governor', HOLD);
    everyoneDone(state);
    castVote(state, 'lena', 'governor', 'lena');
    for (const id of ['brix', 'ossa', 'ai1']) castVote(state, id, 'governor', 'brix');

    const result = everyoneDone(state);
    expect(result?.governor).toEqual({ winner: 'lena', how: 'votes', tallies: [{ id: 'lena', votes: 4 }, { id: 'brix', votes: 3 }] });
  });

  it('B-AC-4: a 2–2 tie goes to the candidate the Land Baron voted for', () => {
    const state = newGame();
    give(state, 'ossa', 3);
    toMonth(state, 4);
    expect(politicsOf(state).baron).toBe('ossa');
    runFor(state, 'lena', 'governor', HOLD);
    runFor(state, 'brix', 'governor', HOLD);
    everyoneDone(state);
    castVote(state, 'lena', 'governor', 'lena');
    castVote(state, 'ai1', 'governor', 'lena');
    castVote(state, 'ossa', 'governor', 'brix');

    const result = everyoneDone(state);
    expect(result?.governor).toEqual({ winner: 'brix', how: 'baron', tallies: [{ id: 'lena', votes: 2 }, { id: 'brix', votes: 2 }] });
  });

  // The plots cases name both orders, so neither seat wins by its place at the table.
  it.each([
    { month: 1, plots: { lena: 1, brix: 2 }, how: 'land', winner: 'brix' },
    { month: 4, plots: { lena: 2, brix: 1 }, how: 'land', winner: 'lena' },
    { month: 1, plots: { lena: 2, brix: 2 }, how: 'lot', winner: undefined },
    { month: 4, plots: { lena: 2, brix: 2 }, how: 'lot', winner: undefined },
  ])('B-AC-4, T-AC-2 RULE-3 rows 6, 7 (AM-17): a tie the Baron\'s ballot does not break goes to the most plots, else by lot: month $month, plots $plots → $how', ({ month, plots, how, winner }) => {
    const state = newGame({ seed: ROUND_SEED });
    give(state, 'ossa', 3);
    give(state, 'lena', plots.lena);
    give(state, 'brix', plots.brix);
    toMonth(state, month);
    // Month 1's Baron was fixed before the plots were handed out: name the one they make.
    if (month === 1) politicsOf(state).baron = 'ossa';
    expect(politicsOf(state).baron).toBe('ossa');
    state.treasury.paid = { lena: 600, brix: 600 };
    runFor(state, 'brix', 'governor', HOLD);
    runFor(state, 'lena', 'governor', HOLD);
    runFor(state, 'ai1', 'governor', HOLD);
    everyoneDone(state);
    castVote(state, 'lena', 'governor', 'lena');
    castVote(state, 'brix', 'governor', 'brix');
    // The Baron votes for the trailing candidate: their ballot names none of the tied pair.
    castVote(state, 'ossa', 'governor', 'ai1');

    const result = everyoneDone(state);
    expect(result?.governor?.tallies).toEqual([
      { id: 'lena', votes: 3 },
      { id: 'brix', votes: 3 },
      { id: 'ai1', votes: 2 },
    ]);
    expect(result?.governor?.how).toBe(how);
    if (winner) expect(result?.governor?.winner).toBe(winner);
    else expect(['lena', 'brix']).toContain(result?.governor?.winner);
  });

  it.each([1, 4, 10])('T-AC-2 RULE-3 rows 1/2 (AM-17): nobody runs and money is equal: month %i appoints a Governor and a different Sheriff, both by lot', (month) => {
    const state = newGame({ seed: ROUND_SEED });
    toMonth(state, month);
    setMoney(state, { lena: 1000, brix: 1000, ossa: 1000, ai1: 1000 });

    const result = everyoneDone(state)!;
    expect(result.governor).toMatchObject({ how: 'appointed', tallies: [] });
    expect(result.sheriff).toMatchObject({ how: 'appointed', tallies: [] });
    expect(result.sheriff!.winner).not.toBe(result.governor!.winner);
  });

  // A round from a seeded start is fair only when every seat ties: two seats side by side, the first wins unless the
  // start falls on the second, 3 games in 4 at a 4-seat table. Seat 0 is the host.
  const FAIR_GAMES = 200;
  const fairShare = (wins: number, of: number) => wins >= of * 0.4 && wins <= of * 0.6;

  it(`T-AC-2 RULE-3 row 7 (AM-17): a tie the Baron and land leave is a fair draw: lena and brix, seats 0 and 1, tie in month 1 of ${FAIR_GAMES} games and each wins about half`, () => {
    const wins: Record<string, number> = { lena: 0, brix: 0 };
    const hows = new Set<string>();
    for (let seed = 0; seed < FAIR_GAMES; seed++) {
      const state = newGame({ seed });
      runFor(state, 'lena', 'governor', HOLD);
      runFor(state, 'brix', 'governor', HOLD);
      everyoneDone(state);
      castVote(state, 'lena', 'governor', 'lena');
      castVote(state, 'brix', 'governor', 'brix');
      const result = everyoneDone(state)!;
      hows.add(result.governor!.how);
      wins[result.governor!.winner]!++;
    }

    expect(fairShare(wins.lena!, FAIR_GAMES), `lena won ${wins.lena} of ${FAIR_GAMES}`).toBe(true);
    expect([...hows], 'nobody owns land, so the result says it was a draw').toEqual(['lot']);
  });

  it(`T-AC-2 RULE-3 row 1 (AM-17): nobody runs and lena and brix are richest: the appointment is the same fair draw, each appointed Governor in about half of ${FAIR_GAMES} games`, () => {
    const wins: Record<string, number> = { lena: 0, brix: 0 };
    for (let seed = 0; seed < FAIR_GAMES; seed++) {
      const state = newGame({ seed });
      setMoney(state, { lena: 1000, brix: 1000, ossa: 900, ai1: 900 });
      const result = everyoneDone(state)!;
      expect(result.governor!.how, `seed ${seed}`).toBe('appointed');
      wins[result.governor!.winner]!++;
    }

    expect(fairShare(wins.lena!, FAIR_GAMES), `lena was appointed ${wins.lena} of ${FAIR_GAMES}`).toBe(true);
  });

  // Lean CI: 25 games on every PR, the full 150 with MULE_FULL=1 (pnpm test:full).
  const INVARIANT_GAMES = process.env.MULE_FULL === '1' ? 150 : 25;
  it(`T-AC-2, T-AC-61 invariant: one player never holds both offices, the fund never goes below 0 and announce or the ballot never ends with a player not Done, over ${INVARIANT_GAMES} seeded games of random candidacies, ballots, Done presses, long steps and AM-1 closes`, () => {
    const broken: string[] = [];
    const hows = new Set<string>();
    for (let seed = 1; seed <= INVARIANT_GAMES; seed++) {
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
        if (state.phase === 'planning' && politicsOf(state).election)
          for (const when of playRandomElection(state, rng, seats)) {
            if (when.includes('ended waiting')) broken.push(`seed ${seed} ${when}`);
            check(when);
          }
        advancePhase(state);
        check(`month ${state.month} ${state.phase}`);
        const result = politicsOf(state).election?.result;
        if (result) for (const o of OFFICES) hows.add(result[o]!.how);
      }
    }

    expect(broken).toEqual([]);
    expect([...hows].sort()).toEqual(['appointed', 'baron', 'land', 'lot', 'unopposed', 'votes']);
  });

  it('AM-2: nobody runs for Governor and the richest runs alone for Sheriff → they are Sheriff (\'unopposed\') and the richest other player is appointed Governor', () => {
    const state = newGame();
    setMoney(state, { lena: 2000, brix: 900, ossa: 1000, ai1: 800 });
    runFor(state, 'lena', 'sheriff');

    const result = everyoneDone(state);
    expect(result).toEqual({
      governor: { winner: 'ossa', how: 'appointed', tallies: [] },
      sheriff: { winner: 'lena', how: 'unopposed', tallies: [{ id: 'lena', votes: 0 }] },
    });
    throughCeremony(state);
    expect(politicsOf(state)).toMatchObject({ governor: 'ossa', sheriff: 'lena' });
  });

  it('AM-2: every player runs for Sheriff → the richest is appointed Governor and the Sheriff race excludes them', () => {
    const state = newGame();
    setMoney(state, { lena: 2000, brix: 900, ossa: 1000, ai1: 800 });
    for (const id of SEATS) runFor(state, id, 'sheriff');
    everyoneDone(state);
    castVote(state, 'lena', 'sheriff', 'lena');
    castVote(state, 'brix', 'sheriff', 'ossa');
    castVote(state, 'ossa', 'sheriff', 'ossa');

    const result = everyoneDone(state);
    expect(result).toEqual({
      governor: { winner: 'lena', how: 'appointed', tallies: [] },
      sheriff: { winner: 'ossa', how: 'votes', tallies: [{ id: 'ossa', votes: 2 }, { id: 'brix', votes: 0 }, { id: 'ai1', votes: 0 }] },
    });
  });
});

describe('FM-WS3-4: what-if copies', () => {
  bothOffices();

  it('FM-WS3-4: playing a month forward on a cloneForSim copy leaves the real game\'s election and offices untouched', () => {
    const state = newGame();
    runFor(state, 'lena', 'governor', HOLD);
    runFor(state, 'brix', 'governor', HOLD);
    const nominated = structuredClone(state.politics);
    const nominating = cloneForSim(state);
    runFor(nominating, 'ossa', 'governor', HOLD);
    runFor(nominating, 'lena', 'sheriff');
    expect(state.politics).toEqual(nominated);

    everyoneDone(state);
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
    expect(taxBounds(state)).toEqual({ low: 0, high: 10 });
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
    expect(taxBounds(state)).toEqual({ low: 10, high: 15 });
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
    expect(taxBounds(low)).toEqual({ low: 0, high: 8 });
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
    toMonth(state, 4);
    expect(electionOf(state).stage).toBe('announce');
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
  bothOffices();

  it.each([
    { fund: 20, governor: 20, sheriff: 0, left: 0 },
    { fund: 100, governor: 50, sheriff: 30, left: 20 },
  ])('T-AC-5: pay never takes the fund below 0: fund $fund → Governor $governor, Sheriff $sheriff', ({ fund, governor, sheriff, left }) => {
    const state = newGame();
    // Brix the richest after Lena, so he is the appointed Sheriff by money, not by a tie.
    setMoney(state, { brix: player(state, 'brix').money + 1 });
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

describe('T-AC-62: Governor only, the default POLITICS.offices', () => {
  it("T-AC-62: by default only the Governor is elected: a Sheriff run is refused with 'The Sheriff is not elected yet' and changes nothing, the ceremony runs one office and nobody is seated as Sheriff", () => {
    expect(POLITICS.offices).toEqual(['governor']);
    const state = newGame();
    expect(canRun(state, 'ossa')).toEqual({ governor: true, sheriff: 'notElected' });
    const before = structuredClone(state.politics);
    expect(() => runFor(state, 'ossa', 'sheriff')).toThrow(new RuleError('The Sheriff is not elected yet'));
    expect(state.politics).toEqual(before);

    runFor(state, 'lena', 'governor', HOLD);
    expect(everyoneDone(state)).toEqual({ governor: { winner: 'lena', how: 'unopposed', tallies: [{ id: 'lena', votes: 0 }] } });
    const steps: string[] = [];
    while (electionOf(state).stage === 'ceremony') {
      const { office, step, clockMs } = electionOf(state).ceremony!;
      steps.push(`${office} ${step}`);
      stepElection(state, clockMs);
    }
    expect(steps).toEqual(['governor intro', 'governor winner']);
    expect(politicsOf(state)).toMatchObject({ governor: 'lena', sheriff: null, terms: { lena: 1 } });
    expect(Object.keys(politicsOf(state).terms)).toEqual(['lena']);
  });

  it("T-AC-62: by default upkeep pays the Governor 50 from the fund and keeps the Sheriff's 30; the office line counts the Governor's term only", () => {
    const state = newGame();
    seatGovernor(state, 'lena');
    while (state.phase !== 'auction') advancePhase(state);
    state.treasury.money = 1_000;
    const money = Object.fromEntries(SEATS.map((id) => [id, player(state, id).money]));

    advancePhase(state);
    expect(state.phase).toBe('upkeep');
    expect(state.treasury.money, 'the fund pays 50 a month, not 80').toBe(1_000 - POLITICS.pay.governor);
    for (const id of SEATS) expect(player(state, id).money - money[id]!, id).toBe(id === 'lena' ? POLITICS.pay.governor : 0);
    for (const id of SEATS) expect(scoreParts(state, id).office, id).toBe(id === 'lena' ? POLITICS.termScore : 0);
  });
});
