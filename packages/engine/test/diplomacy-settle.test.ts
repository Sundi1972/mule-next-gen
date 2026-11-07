import { describe, expect, it } from 'vitest';
import {
  answerDeal,
  castLawVote,
  castVote,
  closePlanningDeals,
  closeVotes,
  councilDone,
  createGame,
  electionDone,
  offerDeal,
  openPlanning,
  POLITICS,
  proposeLaw,
  runFor,
  stepElection,
  stepVotes,
  voteWeight,
  type DealCard,
  type DealOffer,
  type ElectionResult,
  type GameState,
} from '../src/index.js';

const SEATS = ['lena', 'brix', 'ossa', 'kai', 'mia'];
const BIG_DT = 1e9; // literal-ok: a step longer than any show clock

function newGame(): GameState {
  return createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id[0]!.toUpperCase() + id.slice(1), isAi: false })) });
}

/** Lena governs in month 2, no election this month. */
function governed(): GameState {
  const state = newGame();
  state.month = 2;
  state.politics = { ...state.politics!, governor: 'lena', election: null };
  return state;
}

const GOV = (to: string, candidate: string): DealOffer => ({ to, terms: { kind: 'vote', office: 'governor', candidate } });
const LAW = (to: string, yes = true): DealOffer => ({ to, terms: { kind: 'vote', law: true, yes } });
const PACT = (to: string, months = 3): DealOffer => ({ to, terms: { kind: 'pact' }, months });

function declare(state: GameState, ...ids: string[]): void {
  for (const id of ids) runFor(state, id, 'governor', { kind: 'hold' });
}

/** Offers a card and has its receiver accept: an active card the way a table makes one. */
function deal(state: GameState, from: string, offer: DealOffer): string {
  const id = offerDeal(state, from, offer);
  answerDeal(state, offer.to, id, true);
  return id;
}

function cardOf(state: GameState, id: string): DealCard {
  return state.politics!.deals.find((d) => d.id === id)!;
}

function rep(state: GameState, id: string): number {
  return state.players.find((p) => p.id === id)!.reputation;
}

function setRep(state: GameState, id: string, value: number): void {
  state.players.find((p) => p.id === id)!.reputation = value;
}

function weights(state: GameState): Record<string, number> {
  return Object.fromEntries(SEATS.map((id) => [id, voteWeight(state, id).total]));
}

/** Everyone presses Done, the ballot opens, the picks are cast, everyone presses Done: the step that closes the ballot returns the result. */
function closeBallot(state: GameState, picks: Record<string, string>): ElectionResult | null {
  for (const p of SEATS) electionDone(state, p);
  let result = stepElection(state, 0);
  if (state.politics!.election!.stage === 'ballot') {
    for (const [voter, candidate] of Object.entries(picks)) castVote(state, voter, 'governor', candidate);
    for (const p of SEATS) electionDone(state, p);
    result = stepElection(state, 0);
  }
  return result;
}

/** The ceremony runs to its last step: the winners take office. */
function finishCeremony(state: GameState): void {
  stepElection(state, BIG_DT);
  expect(state.politics!.election!.stage).toBe('over');
}

/** Month 1's election: the candidates declared, one card lena -> kai promising `promised`, accepted. */
function electionWithCard(declared: string[], promised = 'brix'): { state: GameState; id: string } {
  const state = newGame();
  declare(state, ...declared);
  return { state, id: deal(state, 'lena', GOV('kai', promised)) };
}

/** A law ballot open in month 3: lena governs, her proposal was made in month 2 and card offers wait in month 2. */
function proposalPending(): GameState {
  const state = governed();
  proposeLaw(state, 'lena', { kind: 'enact', law: 'landTax', setting: 10 });
  return state;
}

function openLawBallot(state: GameState): void {
  state.month = 3;
  openPlanning(state);
  expect(state.politics!.council!.stage).toBe('ballot');
}

/** Everyone presses Done, the ballot tallies, the reveal ends and the law takes effect. */
function finishLawBallot(state: GameState): void {
  for (const p of SEATS) councilDone(state, p);
  stepVotes(state, 0);
  expect(state.politics!.council!.stage).toBe('reveal');
  stepVotes(state, BIG_DT);
  expect(state.politics!.council!.stage).toBe('over');
}

describe('vote cards at their ballot', () => {
  const ELECTION_ROWS: { row: number; why: string; declared: string[]; before?: (s: GameState) => void; picks: Record<string, string>; then: Pick<DealCard, 'status' | 'brokenBy'> }[] = [
    { row: 1, why: 'uncontested office', declared: ['brix'], picks: {}, then: { status: 'expired', brokenBy: null } },
    { row: 1, why: 'appointed office (the only candidate withdrew)', declared: ['brix'], before: (s) => runFor(s, 'brix', null), picks: {}, then: { status: 'expired', brokenBy: null } },
    { row: 2, why: 'the promised candidate withdrew from a contested race', declared: ['brix', 'ossa', 'mia'], before: (s) => runFor(s, 'brix', null), picks: { lena: 'ossa' }, then: { status: 'expired', brokenBy: null } },
    { row: 3, why: 'her ballot names the promised candidate', declared: ['brix', 'ossa'], picks: { lena: 'brix' }, then: { status: 'kept', brokenBy: null } },
    { row: 4, why: 'her ballot names another candidate', declared: ['brix', 'ossa'], picks: { lena: 'ossa' }, then: { status: 'broken', brokenBy: 'lena' } },
    { row: 4, why: 'negative: no ballot cast', declared: ['brix', 'ossa'], picks: { kai: 'brix' }, then: { status: 'broken', brokenBy: 'lena' } },
  ];

  it.each(ELECTION_ROWS)('S3-T-AC-2: S3-RULE-4 election row $row ($why)', ({ declared, before, picks, then }) => {
    const { state, id } = electionWithCard(declared);
    before?.(state);
    closeBallot(state, picks);
    expect(cardOf(state, id), 'a card is not judged at ballot close').toMatchObject({ status: 'active', settled: null });
    finishCeremony(state);
    expect(cardOf(state, id)).toMatchObject({ ...then, settled: 1 });
  });

  const LAW_ROWS: { why: string; from: string; yes: boolean; vote?: boolean; then: Pick<DealCard, 'status' | 'brokenBy'> }[] = [
    { why: "the proposer's opening yes counts as cast", from: 'lena', yes: true, then: { status: 'kept', brokenBy: null } },
    { why: 'voted the promised yes', from: 'brix', yes: true, vote: true, then: { status: 'kept', brokenBy: null } },
    { why: 'voted the promised no', from: 'brix', yes: false, vote: false, then: { status: 'kept', brokenBy: null } },
    { why: 'voted the other way', from: 'brix', yes: true, vote: false, then: { status: 'broken', brokenBy: 'brix' } },
    { why: 'negative: no ballot cast', from: 'brix', yes: true, then: { status: 'broken', brokenBy: 'brix' } },
  ];

  it.each(LAW_ROWS)('S3-T-AC-2: S3-RULE-4 law row ($why)', ({ from, yes, vote, then }) => {
    const state = proposalPending();
    const id = deal(state, from, LAW('ossa', yes));
    openLawBallot(state);
    if (vote !== undefined) castLawVote(state, from, vote);
    for (const p of SEATS) councilDone(state, p);
    stepVotes(state, 0);
    expect(cardOf(state, id), 'a card is not judged at the tally').toMatchObject({ status: 'active', settled: null });
    stepVotes(state, BIG_DT);
    expect(cardOf(state, id)).toMatchObject({ ...then, settled: 3 });
  });

  it("S3-T-AC-2: the early close judges election and law cards too (closeVotes)", () => {
    const { state, id } = electionWithCard(['brix', 'ossa']);
    for (const p of SEATS) electionDone(state, p);
    stepElection(state, 0);
    castVote(state, 'lena', 'governor', 'ossa');
    closeVotes(state);
    expect(cardOf(state, id)).toMatchObject({ status: 'broken', brokenBy: 'lena', settled: 1 });
    const law = proposalPending();
    const lawId = deal(law, 'brix', LAW('ossa', true));
    openLawBallot(law);
    castLawVote(law, 'brix', true);
    closeVotes(law);
    expect(cardOf(law, lawId)).toMatchObject({ status: 'kept', settled: 3 });
  });

  it('S3-T-AC-2: a law card whose proposer lost the election is never judged and expires at planning\'s close (S3-RULE-4 sweep)', () => {
    const state = governed();
    state.month = 3;
    declare(state, 'lena', 'brix');
    proposeLaw(state, 'lena', { kind: 'enact', law: 'landTax', setting: 10 });
    const id = deal(state, 'ossa', LAW('kai', true));
    state.month = 4;
    openPlanning(state);
    expect(state.politics!.election!.stage).toBe('announce');
    expect(cardOf(state, id)).toMatchObject({ status: 'active', until: 4 });
    closeBallot(state, { lena: 'brix', brix: 'brix', ossa: 'brix', kai: 'brix', mia: 'brix' });
    while (state.politics!.election!.stage !== 'over') stepVotes(state, BIG_DT);
    expect(state.politics!.governor).toBe('brix');
    expect(state.politics!.council, 'the proposer lost, so the ballot never opens').toBeNull();
    expect(cardOf(state, id)).toMatchObject({ status: 'active', settled: null });
    closeVotes(state);
    closePlanningDeals(state);
    expect(cardOf(state, id)).toMatchObject({ status: 'expired', brokenBy: null, settled: 4 });
  });

  it('S3-T-AC-2: closePlanningDeals expires offered cards and every active vote card whose until has come, and leaves pacts and later cards', () => {
    const state = newGame();
    declare(state, 'brix', 'ossa');
    const offered = offerDeal(state, 'lena', PACT('brix'));
    const due = deal(state, 'kai', GOV('mia', 'brix'));
    const pact = deal(state, 'ossa', PACT('kai'));
    const later = deal(state, 'mia', GOV('lena', 'ossa'));
    state.politics!.deals.find((d) => d.id === later)!.until = 4;
    closePlanningDeals(state);
    expect(cardOf(state, offered)).toMatchObject({ status: 'expired', settled: 1 });
    expect(cardOf(state, due)).toMatchObject({ status: 'expired', brokenBy: null, settled: 1 });
    expect(cardOf(state, pact)).toMatchObject({ status: 'active', settled: null });
    expect(cardOf(state, later)).toMatchObject({ status: 'active', settled: null });
    const off = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })), politics: false });
    expect(() => closePlanningDeals(off)).not.toThrow();
  });
});

describe('reputation lands with the result', () => {
  it('S3-T-AC-3: the move lands when takeOffice runs, and the tallies are the weights taken at close', () => {
    const { state, id } = electionWithCard(['brix', 'ossa']);
    // Two paid-tax votes, and a reputation just above the low mark: a -10 move would take a vote away if weights were read after it.
    state.treasury.paid['lena'] = POLITICS.weight.taxPerVote * 2;
    setRep(state, 'lena', POLITICS.weight.repLow + 1);
    const atClose = weights(state);
    const result = closeBallot(state, { lena: 'ossa', brix: 'brix', ossa: 'ossa', kai: 'brix', mia: 'brix' })!;
    expect(rep(state, 'lena'), 'the result step moves nothing').toBe(POLITICS.weight.repLow + 1);
    const tallies = Object.fromEntries(result.governor!.tallies.map((t) => [t.id, t.votes]));
    expect(tallies).toEqual({ brix: atClose['brix']! + atClose['kai']! + atClose['mia']!, ossa: atClose['lena']! + atClose['ossa']! });
    stepElection(state, 1);
    expect(rep(state, 'lena'), 'nor does the ceremony before its last step').toBe(POLITICS.weight.repLow + 1);
    finishCeremony(state);
    expect(cardOf(state, id).status).toBe('broken');
    expect(rep(state, 'lena')).toBe(POLITICS.weight.repLow + 1 + POLITICS.reputation.moves.voteBroken);
    expect(voteWeight(state, 'lena').total, 'positive control: a weight taken after the move would differ').toBe(atClose['lena']! - 1);
  });

  it('S3-T-AC-3: an early close moves the reputation with the result, from the weights at close', () => {
    const { state, id } = electionWithCard(['brix', 'ossa']);
    state.treasury.paid['lena'] = POLITICS.weight.taxPerVote * 2;
    setRep(state, 'lena', POLITICS.weight.repLow + 1);
    const atClose = weights(state);
    for (const p of SEATS) electionDone(state, p);
    stepElection(state, 0);
    castVote(state, 'lena', 'governor', 'ossa');
    castVote(state, 'kai', 'governor', 'brix');
    const result = closeVotes(state)!;
    const tallies = Object.fromEntries(result.governor!.tallies.map((t) => [t.id, t.votes]));
    expect(tallies).toEqual({ brix: atClose['kai'], ossa: atClose['lena'] });
    expect(cardOf(state, id).status).toBe('broken');
    expect(rep(state, 'lena')).toBe(POLITICS.weight.repLow + 1 + POLITICS.reputation.moves.voteBroken);
  });

  it('S3-T-AC-3: a law card moves its reputation when the reveal ends, not at the tally', () => {
    const state = proposalPending();
    deal(state, 'brix', LAW('ossa', true));
    openLawBallot(state);
    castLawVote(state, 'brix', false);
    for (const p of SEATS) councilDone(state, p);
    stepVotes(state, 0);
    expect(rep(state, 'brix'), 'tallied: the council result is in, nothing has moved').toBe(50);
    stepVotes(state, 1);
    expect(rep(state, 'brix'), 'mid-reveal').toBe(50);
    stepVotes(state, BIG_DT);
    expect(rep(state, 'brix')).toBe(50 + POLITICS.reputation.moves.voteBroken);
  });
});

describe('S3-RULE-3 vote card moves', () => {
  const MOVES: { start: number; picks: Record<string, string>; end: number }[] = [
    { start: 50, picks: { lena: 'brix' }, end: 50 + POLITICS.reputation.moves.kept },
    { start: 50, picks: { lena: 'ossa' }, end: 50 + POLITICS.reputation.moves.voteBroken },
    { start: POLITICS.reputation.max - 1, picks: { lena: 'brix' }, end: POLITICS.reputation.max },
    { start: POLITICS.reputation.max, picks: { lena: 'brix' }, end: POLITICS.reputation.max },
    { start: 5, picks: { lena: 'ossa' }, end: POLITICS.reputation.min },
    { start: POLITICS.reputation.min, picks: { lena: 'ossa' }, end: POLITICS.reputation.min },
  ];

  it.each(MOVES)('S3-T-AC-4: a vote card moves reputation $start to $end, clamped at min and max', ({ start, picks, end }) => {
    const { state } = electionWithCard(['brix', 'ossa']);
    setRep(state, 'lena', start);
    closeBallot(state, picks);
    finishCeremony(state);
    expect(rep(state, 'lena')).toBe(end);
  });

  it('S3-T-AC-4: the kept limit — a second kept card with the same partner still settles kept with no gain; another partner gains', () => {
    const { state, id } = electionWithCard(['brix', 'ossa']);
    const second = deal(state, 'lena', GOV('kai', 'brix'));
    const third = deal(state, 'lena', GOV('mia', 'brix'));
    closeBallot(state, { lena: 'brix' });
    finishCeremony(state);
    expect([id, second, third].map((c) => cardOf(state, c).status)).toEqual(['kept', 'kept', 'kept']);
    expect(rep(state, 'lena')).toBe(50 + 2 * POLITICS.reputation.moves.kept);
  });

  it("S3-T-AC-4: the ceremony's term counts — a kept card from the old term does not block a gain at the new one", () => {
    const state = newGame();
    state.month = 3;
    state.politics = { ...state.politics!, election: null };
    declare(state, 'brix', 'ossa');
    state.politics!.deals.push({ id: 'deal-old000', from: 'lena', to: 'kai', terms: { kind: 'vote', office: 'governor', candidate: 'ossa' }, offered: 1, until: 1, status: 'kept', brokenBy: null, settled: 1 });
    deal(state, 'lena', GOV('kai', 'brix'));
    state.month = 4;
    openPlanning(state);
    expect(state.politics!.election!.stage).toBe('announce');
    closeBallot(state, { lena: 'brix' });
    finishCeremony(state);
    expect(state.politics!.termStart).toBe(4);
    expect(rep(state, 'lena')).toBe(50 + POLITICS.reputation.moves.kept);
  });
});
