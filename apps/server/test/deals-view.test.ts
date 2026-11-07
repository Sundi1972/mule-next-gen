import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pactBreach, POLITICS, WALK, type DealCard, type GameState, type Phase } from '@mule/engine';
import type { SeatInfo } from '@tabletop/core';
import { Playbooks } from '../src/brain/playbooks.js';
import { MuleGame, type Notice } from '../src/mule-game.js';
import { dealNews } from '../src/politics-view.js';
import { fakeContext, readyAll, throughSidePicks } from './fake-context.js';

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

describe('S3-RULE-11: a card the clock settles is noticed in that same step, stamped with the phase whose rule settled it', () => {
  /** Three people and one computer seat. */
  const PEOPLE: SeatInfo[] = [
    { id: 'lena', name: 'Lena', isAi: false, color: 0 },
    { id: 'brix', name: 'Brix', isAi: false, color: 1 },
    { id: 'ossa', name: 'Ossa', isAi: false, color: 2 },
    { id: 'ai1', name: 'The Big Spender', isAi: true, color: 3 },
  ];
  const HUMANS = ['lena', 'brix', 'ossa'];

  function played(table: SeatInfo[] = PEOPLE, maxMonths?: number) {
    const notices: Notice[] = [];
    const fake = fakeContext({ table });
    const game = new MuleGame(fake.ctx, 7, { politics: true, maxMonths, notice: (n) => notices.push(n) });
    game.start(table);
    const step = throughSidePicks(game, (ms) => fake.advance(ms));
    /** The clock runs, every person pressing Ready once a game second, until `phase` opens: no other intent. */
    const until = (phase: Phase) => {
      for (let t = 0; t < 30 * 60_000 && stateOf(game).phase !== phase; t += WALK.tickMs) {
        if (t % 1000 === 0) readyAll(game);
        if (stateOf(game).phase !== phase) step(WALK.tickMs);
      }
      expect(stateOf(game).phase, `the premise: ${phase} opened`).toBe(phase);
    };
    return { game, notices, step, until };
  }
  const cardNotices = (notices: Notice[], id: string) => deal(notices).filter((n) => n.deal.id === id);
  const deal = (notices: Notice[]) => notices.filter((n) => n.kind === 'deal') as Extract<Notice, { kind: 'deal' }>[];

  it('an offer nobody answered is noticed expired as planning closes, stamped planning', () => {
    const { game, notices, until } = played();
    game.handle('ossa', { type: 'offerDeal', offer: { to: 'lena', terms: { kind: 'pact' }, months: 3 } });
    const id = stateOf(game).politics!.deals.at(-1)!.id;

    until('landGrant');

    expect(cardNotices(notices, id).map((n) => [n.event, n.phase, n.month])).toEqual([
      ['offered', 'planning', 1],
      ['expired', 'planning', 1],
    ]);
  });

  it('a one-month pact is noticed kept the moment the clock opens the upkeep, before any intent, stamped upkeep', () => {
    const { game, notices, step } = played();
    game.handle('ossa', { type: 'offerDeal', offer: { to: 'lena', terms: { kind: 'pact' }, months: 1 } });
    const id = stateOf(game).politics!.deals.at(-1)!.id;
    game.handle('lena', { type: 'answerDeal', id, accept: true });

    // Ready only before production: production and the upkeep's opening are the clock's alone.
    for (let t = 0; t < 30 * 60_000 && stateOf(game).phase !== 'upkeep'; t += WALK.tickMs) {
      if (t % 1000 === 0 && stateOf(game).phase !== 'production') readyAll(game);
      if (stateOf(game).phase !== 'upkeep') step(WALK.tickMs);
    }

    expect(stateOf(game).phase).toBe('upkeep');
    expect(cardNotices(notices, id).map((n) => [n.event, n.phase, n.month])).toEqual([
      ['offered', 'planning', 1],
      ['active', 'planning', 1],
      ['kept', 'upkeep', 1],
    ]);
  });

  it('a pact still running when the game ends is noticed kept at that last upkeep, stamped upkeep, not game over', () => {
    const { game, notices, until } = played(PEOPLE, 1);
    game.handle('ossa', { type: 'offerDeal', offer: { to: 'lena', terms: { kind: 'pact' }, months: 3 } });
    const id = stateOf(game).politics!.deals.at(-1)!.id;
    game.handle('lena', { type: 'answerDeal', id, accept: true });

    until('gameOver');

    expect(cardNotices(notices, id).at(-1)).toMatchObject({ event: 'kept', phase: 'upkeep', month: 1 });
  });

  it('a vote promise broken on the ballot is noticed, and in the news with its seats, in the tick that settles it', () => {
    const { game, notices, step } = played();
    game.handle('lena', { type: 'run', office: 'governor', promise: { kind: 'hold' } });
    game.handle('brix', { type: 'run', office: 'governor', promise: { kind: 'hold' } });
    game.handle('ossa', { type: 'offerDeal', offer: { to: 'brix', terms: { kind: 'vote', office: 'governor', candidate: 'brix' } } });
    const id = stateOf(game).politics!.deals.at(-1)!.id;
    game.handle('brix', { type: 'answerDeal', id, accept: true });
    for (const h of HUMANS) game.handle(h, { type: 'ready' });
    for (let t = 0; t < 120_000 && game.viewFor(null).politics!.election!.stage !== 'ballot'; t += WALK.tickMs) step(WALK.tickMs);
    game.handle('lena', { type: 'vote', office: 'governor', candidate: 'lena' });
    game.handle('brix', { type: 'vote', office: 'governor', candidate: 'brix' });
    game.handle('ossa', { type: 'vote', office: 'governor', candidate: 'lena' });
    for (const h of HUMANS) game.handle(h, { type: 'ready' });

    const card = () => stateOf(game).politics!.deals.find((d) => d.id === id)!;
    for (let t = 0; t < 120_000 && card().status !== 'broken'; t += WALK.tickMs) step(WALK.tickMs);

    expect(card().status, 'the premise: the ballot broke the promise').toBe('broken');
    expect(cardNotices(notices, id).map((n) => n.event)).toEqual(['offered', 'active', 'broken']);
    expect(game.viewFor(null).newsLines).toContainEqual({ text: 'Ossa broke a promise to Brix: a vote for Brix. Reputation −10.', who: ['ossa', 'brix', 'brix'] });
  });

  it.each([
    ['as the development closes, noticed with the close', 2],
    ['during the development, noticed by the next Ready', 1],
  ])('a card settling %s stays out of the auction playbook’s public facts', (_when, before) => {
    const askPhase = vi.spyOn(Playbooks.prototype, 'askPhase');
    const { game, notices, until } = played(PEOPLE.filter((s) => !s.isAi));
    game.handle('ossa', { type: 'offerDeal', offer: { to: 'lena', terms: { kind: 'pact' }, months: 3 } });
    const id = stateOf(game).politics!.deals.at(-1)!.id;
    game.handle('lena', { type: 'answerDeal', id, accept: true });
    until('development');
    const state = stateOf(game);

    // Some press Ready; then the card settles, as a rule could settle it; the rest press Ready, the last closing it.
    for (const h of HUMANS.slice(0, before)) game.handle(h, { type: 'ready' });
    expect(state.phase, 'the premise: still the development').toBe('development');
    const politics = structuredClone(state.politics!);
    politics.deals.find((d) => d.id === id)!.status = 'kept';
    state.politics = politics;
    for (const h of HUMANS.slice(before)) game.handle(h, { type: 'ready' });

    expect(state.phase, 'the premise: the development closed').not.toBe('development');
    expect(cardNotices(notices, id).at(-1)!.event, 'the premise: the record noticed it').toBe('kept');
    const facts = askPhase.mock.calls.filter(([, phase]) => phase === 'auction').at(-1)![2];
    expect(facts.filter((f) => 'parties' in f && f.parties !== undefined), 'no private notice').toEqual([]);
  });
});
