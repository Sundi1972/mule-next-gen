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
  monthEndDeals,
  offerDeal,
  openPlanning,
  pactBetween,
  pactBreach,
  POLITICS,
  promisedVotes,
  proposeLaw,
  reputationReasons,
  runFor,
  stepElection,
  stepVotes,
  voteWeight,
  type DealCard,
  type DealOffer,
  type ElectionResult,
  type GameState,
  type MonthEvent,
  type MonthReport,
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
    // A card for the next ballot (a card made during the ceremony has until 4): this result must leave it alone.
    const later = deal(state, 'kai', GOV('mia', 'brix'));
    cardOf(state, later).until = 4;
    before?.(state);
    closeBallot(state, picks);
    expect(cardOf(state, id), 'a card is not judged at ballot close').toMatchObject({ status: 'active', settled: null });
    finishCeremony(state);
    expect(cardOf(state, id)).toMatchObject({ ...then, settled: 1 });
    expect(cardOf(state, later), 'a card whose until is not this month is not this ballot\'s').toMatchObject({ status: 'active', settled: null });
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
    finishLawBallot(state);
    expect(state.politics!.laws.landTax, 'the law took effect before the card was judged').toBeTruthy();
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
    const shortPact = deal(state, 'mia', PACT('brix', 1));
    expect(cardOf(state, shortPact).until, 'a 1-month pact ends this month').toBe(1);
    closePlanningDeals(state);
    expect(cardOf(state, offered)).toMatchObject({ status: 'expired', settled: 1 });
    expect(cardOf(state, due)).toMatchObject({ status: 'expired', brokenBy: null, settled: 1 });
    expect(cardOf(state, pact)).toMatchObject({ status: 'active', settled: null });
    expect(cardOf(state, shortPact), 'a pact settles at the upkeep, not at planning\'s close').toMatchObject({ status: 'active', settled: null });
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

  it('S3-T-AC-4: the kept limit — a pact kept where no sabotage is possible paid nobody, so it does not use up the partner\'s gain', () => {
    const { state } = electionWithCard(['brix', 'ossa']);
    const pact = deal(state, 'lena', PACT('kai', 1));
    monthEndDeals(state, false, false);
    expect(cardOf(state, pact)).toMatchObject({ status: 'kept', settled: 1 });
    expect(rep(state, 'lena')).toBe(50);
    closeBallot(state, { lena: 'brix' });
    finishCeremony(state);
    expect(rep(state, 'lena')).toBe(50 + POLITICS.reputation.moves.kept);
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

/** Month 3: Lena offers Brix a 3-month pact and he accepts, through the engine's own calls: it binds months 3 to 5. */
function pactInMonth3(): { state: GameState; id: string } {
  const state = newGame();
  state.month = 3;
  state.politics = { ...state.politics!, election: null };
  return { state, id: deal(state, 'lena', PACT('brix', 3)) };
}

describe('pacts', () => {
  it('S3-T-AC-14: monthEndDeals settles a pact kept at the upkeep of its until, and pays both parties only where sabotage is possible', () => {
    for (const possible of [false, true]) {
      const { state, id } = pactInMonth3();
      expect(cardOf(state, id)).toMatchObject({ status: 'active', until: 5 });
      state.month = 4;
      monthEndDeals(state, false, possible);
      expect(cardOf(state, id), 'before its until').toMatchObject({ status: 'active', settled: null });
      state.month = 5;
      monthEndDeals(state, false, possible);
      expect(cardOf(state, id)).toMatchObject({ status: 'kept', brokenBy: null, settled: 5 });
      const gain = possible ? POLITICS.reputation.moves.kept : 0;
      expect([rep(state, 'lena'), rep(state, 'brix')], `possible ${possible}`).toEqual([50 + gain, 50 + gain]);
    }
  });

  it('S3-T-AC-14: the kept limit holds for pacts too — a kept vote card with the partner this term leaves only the other party a gain', () => {
    const { state, id } = pactInMonth3();
    state.politics!.deals.push({ id: 'deal-vote00', from: 'lena', to: 'brix', terms: { kind: 'vote', office: 'governor', candidate: 'ossa' }, offered: 1, until: 3, status: 'kept', brokenBy: null, settled: 3 });
    state.month = 5;
    monthEndDeals(state, false, true);
    expect(cardOf(state, id).status).toBe('kept');
    expect([rep(state, 'lena'), rep(state, 'brix')]).toEqual([50, 50 + POLITICS.reputation.moves.kept]);
  });

  it('S3-T-AC-14: pactBreach rows 1-3 — outside the pact false and nothing changes; inside, once per card; a kept pact turns broken without a second gain', () => {
    for (const month of [3, 5]) {
      const edge = pactInMonth3();
      edge.state.month = month;
      expect(pactBreach(edge.state, 'lena', 'brix', month, true), `month ${month} is inside a 3-5 pact`).toBe(true);
    }
    const { state, id } = pactInMonth3();
    const before = JSON.stringify([state.politics, state.players.map((p) => p.reputation)]);
    expect(pactBreach(state, 'lena', 'brix', 2, true), 'before the pact').toBe(false);
    expect(pactBreach(state, 'lena', 'brix', 6, true), 'after the pact').toBe(false);
    expect(pactBreach(state, 'lena', 'ossa', 4, true), 'another pair').toBe(false);
    expect(JSON.stringify([state.politics, state.players.map((p) => p.reputation)])).toBe(before);
    const off = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })), politics: false });
    expect(pactBreach(off, 'lena', 'brix', 4, true)).toBe(false);
    // The pact ended kept at month 5 (both gained); an investigation then reveals month 4's sabotage.
    state.month = 5;
    monthEndDeals(state, false, true);
    expect(cardOf(state, id).status).toBe('kept');
    state.month = 8;
    state.politics = { ...state.politics!, termStart: 6 }; // a new term: the pact's gain at month 5 no longer counts, yet the kept pact must not pay its victim again
    expect(pactBreach(state, 'lena', 'brix', 4, true)).toBe(true);
    expect(cardOf(state, id)).toMatchObject({ status: 'broken', brokenBy: 'lena', settled: 8 });
    expect(rep(state, 'lena'), 'the earlier gain stays, the breach costs').toBe(50 + POLITICS.reputation.moves.kept + POLITICS.reputation.moves.pactBroken);
    expect(rep(state, 'brix'), 'the victim is not paid twice').toBe(50 + POLITICS.reputation.moves.kept);
    expect(pactBreach(state, 'lena', 'brix', 4, true), 'once per card').toBe(false);
    expect(rep(state, 'lena')).toBe(50 + POLITICS.reputation.moves.kept + POLITICS.reputation.moves.pactBroken);
  });

  it('S3-T-AC-15: pactBreach in month 4 of a 3-5 pact breaks it with the saboteur named, costs them pactBroken and pays the victim where sabotage is possible', () => {
    for (const possible of [false, true]) {
      const { state, id } = pactInMonth3();
      state.month = 4;
      expect(pactBetween(state, 'brix', 'lena')).toBe(cardOf(state, id));
      expect(pactBreach(state, 'lena', 'brix', 4, possible)).toBe(true);
      expect(cardOf(state, id)).toMatchObject({ status: 'broken', brokenBy: 'lena', settled: 4 });
      expect(rep(state, 'lena')).toBe(50 + POLITICS.reputation.moves.pactBroken);
      expect(rep(state, 'brix'), `possible ${possible}`).toBe(50 + (possible ? POLITICS.reputation.moves.kept : 0));
      expect(pactBetween(state, 'lena', 'brix'), 'a broken pact binds no one').toBeNull();
    }
    const low = pactInMonth3();
    low.state.month = 4;
    setRep(low.state, 'lena', 15);
    pactBreach(low.state, 'lena', 'brix', 4, true);
    expect(rep(low.state, 'lena'), 'clamped at the floor').toBe(POLITICS.reputation.min);
  });

  it('S3-T-AC-2: monthEndDeals at game over settles active pacts kept as at their end and expires active vote cards', () => {
    const state = newGame();
    declare(state, 'brix', 'ossa');
    const pact = deal(state, 'lena', PACT('brix', 6));
    const vote = deal(state, 'kai', GOV('mia', 'brix'));
    const declined = offerDeal(state, 'ossa', PACT('kai'));
    answerDeal(state, 'kai', declined, false);
    monthEndDeals(state, true, true);
    expect(cardOf(state, pact)).toMatchObject({ status: 'kept', settled: 1 });
    expect(cardOf(state, vote)).toMatchObject({ status: 'expired', brokenBy: null, settled: 1 });
    expect(cardOf(state, declined).status).toBe('declined');
    expect([rep(state, 'lena'), rep(state, 'brix'), rep(state, 'kai')]).toEqual([53, 53, 50]);
  });
});

describe('what the table can read', () => {
  const unrest = (player: string) => ({ key: 'blamedForUnrest', player }) as unknown as MonthEvent; // only key and player are read

  it('S3-T-AC-4: reputationReasons lists a player\'s broken cards (as breaker) and their unrest months, newest first, never a kept or active card', () => {
    const state = newGame();
    state.month = 5;
    const card = (id: string, from: string, to: string, status: DealCard['status'], settled: number | null, brokenBy: string | null): DealCard => ({
      id, from, to, terms: { kind: 'pact' }, offered: 1, until: 3, status, brokenBy, settled,
    });
    state.politics!.deals.push(
      card('deal-old000', 'lena', 'brix', 'broken', 2, 'lena'),
      card('deal-kept00', 'lena', 'kai', 'kept', 3, null),
      card('deal-theirs', 'brix', 'ossa', 'broken', 4, 'brix'),
      card('deal-victim', 'ossa', 'lena', 'broken', 4, 'ossa'),
      card('deal-live00', 'lena', 'mia', 'active', null, null),
      card('deal-new000', 'mia', 'lena', 'broken', 5, 'lena'),
    );
    const report = (month: number, ...who: string[]) => ({ month, events: who.map(unrest) }) as unknown as MonthReport; // only month and events are read
    state.history = [report(3, 'lena', 'brix'), report(4, 'lena'), report(5, 'brix')];
    // The month's own list: Lena's blame is not in any report yet and must be listed; Brix's repeats the report filed at upkeep and counts once.
    state.monthEvents = [unrest('lena'), unrest('brix')];
    const label = (r: ReturnType<typeof reputationReasons>[number]) => (r.kind === 'broken' ? `broken ${r.card.id} ${r.card.settled}` : `${r.kind} ${r.month}`);
    expect(reputationReasons(state, 'lena').map(label)).toEqual(['broken deal-new000 5', 'unrest 5', 'unrest 4', 'unrest 3', 'broken deal-old000 2']);
    expect(reputationReasons(state, 'brix').map(label), 'month 5 once').toEqual(['unrest 5', 'broken deal-theirs 4', 'unrest 3']);
    expect(reputationReasons(state, 'kai'), 'a kept card gives no reason').toEqual([]);
    expect(reputationReasons(state, 'mia').map((r) => r.kind), 'the victim of a break has none').toEqual([]);
  });

  it("S3-B-AC-2: promisedVotes names Lena's promised candidate with Brix as receiver while her card is active, and nothing once it settles", () => {
    const state = newGame();
    declare(state, 'ossa', 'mia');
    deal(state, 'lena', GOV('brix', 'ossa'));
    deal(state, 'lena', GOV('kai', 'ossa'));
    expect(promisedVotes(state, 'lena')).toEqual({ election: { governor: { candidate: 'ossa', to: ['brix', 'kai'] } }, law: null });
    expect(promisedVotes(state, 'brix'), 'the receiver takes on no promise').toEqual({ election: {}, law: null });
    const offered = offerDeal(state, 'lena', GOV('mia', 'ossa'));
    expect(promisedVotes(state, 'lena').election.governor!.to, 'an unanswered offer is no promise').toEqual(['brix', 'kai']);
    answerDeal(state, 'mia', offered, false);
    closeBallot(state, { lena: 'ossa' });
    finishCeremony(state);
    expect(promisedVotes(state, 'lena')).toEqual({ election: {}, law: null });
    const law = proposalPending();
    deal(law, 'brix', LAW('ossa', false));
    expect(promisedVotes(law, 'brix')).toEqual({ election: {}, law: { yes: false, to: ['ossa'] } });
  });
});
