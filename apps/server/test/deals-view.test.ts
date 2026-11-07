import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pactBreach, POLITICS, type DealCard, type GameState } from '@mule/engine';
import type { SeatInfo } from '@tabletop/core';
import { MuleGame, type Notice } from '../src/mule-game.js';
import { dealNews } from '../src/politics-view.js';
import { fakeContext } from './fake-context.js';

/** S3-C11 and S3-C12: what each screen, the news and the record see of the cards. Every visibility goes through partyTo. */

const TABLE: SeatInfo[] = [
  { id: 's1', name: 'Heiko', isAi: false, color: 0 },
  { id: 's2', name: 'Lena', isAi: false, color: 1 },
  { id: 's4', name: 'Kai', isAi: false, color: 2 },
  { id: 's3', name: 'The Accountant', isAi: true, color: 3 },
];

beforeEach(() => {
  for (const level of ['log', 'info', 'warn'] as const) vi.spyOn(console, level).mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

function startedGame() {
  const notices: Notice[] = [];
  const fake = fakeContext({ table: TABLE });
  const game = new MuleGame(fake.ctx, 10, { politics: true, notice: (n) => notices.push(n) });
  game.start(TABLE);
  return { game, notices };
}

const stateOf = (game: MuleGame) => (game as unknown as { state: GameState }).state;
const PACT = { to: 's2', terms: { kind: 'pact' as const }, months: 3 };

/** Heiko offers Lena a pact and she accepts: the card's id. */
function pact(game: MuleGame): string {
  game.handle('s1', { type: 'offerDeal', offer: PACT });
  const id = stateOf(game).politics!.deals.at(-1)!.id;
  game.handle('s2', { type: 'answerDeal', id, accept: true });
  return id;
}

describe('S3-RULE-7 (server views): a card reaches its two parties only, until it breaks', () => {
  it('S3-T-AC-5: an active pact is on both parties’ phones; Kai’s phone and the TV hold no trace of it', () => {
    const { game } = startedGame();
    const id = pact(game);

    for (const party of ['s1', 's2']) {
      expect(game.viewFor(party).me!.deals!.cards.map((c) => [c.id, c.status])).toEqual([[id, 'active']]);
    }
    expect(game.viewFor('s4').me!.deals!.cards).toEqual([]);
    expect(JSON.stringify(game.viewFor('s4')), 'a third phone').not.toContain(id);
    expect(JSON.stringify(game.viewFor(null)), 'the TV').not.toContain(id);
  });

  it('MyDealsView: an open offer counts against the proposer’s offers left, and the pact lengths come from config', () => {
    const { game } = startedGame();
    const left = () => game.viewFor('s1').me!.deals!.offersLeft;
    expect(left()).toBe(POLITICS.deals.maxOpenOffers);

    game.handle('s1', { type: 'offerDeal', offer: PACT });

    expect(left()).toBe(POLITICS.deals.maxOpenOffers - 1);
    expect(game.viewFor('s2').me!.deals!.offersLeft, 'the receiver’s count is their own').toBe(POLITICS.deals.maxOpenOffers);
    expect(game.viewFor('s1').me!.deals!.pactMonths).toEqual([...POLITICS.deals.pactMonths]);
  });

  it('a broken card is public: on every screen’s brokenDeals, on a third phone’s own list, and as the breaker’s public reason', () => {
    const { game } = startedGame();
    const id = pact(game);

    pactBreach(stateOf(game), 's1', 's2', stateOf(game).month, true);

    for (const viewer of ['s1', 's2', 's4', null]) {
      const v = game.viewFor(viewer);
      expect(v.politics!.brokenDeals!.map((c) => [c.id, c.brokenBy]), String(viewer)).toEqual([[id, 's1']]);
      expect(v.politics!.reputationReasons!.s1, String(viewer)).toEqual([{ kind: 'broken', id }]);
    }
    expect(game.viewFor('s4').me!.deals!.cards.map((c) => c.id), 'public now, so on every list').toEqual([id]);
  });

  it('MyPoliticsView.promised: a promised vote shows on the promiser’s own phone only', () => {
    const { game } = startedGame();
    game.handle('s2', { type: 'run', office: 'governor', promise: { kind: 'hold' } });
    game.handle('s1', { type: 'offerDeal', offer: { to: 's4', terms: { kind: 'vote', office: 'governor', candidate: 's2' } } });
    const id = stateOf(game).politics!.deals.at(-1)!.id;
    game.handle('s4', { type: 'answerDeal', id, accept: true });

    expect(game.viewFor('s1').me!.politics!.promised).toEqual({ election: { governor: { candidate: 's2', to: ['s4'] } }, law: null });
    expect(game.viewFor('s4').me!.politics!.promised).toEqual({ election: {}, law: null });
  });
});

describe('S3-RULE-11 / S3-C12: the record’s deal notices, and one news line per break', () => {
  const deal = (notices: Notice[]) => notices.filter((n) => n.kind === 'deal') as Extract<Notice, { kind: 'deal' }>[];

  it('an offer and its answer each leave a notice private to the two parties, with the card as it stood', () => {
    const { game, notices } = startedGame();
    const id = pact(game);

    expect(deal(notices).map((n) => [n.event, n.deal.id, n.deal.status, n.parties])).toEqual([
      ['offered', id, 'offered', ['s1', 's2']],
      ['active', id, 'active', ['s1', 's2']],
    ]);
  });

  it('a break leaves a public notice, with no parties, and one news line on every screen', () => {
    const { game, notices } = startedGame();
    pact(game);
    pactBreach(stateOf(game), 's1', 's2', stateOf(game).month, true);

    // The next thing the table does: the server notices the change with it.
    game.handle('s4', { type: 'offerDeal', offer: { to: 's1', terms: { kind: 'pact' }, months: 1 } });

    const broken = deal(notices).filter((n) => n.event === 'broken');
    expect(broken).toHaveLength(1);
    expect(broken[0]!.parties, 'public').toBeUndefined();
    expect(game.viewFor(null).news[0]).toBe('Heiko broke a pact with Lena. Reputation −20.');
    expect(game.viewFor('s4').news[0]).toBe('Heiko broke a pact with Lena. Reputation −20.');
  });
});

describe('dealNews: the wording of a break, per kind of card', () => {
  const card = (terms: DealCard['terms'], from = 's1', to = 's2', brokenBy: string | null = 's1'): DealCard => ({
    id: 'deal-a',
    from,
    to,
    terms,
    offered: 2,
    until: 4,
    status: 'broken',
    brokenBy,
    settled: 4,
  });
  const names: Record<string, string> = { s1: 'Heiko', s2: 'Lena', s4: 'Kai' };
  const was = (c: DealCard): DealCard => ({ ...c, status: 'active', brokenBy: null, settled: null });
  const news = (c: DealCard) => dealNews([was(c)], [c], (id) => names[id]!);

  it.each([
    [{ kind: 'vote', office: 'governor', candidate: 's4' } as const, 'Heiko broke a promise to Lena: a vote for Kai. Reputation −10.', ['s1', 's2', 's4']],
    [{ kind: 'vote', law: true, yes: true } as const, 'Heiko broke a promise to Lena: a yes on the law. Reputation −10.', ['s1', 's2']],
    [{ kind: 'vote', law: true, yes: false } as const, 'Heiko broke a promise to Lena: a no on the law. Reputation −10.', ['s1', 's2']],
    [{ kind: 'pact' } as const, 'Heiko broke a pact with Lena. Reputation −20.', ['s1', 's2']],
  ])('%j reads %j, naming %j', (terms, text, who) => {
    expect(news(card(terms))).toEqual([{ text, who }]);
  });

  it('a pact broken by its receiver names the proposer as the other party', () => {
    expect(news(card({ kind: 'pact' }, 's1', 's2', 's2'))).toEqual([{ text: 'Lena broke a pact with Heiko. Reputation −20.', who: ['s2', 's1'] }]);
  });

  it('only a card that turns broken makes news: an offer, a kept pact or an already broken card makes none', () => {
    const kept = { ...card({ kind: 'pact' }), status: 'kept' as const, brokenBy: null };
    expect(dealNews([], [{ ...kept, status: 'offered' }], (id) => names[id]!)).toEqual([]);
    expect(dealNews([was(kept)], [kept], (id) => names[id]!)).toEqual([]);
    const broken = card({ kind: 'pact' });
    expect(dealNews([broken], [broken], (id) => names[id]!)).toEqual([]);
  });
});
