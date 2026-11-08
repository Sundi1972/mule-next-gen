import type { MuleView, TableView } from '@mule/protocol';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { TableApp } from '../src/table/TableApp';
import { aMuleView, aPlayer } from './fixtures/views';

/** Heiko, 7 Nov: a computer seat is always marked, in every ticker; the TV's news column carries it from newsLines' seats. */

const PLAYERS = [
  aPlayer({ id: 's1', name: 'Lena', slot: 0, isAi: false }),
  aPlayer({ id: 's2', name: 'Ossa', slot: 1, isAi: true }),
  aPlayer({ id: 's3', name: 'Al', slot: 2, isAi: true }),
];

let state: unknown;
// The TV reads the room through useClientState, whose store has no server snapshot to render from.
vi.mock('../src/net/react', async (actual) => ({ ...(await actual<typeof import('../src/net/react')>()), useClientState: () => state }));

function onTv(game: MuleView): string {
  const table: TableView<MuleView> = { code: 'MULE', status: 'playing', hostId: 's1', seats: PLAYERS.map((p) => ({ id: p.id, name: p.name, isAi: p.isAi, connected: true, color: p.slot })), boards: 1, game };
  state = { status: 'open', role: 'board', code: 'MULE', seatId: null, view: table, notice: null, chat: [], emotes: [], toasts: [], clockOffset: 0 };
  const client = { subscribe: () => () => {}, getState: () => state, serverNow: () => 0, watch: () => {} } as unknown as TableClient;
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(TableApp, { room: 'MULE' }) })).replaceAll('<!-- -->', '');
}

const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const items = (html: string) => [...html.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((m) => m[1]!);
const newsOf = (html: string) => items(html.match(/<ul[^>]*data-testid="tv-news"[^>]*>(.*?)<\/ul>/)![1]!);

const BROKE = 'Ossa broke a promise to Lena: a vote for Ossa. Reputation −10.';
const ALSO = 'Also: Al bought a plot from Lena for 120.';
const lines: MuleView['newsLines'] = [
  { text: BROKE, who: ['s2', 's1', 's2'] },
  { text: ALSO, who: ['s3', 's1'] },
];

describe("the TV's news column marks a computer seat (Heiko, 7 Nov)", () => {
  it.each(['planning', 'production'] as const)('%s: every computer seat named in a line reads "· AI" where it stands; a person has no mark', (phase) => {
    const html = onTv(aMuleView({ phase, players: PLAYERS, me: null, politics: null, news: [BROKE, ALSO], newsLines: lines, production: null } as Parameters<typeof aMuleView>[0]));
    const [broke, also] = newsOf(html);
    expect(text(broke!)).toBe('Ossa · AI broke a promise to Lena: a vote for Ossa · AI. Reputation −10.');
    expect(broke!.match(/data-testid="ai-mark"/g)).toHaveLength(2);
    // "Al" is a whole name, never the start of "Also".
    expect(text(also!)).toBe('Also: Al · AI bought a plot from Lena for 120.');
  });

  it('without newsLines (an older server), or when a line names no seat, the words show as they are', () => {
    const old = onTv(aMuleView({ phase: 'planning', players: PLAYERS, me: null, politics: null, news: [BROKE] }));
    expect(newsOf(old).map(text)).toEqual([BROKE]);
    expect(old.match(/<ul[^>]*data-testid="tv-news"[^>]*>(.*?)<\/ul>/)![1]).not.toContain('ai-mark');
    const none = onTv(aMuleView({ phase: 'planning', players: PLAYERS, me: null, politics: null, news: [BROKE], newsLines: [{ text: BROKE, who: [] }] }));
    expect(newsOf(none).map(text)).toEqual([BROKE]);
  });
});
