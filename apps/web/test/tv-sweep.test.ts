import type { MarketRow, MuleView, TableView } from '@mule/protocol';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { TableApp } from '../src/table/TableApp';
import { aMuleView, aPlayer } from './fixtures/views';

/** The TV's words a screen sweep (6 Nov) found wrong: the land grant's plot count and the store tiles' prices. */

const PLAYERS = [aPlayer({ id: 's1', name: 'Lena', slot: 0, plots: 1 }), aPlayer({ id: 's2', name: 'Ossa', slot: 1, plots: 3 })];

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

const market = (good: MarketRow['good'], price: number, cover: number): MarketRow => ({ good, price, storeBuys: null, storeSells: price, storeStock: 0, cover, demand: 1, shipPays: null });

describe('the TV, after the 6 November screen sweep', () => {
  it('SWEEP-B15: the land grant counts one plot as "1 plot", more as "plots"', () => {
    const html = text(onTv(aMuleView({ phase: 'landGrant', players: PLAYERS, me: null, politics: null })));
    expect(html).toContain('Lena 1 plot');
    expect(html).not.toContain('1 plots');
    expect(html).toContain('Ossa 3 plots');
  });

  it('SWEEP-A10: a store tile prints its price in credits; "no demand" and a short cover keep their own words and colours', () => {
    const rows = [market('food', 156, 0), market('water', 14, 1.8), market('rareEarth', 60, 99)];
    const tiles = element(onTv(aMuleView({ month: 3, players: PLAYERS, me: null, politics: null, market: rows })), 'tv-market');
    expect(text(tiles)).toBe('Food 156 cr 0 months cover Water 14 cr 1.8 months cover Rare earth 60 cr no demand');
    expect(tiles).toMatch(/class="[^"]*text-alert[^"]*">0 months cover</);
    expect(tiles).toMatch(/class="[^"]*text-ink-3[^"]*">no demand</);
  });
});
