import type { ColonyView, MuleView } from '@mule/protocol';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ColonyGauges } from '../src/components/Colony';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { TvMonthEnd } from '../src/table/TableApp';
import { aMuleView, aPlayer } from './fixtures/views';

/**
 * Rulebook #tv-month-end-paid-out (PM ruling, 7 Nov): the TV's month end says what the colony fund paid out that month as
 * a total only, at every number of players, in the Wealth gauge's note: "fund 438 cr · paid out 871". The full line is the
 * phones'.
 */

const PLAYERS = [aPlayer({ id: 's1', name: 'Heiko', slot: 0 }), aPlayer({ id: 's2', name: 'Kai', slot: 1 })];

/** Month 7's end: office pay 300, upkeep 85, Welfare 54 to Kai, buildings 432, so 871 paid out of a fund now at 438. */
const COLONY: ColonyView = {
  gauges: { wealth: 26_400, environment: 34, prestige: 2, happiness: 64, band: 'content' },
  lastGauges: { wealth: 24_900, prestige: 2, happiness: 58 },
  fund: 438,
  ledger: { month: 7, in: { salesTax: 900 }, out: { officePay: 300, upkeep: 85, welfare: 54, project: 432 } },
  projects: [],
  catalogue: [],
  score: null,
};

const client = { subscribe: () => () => {}, getState: () => ({ status: 'open', role: 'board', code: 'MULE', seatId: null, view: null, chat: [], emotes: [], toasts: [], clockOffset: 0 }), serverNow: () => 0, intent: () => {}, watch: () => {} } as unknown as TableClient;

function monthEnd(colony: ColonyView, over: Partial<MuleView> = {}): MuleView {
  return aMuleView({ players: PLAYERS, me: null, politics: null, month: 7, phase: 'upkeep', colony, ...over });
}

const render = (el: ReactElement) => renderToStaticMarkup(createElement(ClientProvider, { client, children: el })).replaceAll('<!-- -->', '');
const onTv = (view: MuleView) => render(createElement(TvMonthEnd, { game: view }));

/** The words of the element carrying this data-testid, through its matching closing tag. */
function said(html: string, testid: string): string {
  const open = html.match(new RegExp(`<([a-z]+)[^>]*data-testid="${testid}"[^>]*>`));
  expect(open, `an element with data-testid="${testid}"`).not.toBeNull();
  const tag = open![1]!;
  let depth = 0;
  const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, 'g');
  re.lastIndex = open!.index!;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(open!.index!, m.index + m[0].length).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  throw new Error(`no closing tag for ${testid}`);
}

describe("the TV's month end says what the fund paid out, as a total, in the Wealth note (#tv-month-end-paid-out)", () => {
  it('B-AC: "fund 438 cr · paid out 871", every line of the month summed', () => {
    expect(said(onTv(monthEnd(COLONY)), 'gauge-wealth')).toContain('fund 438 cr · paid out 871');
  });

  it('at every number of players: six seats read the same total', () => {
    const six = Array.from({ length: 6 }, (_, i) => aPlayer({ id: `s${i + 1}`, name: `P${i + 1}`, slot: i }));
    expect(said(onTv(monthEnd(COLONY, { players: six })), 'gauge-wealth')).toContain('fund 438 cr · paid out 871');
  });

  it('a month the fund paid nothing says so: "paid out 0"', () => {
    expect(said(onTv(monthEnd({ ...COLONY, ledger: { month: 7, in: {}, out: {} } })), 'gauge-wealth')).toContain('fund 438 cr · paid out 0');
  });

  it("only this month's ledger: before the first upkeep, or with last month's, the note is the fund alone", () => {
    expect(said(onTv(monthEnd({ ...COLONY, ledger: null })), 'gauge-wealth')).not.toContain('paid out');
    expect(said(onTv(monthEnd({ ...COLONY, ledger: { ...COLONY.ledger!, month: 6 } })), 'gauge-wealth')).not.toContain('paid out');
  });

  it("the phones and the TV's header keep the fund alone: the full line is the phones' colony panel", () => {
    expect(said(render(createElement(ColonyGauges, { colony: COLONY, size: 'phone' })), 'gauge-wealth')).not.toContain('paid out');
    expect(said(render(createElement(ColonyGauges, { colony: COLONY, size: 'tv' })), 'gauge-wealth')).not.toContain('paid out');
  });
});
