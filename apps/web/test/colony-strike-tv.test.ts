import type { ColonyView, MuleView, PlayerView, PoliticsView, TableView, TileView } from '@mule/protocol';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { TableApp } from '../src/table/TableApp';
import { aMuleView, aPlayer } from './fixtures/views';

/**
 * The general strike on the TV (G-5 C37, WS8's PR-E1), from views the server could send: the header's badge, and in
 * planning a striker on every plot of the struck good until the fund pays. With politics off, or no strike, the TV is today's.
 */

const PLAYERS: PlayerView[] = [aPlayer({ id: 's1', name: 'Lena', slot: 0 }), aPlayer({ id: 's2', name: 'Kai', slot: 1 }), aPlayer({ id: 's3', name: 'Ossa', slot: 2 })];

const tile = (x: number, y: number, owner: string | null, outfit: TileView['outfit']): TileView => ({ x, y, terrain: 'plains', peaks: 0, owner, outfit, pollution: 0, filter: false });
/** Two Food farms (Lena's and Ossa's), an Energy plot of Kai's, an empty plot of Kai's, and free land. */
const TILES: TileView[] = [tile(0, 0, 's1', 'food'), tile(1, 0, 's2', 'energy'), tile(2, 0, 's3', 'food'), tile(3, 0, 's2', null), tile(0, 1, null, null), tile(1, 1, null, null), tile(2, 1, null, null), tile(3, 1, null, null)];

const politics: PoliticsView = {
  governor: 's2',
  sheriff: null,
  term: [4, 6],
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
};

const colony = (strike: ColonyView['strike']): ColonyView => ({
  gauges: { wealth: 26_400, environment: 34, prestige: 2, happiness: 44, band: 'restless' },
  lastGauges: null,
  fund: 2_340,
  ledger: null,
  projects: [],
  catalogue: [],
  strike,
  score: null,
});

const UNPAID = { good: 'food' as const, cost: 240, paid: false };
const PAID = { ...UNPAID, paid: true };

const game = (c: ColonyView | null, over: Partial<MuleView> = {}): MuleView =>
  aMuleView({ players: PLAYERS, me: null, politics: c ? politics : null, month: 5, width: 4, height: 2, tiles: TILES, ...(c ? { colony: c } : {}), ...over });

let state: { status: 'open'; role: 'board'; code: string; seatId: null; view: TableView<MuleView>; notice: null; chat: []; emotes: []; toasts: []; clockOffset: number };

// The TV reads the room through useClientState, whose store has no server snapshot to render from.
vi.mock('../src/net/react', async (actual) => ({ ...(await actual<typeof import('../src/net/react')>()), useClientState: () => state }));

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
  return html.slice(from, end).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

const strikers = (html: string) => [...html.matchAll(/data-testid="striker-(\d+)-(\d+)"/g)].map((m) => `${m[1]},${m[2]}`).sort();

describe('the general strike on the TV (C37)', () => {
  it('B-AC-37-1: the header badge reads "STRIKE · Food 20%" while unpaid, "PAID · −240 cr" once paid, and is absent with no strike', () => {
    expect(textOf(onTv(game(colony(UNPAID))), 'strike-badge')).toBe('STRIKE · Food 20%');
    expect(textOf(onTv(game(colony(PAID))), 'strike-badge')).toBe('PAID · −240 cr');
    expect(onTv(game(colony(null)))).not.toContain('data-testid="strike-badge"');
  });

  it('B-AC-37-1: the badge rides the header in every phase that draws the colony gauges, such as the month end', () => {
    expect(textOf(onTv(game(colony(UNPAID), { phase: 'upkeep' })), 'strike-badge')).toBe('STRIKE · Food 20%');
  });

  it("B-AC-37-3: in planning a striker stands on exactly the struck good's plots, and they are gone once paid", () => {
    const html = onTv(game(colony(UNPAID)));
    expect(strikers(html)).toEqual(['0,0', '2,0']);
    expect(textOf(html, 'strike-chip-0-0')).toBe('STRIKE · 20%');
    expect(strikers(onTv(game(colony(PAID))))).toEqual([]);
  });

  it('B-AC-37-3: an Energy strike stands on the Energy plot alone', () => {
    expect(strikers(onTv(game(colony({ ...UNPAID, good: 'energy' }))))).toEqual(['1,0']);
  });

  it("B-AC-37-5: with politics off, or no strike this month, the TV's planning is today's: no badge, no strikers", () => {
    for (const html of [onTv(game(null)), onTv(game(colony(null)))]) {
      expect(html).not.toContain('data-testid="strike-badge"');
      expect(strikers(html)).toEqual([]);
      expect(html).toContain('data-testid="holo-map"');
    }
  });
});
