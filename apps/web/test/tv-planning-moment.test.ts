import type { DealCard } from '@mule/engine';
import type { MuleView, PlayerView, PoliticsView, TableView } from '@mule/protocol';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { TableApp } from '../src/table/TableApp';
import { aMuleView, aPlayer } from './fixtures/views';

/*
 * SB-5a (the tabbed hub's TV planning, mock hub-tabs src/tv/TvPlanning.tsx CHANGE 2; WS6 ruling 8 Nov, WS4 accepted):
 * a broken deal card is a moment on the TV. Its banner (WS7's TvDeals) overlays the top of the map box, out of flow,
 * so the body's scale never moves for it; the news column keeps the server's line for it.
 */

const PLAYERS: PlayerView[] = [
  aPlayer({ id: 's1', name: 'Lena', slot: 0, reputation: 72 }),
  aPlayer({ id: 's2', name: 'Kai', slot: 1, reputation: 40 }),
  aPlayer({ id: 's3', name: 'Ossa', slot: 2, reputation: 25, isAi: true }),
];
const BROKE: DealCard = { id: 'deal-k', from: 's1', to: 's2', terms: { kind: 'pact' }, offered: 1, until: 4, status: 'broken', brokenBy: 's2', settled: 3 };
const NEWS = 'Kai broke a pact with Lena. Reputation −20.';

function politics(brokenDeals: DealCard[]): PoliticsView {
  return {
    governor: null, sheriff: null, term: null, next: 4, baron: null,
    tax: { percent: 5, start: 5, low: 0, high: 10 }, fund: 0, pay: { governor: 50 },
    weights: [], candidates: { governor: [] }, promises: {}, promise: null, promiseFrom: null, election: null,
    brokenDeals, reputationReasons: {},
  };
}

let state: unknown;
// The TV reads the room through useClientState, whose store has no server snapshot to render from.
vi.mock('../src/net/react', async (actual) => ({ ...(await actual<typeof import('../src/net/react')>()), useClientState: () => state }));

function onTv(brokenDeals: DealCard[]): string {
  const game: MuleView = aMuleView({ phase: 'planning', month: 3, players: PLAYERS, me: null, politics: politics(brokenDeals), news: brokenDeals.length ? [NEWS] : [] });
  const seats = game.players.map((p) => ({ id: p.id, name: p.name, isAi: p.isAi, connected: true, color: p.slot, ...(p.isAi ? { kind: 'builtin' as const } : {}) }));
  const table: TableView<MuleView> = { code: 'MULE', status: 'playing', hostId: 's1', seats, boards: 1, game };
  state = { status: 'open', role: 'board', code: 'MULE', seatId: null, view: table, notice: null, chat: [], emotes: [], toasts: [], clockOffset: 0 };
  const client = { subscribe: () => () => {}, getState: () => state, serverNow: () => 0, watch: () => {} } as unknown as TableClient;
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(TableApp, { room: 'MULE' }) })).replaceAll('<!-- -->', '');
}

/** The markup of the element carrying this data-testid, through its matching closing tag. */
function element(html: string, testid: string): string {
  const open = html.match(new RegExp(`<([a-z]+)[^>]*data-testid="${testid}"[^>]*>`));
  expect(open, `an element with data-testid="${testid}"`).not.toBeNull();
  const tag = open![1]!;
  let depth = 0;
  const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, 'g');
  re.lastIndex = open!.index!;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(open!.index!, m.index + m[0].length);
  }
  throw new Error(`no closing tag for ${testid}`);
}

describe('SB-5a: a broken card is a moment over the TV planning map', () => {
  it('the banner overlays the map box, out of flow, not under the header', () => {
    const html = onTv([BROKE]);
    const box = element(html, 'tv-map-box');
    expect(box).toMatch(/^<div[^>]*class="[^"]*\brelative\b/);
    const moment = element(box, 'tv-moment');
    // Out of flow, over the map's top, above the map's own layers.
    expect(moment).toMatch(/^<div[^>]*class="[^"]*\babsolute\b[^"]*\binset-x-0\b[^"]*\btop-0\b/);
    expect(moment).toContain('data-testid="tv-break-banner"');
    expect(moment).toContain('data-testid="tv-break-deal-k-words"');
    // The moment comes after the map in the box, so it draws over it.
    expect(box.indexOf('data-testid="holo-map"')).toBeLessThan(box.indexOf('data-testid="tv-moment"'));
    // Not in the planning header, where it would push the body down and scale it.
    const header = html.slice(html.indexOf('data-testid="tv-planning"'), html.indexOf('data-testid="tv-map-box"'));
    expect(header).not.toContain('tv-break-banner');
  });

  it('the news column keeps the server\'s line for the break', () => {
    expect(onTv([BROKE])).toContain(NEWS);
  });

  it('with no break this month, the box draws no moment', () => {
    expect(onTv([])).not.toContain('data-testid="tv-moment"');
    expect(onTv([{ ...BROKE, settled: 2 }])).not.toContain('tv-break-banner');
  });
});
