import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  answerDeal,
  castLawVote,
  castVote,
  createGame,
  electionDone,
  offerDeal,
  openPlanning,
  proposeLaw,
  runFor,
  stepElection,
  withdrawDeal,
  type DealCard,
  type DealOffer,
  type GameState,
} from '../src/index.js';

/** S3-C8: the month's clock settles the cards. diplomacy.ts says how each settles; this pins when advancePhase asks it to. */

const SEATS = ['lena', 'brix', 'kai'];

function newGame(maxMonths = 12, politics?: boolean): GameState {
  return createGame({ seed: 7, maxMonths, politics, players: SEATS.map((id) => ({ id, name: id, isAi: false })) });
}

const cardOf = (state: GameState, id: string): DealCard => state.politics!.deals.find((d) => d.id === id)!;

/** Offers a card and has its receiver accept it. */
function deal(state: GameState, from: string, offer: DealOffer): string {
  const id = offerDeal(state, from, offer);
  answerDeal(state, offer.to, id, true);
  return id;
}

/** Advances phase by phase until `phase` is entered, at most a game's worth of steps. */
function into(state: GameState, phase: GameState['phase']): void {
  for (let i = 0; i < 200; i++) {
    advancePhase(state);
    if (state.phase === phase || state.phase === 'gameOver') return;
  }
  throw new Error(`never reached ${phase}`);
}

describe('S3-C8: offers expire as planning closes; pacts settle at the upkeep of their last month', () => {
  it('S3-T-AC-2: a card nobody answered expires the moment planning closes, settled that month (the sweep)', () => {
    const state = newGame();
    const id = offerDeal(state, 'lena', { to: 'brix', terms: { kind: 'pact' }, months: 3 });
    expect(cardOf(state, id).status, 'the premise: offered in planning').toBe('offered');

    advancePhase(state);

    expect(state.phase).not.toBe('planning');
    expect(cardOf(state, id)).toMatchObject({ status: 'expired', settled: 1 });
  });

  it('S3-T-AC-14: an accepted three-month pact stays active through month 2’s upkeep and settles kept at month 3’s (S3-RULE-5)', () => {
    const state = newGame();
    const id = deal(state, 'lena', { to: 'brix', terms: { kind: 'pact' }, months: 3 });
    expect(cardOf(state, id)).toMatchObject({ status: 'active', until: 3 });

    into(state, 'upkeep');
    expect(state.month).toBe(1);
    expect(cardOf(state, id).status, 'month 1’s upkeep').toBe('active');
    into(state, 'upkeep');
    expect(state.month).toBe(2);
    expect(cardOf(state, id).status, 'month 2’s upkeep').toBe('active');
    into(state, 'upkeep');

    expect(state.month).toBe(3);
    expect(cardOf(state, id)).toMatchObject({ status: 'kept', settled: 3 });
  });

  it('S3-T-AC-14: a pact still running when the game ends settles kept at the last upkeep (S3-RULE-5)', () => {
    const state = newGame(2);
    const id = deal(state, 'lena', { to: 'kai', terms: { kind: 'pact' }, months: 6 });
    expect(cardOf(state, id).until, 'the premise: capped at the game’s end').toBe(2);

    into(state, 'gameOver');

    expect(cardOf(state, id)).toMatchObject({ status: 'kept', settled: 2 });
  });
});

describe('S3-T-AC-2: through advancePhase, the ballots are judged before the sweep', () => {
  // The order trap: were the sweep to run before closeVotes, a card whose ballot planning's close ends early would
  // expire unjudged, and its breaker would lose no reputation.
  it.each([
    ['kept', 'brix'],
    ['broken', 'kai'],
  ])('S3-T-AC-2: an election card whose ballot planning’s close ends early settles %s, never expired', (status, pick) => {
    const state = newGame();
    for (const id of ['brix', 'kai']) runFor(state, id, 'governor', { kind: 'hold' });
    const id = deal(state, 'lena', { to: 'kai', terms: { kind: 'vote', office: 'governor', candidate: 'brix' } });
    for (const p of SEATS) electionDone(state, p);
    stepElection(state, 0);
    expect(state.politics!.election!.stage, 'the premise: the ballot is open').toBe('ballot');
    castVote(state, 'lena', 'governor', pick);

    // The host's Continue: planning ends with the ballot still open.
    advancePhase(state);

    expect(state.phase).not.toBe('planning');
    expect(cardOf(state, id)).toMatchObject({ status, settled: 1 });
  });

  it.each([
    ['kept', true],
    ['broken', false],
  ])('S3-T-AC-2: a law card whose ballot planning’s close ends early settles %s, never expired', (status, yes) => {
    const state = newGame();
    state.month = 2;
    state.politics = { ...state.politics!, governor: 'lena', election: null };
    proposeLaw(state, 'lena', { kind: 'enact', law: 'landTax', setting: 10 });
    const id = deal(state, 'brix', { to: 'kai', terms: { kind: 'vote', law: true, yes: true } });
    state.month = 3;
    openPlanning(state);
    expect(state.politics!.council!.stage, 'the premise: the law ballot is open').toBe('ballot');
    castLawVote(state, 'brix', yes);

    advancePhase(state);

    expect(state.phase).not.toBe('planning');
    expect(cardOf(state, id)).toMatchObject({ status, settled: 3 });
  });
});

describe('S3-T-AC-6: with politics off, the clock runs a whole month with no cards', () => {
  it('S3-T-AC-6: every deal intent is refused, and a whole month through advancePhase leaves no politics and no card', () => {
    const state = newGame(12, false);
    expect(state.politics).toBeNull();
    expect(() => offerDeal(state, 'lena', { to: 'brix', terms: { kind: 'pact' }, months: 3 })).toThrow('This game plays without deals');
    expect(() => answerDeal(state, 'brix', 'deal-x', true), 'its own words: no planning card table').toThrow('Cards are answered in planning');
    expect(() => withdrawDeal(state, 'lena', 'deal-x')).toThrow('This game plays without deals');

    into(state, 'upkeep');
    into(state, 'planning');

    expect(state.month, 'the premise: a whole month went by').toBe(2);
    expect(state.politics).toBeNull();
  });
});
