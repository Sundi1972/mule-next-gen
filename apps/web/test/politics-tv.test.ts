import { POLITICS, type DealCard, type TaxPromise } from '@mule/engine';
import type { MuleView, PlayerView, PoliticsView, TableView } from '@mule/protocol';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { TableApp } from '../src/table/TableApp';
import { TvDeals } from '../src/table/TvDeals';

const player = (id: string, name: string, slot: number): PlayerView => ({ id, name, isAi: false, color: '', species: 'zipwing', money: 1000, worth: 0, lastWorth: null, worthBeforeCut: null, plots: 0, ready: false, doneDeveloping: false, condition: null, colonist: null, slot });
const PLAYERS = [player('s1', 'Lena', 0), player('s2', 'Ossa', 1), player('s3', 'Kai', 2)];

const politics = (extra: Partial<PoliticsView>): PoliticsView => ({
  governor: null,
  sheriff: null,
  term: null,
  next: 7,
  baron: null,
  tax: { percent: 5, start: 5, low: 0, high: 10 },
  fund: 0,
  pay: { governor: 50 },
  weights: [],
  candidates: { governor: [] },
  promises: {},
  promise: null,
  promiseFrom: null,
  election: null,
  ...extra,
});

const game = (p: PoliticsView | null, month: number): MuleView => ({
  finished: false,
  month,
  maxMonths: 12,
  phase: 'planning',
  phaseEndsAt: null,
  width: 1,
  height: 1,
  tiles: [],
  lit: null,
  players: PLAYERS,
  me: null,
  market: [],
  storeMules: 0,
  mulePrice: 0,
  colonists: 0,
  air: { level: 22, band: 'clean' },
  lastAir: null,
  colonistsFed: null,
  ship: { arrives: 3, inPort: false, wants: null },
  treasury: { money: 0, salesTax: (p?.tax.percent ?? 5) / 100 },
  news: [],
  scores: null,
  auction: null,
  listings: [],
  lotSlots: { used: 0, max: 4 },
  landAuction: null,
  production: null,
  politics: p,
});

let state: { status: 'open'; role: 'board'; code: string; seatId: null; view: TableView<MuleView>; notice: null; chat: []; emotes: []; toasts: []; clockOffset: number };

// The TV reads the room through useClientState, whose store has no server snapshot to render from.
vi.mock('../src/net/react', async (actual) => ({ ...(await actual<typeof import('../src/net/react')>()), useClientState: () => state }));

/** The TV's screen in planning for this game. */
function onTv(g: MuleView): string {
  const table: TableView<MuleView> = { code: 'MULE', status: 'playing', hostId: 's1', seats: PLAYERS.map((p) => ({ id: p.id, name: p.name, isAi: false, connected: true, color: p.slot })), boards: 1, game: g };
  state = { status: 'open', role: 'board', code: 'MULE', seatId: null, view: table, notice: null, chat: [], emotes: [], toasts: [], clockOffset: 0 };
  const client = { subscribe: () => () => {}, getState: () => state, serverNow: () => 0, watch: () => {} } as unknown as TableClient;
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(TableApp, { room: 'MULE' }) })).replaceAll('<!-- -->', '');
}

const tagOf = (html: string, testid: string) => html.match(new RegExp(`<[a-z]+[^>]*data-testid="${testid}"[^>]*>`))?.[0];

/** The text inside the element carrying this data-testid, tags stripped, up to its own closing tag. */
function textOf(html: string, testid: string): string {
  const open = tagOf(html, testid);
  expect(open, `an element with data-testid="${testid}"`).toBeDefined();
  const tag = /^<([a-z][a-z0-9]*)/.exec(open!)![1]!;
  const from = html.indexOf(open!) + open!.length;
  const tags = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
  tags.lastIndex = from;
  let depth = 1;
  let end = from;
  for (let m = tags.exec(html); m && depth > 0; m = tags.exec(html)) {
    depth += m[1] ? -1 : 1;
    end = m.index;
  }
  return html.slice(from, end).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

const CAP_4: TaxPromise = { kind: 'cap', percent: 4 };
const HOLD: TaxPromise = { kind: 'hold' };
const LOWER: TaxPromise = { kind: 'lower' };

/** Month `month`, Ossa Governor since month 4 on `promise` from a tax of `from`, the tax at `percent` from this month's `start`. */
const governed = (promise: TaxPromise | null, percent: number, start: number, month = 5, from: number | null = 5) =>
  game(politics({ governor: 's2', term: [4, 6], promise, promiseFrom: from, tax: { percent, start, low: 0, high: 10 } }), month);

describe("the TV's planning header (T-AC-70, E-7)", () => {
  it.each<[string, MuleView, string, string]>([
    ['kept', governed(CAP_4, 4, 4), 'Governor Ossa · promised up to 4% · tax 4%, kept', 'text-ok'],
    ['broken', governed(CAP_4, 6, 6), 'Governor Ossa · promised up to 4% · tax 6%, promise broken', 'text-alert'],
    ['lower, kept against the tax when the term began', governed(LOWER, 4, 4), 'Governor Ossa · promised lower it · tax 4%, kept', 'text-ok'],
    ['hold, broken against the tax when the term began', governed(HOLD, 7, 7), 'Governor Ossa · promised keep it at 5% · tax 7%, promise broken', 'text-alert'],
    ['the new Governor has yet to set it', governed(CAP_4, 5, 5, 4, 5), 'Governor Ossa · promised up to 4% · tax still 5%', 'text-warn'],
  ])("T-AC-70: the TV's planning header says whether the Governor keeps their promise (%s)", (_, g, line, tone) => {
    const html = onTv(g);
    const header = html.indexOf('data-testid="tv-phase"');
    const promise = html.indexOf('data-testid="tv-governor-promise"');
    expect(header, 'the planning header').toBeGreaterThanOrEqual(0);
    expect(promise, 'the promise line under the header').toBeGreaterThan(header);
    expect(promise, 'the promise line before the map').toBeLessThan(html.indexOf('data-testid="holo-map"'));
    expect(textOf(html, 'tv-governor-promise')).toBe(line);
    expect(tagOf(html, 'tv-promise-status')).toContain(tone);
  });

  it("T-AC-70: with nobody Governor the TV's planning header has no promise line", () => {
    const html = onTv(game(politics({}), 2));
    expect(html).toContain('data-testid="tv-phase"');
    expect(tagOf(html, 'tv-governor-promise')).toBeUndefined();
  });

  it('T-AC-70: an appointed Governor made no promise: the TV names them, with nothing to keep', () => {
    const html = onTv(governed(null, 5, 5));
    expect(textOf(html, 'tv-governor-promise')).toBe('Governor Ossa');
    expect(tagOf(html, 'tv-promise-status')).toBeUndefined();
  });

  it('T-AC-70: a game without politics has no promise line', () => {
    expect(tagOf(onTv(game(null, 2)), 'tv-governor-promise')).toBeUndefined();
  });
});

describe("the TV's break banner (S3-C20)", () => {
  /** Month 8's table: Ossa is a computer seat; reputations as after the breaks below. */
  const SEATS: PlayerView[] = [
    { ...player('lena', 'Lena', 0), reputation: 40 },
    { ...player('ossa', 'Ossa', 1), isAi: true, reputation: 62 },
    { ...player('brix', 'Brix', 2), reputation: 61 },
    { ...player('kai', 'Kai', 3), reputation: 44 },
  ];
  const card = (over: Partial<DealCard> & Pick<DealCard, 'id' | 'from' | 'to' | 'terms'>): DealCard => ({ offered: 5, until: 8, status: 'broken', brokenBy: over.from, settled: 8, ...over });
  const LENA_VOTE = card({ id: 'deal-b3x8re', from: 'lena', to: 'brix', terms: { kind: 'vote', office: 'governor', candidate: 'brix' } });
  const OSSA_LAW = card({ id: 'deal-z5n1yq', from: 'ossa', to: 'kai', terms: { kind: 'vote', law: true, yes: true } });
  const LENA_PACT = card({ id: 'deal-q7k2m9', from: 'lena', to: 'brix', terms: { kind: 'pact' } });

  const atMonth = (brokenDeals: DealCard[] | undefined, month = 8): MuleView => ({ ...game(politics({ ...(brokenDeals ? { brokenDeals } : {}) }), month), players: SEATS });
  const banner = (g: MuleView) => renderToStaticMarkup(createElement(TvDeals, { game: g })).replaceAll('<!-- -->', '');
  const marks = (html: string) => html.match(/data-testid="ai-mark"/g)?.length ?? 0;

  /** The test ids in the banner, in order, that start with `prefix`. */
  const ids = (html: string, prefix: string) => [...html.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1]!).filter((id) => id.startsWith(prefix));
  const { voteBroken, pactBroken } = POLITICS.reputation.moves;

  it('S3-B-AC-2: when a card in politics.brokenDeals is new, TvDeals shows a banner naming who broke a promise to whom, what was promised and the drop', () => {
    const html = banner(atMonth([LENA_VOTE]));
    expect(html).toContain('data-testid="tv-break-banner"');
    expect(textOf(html, 'tv-break-lena')).toContain('A promise was broken');
    expect(textOf(html, 'tv-break-deal-b3x8re-words')).toBe('Lena broke a promise to Brix: a vote for Brix');
    // The drop alone, beside the breaker's chip with the number now: no "before" worked back from it.
    expect(textOf(html, 'tv-break-lena-drop')).toBe(`−${-voteBroken}`);
    expect(textOf(html, 'tv-break-lena-rep')).toBe('40');
    expect(textOf(html, 'tv-break-lena')).not.toContain('→');
    expect(marks(html), 'Lena is a person: no AI mark').toBe(0);
  });

  it("S3-B-AC-2: the drop is POLITICS' move, never a typed number: a pact's, and a retuned move", () => {
    expect(textOf(banner(atMonth([LENA_PACT])), 'tv-break-lena-drop')).toBe(`−${-pactBroken}`);
    expect(textOf(banner(atMonth([LENA_PACT])), 'tv-break-lena')).toContain('A pact was broken');
    expect(textOf(banner(atMonth([LENA_PACT])), 'tv-break-deal-q7k2m9-words')).toBe('Lena broke a pact with Brix');
    const moves = POLITICS.reputation.moves as { voteBroken: number };
    const was = moves.voteBroken;
    try {
      moves.voteBroken = -7;
      expect(textOf(banner(atMonth([LENA_VOTE])), 'tv-break-lena-drop')).toBe('−7');
    } finally {
      moves.voteBroken = was;
    }
  });

  it("S3-B-AC-2: one breaker's cards broken in the month make one line with the drops summed; another breaker has a line of its own", () => {
    const html = banner(atMonth([LENA_VOTE, OSSA_LAW, LENA_PACT]));
    expect(ids(html, 'tv-break-').filter((id) => !/-(words|drop|rep)$/.test(id) && id !== 'tv-break-banner')).toEqual(['tv-break-lena', 'tv-break-ossa']);
    expect(textOf(html, 'tv-break-lena-drop')).toBe(`−${-(voteBroken + pactBroken)}`);
    expect(textOf(html, 'tv-break-ossa-drop')).toBe(`−${-voteBroken}`);
    expect(ids(html, 'tv-break-deal-').filter((id) => id.endsWith('-words'))).toEqual(['tv-break-deal-b3x8re-words', 'tv-break-deal-q7k2m9-words', 'tv-break-deal-z5n1yq-words']);
  });

  it('S3-B-AC-2: a computer seat that breaks a promise is named "Ossa · AI" on the banner, from players[].isAi; a person\'s name has no mark', () => {
    const html = banner(atMonth([OSSA_LAW, LENA_VOTE]));
    expect(textOf(html, 'tv-break-deal-z5n1yq-words')).toBe('Ossa · AI broke a promise to Kai: a yes on the law');
    expect(textOf(html, 'tv-break-deal-b3x8re-words')).toBe('Lena broke a promise to Brix: a vote for Brix');
    // The mark follows the seat, not the name: a person and a computer seat may share one.
    const twins = { ...atMonth([LENA_VOTE]), players: SEATS.map((p) => (p.id === 'lena' || p.id === 'brix' ? { ...p, name: 'Sam', isAi: p.id === 'brix' } : p)) };
    expect(textOf(banner(twins), 'tv-break-deal-b3x8re-words')).toBe('Sam broke a promise to Sam · AI: a vote for Sam · AI');
  });

  it.each<[string, MuleView]>([
    ['a kept card: brokenDeals holds none', atMonth([])],
    ['a card broken in an earlier month', atMonth([{ ...LENA_VOTE, settled: 6 }])],
    ['a card broken last month', atMonth([{ ...LENA_VOTE, settled: 7 }])],
    ['an older server with no brokenDeals', atMonth(undefined)],
    ['a game without politics', { ...game(null, 8), players: SEATS }],
  ])('S3-B-AC-2: no new broken card, no banner (%s)', (_, g) => {
    expect(banner(g)).toBe('');
  });
});
