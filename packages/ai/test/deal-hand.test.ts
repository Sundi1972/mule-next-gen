import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  answerDeal,
  castVote,
  createRng,
  votesDone,
  createGame,
  observe,
  offerDeal,
  POLITICS,
  RuleError,
  runFor,
  stepElection,
  WALK,
  type DealCard,
  type DealOffer,
  type DealTerms,
  type GameState,
  type LawProposal,
  type Politics,
} from '@mule/engine';
import type { Act, AiAction } from '../src/actions.js';
import { DealHand, type SeatPort } from '../src/hands/deal.js';
import { VoteHand } from '../src/hands/vote.js';
import { cardWorth } from '../src/politics-value.js';
import { AiSeat } from '../src/seat.js';
import type { Mind } from '../src/value.js';

// Answer rows 3-4 and the offer drafts set the worth they compare, so the values are doubles here.
vi.mock('../src/politics-value.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/politics-value.js')>()),
  cardWorth: vi.fn(() => 0),
}));
// Slice 4 has not landed: a pact is offered only where sabotage can happen.
const sabotage = vi.hoisted(() => ({ possible: false }));
vi.mock('@mule/engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@mule/engine')>()),
  sabotagePossible: () => sabotage.possible,
}));

const SEATS = ['ai0', 'ai1', 'ai2', 'ai3'];
const PAUSE_MS = POLITICS.ai.actMs[1] + WALK.tickMs;
const worth = vi.mocked(cardWorth);
const saved = { deals: { ...POLITICS.ai.deals }, open: POLITICS.deals.maxOpenOffers };

beforeEach(() => {
  worth.mockReset().mockReturnValue(0);
  sabotage.possible = false;
});
afterEach(() => {
  Object.assign(POLITICS.ai.deals, saved.deals);
  POLITICS.deals.maxOpenOffers = saved.open;
});

function mindOf(me: string, persona: 'trader' | 'cautious' | 'aggressive' | 'saboteur' = 'trader', level: 'trader' | 'rookie' = 'trader', seed = 1): Mind {
  return new AiSeat({ id: me, name: me, persona, level, seed }).mind;
}

function newGame(seed = 7): GameState {
  return createGame({ seed, players: SEATS.map((id) => ({ id, name: id, isAi: true })) });
}

/** Each deal AiAction through the engine call a phone's intent reaches; false on a RuleError. */
function engineAct(state: GameState, id: string, refused: AiAction[] = [], sent: AiAction[] = []): Act {
  return (action) => {
    sent.push(action);
    try {
      if (action.type === 'offerDeal') offerDeal(state, id, action.offer);
      else if (action.type === 'answerDeal') answerDeal(state, id, action.id, action.accept);
      else throw new Error(`DealHand sent a non-deal move: ${action.type}`);
      return true;
    } catch (err) {
      if (!(err instanceof RuleError)) throw err;
      refused.push(action);
      return false;
    }
  };
}

/** Ticks one hand for longer than any pause. */
function run(state: GameState, hand: DealHand, id = hand.mind.me): { sent: AiAction[]; refused: AiAction[] } {
  const sent: AiAction[] = [];
  const refused: AiAction[] = [];
  for (let t = 0; t < PAUSE_MS; t += WALK.tickMs) hand.tick(state, WALK.tickMs, engineAct(state, id, refused, sent));
  return { sent, refused };
}

function card(from: string, to: string, terms: DealTerms, over: Partial<DealCard> = {}): DealCard {
  return { id: `deal-${from}${to}`, from, to, terms, offered: 1, until: 3, status: 'offered', brokenBy: null, settled: null, ...over };
}

function withDeals(state: GameState, deals: DealCard[]): GameState {
  state.politics = { ...state.politics!, deals };
  return state;
}

function setReputation(state: GameState, id: string, reputation: number): void {
  state.players.find((p) => p.id === id)!.reputation = reputation;
}

const PACT: DealTerms = { kind: 'pact' };
const obsOf = (state: GameState, me = 'ai0') => observe(state, me);

describe('S3-T-AC-8: DealHand answer rows (S3-RULE-9)', () => {
  it('S3-T-AC-8 answer row 1: a proposer below refuseBelow is declined, however much the card is worth', () => {
    const state = newGame();
    worth.mockReturnValue(1_000);
    const offered = card('ai1', 'ai0', PACT);
    setReputation(state, 'ai1', POLITICS.ai.deals.refuseBelow - 1);
    expect(new DealHand(mindOf('ai0')).answer(obsOf(state), offered)).toBe(false);
    setReputation(state, 'ai1', POLITICS.ai.deals.refuseBelow);
    expect(new DealHand(mindOf('ai0')).answer(obsOf(state), offered)).toBe(true);
  });

  it('S3-T-AC-8 answer row 3: accepts at or above the persona\'s acceptMin, declines below it', () => {
    const state = newGame();
    const offered = card('ai1', 'ai0', PACT);
    for (const persona of ['trader', 'cautious', 'aggressive', 'saboteur'] as const) {
      const min = POLITICS.ai.deals.acceptMin[persona];
      const hand = new DealHand(mindOf('ai0', persona));
      worth.mockReturnValue(min);
      expect(hand.answer(obsOf(state), offered), `${persona} at ${min}`).toBe(true);
      worth.mockReturnValue(min - 1);
      expect(hand.answer(obsOf(state), offered), `${persona} below ${min}`).toBe(false);
    }
  });

  it('S3-T-AC-8 answer row 2: a Rookie accepts on the deal stream\'s chance, whatever the card is worth', () => {
    const state = newGame();
    state.month = 2;
    worth.mockReturnValue(-1_000);
    const hand = () => new DealHand(mindOf('ai0', 'trader', 'rookie'));
    const offered = card('ai1', 'ai0', PACT);
    // the stream is entered by the first tick or flush of the month
    const flushed = (rookieAccept: number): boolean[] => {
      POLITICS.ai.deals.rookieAccept = rookieAccept;
      const answers: boolean[] = [];
      withDeals(state, [offered]);
      const h = hand();
      h.flush(state, (a) => (a.type === 'answerDeal' && answers.push(a.accept), true));
      return answers;
    };
    expect(flushed(1)).toEqual([true]);
    expect(flushed(0)).toEqual([false]);
    expect(worth).not.toHaveBeenCalled();
  });

  it('S3-T-AC-8 answer row 2: answer() called on its own enters the month, so a Rookie draws from its own stream, not a shared one', () => {
    POLITICS.ai.deals.rookieAccept = 0.5; // literal-ok: a coin, so the seed decides
    const offered = card('ai1', 'ai0', PACT);
    let differs = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const state = withDeals(newGame(seed), [offered]);
      const direct = new DealHand(mindOf('ai0', 'trader', 'rookie', seed)).answer(obsOf(state), offered);
      const answers: boolean[] = [];
      new DealHand(mindOf('ai0', 'trader', 'rookie', seed)).flush(state, (a) => (a.type === 'answerDeal' && answers.push(a.accept), true));
      expect(direct, `seed ${seed}`).toBe(answers[0]);
      differs += direct ? 1 : 0;
    }
    expect(differs, 'both answers occur across seeds').toBeGreaterThan(0);
    expect(differs).toBeLessThan(20);
  });

  it('S3-T-AC-8 answer rows 2-4: a DealPort answer replaces them, row 1 still comes first, null leaves the keyless rule', () => {
    const state = newGame();
    const offered = card('ai1', 'ai0', PACT);
    const asked: string[] = [];
    const port = (answer: boolean | null): SeatPort => ({ answerFor: (c) => (asked.push(c.id), answer), offersFor: () => null });
    worth.mockReturnValue(-1_000);
    expect(new DealHand(mindOf('ai0'), port(true)).answer(obsOf(state), offered)).toBe(true);
    worth.mockReturnValue(1_000);
    expect(new DealHand(mindOf('ai0'), port(false)).answer(obsOf(state), offered)).toBe(false);
    expect(new DealHand(mindOf('ai0'), port(null)).answer(obsOf(state), offered)).toBe(true);
    asked.length = 0;
    setReputation(state, 'ai1', 0);
    expect(new DealHand(mindOf('ai0'), port(true)).answer(obsOf(state), offered)).toBe(false);
    expect(asked).toEqual([]);
  });

  it('S3-T-AC-8 negative: a pact where one is active already is declined, so the engine never refuses the answer', () => {
    const state = newGame();
    worth.mockReturnValue(1_000);
    const active = card('ai0', 'ai1', PACT, { id: 'deal-active', status: 'active' });
    const second = card('ai1', 'ai0', PACT, { id: 'deal-second' });
    withDeals(state, [active, second]);
    expect(new DealHand(mindOf('ai0')).answer(obsOf(state), second)).toBe(false);
  });
});

describe('S3-T-AC-8: DealHand answers in planning', () => {
  function offeredState(terms: DealTerms = PACT): GameState {
    const state = newGame();
    state.month = 2;
    return withDeals(state, [card('ai1', 'ai0', terms, { until: 4 })]);
  }

  it('S3-T-AC-8: answers once, after its seeded pause and within the longest one, and the engine takes the answer', () => {
    const state = offeredState();
    const hand = new DealHand(mindOf('ai0'));
    const early: AiAction[] = [];
    hand.tick(state, POLITICS.ai.actMs[0] - 1, (a) => (early.push(a), true));
    expect(early).toEqual([]);
    const { sent, refused } = run(state, hand);
    expect(sent.filter((a) => a.type === 'answerDeal')).toEqual([{ type: 'answerDeal', id: 'deal-ai1ai0', accept: true }]);
    expect(refused).toEqual([]);
    expect(state.politics!.deals[0]!.status).toBe('active');
  });

  it('S3-T-AC-8: flush answers every waiting card at once, and a card answered is not answered again', () => {
    const state = offeredState();
    withDeals(state, [...state.politics!.deals, card('ai2', 'ai0', { kind: 'vote', law: true, yes: true }, { id: 'deal-two', until: 4 })]);
    const hand = new DealHand(mindOf('ai0'));
    const sent: AiAction[] = [];
    hand.flush(state, (a) => (sent.push(a), true));
    expect(sent.map((a) => a.type === 'answerDeal' && a.id).sort()).toEqual(['deal-ai1ai0', 'deal-two']);
    hand.flush(state, (a) => (sent.push(a), true));
    run(state, hand);
    expect(sent).toHaveLength(2);
  });

  it('S3-T-AC-8: sends nothing outside planning, or with politics off', () => {
    const state = offeredState();
    state.phase = 'auction';
    const hand = new DealHand(mindOf('ai0'));
    expect(run(state, hand).sent).toEqual([]);
    hand.flush(state, () => expect.unreachable());
    state.phase = 'planning';
    state.politics = null;
    expect(run(state, hand).sent).toEqual([]);
  });

  it('S3-T-AC-8 negative: a Rookie\'s answer is never refused by the engine, on a pact, a vote card or an expired one', () => {
    for (let seed = 1; seed <= 12; seed++) {
      for (const terms of [PACT, { kind: 'vote', law: true, yes: false } as DealTerms]) {
        POLITICS.ai.deals.rookieAccept = seed % 2;
        const state = newGame(seed);
        state.month = 2;
        withDeals(state, [card('ai1', 'ai0', terms, { until: seed % 3 === 0 ? 1 : 4 })]);
        const { sent, refused } = run(state, new DealHand(mindOf('ai0', 'trader', 'rookie', seed)));
        expect(sent.length, `seed ${seed}`).toBe(1);
        expect(refused, `seed ${seed}`).toEqual([]);
      }
    }
  });

  it('S3-T-AC-8 (S3-HC-2): a card between two other seats is never named, asked about or valued, and never shows in what the hand reads', () => {
    const state = newGame();
    state.month = 2;
    withDeals(state, [card('ai2', 'ai3', PACT, { id: 'deal-hidden' })]);
    state.politics = { ...state.politics!, election: null };
    sabotage.possible = true; // the pact row is the one that values cards
    const named: AiAction[] = [];
    const hand = new DealHand(mindOf('ai0'), { answerFor: () => expect.unreachable(), offersFor: () => null });
    hand.tick(state, PAUSE_MS, (a) => (named.push(a), true));
    hand.flush(state, (a) => (named.push(a), true));
    expect(JSON.stringify(named)).not.toContain('deal-hidden');
    expect(worth).toHaveBeenCalled();
    expect(worth.mock.calls.every(([obs]) => obs.politics!.deals.length === 0)).toBe(true);
    expect(state.politics!.deals[0]!.status).toBe('offered');
  });
});

/** Month 1's announce with these candidates for governor and these seats Done; ai1 holds the most plots and ai3 the fewest of those, so a trader's pick is the first of the rest. */
function announceWith(candidates: string[], done: string[] = SEATS): GameState {
  const state = newGame();
  const free = state.tiles.filter((t) => t.terrain !== 'store' && t.owner === null);
  for (const [id, n] of Object.entries({ ai0: 2, ai1: 3, ai2: 1, ai3: 2 })) for (let i = 0; i < n; i++) free.shift()!.owner = id;
  for (const id of candidates) runFor(state, id, 'governor', { kind: 'hold' });
  expect(state.politics!.election!.stage).toBe('announce');
  // a DealHand offers in announce only once its seat has pressed Done, which VoteHand does after its last call
  state.politics!.election!.done = [...done];
  return state;
}

const worthTo = (table: Record<string, number>) => worth.mockImplementation((_obs, who, c) => (who === 'ai0' ? (table[c.to] ?? 0) : 0));

describe('S3-T-AC-8: DealHand offer rows a-c (S3-RULE-9)', () => {
  it('S3-T-AC-8 offer row a: in an election\'s announce it offers its own vote to the candidate ownVote names, and the engine takes it', () => {
    const state = announceWith(['ai1', 'ai2']);
    worthTo({ ai1: 5, ai2: 5 });
    const { sent, refused } = run(state, new DealHand(mindOf('ai0')));
    const offers = sent.filter((a): a is Extract<AiAction, { type: 'offerDeal' }> => a.type === 'offerDeal');
    expect(offers).toHaveLength(1);
    expect(offers[0]!.offer.terms).toMatchObject({ kind: 'vote', office: 'governor' });
    expect(['ai1', 'ai2']).toContain(offers[0]!.offer.to);
    expect(refused).toEqual([]);
    expect(state.politics!.deals).toHaveLength(1);
  });

  it('S3-T-AC-8 AM-8 offer row a: it never offers a vote card for an office its own seat runs for', () => {
    const state = announceWith(['ai0', 'ai1', 'ai2']);
    worth.mockReturnValue(5);
    const { sent } = run(state, new DealHand(mindOf('ai0')));
    expect(sent.filter((a) => a.type === 'offerDeal')).toEqual([]);
    // the contrast: a seat that stays out of the race offers on the same ballot
    const other = announceWith(['ai1', 'ai2']);
    expect(run(other, new DealHand(mindOf('ai3'))).sent.filter((a) => a.type === 'offerDeal')).toHaveLength(1);
  });

  it('S3-T-AC-8 AM-8 offer row a: in announce a seat offers only once it is Done', () => {
    const waiting = announceWith(['ai1', 'ai2'], []);
    worth.mockReturnValue(5);
    const hand = new DealHand(mindOf('ai0'));
    expect(run(waiting, hand).sent).toEqual([]);
    waiting.politics!.election!.done = ['ai0'];
    expect(run(waiting, hand).sent.filter((a) => a.type === 'offerDeal')).toHaveLength(1);
  });

  it('S3-T-AC-8 AM-8 offer row a: with VoteHands beside it, a seat that declares in announce never holds a card for that office', () => {
    // VoteHand and DealHand together: whoever declares at its last call must hold no card for that office
    let cards = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const state = newGame(seed);
      const free = state.tiles.filter((t) => t.terrain !== 'store' && t.owner === null);
      for (const [id, n] of Object.entries({ ai0: 2, ai1: 3, ai2: 1, ai3: 2 })) for (let i = 0; i < n; i++) free.shift()!.owner = id;
      runFor(state, 'ai1', 'governor', { kind: 'hold' });
      const personas = ['trader', 'cautious', 'aggressive', 'saboteur'] as const;
      const votes = SEATS.map((id, i) => new VoteHand(mindOf(id, personas[i]!, 'trader', seed + i), createSeeded(seed * 10 + i)));
      const deals = SEATS.map((id, i) => new DealHand(mindOf(id, personas[i]!, 'trader', seed + i)));
      worth.mockReturnValue(3);
      for (let t = 0; t < 120_000 && state.politics!.election!.stage === 'announce'; t += WALK.tickMs) {
        SEATS.forEach((id, i) => {
          votes[i]!.tick(state, WALK.tickMs, voteAct(state, id));
          deals[i]!.tick(state, WALK.tickMs, engineAct(state, id));
        });
        stepElection(state, WALK.tickMs);
      }
      // the field the ballot opened with (the announce's candidates are copied there and cleared)
      const { deals: held } = state.politics!;
      const candidates = state.politics!.election!.candidates;
      for (const c of held) {
        if (c.terms.kind !== 'vote' || !('office' in c.terms)) continue;
        cards++;
        expect(candidates[c.terms.office], `seed ${seed}: ${c.from}'s card for ${c.terms.office}`).not.toContain(c.from);
      }
    }
    expect(cards, 'the table did offer vote cards in announce').toBeGreaterThan(0);
  });

  it('S3-T-AC-8 AM-8: a port\'s offered vote for an office its seat runs for is dropped', () => {
    const state = announceWith(['ai0', 'ai1']);
    const port: SeatPort = { answerFor: () => null, offersFor: () => [{ to: 'ai1', terms: { kind: 'vote', office: 'governor', candidate: 'ai1' } }, { to: 'ai2', terms: { kind: 'pact' }, months: 3 }] };
    sabotage.possible = true;
    const { sent } = run(state, new DealHand(mindOf('ai0'), port));
    expect(sent.filter((a) => a.type === 'offerDeal').map((a) => a.type === 'offerDeal' && a.offer.terms.kind)).toEqual(['pact']);
  });

  it('S3-T-AC-8 offer row a: the offered vote is ownVote\'s, the port\'s choice included, so the offer and the cast vote are one decision', () => {
    const state = announceWith(['ai1', 'ai2', 'ai3']);
    worth.mockReturnValue(5);
    const port: SeatPort = { answerFor: () => null, offersFor: () => null, electionVote: () => 'ai3', lawVote: () => null };
    const { sent } = run(state, new DealHand(mindOf('ai0'), port));
    const offer = sent.find((a) => a.type === 'offerDeal');
    expect(offer).toMatchObject({ offer: { to: 'ai3', terms: { kind: 'vote', office: 'governor', candidate: 'ai3' } } });
  });

  function lawState(proposal: LawProposal, by: string): GameState {
    const state = newGame();
    state.month = 2;
    state.politics = { ...state.politics!, governor: by, election: null, baron: null, proposal: { by, month: 2, proposal } } as Politics;
    return state;
  }

  it('S3-T-AC-8 offer row b: with a law up for a vote and a yes, the vote goes to the proposer', () => {
    const state = lawState({ kind: 'enact', law: 'landTax', setting: 10 }, 'ai1');
    worth.mockReturnValue(5);
    const { sent, refused } = run(state, new DealHand(mindOf('ai0')));
    const offers = sent.filter((a) => a.type === 'offerDeal');
    expect(offers).toEqual([{ type: 'offerDeal', offer: { to: 'ai1', terms: { kind: 'vote', law: true, yes: true } } }]);
    expect(refused).toEqual([]);
  });

  it('S3-T-AC-8 offer row b: a no goes to the player the law costs most, never to the seat itself', () => {
    const state = lawState({ kind: 'enact', law: 'landTax', setting: 10 }, 'ai1');
    const tiles = state.tiles.filter((t) => t.terrain !== 'store' && t.owner === null);
    for (const t of tiles.slice(0, 10)) t.owner = 'ai2';
    for (const t of tiles.slice(10, 12)) t.owner = 'ai0';
    worth.mockReturnValue(5);
    const port: SeatPort = { answerFor: () => null, offersFor: () => null, electionVote: () => null, lawVote: () => false };
    const { sent } = run(state, new DealHand(mindOf('ai0'), port));
    expect(sent.filter((a) => a.type === 'offerDeal')).toEqual([{ type: 'offerDeal', offer: { to: 'ai2', terms: { kind: 'vote', law: true, yes: false } } }]);
  });

  it('S3-T-AC-8 offer row b: a no on a repeal goes to the player the repeal costs most, not to the one it helps most', () => {
    // landTax in force: the repeal saves its payers money, so the player with the most plots is the one it costs least
    const state = lawState({ kind: 'repeal', law: 'landTax' }, 'ai3');
    state.politics = { ...state.politics!, laws: { landTax: { setting: 10, since: 1 } } };
    for (const t of state.tiles.filter((t) => t.terrain !== 'store' && t.owner === null).slice(0, 10)) t.owner = 'ai1';
    worth.mockReturnValue(5);
    const port: SeatPort = { answerFor: () => null, offersFor: () => null, electionVote: () => null, lawVote: () => false };
    const { sent, refused } = run(state, new DealHand(mindOf('ai0'), port));
    // nobody loses by it, so the cost ties at nothing and the first in seat order who is not helped wins
    expect(sent.filter((a) => a.type === 'offerDeal')).toEqual([{ type: 'offerDeal', offer: { to: 'ai2', terms: { kind: 'vote', law: true, yes: false } } }]);
    expect(refused).toEqual([]);
  });

  it('S3-T-AC-8 offer row b: no offer on a law the seat itself proposes, however it would vote', () => {
    const state = lawState({ kind: 'enact', law: 'landTax', setting: 10 }, 'ai0');
    worth.mockReturnValue(5);
    expect(run(state, new DealHand(mindOf('ai0'))).sent.filter((a) => a.type === 'offerDeal')).toEqual([]);
  });

  it('S3-T-AC-8 offer row a: no vote card where an office has fewer than two candidates', () => {
    const state = announceWith(['ai1']);
    worth.mockReturnValue(5);
    expect(run(state, new DealHand(mindOf('ai0'))).sent.filter((a) => a.type === 'offerDeal')).toEqual([]);
  });

  it('S3-T-AC-8 offer row c: where sabotage can happen, a pact of the middle length to the player it is worth most with', () => {
    const state = newGame();
    state.month = 2;
    state.politics = { ...state.politics!, election: null };
    sabotage.possible = true;
    worthTo({ ai1: 2, ai2: 9, ai3: 4 });
    const { sent, refused } = run(state, new DealHand(mindOf('ai0')));
    const months = POLITICS.ai.deals.pactMonths;
    expect(sent.filter((a) => a.type === 'offerDeal')).toEqual([{ type: 'offerDeal', offer: { to: 'ai2', terms: { kind: 'pact' }, months } }]);
    expect(refused).toEqual([]);
    // the draft the hand valued carries the card the engine made: its id and the until the engine computed (month 2 + 3 months - 1)
    const drafts = worth.mock.calls.map(([, , c]) => c).filter((c) => c.id === 'draft' && c.to === 'ai2');
    expect(drafts.length).toBeGreaterThan(0);
    for (const d of drafts) expect(d.until).toBe(4);
    expect(state.politics!.deals[0]!.until).toBe(4);
  });

  it('S3-T-AC-8 offer row c: a partner who fails an offer test falls through to the next best, not to no pact', () => {
    const base = (): GameState => {
      const state = newGame();
      state.month = 2;
      state.politics = { ...state.politics!, election: null };
      sabotage.possible = true;
      return state;
    };
    worthTo({ ai1: 2, ai2: 9, ai3: 4 });
    const toOf = (state: GameState): unknown[] => run(state, new DealHand(mindOf('ai0'))).sent.filter((a) => a.type === 'offerDeal').map((a) => a.type === 'offerDeal' && a.offer.to);
    const declined = base();
    withDeals(declined, [card('ai0', 'ai2', PACT, { id: 'deal-no-ai2', status: 'declined', settled: 2 })]);
    expect(toOf(declined)).toEqual(['ai3']);
    const held = base();
    withDeals(held, [card('ai0', 'ai2', { kind: 'vote', law: true, yes: true }, { id: 'deal-open-ai2', until: 3 })]);
    expect(toOf(held)).toEqual(['ai3']);
  });

  it('S3-T-AC-8 offer row c: while sabotage cannot happen, no pact is offered', () => {
    const state = newGame();
    state.month = 2;
    state.politics = { ...state.politics!, election: null };
    worth.mockReturnValue(9);
    expect(run(state, new DealHand(mindOf('ai0'))).sent).toEqual([]);
  });

  it('S3-T-AC-8 offer tests: worth to itself above 0, to the partner at least 0, partner reputation at refuseBelow, no same card declined this month', () => {
    const base = (): GameState => {
      const state = newGame();
      state.month = 2;
      state.politics = { ...state.politics!, election: null };
      sabotage.possible = true;
      return state;
    };
    const offers = (state: GameState): number => run(state, new DealHand(mindOf('ai0'))).sent.filter((a) => a.type === 'offerDeal').length;
    const only = (mine: number, theirs: number) => worth.mockImplementation((_o, who) => (who === 'ai0' ? mine : theirs));
    only(1, 0);
    expect(offers(base())).toBe(1);
    only(0, 5);
    expect(offers(base())).toBe(0);
    only(5, -1);
    expect(offers(base())).toBe(0);
    only(5, 0);
    const poor = base();
    for (const id of ['ai1', 'ai2', 'ai3']) setReputation(poor, id, POLITICS.ai.deals.refuseBelow - 1);
    expect(offers(poor)).toBe(0);
    const declined = base();
    withDeals(declined, ['ai1', 'ai2', 'ai3'].map((to) => card('ai0', to, PACT, { id: `deal-no-${to}`, status: 'declined', settled: 2 })));
    expect(offers(declined)).toBe(0);
    const lastMonth = base();
    withDeals(lastMonth, ['ai1', 'ai2', 'ai3'].map((to) => card('ai0', to, PACT, { id: `deal-no-${to}`, status: 'declined', settled: 1 })));
    expect(offers(lastMonth)).toBe(1);
  });

  it('S3-T-AC-8: at most offersPerMonth a month, the best by worth first, within maxOpenOffers', () => {
    const state = announceWith(['ai1', 'ai2']);
    sabotage.possible = true;
    worth.mockImplementation((_o, who, c) => (who !== 'ai0' ? 0 : c.terms.kind === 'pact' ? (c.to === 'ai3' ? 9 : 1) : 5));
    const hand = new DealHand(mindOf('ai0'));
    const { sent } = run(state, hand);
    const offers = sent.filter((a): a is Extract<AiAction, { type: 'offerDeal' }> => a.type === 'offerDeal');
    expect(offers).toHaveLength(POLITICS.ai.deals.offersPerMonth);
    expect(offers[0]!.offer.to).toBe('ai3');
    hand.offer(state, (a) => expect.unreachable(String(a.type)));
    const crowded = announceWith(['ai1', 'ai2']);
    POLITICS.deals.maxOpenOffers = 1;
    expect(run(crowded, new DealHand(mindOf('ai0'))).sent.filter((a) => a.type === 'offerDeal')).toHaveLength(1);
  });

  it('S3-T-AC-8: a DealPort\'s offers replace the keyless rows, up to the month\'s limit', () => {
    const state = newGame();
    state.month = 2;
    state.politics = { ...state.politics!, election: null };
    worth.mockReturnValue(9);
    sabotage.possible = true;
    const own: DealOffer[] = [1, 3, 6].map((months, i) => ({ to: SEATS[i + 1]!, terms: PACT, months }));
    const { sent } = run(state, new DealHand(mindOf('ai0'), { answerFor: () => null, offersFor: () => own }));
    expect(sent.filter((a) => a.type === 'offerDeal')).toHaveLength(POLITICS.ai.deals.offersPerMonth);
    expect(sent[0]).toEqual({ type: 'offerDeal', offer: own[0] });
    const none = run(newGame(), new DealHand(mindOf('ai0'), { answerFor: () => null, offersFor: () => [] }));
    expect(none.sent).toEqual([]);
  });

  it('S3-T-AC-8: it never withdraws, and never offers outside planning', () => {
    const state = announceWith(['ai1', 'ai2']);
    worth.mockReturnValue(5);
    state.phase = 'auction';
    expect(run(state, new DealHand(mindOf('ai0'))).sent).toEqual([]);
    state.phase = 'planning';
    const hand = new DealHand(mindOf('ai0'));
    const { sent } = run(state, hand);
    state.month = 2;
    sent.push(...run(state, hand).sent);
    expect(sent.some((a) => a.type === 'withdrawDeal')).toBe(false);
  });
});

describe('S3-T-AC-8 (S3-HC-3): DealHand\'s draws leave the election and council fixtures unchanged', () => {
  function ballotTable(seed: number, withDeals: boolean) {
    const state = newGame(seed);
    const free = state.tiles.filter((t) => t.terrain !== 'store' && t.owner === null);
    for (const [id, n] of Object.entries({ ai1: 3, ai2: 1, ai3: 2 })) for (let i = 0; i < n; i++) free.shift()!.owner = id;
    for (const id of ['ai1', 'ai2', 'ai3']) runFor(state, id, 'governor', { kind: 'hold' });
    const votes = SEATS.map((id, i) => new VoteHand(mindOf(id, (['trader', 'cautious', 'aggressive', 'saboteur'] as const)[i]!, 'trader', seed + i), createSeeded(seed * 10 + i)));
    const deals = SEATS.map((id, i) => new DealHand(mindOf(id, (['trader', 'cautious', 'aggressive', 'saboteur'] as const)[i]!, 'trader', seed + i)));
    const sent: Record<string, AiAction[]> = Object.fromEntries(SEATS.map((id) => [id, []]));
    worth.mockReturnValue(withDeals ? 3 : 0);
    sabotage.possible = true; // a pact is the card the planning that follows the election offers
    // the election's ballot, then the planning window after it, where the DealHands offer their pacts
    let overFor = 0;
    for (let t = 0; t < 120_000 && overFor < PAUSE_MS; t += WALK.tickMs) {
      if (state.politics!.election!.stage === 'over') overFor += WALK.tickMs;
      SEATS.forEach((id, i) => {
        const record: Act = (a) => (sent[id]!.push(a), voteAct(state, id)(a));
        votes[i]!.tick(state, WALK.tickMs, record);
        if (withDeals) deals[i]!.tick(state, WALK.tickMs, engineAct(state, id));
      });
      stepElection(state, WALK.tickMs);
    }
    return { ballots: structuredClone(state.politics!.election!.ballots), sent, governor: state.politics!.governor, cards: state.politics!.deals.length };
  }

  it('S3-T-AC-8 (S3-HC-3): the same table with DealHands ticking beside the VoteHands casts the same ballots and sends the same moves', () => {
    let cards = 0;
    for (const seed of [3, 7, 11]) {
      const alone = ballotTable(seed, false);
      const beside = ballotTable(seed, true);
      cards += beside.cards;
      expect(beside.sent, `seed ${seed}`).toEqual(alone.sent);
      expect(beside.ballots, `seed ${seed}`).toEqual(alone.ballots);
      expect(beside.governor, `seed ${seed}`).toBe(alone.governor);
    }
    expect(cards, 'the DealHands offered cards beside the VoteHands').toBeGreaterThan(0);
  });

  it('S3-T-AC-8 (S3-HC-3): a council ballot with DealHands beside it votes as it does alone', () => {
    const lawVotes = (withDeals: boolean): AiAction[] => {
      const state = newGame();
      state.month = 2;
      const proposal: LawProposal = { kind: 'enact', law: 'landTax', setting: 10 };
      state.politics = { ...state.politics!, governor: 'ai1', baron: null, election: null, council: { stage: 'ballot', clockMs: 0, proposal, proposer: 'ai1', ballots: { ai1: true }, done: [], result: null } };
      worth.mockReturnValue(withDeals ? 3 : 0);
      const sent: AiAction[] = [];
      for (const [i, id] of SEATS.entries()) {
        const mind = mindOf(id, 'trader', 'rookie', 5 + i);
        if (withDeals) new DealHand(mind).tick(state, PAUSE_MS, engineAct(state, id));
        new VoteHand(mind, createSeeded(9 + i)).tick(state, 0, (a) => (sent.push(a), true));
      }
      return sent;
    };
    expect(lawVotes(true)).toEqual(lawVotes(false));
  });
});

function createSeeded(seed: number) {
  return createRng((seed ^ 0x165667b1) >>> 0);
}

/** The moves of a VoteHand in the election, applied as a phone's intents are. */
function voteAct(state: GameState, id: string): Act {
  return (a) => {
    try {
      if (a.type === 'run') runFor(state, id, a.office, a.promise);
      else if (a.type === 'vote') castVote(state, id, a.office, a.candidate);
      else if (a.type === 'done') votesDone(state, id, a.done);
      else if (a.type === 'setTax' || a.type === 'propose') return false;
      return true;
    } catch (err) {
      if (!(err instanceof RuleError)) throw err;
      return false;
    }
  };
}
