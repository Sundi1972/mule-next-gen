import type { MuleView, TableView } from '@mule/protocol';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { TableApp } from '../src/table/TableApp';
import { aMuleView, aPlayer } from './fixtures/views';

/** Heiko, 7 Nov: a computer seat is always marked, so children know who is talking; the TV's players strip carries it too. */

const PLAYERS = [aPlayer({ id: 's1', name: 'Lena', slot: 0, plots: 1 }), aPlayer({ id: 's2', name: 'Kai', slot: 1, plots: 3, isAi: true })];

let state: unknown;
// The TV reads the room through useClientState, whose store has no server snapshot to render from.
vi.mock('../src/net/react', async (actual) => ({ ...(await actual<typeof import('../src/net/react')>()), useClientState: () => state }));

function onTv(game: MuleView): string {
  const table: TableView<MuleView> = { code: 'MULE', status: 'playing', hostId: 's1', seats: PLAYERS.map((p) => ({ id: p.id, name: p.name, isAi: p.isAi, connected: true, color: p.slot })), boards: 1, game };
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

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe("the TV's players strip marks a computer seat (Heiko, 7 Nov)", () => {
  it('the land grant: Kai reads "Kai · AI", Lena (a person) has no mark', () => {
    const html = onTv(aMuleView({ phase: 'landGrant', players: PLAYERS, me: null, politics: null }));
    const kai = element(html, 'tv-player-s2');
    expect(text(kai)).toBe('Kai · AI 3 plots');
    // The mark sits outside the name's truncation, so a long name never cuts it off.
    expect(element(kai, 'tv-player-name')).not.toContain('ai-mark');
    expect(kai).toContain('data-testid="ai-mark"');
    expect(element(html, 'tv-player-s1')).not.toContain('ai-mark');
  });

  it('a phase whose own screen has not come up yet: the mark says AI once, so the right column no longer repeats it', () => {
    const players = PLAYERS.map((p) => ({ ...p, ready: p.isAi }));
    const html = onTv(aMuleView({ phase: 'auction', players, me: null, politics: null, auction: null } as Parameters<typeof aMuleView>[0]));
    expect(text(element(html, 'tv-player-s2'))).toBe('Kai · AI READY');
    expect(text(element(html, 'tv-player-s1'))).toBe('Lena …');
  });
});
