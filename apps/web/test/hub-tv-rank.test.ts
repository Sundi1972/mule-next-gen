import type { MuleView, TableView } from '@mule/protocol';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { TableApp } from '../src/table/TableApp';
import { aMuleView, aPlayer } from './fixtures/views';

/**
 * H-4 on the TV (UX audit): planning's ready list gains each player's place by Worth, the number everyone sees. The TV
 * view carries no `me`, so no one's Worth lines; the list shows a place, never a breakdown or anyone's goods.
 */

/** Ossa leads by Worth; Lena and Kai share second; Lena's money is the most, and does not rank her. */
const PLAYERS = [
  aPlayer({ id: 's1', name: 'Lena', slot: 0, money: 9_000, worth: 3_000 }),
  aPlayer({ id: 's2', name: 'Ossa', slot: 1, money: 1_000, worth: 5_000, ready: true }),
  aPlayer({ id: 's3', name: 'Kai', slot: 2, money: 500, worth: 3_000 }),
];

let state: unknown;
// The TV reads the room through useClientState, whose store has no server snapshot to render from.
vi.mock('../src/net/react', async (actual) => ({ ...(await actual<typeof import('../src/net/react')>()), useClientState: () => state }));

function onTv(game: MuleView, players = PLAYERS): string {
  const table: TableView<MuleView> = { code: 'MULE', status: 'playing', hostId: 's1', seats: players.map((p) => ({ id: p.id, name: p.name, isAi: p.isAi, connected: true, color: p.slot })), boards: 1, game };
  state = { status: 'open', role: 'board', code: 'MULE', seatId: null, view: table, notice: null, chat: [], emotes: [], toasts: [], clockOffset: 0 };
  const client = { subscribe: () => () => {}, getState: () => state, serverNow: () => 0, watch: () => {} } as unknown as TableClient;
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(TableApp, { room: 'MULE' }) })).replaceAll('<!-- -->', '');
}

describe("the TV's ready list (H-4)", () => {
  it("H-4: each player's row says their place by Worth, a shared Worth a shared place", () => {
    const html = onTv(aMuleView({ month: 4, players: PLAYERS, me: null, politics: null }));
    const list = html.slice(html.indexOf('data-testid="tv-ready-list"'), html.indexOf('</ul>', html.indexOf('data-testid="tv-ready-list"')));
    const rank = (id: string) => list.match(new RegExp(`data-testid="tv-rank-${id}"[^>]*>([^<]*)<`))?.[1];
    expect([rank('s1'), rank('s2'), rank('s3')]).toEqual(['2nd', '1st', '2nd']);
    // The rows stay in seat order, as the ready list has them; only the place is new.
    expect([...list.matchAll(/data-testid="tv-rank-(s\d)"/g)].map((m) => m[1])).toEqual(['s1', 's2', 's3']);
  });

  it("H-4: from five seats the AIs share one row, and each AI's place is in it beside its name", () => {
    // Two people and four AIs; Brix and Kai, AIs, lead.
    const six = [
      aPlayer({ id: 's1', name: 'Lena', slot: 0, worth: 3_000 }),
      aPlayer({ id: 's2', name: 'Ossa', slot: 1, worth: 1_000 }),
      aPlayer({ id: 's3', name: 'Brix', slot: 2, isAi: true, worth: 6_000 }),
      aPlayer({ id: 's4', name: 'Kai', slot: 3, isAi: true, worth: 5_000 }),
      aPlayer({ id: 's5', name: 'Pip', slot: 4, isAi: true, worth: 2_000 }),
      aPlayer({ id: 's6', name: 'Zed', slot: 5, isAi: true, worth: 500 }),
    ];
    const html = onTv(aMuleView({ month: 4, players: six, me: null, politics: null }), six);
    const from = html.indexOf('data-testid="tv-ready-list"');
    const list = html.slice(from, html.indexOf('</ul>', from));
    expect(list).toContain('data-testid="tv-ready-ais"');
    const places = [...list.matchAll(/data-testid="tv-rank-(s\d)"[^>]*>([^<]*)</g)].map((m) => [m[1], m[2]] as const);
    // Every seat's place shows exactly once, and the places run from 1st to the last.
    expect(places.map(([id]) => id).sort()).toEqual(six.map((p) => p.id));
    expect(places.map(([, place]) => place).sort()).toEqual(['1st', '2nd', '3rd', '4th', '5th', '6th']);
    const ais = list.slice(list.indexOf('data-testid="tv-ready-ais"'));
    expect(ais.replace(/<[^>]+>/g, '')).toContain('Brix 1st, Kai 2nd, Pip 4th, Zed 6th');
  });

  it("H-4 (negative): the TV shows nobody's Worth lines", () => {
    const html = onTv(aMuleView({ month: 4, players: PLAYERS, me: null, politics: null }));
    for (const id of ['standings-mine', 'your-worth', 'standings-sheet']) expect(html, id).not.toContain(`data-testid="${id}"`);
    expect(html).not.toMatch(/Your worth|units</);
  });
});
