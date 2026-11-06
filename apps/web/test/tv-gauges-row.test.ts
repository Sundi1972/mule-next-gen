import type { ColonyView, MuleView, PlayerView } from '@mule/protocol';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { ReadyCount } from '../src/phone/hub/ReadyBar';
import { TvHeader } from '../src/table/TableApp';
import { aMuleView, aPlayer } from './fixtures/views';

/**
 * GAUGES-ROW (WS4, PM ruling 5 Nov, rulebook #gauges-row): a TV header that shows a clock, a status badge (the strike) or
 * a ready count puts the colony's four gauges on a full-width row of their own under the title; a header with none of
 * them keeps the gauges beside the title.
 */

const PLAYERS: PlayerView[] = [aPlayer({ id: 's1', name: 'Lena', slot: 0 }), aPlayer({ id: 's2', name: 'Kai', slot: 1 })];

const colony = (strike: ColonyView['strike'] = null): ColonyView => ({
  gauges: { wealth: 26_400, environment: 34, prestige: 2, happiness: 44, band: 'restless' },
  lastGauges: null,
  fund: 2_340,
  ledger: null,
  projects: [],
  catalogue: [],
  strike,
  score: null,
});

const game = (c: ColonyView | null): MuleView => aMuleView({ players: PLAYERS, me: null, politics: null, month: 5, ...(c ? { colony: c } : {}) });

const client = {
  subscribe: () => () => {},
  getState: () => ({ status: 'open', role: 'board', code: 'MULE', seatId: null, view: null, chat: [], emotes: [], toasts: [], clockOffset: 0 }),
  serverNow: () => 0,
  intent: () => {},
} as unknown as TableClient;

function header(props: Parameters<typeof TvHeader>[0]): string {
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(TvHeader, props) }));
}

/** Where the colony's gauges are drawn: inside the header row, on a row of their own after it, or nowhere; and their width class. */
function gauges(html: string): { where: 'header' | 'own row' | 'none'; width: string | null } {
  const at = html.indexOf('data-testid="colony-gauges"');
  if (at < 0) return { where: 'none', width: null };
  const tag = html.slice(html.lastIndexOf('<', at), html.indexOf('>', at));
  const width = tag.match(/\bw-(full|\[\d+px\])/)?.[0] ?? null;
  return { where: at < html.indexOf('</header>') ? 'header' : 'own row', width };
}

describe('GAUGES-ROW (WS4): a crowded TV header puts the colony gauges on their own full-width row', () => {
  it('with a clock the gauges sit on their own row, full width, so the clock stays on the screen', () => {
    expect(gauges(header({ game: game(colony()), title: 'Production', seconds: 42 }))).toEqual({ where: 'own row', width: 'w-full' });
  });

  it('with the strike badge and no ready count the gauges sit on their own row, full width (#368: not w-[760px])', () => {
    expect(gauges(header({ game: game(colony({ good: 'food', cost: 240, paid: false })), title: 'Production' }))).toEqual({ where: 'own row', width: 'w-full' });
  });

  it('with a ready count the gauges sit on their own row, full width, as planning already does', () => {
    const ready = createElement(ReadyCount, { players: PLAYERS, tv: true });
    expect(gauges(header({ game: game(colony()), title: 'Planning', seconds: 42, ready }))).toEqual({ where: 'own row', width: 'w-full' });
  });

  it('with no clock, badge or ready count the gauges stay beside the title, at their header width', () => {
    expect(gauges(header({ game: game(colony()), title: 'Election day' }))).toEqual({ where: 'header', width: 'w-[760px]' });
  });

  it('without the colony (politics off) a clocked header keeps its air gauge and draws no colony gauges', () => {
    const html = header({ game: game(null), title: 'Development', seconds: 42 });
    expect(gauges(html).where).toBe('none');
    expect(html).toMatch(/air/i);
  });
});
