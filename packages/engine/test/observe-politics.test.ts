import { describe, expect, it } from 'vitest';
import { createGame, observe, type DealCard, type DealTerms, type GameState, type SabotageOrder } from '../src/index.js';

const SEATS = ['brix', 'ossa', 'lena', 'tam'];
const MONTH = 3;

function card(id: string, from: string, to: string, status: DealCard['status'], terms: DealTerms = { kind: 'pact' }): DealCard {
  return { id, from, to, terms, offered: 2, until: 5, status, brokenBy: status === 'broken' ? from : null, settled: null };
}

function order(id: string, by: string, outcome: SabotageOrder['outcome'], cost: number, culpritPublic = false): SabotageOrder {
  return { id, by, month: MONTH, target: { kind: 'powerCut', tile: 7 }, cost, outcome, culpritPublic };
}

/**
 * Month 3 with every slice 3-5 secret in play. Ossa is Sheriff; Lena proposed a law and has since changed her vote to
 * no; an overrule of the tax is in its reveal.
 */
function politicsInPlay(): GameState {
  const state = createGame({ seed: 11, players: SEATS.map((id) => ({ id, name: id, isAi: false })) });
  state.month = MONTH;
  Object.assign(state.politics!, {
    sheriff: 'ossa',
    deals: [
      card('deal-1', 'brix', 'ossa', 'active'),
      card('deal-2', 'lena', 'brix', 'offered', { kind: 'vote', law: true, yes: true }),
      card('deal-3', 'ossa', 'lena', 'active'),
      card('deal-4', 'lena', 'tam', 'broken'),
      card('deal-5', 'tam', 'ossa', 'offered'),
    ],
    sabotage: [
      { ...order('sab-1', 'brix', 'pending', 40), target: { kind: 'rumour', good: 'smithore', dir: 'up' } },
      order('sab-2', 'ossa', 'pending', 50),
      order('sab-3', 'lena', 'done', 60),
      order('sab-4', 'tam', 'caught', 70, true),
      order('sab-5', 'ossa', 'failed', 80),
    ],
    guards: [12, 14],
    rumoured: [
      { good: 'smithore', from: 31 },
      { good: 'food', from: 22 },
    ],
    overrule: {
      month: MONTH,
      target: 'tax',
      caller: 'brix',
      stage: 'reveal',
      clockMs: 0,
      ballots: { brix: false, ossa: true, tam: true },
      done: ['brix', 'ossa', 'tam'],
      result: { passed: false, yes: 2, no: 1, total: 3, needed: 3 },
    },
    council: {
      stage: 'ballot',
      clockMs: 0,
      proposal: { kind: 'enact', law: 'landTax', setting: 5 },
      proposer: 'lena',
      ballots: { lena: false, ossa: true, tam: false },
      done: ['lena', 'ossa', 'tam'],
      result: null,
    },
  });
  return state;
}

const ids = (items: { id: string }[]) => items.map((i) => i.id);

describe('what a seat sees of politics slices 3-5 (HC-4)', () => {
  it('deal cards: a seat sees the cards it is party to, and every broken card', () => {
    const state = politicsInPlay();
    expect(ids(observe(state, 'brix').politics!.deals)).toEqual(['deal-1', 'deal-2', 'deal-4']);
    expect(ids(observe(state, 'tam').politics!.deals)).toEqual(['deal-4', 'deal-5']);
    expect(ids(state.politics!.deals)).toEqual(['deal-1', 'deal-2', 'deal-3', 'deal-4', 'deal-5']);
  });

  it("sabotage: a seat's own orders whole; another's only once done or caught, at no cost and with its culprit only if public", () => {
    const state = politicsInPlay();
    const seen = observe(state, 'brix').politics!.sabotage;
    expect(ids(seen)).toEqual(['sab-1', 'sab-3', 'sab-4']);
    expect(seen[0]).toEqual(state.politics!.sabotage[0]);
    expect(seen[1]).toMatchObject({ by: null, cost: 0, outcome: 'done' });
    expect(seen[2]).toMatchObject({ by: 'tam', cost: 0, outcome: 'caught' });
    expect(observe(state, 'ossa').politics!.sabotage.filter((o) => o.by === 'ossa')).toEqual([
      state.politics!.sabotage[1],
      state.politics!.sabotage[4],
    ]);
    expect(state.politics!.sabotage.map((o) => [o.by, o.cost])).toEqual([['brix', 40], ['ossa', 50], ['lena', 60], ['tam', 70], ['ossa', 80]]);
  });

  it("guards: only the Sheriff sees this month's guarded tiles", () => {
    const state = politicsInPlay();
    expect(observe(state, 'ossa').politics!.guards).toEqual([12, 14]);
    expect(observe(state, 'brix').politics!.guards).toEqual([]);
    expect(state.politics!.guards).toEqual([12, 14]);
  });

  it("overrule: a seat sees only its own ballot, a no included; the result's totals are public", () => {
    const state = politicsInPlay();
    expect(observe(state, 'brix').politics!.overrule!.ballots).toEqual({ brix: false });
    expect(observe(state, 'lena').politics!.overrule!.ballots).toEqual({});
    expect(observe(state, 'lena').politics!.overrule!.result).toEqual(state.politics!.overrule!.result);
    expect(state.politics!.overrule!.ballots).toEqual({ brix: false, ossa: true, tam: true });
  });

  it("S4-T-AC-6: rumoured: a rumour's existence is public, so every seat sees each rumoured good; the price before the shift is the engine's, as a human is not told it either (PM ruling, HC-4)", () => {
    const state = politicsInPlay();
    for (const id of SEATS) expect(observe(state, id).politics!.rumoured, id).toEqual(state.politics!.rumoured.map(({ good }) => ({ good })));
  });

  it("law ballot: the proposer's opening yes is public, never the proposer's current vote; a seat's own entry overrides it", () => {
    const state = politicsInPlay();
    expect(observe(state, 'brix').politics!.council!.ballots).toEqual({ lena: true });
    expect(observe(state, 'ossa').politics!.council!.ballots).toEqual({ lena: true, ossa: true });
    expect(observe(state, 'lena').politics!.council!.ballots).toEqual({ lena: false });
    expect(state.politics!.council!.ballots).toEqual({ lena: false, ossa: true, tam: false });
  });

  it("leak: a seat's politics holds none of the others' secret cards, pending or failed orders, culprits, costs or ballots", () => {
    const state = politicsInPlay();
    const secrets = ['deal-3', 'deal-5', 'sab-2', 'sab-5', '"by":"lena"', '"cost":60', '"cost":70', '"ossa":', '"tam":', '"lena":false'];
    const seen = JSON.stringify(observe(state, 'brix').politics);
    for (const secret of secrets) expect(seen, secret).not.toContain(secret);
    const real = JSON.stringify(state.politics);
    for (const secret of secrets) expect(real, `the real game keeps ${secret}`).toContain(secret);
  });
});
