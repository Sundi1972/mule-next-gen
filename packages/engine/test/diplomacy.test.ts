import { describe, expect, it } from 'vitest';
import {
  answerDeal,
  closeElection,
  createGame,
  electionDone,
  dealUntil,
  nextElectionMonth,
  offerDeal,
  openPlanning,
  partyTo,
  POLITICS,
  proposeLaw,
  RuleError,
  runFor,
  stableJson,
  stepElection,
  withdrawDeal,
  type DealCard,
  type DealOffer,
  type GameState,
} from '../src/index.js';

const SEATS = ['lena', 'brix', 'ossa', 'kai', 'mia'];
const NAME = (id: string) => id[0]!.toUpperCase() + id.slice(1);

/** Month 1's planning: the first election in announce, nobody declared. */
function newGame(options: { politics?: boolean; seed?: number } = {}): GameState {
  return createGame({ seed: options.seed ?? 7, players: SEATS.map((id) => ({ id, name: NAME(id), isAi: false })), politics: options.politics });
}

/** Lena governs in month 2, no election this month (the council tests' setup). */
function governed(): GameState {
  const state = newGame();
  state.month = 2;
  state.politics = { ...state.politics!, governor: 'lena', election: null };
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

const PACT = (to: string, months = 3): DealOffer => ({ to, terms: { kind: 'pact' }, months });
const GOV = (to: string, candidate: string): DealOffer => ({ to, terms: { kind: 'vote', office: 'governor', candidate } });
const LAW = (to: string, yes = true): DealOffer => ({ to, terms: { kind: 'vote', law: true, yes } });

function declare(state: GameState, ...ids: string[]): void {
  for (const id of ids) runFor(state, id, 'governor', { kind: 'hold' });
}

function cards(state: GameState): readonly DealCard[] {
  return state.politics!.deals;
}

/** Everything a card must never touch (S3-HC-1). */
function valuables(state: GameState): string {
  return stableJson({ players: state.players.map((p) => [p.id, p.money, p.stock, p.carriedMule]), tiles: state.tiles });
}

const STATUSES: DealCard['status'][] = ['offered', 'active', 'declined', 'withdrawn', 'expired', 'kept', 'broken'];

function card(status: DealCard['status']): DealCard {
  return { id: 'deal-abc123', from: 'lena', to: 'brix', terms: { kind: 'pact' }, offered: 1, until: 3, status, brokenBy: status === 'broken' ? 'lena' : null, settled: null };
}

describe('partyTo', () => {
  it('S3-T-AC-5: partyTo(viewer, card) is true for the card\'s two parties and for any broken card, and false for anyone else', () => {
    for (const status of STATUSES) {
      const c = card(status);
      expect(partyTo('lena', c), `from, ${status}`).toBe(true);
      expect(partyTo('brix', c), `to, ${status}`).toBe(true);
      expect(partyTo('ossa', c), `third player, ${status}`).toBe(status === 'broken');
    }
    expect(partyTo('ossa', card('active'))).toBe(false);
  });
});

const ROWS: { row: number; why: string; make: () => GameState; call: (s: GameState) => void; then: string }[] = [
  { row: 1, why: 'politics off', make: () => newGame({ politics: false }), call: (s) => offerDeal(s, 'lena', PACT('brix')), then: 'This game plays without deals' },
  { row: 2, why: 'not planning', make: () => Object.assign(newGame(), { phase: 'auction' }), call: (s) => offerDeal(s, 'lena', PACT('brix')), then: 'Cards are offered in planning' },
  { row: 3, why: 'to is from', make: () => newGame(), call: (s) => offerDeal(s, 'lena', PACT('lena')), then: 'Pick another player' },
  { row: 3, why: 'to is nobody', make: () => newGame(), call: (s) => offerDeal(s, 'lena', PACT('nobody')), then: 'Pick another player' },
  { row: 4, why: 'the open-offers cap', make: () => {
    const s = newGame();
    for (const to of ['brix', 'ossa', 'kai']) offerDeal(s, 'lena', PACT(to));
    return s;
  }, call: (s) => offerDeal(s, 'lena', PACT('mia')), then: `You have ${POLITICS.deals.maxOpenOffers} cards waiting for an answer` },
  { row: 5, why: 'the last card is unanswered', make: () => {
    const s = newGame();
    offerDeal(s, 'lena', PACT('brix'));
    return s;
  }, call: (s) => offerDeal(s, 'lena', LAW('brix')), then: 'Brix has not answered your last card' },
  { row: 6, why: 'a 2-month pact', make: () => newGame(), call: (s) => offerDeal(s, 'lena', PACT('brix', 2)), then: `A pact runs ${POLITICS.deals.pactMonths.slice(0, -1).join(', ')} or ${POLITICS.deals.pactMonths.at(-1)} months` },
  { row: 6, why: 'a pact with no months', make: () => newGame(), call: (s) => offerDeal(s, 'lena', { to: 'brix', terms: { kind: 'pact' } }), then: `A pact runs ${POLITICS.deals.pactMonths.slice(0, -1).join(', ')} or ${POLITICS.deals.pactMonths.at(-1)} months` },
  { row: 7, why: 'an active pact between them', make: () => {
    const s = newGame();
    answerDeal(s, 'brix', (offerDeal(s, 'lena', PACT('brix')), cards(s)[0]!.id), true);
    return s;
  }, call: (s) => offerDeal(s, 'lena', PACT('brix')), then: 'You already have a pact with Brix' },
  { row: 7, why: 'their pact to her is on the table', make: () => {
    const s = newGame();
    offerDeal(s, 'brix', PACT('lena'));
    return s;
  }, call: (s) => offerDeal(s, 'lena', PACT('brix')), then: 'You already have a pact with Brix' },
  { row: 8, why: 'the Sheriff is not elected', make: () => newGame(), call: (s) => offerDeal(s, 'lena', { to: 'brix', terms: { kind: 'vote', office: 'sheriff', candidate: 'ossa' } }), then: 'The Sheriff is not elected yet' },
  { row: 9, why: 'no election left', make: () => {
    const s = newGame();
    s.month = 11;
    openPlanning(s);
    expect(nextElectionMonth(s)).toBeNull();
    return s;
  }, call: (s) => offerDeal(s, 'lena', GOV('brix', 'ossa')), then: 'No election is left this game' },
  { row: 10, why: 'a vote for herself', make: () => {
    const s = newGame();
    declare(s, 'lena');
    return s;
  }, call: (s) => offerDeal(s, 'lena', GOV('brix', 'lena')), then: 'Promise your vote to someone else' },
  { row: 11, why: 'the candidate has not declared', make: () => newGame(), call: (s) => offerDeal(s, 'lena', GOV('brix', 'ossa')), then: 'Ossa is not running for Governor' },
  { row: 12, why: 'no law is up', make: () => governed(), call: (s) => offerDeal(s, 'brix', LAW('ossa')), then: 'No law is up for a vote' },
  { row: 13, why: 'her own vote card on this ballot with another choice', make: () => {
    const s = newGame();
    declare(s, 'brix', 'ossa');
    offerDeal(s, 'lena', GOV('kai', 'brix'));
    return s;
  }, call: (s) => offerDeal(s, 'lena', GOV('mia', 'ossa')), then: 'You already promised your vote on this ballot' },
  { row: 14, why: 'the same choice to another player', make: () => {
    const s = newGame();
    declare(s, 'brix');
    offerDeal(s, 'lena', GOV('kai', 'brix'));
    return s;
  }, call: (s) => offerDeal(s, 'lena', GOV('mia', 'brix')), then: 'valid' },
  { row: 13, why: 'negative: a vote card between two other players on the same ballot never blocks', make: () => {
    const s = newGame();
    declare(s, 'brix', 'ossa');
    offerDeal(s, 'kai', GOV('mia', 'brix'));
    return s;
  }, call: (s) => offerDeal(s, 'lena', GOV('mia', 'ossa')), then: 'valid' },
  { row: 14, why: 'a pact', make: () => newGame(), call: (s) => offerDeal(s, 'lena', PACT('brix')), then: 'valid' },
];

describe('offerDeal, answerDeal and withdrawDeal', () => {
  it.each(ROWS)('S3-T-AC-1: S3-RULE-2 offer row $row ($why)', ({ make, call, then }) => {
    const state = make();
    const before = valuables(state);
    expect(refused(() => call(state))).toBe(then);
    expect(valuables(state)).toBe(before);
  });

  it('S3-T-AC-1: a refused offer writes nothing', () => {
    const state = newGame();
    const politics = state.politics;
    expect(refused(() => offerDeal(state, 'lena', PACT('lena')))).toBe('Pick another player');
    expect(state.politics).toBe(politics);
    expect(cards(state)).toEqual([]);
  });

  it('S3-T-AC-1: an accepted offer is a card in the frozen shape, offered with no settlement', () => {
    const state = newGame();
    const id = offerDeal(state, 'lena', PACT('brix', 3));
    expect(cards(state)).toEqual([{ id, from: 'lena', to: 'brix', terms: { kind: 'pact' }, offered: 1, until: 3, status: 'offered', brokenBy: null, settled: null }]);
  });

  it('S3-T-AC-1: S3-RULE-2 answer rows 1-6 and withdraw, with their words and settlements', () => {
    const state = newGame();
    const id = offerDeal(state, 'lena', PACT('brix'));
    const before = valuables(state);
    // answer row 1: not planning
    expect(refused(() => answerDeal(Object.assign(structuredClone(state), { phase: 'auction' }), 'brix', id, true))).toBe('Cards are answered in planning');
    // answer row 2: no such card, or not addressed to the answerer; withdraw refuses a card that is not the caller's own
    expect(refused(() => answerDeal(state, 'brix', 'deal-nope00', true))).toBe('That card is no longer open');
    expect(refused(() => answerDeal(state, 'ossa', id, true))).toBe('That card is no longer open');
    expect(refused(() => withdrawDeal(state, 'brix', id))).toBe('That card is no longer open');
    // answer row 3 and withdraw settle this month
    const declined = structuredClone(state);
    answerDeal(declined, 'brix', id, false);
    expect(cards(declined)[0]).toMatchObject({ status: 'declined', settled: 1 });
    const withdrawn = structuredClone(state);
    withdrawDeal(withdrawn, 'lena', id);
    expect(cards(withdrawn)[0]).toMatchObject({ status: 'withdrawn', settled: 1 });
    // answer row 5: an active pact between them already
    const clash = structuredClone(state);
    clash.politics!.deals.push({ ...cards(clash)[0]!, id: 'deal-fixt00', from: 'brix', to: 'lena', status: 'active' });
    expect(refused(() => answerDeal(clash, 'brix', id, true))).toBe('You already have a pact with Lena');
    // answer row 6, then a settled card is gone for both sides
    answerDeal(state, 'brix', id, true);
    expect(cards(state)[0]).toMatchObject({ status: 'active', brokenBy: null, settled: null });
    expect(refused(() => answerDeal(state, 'brix', id, true))).toBe('That card is no longer open');
    expect(refused(() => withdrawDeal(state, 'lena', id))).toBe('That card is no longer open');
    expect(valuables(state)).toBe(before);
  });

  it('S3-T-AC-1: S3-RULE-2 answer row 4 — a vote card whose ballot closed since the offer expires with no error', () => {
    const state = newGame();
    declare(state, 'brix', 'ossa');
    const id = offerDeal(state, 'lena', GOV('kai', 'brix'));
    closeElection(state);
    answerDeal(state, 'kai', id, true);
    expect(cards(state)[0]).toMatchObject({ status: 'expired', settled: 1 });
  });

  it('S3-T-AC-1: ids are deal- plus six base-36 characters, unique, replayable, and say nothing of the card count (AM-2)', () => {
    const play = (seed: number): string[] => {
      const s = newGame({ seed });
      return [offerDeal(s, 'lena', PACT('brix')), offerDeal(s, 'lena', PACT('ossa')), offerDeal(s, 'brix', PACT('ossa')), offerDeal(s, 'kai', PACT('mia'))];
    };
    const ids = play(7);
    for (const id of ids) expect(id).toMatch(/^deal-[0-9a-z]{6}$/);
    expect(new Set(ids).size).toBe(ids.length);
    expect(play(7)).toEqual(ids);
    expect(play(8)[0]).not.toBe(ids[0]);
    ids.forEach((id, i) => expect(id).not.toBe(`deal-${i + 1}`));
  });
});

describe('dealUntil', () => {
  it('S3-T-AC-2: a pact runs its months, capped at maxMonths, and the offered card agrees', () => {
    for (const months of POLITICS.deals.pactMonths) {
      const s = newGame();
      expect(dealUntil(s, 'lena', PACT('brix', months))).toBe(months);
      const id = offerDeal(s, 'lena', PACT('brix', months));
      expect(cards(s).find((c) => c.id === id)!.until).toBe(months);
    }
    const late = newGame();
    late.month = 11;
    late.maxMonths = 12;
    const last = POLITICS.deals.pactMonths.at(-1)!;
    expect(dealUntil(late, 'lena', PACT('brix', last))).toBe(12);
    expect(cards(late)).toEqual([]);
  });

  it('S3-T-AC-2: an office vote binds this month in announce or ballot, else the next election month', () => {
    const state = newGame();
    declare(state, 'brix', 'ossa');
    expect(dealUntil(state, 'lena', GOV('kai', 'brix'))).toBe(1);
    for (const p of SEATS) electionDone(state, p);
    stepElection(state, 0);
    expect(state.politics!.election!.stage).toBe('ballot');
    expect(dealUntil(state, 'lena', GOV('kai', 'brix'))).toBe(1);
    const id = offerDeal(state, 'lena', GOV('kai', 'brix'));
    expect(cards(state).find((c) => c.id === id)!.until).toBe(1);
    closeElection(state);
    expect(dealUntil(state, 'lena', GOV('mia', 'brix'))).toBe(nextElectionMonth(state));
    const later = newGame();
    later.month = 2;
    openPlanning(later);
    declare(later, 'brix', 'ossa');
    expect(dealUntil(later, 'lena', GOV('kai', 'brix'))).toBe(4);
  });

  it('S3-T-AC-2: a law vote binds this month while a ballot is open, else the month after the pending proposal', () => {
    const state = governed();
    proposeLaw(state, 'lena', { kind: 'enact', law: 'landTax', setting: 10 });
    expect(dealUntil(state, 'brix', LAW('ossa'))).toBe(3);
    state.month = 3;
    openPlanning(state);
    expect(state.politics!.council!.stage).toBe('ballot');
    expect(dealUntil(state, 'brix', LAW('ossa'))).toBe(3);
    const id = offerDeal(state, 'brix', LAW('ossa'));
    expect(cards(state).find((c) => c.id === id)!.until).toBe(3);
  });

  it('S3-T-AC-2: with no election left there is a refusal, never an until', () => {
    const state = newGame();
    state.month = 11;
    openPlanning(state);
    expect(refused(() => dealUntil(state, 'lena', GOV('brix', 'ossa')))).toBe('No election is left this game');
  });
});

describe('politics off', () => {
  it('S3-T-AC-6: the three calls refuse with row 1\'s words and nothing is written', () => {
    const state = newGame({ politics: false });
    expect(refused(() => offerDeal(state, 'lena', PACT('brix')))).toBe('This game plays without deals');
    expect(refused(() => withdrawDeal(state, 'lena', 'deal-abc123'))).toBe('This game plays without deals');
    expect(refused(() => answerDeal(state, 'brix', 'deal-abc123', true))).toBe('Cards are answered in planning');
    expect(state.politics).toBeNull();
  });
});
