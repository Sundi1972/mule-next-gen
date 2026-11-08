import type { MuleView, TableView } from '@mule/protocol';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { TableApp } from '../src/table/TableApp';
import { aMuleView, aPlayer } from './fixtures/views';

/**
 * TV-FIT on planning at a table of people (PM ruling 8 Nov; e2e tv-planning-fit.ts measured trunk at 0.636 with four
 * people and 0.568 with six): from four seats the side drops the box of who the table waits for, and the ready list
 * says it, each row PLANNING or READY; the host's row says the table may go on without the others. Three seats or
 * fewer keep the box, which fits.
 */

const people = (n: number, ready: string[] = []) =>
  ['Lena', 'Kai', 'Ossa', 'Brix', 'Juno', 'Rex'].slice(0, n).map((name, i) => aPlayer({ id: `s${i + 1}`, name, slot: i, ready: ready.includes(`s${i + 1}`) }));

let state: unknown;
// The TV reads the room through useClientState, whose store has no server snapshot to render from.
vi.mock('../src/net/react', async (actual) => ({ ...(await actual<typeof import('../src/net/react')>()), useClientState: () => state }));

function onTv(players: ReturnType<typeof people>): string {
  const game = aMuleView({ phase: 'planning', players, me: null, politics: null });
  const table: TableView<MuleView> = { code: 'MULE', status: 'playing', hostId: 's1', seats: players.map((p) => ({ id: p.id, name: p.name, isAi: p.isAi, connected: true, color: p.slot })), boards: 1, game };
  state = { status: 'open', role: 'board', code: 'MULE', seatId: null, view: table, notice: null, chat: [], emotes: [], toasts: [], clockOffset: 0 };
  const client = { subscribe: () => () => {}, getState: () => state, serverNow: () => 0, watch: () => {} } as unknown as TableClient;
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(TableApp, { room: 'MULE' }) })).replaceAll('<!-- -->', '');
}

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

describe('TV planning at a table of people (TV-FIT, PM ruling 8 Nov)', () => {
  it.each([4, 6])('%s seats: no waiting box; each row says PLANNING or READY, and the ready host\'s row that the table may go on', (n) => {
    const html = onTv(people(n, ['s1', 's2']));
    expect(html).not.toContain('data-testid="tv-waiting"');
    expect(html).not.toContain('can continue without them');
    expect(text(element(html, 'tv-state-s1'))).toBe('READY · CAN CONTINUE');
    expect(text(element(html, 'tv-state-s2'))).toBe('READY');
    expect(text(element(html, 'tv-state-s3'))).toBe('PLANNING');
  });

  it('4 seats, everyone ready: no "Everyone is ready" box either; the rows say it', () => {
    const html = onTv(people(4, ['s1', 's2', 's3', 's4']));
    expect(html).not.toContain('Everyone is ready');
    expect(text(element(html, 'tv-state-s1'))).toBe('READY');
  });

  it('3 seats keep the box, the host\'s line in it, and the rows as they were', () => {
    const html = onTv(people(3, ['s1']));
    expect(text(element(html, 'tv-waiting'))).toContain('Lena, the host, can continue without them.');
    expect(text(element(html, 'tv-state-s1'))).toBe('READY');
  });
});
