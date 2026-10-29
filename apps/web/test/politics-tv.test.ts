import type { TaxPromise } from '@mule/engine';
import type { MuleView, PlayerView, PoliticsView, TableView } from '@mule/protocol';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { TableApp } from '../src/table/TableApp';

const player = (id: string, name: string, slot: number): PlayerView => ({ id, name, isAi: false, color: '', species: 'zipwing', money: 1000, worth: 0, plots: 0, ready: false, doneDeveloping: false, condition: null, colonist: null, slot });
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
