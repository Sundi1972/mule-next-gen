import type { MuleView, MyView, PlayerView, TableView } from '@mule/protocol';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { fmt } from '../src/game/derive';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { PhoneGameProvider } from '../src/phone/game';
import { GameOver } from '../src/phone/GameOver';
import { Results } from '../src/phone/Results';
import { TvGameOver, TvStandings } from '../src/table/TableApp';

const row = (id: string, name: string, slot: number, money: number, worth: number): PlayerView => ({
  id,
  name,
  isAi: false,
  color: '',
  slot,
  species: 'zipwing',
  money,
  worth,
  plots: 0,
  ready: false,
  doneDeveloping: false,
  colonist: null,
  condition: null,
});

/** Heiko leads on cash; Mia's goods, land and MULEs make her the Worth leader. */
const HEIKO = row('s1', 'Heiko', 0, 3_000, 3_400);
const MIA = row('s2', 'Mia', 1, 900, 5_200);
const KAI = row('s3', 'Kai', 2, 1_500, 2_100);
const PLAYERS = [HEIKO, MIA, KAI];

const stock = { food: 4, water: 2, energy: 3, smithore: 0, crystite: 0, rareEarth: 0, alloy: 0, electronics: 0, medicine: 0 };
const me: MyView = {
  id: 's1',
  species: 'zipwing',
  stock,
  carriedMule: null,
  claimsLeft: 0,
  hungry: false,
  sick: false,
  needs: { food: 3, water: 2 },
  monthNeeds: { ...stock, food: 3, water: 2, energy: 2 },
  devEndsAt: null,
  devSeconds: 50,
  produced: null,
  mulePrice: 150,
  outfitCosts: { food: 25, water: 25, energy: 50, smithore: 75, crystite: 100, rareEarth: 100, alloy: 150, electronics: 200, medicine: 150, greenBelt: 40 },
  droneOrder: [],
  politics: null,
  installedThisTurn: false,
  worthParts: { money: 3_000, goods: 100, plots: 1, land: 300, mules: 0, muleValue: 0, office: 0, cut: 0 },
};

function view(extra: Partial<MuleView> = {}): MuleView {
  return {
    finished: false,
    month: 4,
    maxMonths: 12,
    phase: 'upkeep',
    phaseEndsAt: null,
    width: 1,
    height: 1,
    tiles: [],
    lit: null,
    players: PLAYERS,
    me,
    market: [],
    storeMules: 0,
    mulePrice: 150,
    colonists: 0,
    air: { level: 12, band: 'clean' },
    ship: { arrives: 6, inPort: false, wants: null },
    treasury: { money: 0, salesTax: 0.05 },
    news: [],
    scores: null,
    auction: null,
    listings: [],
    lotSlots: { used: 0, max: 4 },
    landAuction: null,
    production: null,
    politics: null,
    ...extra,
  };
}

/** Game over as the server sends it: `scores` in seat order, each player's worth equal to their score (T-AC-14). */
const OVER = view({
  finished: true,
  phase: 'gameOver',
  scores: PLAYERS.map((p) => ({ id: p.id, score: p.worth })),
});

const client = {
  subscribe: () => () => {},
  getState: () => ({ status: 'open', role: 'player', code: 'MULE', seatId: 's1', view: null, chat: [], emotes: [], toasts: [], clockOffset: 0 }),
  serverNow: () => 0,
  intent: () => {},
} as unknown as TableClient;

/** A screen as Heiko's phone draws it, from this view. */
function onPhone(game: MuleView, screen: () => ReactElement): string {
  const table = { code: 'MULE', status: 'playing', hostId: 's1', seats: [], boards: 1, game } as TableView<MuleView>;
  const value = { table, view: game, me: game.me!, self: game.players[0]!, slot: 0 as const };
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(PhoneGameProvider, { value, children: createElement(screen) }) }));
}

/** The markup of the element carrying this data-testid, through its closing tag. Assumes no element of the same tag nests in it. */
function element(html: string, testid: string): string {
  const open = html.match(new RegExp(`<([a-z]+)[^>]*data-testid="${testid}"[^>]*>`));
  expect(open, `an element with data-testid="${testid}"`).not.toBeNull();
  const from = open!.index!;
  return html.slice(from, html.indexOf(`</${open![1]}>`, from) + open![1]!.length + 3);
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** Each list item's text, top to bottom. */
const rows = (html: string, testid: string) => [...element(html, testid).matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((m) => text(m[1]!));
/** Each table row's text in the element carrying this data-testid, header rows aside, top to bottom. */
const tableRows = (html: string, testid: string) => {
  const from = html.search(new RegExp(`data-testid="${testid}"`));
  const body = html.slice(from, html.indexOf('</tbody>', from));
  return [...body.slice(body.indexOf('<tbody')).matchAll(/<tr[^>]*>(.*?)<\/tr>/g)].map((m) => text(m[1]!));
};

describe('B-AC-10 (WS4, Worth): who is leading, in credits, every month', () => {
  it("B-AC-10 (WS4, Worth): the phone's Results list the Worth leader first, the cash leader second, labelled worth", () => {
    // At the harvest; the month end's league table is C20's (month-end.test.ts).
    const html = onPhone(view({ phase: 'production' }), Results);
    expect(rows(html, 'standings')).toEqual(['1 Mia 5,200', '2 You 3,400', '3 Kai 2,100']);
    expect(text(html)).toContain('Standings BY WORTH');
    expect(text(html)).not.toContain('BY MONEY');
    expect(text(html)).toMatch(/Rank #2 of 3/);
  });

  it("B-AC-10 (WS4, Worth): the TV's standings list the Worth leader first, the cash leader second, labelled worth", () => {
    const html = renderToStaticMarkup(createElement(TvStandings, { game: view() }));
    expect(rows(html, 'tv-standings')).toEqual(['1 Mia 5,200', '2 Heiko 3,400', '3 Kai 2,100']);
    expect(text(html)).toMatch(/^Standings · worth /);
  });

  it('B-AC-10 (WS4, Worth, negative): at game over the phone and the TV rank by the final scores, in order and number', () => {
    const final = [...OVER.scores!].sort((a, b) => b.score - a.score).map((s) => ({ name: PLAYERS.find((p) => p.id === s.id)!.name, score: fmt(s.score) }));
    expect(final.map((f) => f.name), 'the cash leader is not the winner').toEqual(['Mia', 'Heiko', 'Kai']);

    // In credits since C20: the final standings are the league table, ranked as before.
    const phone = onPhone(OVER, GameOver);
    expect(tableRows(phone, 'scores')).toEqual(final.map((f, i) => `${i + 1} ${f.name === 'Heiko' ? 'You (Heiko)' : f.name} ${f.score}`));
    expect(text(element(phone, 'winner'))).toContain(`Mia wins with a Worth of ${final[0]!.score} cr`);

    // The TV's header carries the table chat's ticker, which reads its client (C20).
    const tv = renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(TvGameOver, { game: { ...OVER, me: null } }) }));
    expect(tableRows(tv, 'tv-scores')).toEqual(final.map((f, i) => `${i + 1} ${f.name} ${f.score}`));
    expect(text(element(tv, 'tv-winner'))).toBe(`The colony goes to Mia wins with a Worth of ${final[0]!.score} cr`);
  });
});
