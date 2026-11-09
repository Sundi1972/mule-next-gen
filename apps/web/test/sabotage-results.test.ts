import type { IncidentView, MuleView, MyView, PoliticsView, TableView } from '@mule/protocol';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { PhoneGameProvider } from '../src/phone/game';
import { Results } from '../src/phone/Results';
import { aMuleView, aPlayer } from './fixtures/views';

/**
 * S4-C17 follow-up (PM ruling 8 Nov, Heiko's pick): the TV counts the month's sabotage with its SABOTAGE ×N tag, and
 * every phone shows the full public lines at the month end, a phone at a table with a TV too. Read off the phone's
 * real Results screen, as the server's views would draw it.
 */

const PLAYERS = [aPlayer({ id: 'lena', name: 'Lena', slot: 0 }), aPlayer({ id: 'ossa', name: 'Ossa', slot: 1 }), aPlayer({ id: 'brix', name: 'Brix', slot: 2 })];
const MONTH = 4;
const me = { id: 'ossa', species: 'zipwing', stock: {}, politics: null, worthParts: { money: 0, goods: 0, plots: 0, land: 0, mules: 0, muleValue: 0, office: 0, donated: 0, cut: 0 } } as unknown as MyView;

const cut = (over: Partial<IncidentView>): IncidentView => ({ id: 'sab-a', month: MONTH, kind: 'powerCut', victim: 'ossa', at: { x: 7, y: 1 }, good: 'smithore', worked: true, culprit: null, how: null, investigated: false, fine: null, ...over });

function monthEnd(incidents: IncidentView[]): MuleView {
  return aMuleView({ players: PLAYERS, me, month: MONTH, phase: 'upkeep', politics: { sheriff: 'brix', sabotage: { incidents } } as unknown as PoliticsView });
}

const client = { subscribe: () => () => {}, getState: () => ({ status: 'open', role: 'player', code: 'MULE', seatId: 'ossa', view: null, chat: [], emotes: [], toasts: [], clockOffset: 0 }), serverNow: () => 0, intent: () => {} } as unknown as TableClient;

/** Ossa's phone at the month end; `boards` 1 is a table with a TV, 0 one without. */
function phone(game: MuleView, boards: number): string {
  const table = { code: 'MULE', status: 'playing', hostId: 'lena', seats: [], boards, game } as unknown as TableView<MuleView>;
  const value = { table, view: game, me: game.me!, self: game.players[1]!, slot: 1 as const };
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(PhoneGameProvider, { value, children: createElement(Results) }) }));
}
const words = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('S4-C17 · a phone at a table with a TV shows the month’s public sabotage lines at the month end', () => {
  it('S4-B-AC-2: an unseen cut reads "someone", on the phone beside the TV', () => {
    const html = phone(monthEnd([cut({})]), 1);
    expect(html).toContain('data-testid="phone-monthend"');
    expect(words(html)).toContain('Sabotage: someone cut the power to Ossa’s smithore plot.');
  });

  it('S4-B-AC-1: a caught cut names the culprit, as the public incident does', () => {
    const html = phone(monthEnd([cut({ worked: false, culprit: 'lena', how: 'guard' })]), 1);
    expect(words(html)).toContain('Sabotage: Lena was caught by a guard at Ossa’s plot. The power stayed on.');
  });

  it('privacy: a name only when the public incident names one; the orderer’s own list never leaks into the public line', () => {
    // Lena's own phone: her own list knows the culprit is herself; the public incident does not name anyone.
    const own = { ...me, id: 'lena', politics: { sabotage: { mine: [{ ...cut({ culprit: 'lena' }), public: false, outcome: 'done' }] } } } as unknown as MyView;
    const game = { ...monthEnd([cut({})]), me: own };
    const table = { code: 'MULE', status: 'playing', hostId: 'lena', seats: [], boards: 1, game } as unknown as TableView<MuleView>;
    const value = { table, view: game, me: own, self: game.players[0]!, slot: 0 as const };
    const html = words(renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(PhoneGameProvider, { value, children: createElement(Results) }) })));
    const at = html.indexOf('Sabotage:');
    expect(at).toBeGreaterThanOrEqual(0);
    const line = 'Sabotage: someone cut the power to Ossa’s smithore plot.';
    expect(html.slice(at, at + line.length)).toBe(line);
    expect(html).not.toMatch(/Sabotage: Lena/);
  });

  it('the same lines on the phone with no TV; and a month with none draws nothing', () => {
    expect(words(phone(monthEnd([cut({})]), 0))).toContain('Sabotage: someone cut the power to Ossa’s smithore plot.');
    expect(phone(monthEnd([]), 1)).not.toContain('data-testid="sabotage-news"');
    expect(phone(monthEnd([cut({ month: MONTH - 1 })]), 1)).not.toContain('data-testid="sabotage-news"');
  });
});
