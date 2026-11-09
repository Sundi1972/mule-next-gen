import { POLITICS, type DealCard } from '@mule/engine';
import type { ColonyView, MuleView, PoliticsView } from '@mule/protocol';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { TvMonthEnd } from '../src/table/TableApp';
import { aMuleView, aPlayer } from './fixtures/views';

/**
 * S3-C20 at the TV's month end (PM ruling A, 8 Nov, over the mock's box, which drew six seats at 0.560): the breaker's
 * league row says what this month's broken cards cost them, "✗ −10" after the chip, its label the whole public words.
 * No height: the full list is the phones' month end; the TV says it in full in planning's banner and the news.
 */

const PLAYERS = [
  aPlayer({ id: 'k', name: 'Kai', slot: 0, reputation: 60 }),
  aPlayer({ id: 'l', name: 'Lena', slot: 1, reputation: 55 }),
  aPlayer({ id: 'o', name: 'Ossa', slot: 2, reputation: 40, isAi: true }),
];
const { voteBroken, pactBroken } = POLITICS.reputation.moves;
const card = (over: Partial<DealCard> & Pick<DealCard, 'id' | 'from' | 'to'>): DealCard => ({ terms: { kind: 'pact' }, offered: 1, until: 4, status: 'broken', brokenBy: null, settled: 3, ...over });
const BROKEN: DealCard[] = [
  card({ id: 'deal-a', from: 'o', to: 'k', terms: { kind: 'vote', office: 'governor', candidate: 'o' }, brokenBy: 'o' }),
  card({ id: 'deal-b', from: 'l', to: 'k', brokenBy: 'k' }),
  card({ id: 'deal-c', from: 'l', to: 'o', brokenBy: 'l', settled: 2 }),
];

function politics(brokenDeals: DealCard[]): PoliticsView {
  return {
    governor: null, sheriff: null, term: null, next: 4, baron: null,
    tax: { percent: 5, start: 5, low: 0, high: 10 }, fund: 0, pay: { governor: 50 },
    weights: [], candidates: { governor: [] }, promises: {}, promise: null, promiseFrom: null, election: null,
    brokenDeals, reputationReasons: {},
  };
}
const COLONY: ColonyView = {
  gauges: { wealth: 26_400, environment: 34, prestige: 2, happiness: 64, band: 'content' },
  lastGauges: { wealth: 24_900, prestige: 2, happiness: 58 },
  fund: 438,
  ledger: { month: 3, in: { salesTax: 900 }, out: { officePay: 300 } },
  projects: [],
  catalogue: [],
  score: null,
};

const client = { subscribe: () => () => {}, getState: () => ({ status: 'open', role: 'board', code: 'MULE', seatId: null, view: null, chat: [], emotes: [], toasts: [], clockOffset: 0 }), serverNow: () => 0, intent: () => {}, watch: () => {} } as unknown as TableClient;
const onTv = (game: MuleView) => renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(TvMonthEnd, { game }) })).replaceAll('<!-- -->', '');
const monthEnd = (brokenDeals: DealCard[], over: Partial<MuleView> = {}) => aMuleView({ phase: 'upkeep', month: 3, players: PLAYERS, me: null, politics: politics(brokenDeals), ...over });

/** The league row's mark for this player: its words and its label, or null. */
function mark(html: string, id: string): { words: string; label: string } | null {
  const m = html.match(new RegExp(`<span[^>]*data-testid="league-broke-${id}"[^>]*>(.*?)</span>`));
  if (!m) return null;
  return { words: m[1]!.replace(/<[^>]+>/g, ''), label: m[0].match(/aria-label="([^"]*)"/)![1]! };
}

describe("the TV month end's broken cards (S3-C20, PM ruling A)", () => {
  it.each([
    ['without the colony gauges', {}],
    ['beside the colony gauges', { colony: COLONY }],
  ])("%s: each breaker's league row says what this month's breaks cost, after the chip; the label says it whole", (_, over) => {
    const html = onTv(monthEnd(BROKEN, over));
    expect(mark(html, 'o')).toEqual({ words: `✗ −${-voteBroken}`, label: `Broke this month: Ossa broke a promise to Kai: a vote for Ossa. Reputation −${-voteBroken}.` });
    expect(mark(html, 'k')).toEqual({ words: `✗ −${-pactBroken}`, label: `Broke this month: Kai broke a pact with Lena. Reputation −${-pactBroken}.` });
    // Lena's break was last month's: her row has none. And no list.
    expect(mark(html, 'l')).toBeNull();
    expect(html).not.toContain('broken-cards');
    // After the chip, in the name's cell.
    const row = html.slice(html.indexOf('data-testid="league-row-o"'));
    expect(row.indexOf('league-rep-o')).toBeLessThan(row.indexOf('league-broke-o'));
  });

  it('two breaks by one player: the row adds them up, the label says both', () => {
    const twice = [...BROKEN, card({ id: 'deal-d', from: 'o', to: 'l', brokenBy: 'o' })];
    expect(mark(onTv(monthEnd(twice)), 'o')).toEqual({
      words: `✗ −${-(voteBroken + pactBroken)}`,
      label: `Broke this month: Ossa broke a promise to Kai: a vote for Ossa; Ossa broke a pact with Lena. Reputation −${-(voteBroken + pactBroken)}.`,
    });
  });

  it('a month with no broken card, or politics off, marks no row', () => {
    expect(onTv(monthEnd([BROKEN[2]!]))).not.toContain('league-broke-');
    expect(onTv(aMuleView({ phase: 'upkeep', month: 3, players: PLAYERS, me: null, politics: null }))).not.toContain('league-broke-');
  });
});
