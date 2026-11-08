import { productionShowMs } from '@mule/engine';
import type { EventView, IncidentView, MuleView, PoliticsView, ProductionView, TableView, TileView } from '@mule/protocol';
import { eventScript, showTimes } from '@mule/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { TvProduction } from '../src/table/TvProduction';
import { aPlayer } from './fixtures/views';

/**
 * S4-C17 through the TV's real production screen: the event as the server sends it (no good, no dir: the contract is
 * frozen) and the public incident beside it in the view. The whisper's price tag is what the room sees.
 */

const W = 9;
const H = 5;
const PLAYERS = [aPlayer({ id: 'lena', name: 'Lena', slot: 0 }), aPlayer({ id: 'ossa', name: 'Ossa', slot: 1 })];
const tiles: TileView[] = Array.from({ length: W * H }, (_, i) => ({ x: i % W, y: Math.floor(i / W), terrain: i === 22 ? 'store' : 'plains', peaks: 0, owner: null, outfit: null, pollution: 0, filter: false }) as TileView);

const RUMOUR: EventView = {
  key: 'marketRumour',
  kind: 'sabotage',
  title: 'Sabotage: market rumour',
  line: 'A rumour: Food opens 25% lower at the auction.',
  sign: 'bad',
  scope: 'colony',
  origin: { x: 4, y: 2 },
  hits: [],
  phase: 'production',
  weight: 'headline',
  playMs: 7000,
  sabotage: { order: 'sab-d', culprit: null, worked: true, guarded: false },
};
const INCIDENT: IncidentView = { id: 'sab-d', month: 3, kind: 'rumour', victim: null, at: null, good: 'food', dir: 'down', worked: true, culprit: null, how: null, investigated: false, fine: null };

const production: ProductionView = { lines: [], events: [RUMOUR], lengthMs: productionShowMs(0, 1800 + RUMOUR.playMs), introMs: 1800 };

function tvAt(incidents: IncidentView[], share: number): string {
  const s = eventScript({ events: production.events, introMs: production.introMs }, showTimes(production).eventsAt ?? 0, 'tv');
  const g = s.segments[0]!;
  const t = g.playAt + share * (g.settleAt - g.playAt);
  const phaseEndsAt = 5_000_000;
  const client = { subscribe: () => () => {}, getState: () => ({ status: 'open', role: 'table', code: 'MULE', seatId: null, view: null, chat: [], emotes: [], toasts: [], clockOffset: 0 }), serverNow: () => phaseEndsAt - production.lengthMs + t * 1000, intent: () => {} } as unknown as TableClient;
  const game = {
    finished: false, month: 3, maxMonths: 12, lastAir: null, colonistsFed: null, phase: 'production', phaseEndsAt, width: W, height: H, tiles, lit: null,
    players: PLAYERS, me: null, market: [], storeMules: 0, mulePrice: 0, colonists: 0, air: { level: 22, band: 'clean' }, ship: { arrives: 3, inPort: false, wants: null },
    treasury: { money: 0, salesTax: 0.05 }, news: [], scores: null, auction: null, listings: [], lotSlots: { used: 0, max: 4 }, landAuction: null, production,
    politics: { sheriff: null, sabotage: { incidents } } as unknown as PoliticsView,
  } as MuleView;
  const table = { code: 'MULE', status: 'playing', hostId: 'lena', boards: 1, game: null, seats: [] } as unknown as TableView<MuleView>;
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(TvProduction, { table, game, production }) }));
}

describe('S4-C17 · the TV’s production screen: a rumour’s tag from its public incident', () => {
  it('with the incident in the view, the whisper tips Food 25% down', () => {
    const html = tvAt([INCIDENT], 0.6);
    expect(html).toContain('data-testid="fx-whisper"');
    expect(html.replace(/<[^>]+>/g, ' ')).toContain('▼ −25%');
  });

  it('before the server serves incidents: the whisper alone, no tag', () => {
    const html = tvAt([], 0.6);
    expect(html).toContain('data-testid="fx-whisper"');
    expect(html).not.toContain('data-testid="fx-price-tip"');
  });
});
