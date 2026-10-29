import type { TaxPromise } from '@mule/engine';
import type { ChatMessage, MuleView, MyView, PlayerView, PoliticsView, TableView } from '@mule/protocol';
import type { Slot } from '@mule/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { PhoneGameProvider } from '../src/phone/game';
import { Hub } from '../src/phone/hub/Hub';
import type { HubSlots } from '../src/phone/hub/slots';
import { HUB_SLOTS } from '../src/phone/hub/today';
import { aMuleView, aPlayer } from './fixtures/views';

/**
 * E-11 (UX audit) under C20's rule on a phone (Heiko's "(c) chat at the bottom", WS6's mock 529bc7f8 ?ticker=under):
 * the table chat follows the rail's content, so the Governor's desk folds nothing. The footer names who is still
 * planning, the ticker keeps both lines, and the seat row comes after the open desk, not in the rail's header. The
 * static render has no width, so it draws the phone's layout, as the shell does before it measures. The browser half,
 * where the desk is measured against the footer at 844 and 667, is hub-steps.ts's governorsDeskFits.
 */

const player = (id: string, name: string, slot: number, isAi = false): PlayerView => aPlayer({ id, name, slot, isAi });
/** Lena and Ossa still planning, two AI seats ready: 2 / 4 READY. */
const PLAYERS = [player('s1', 'Lena', 0), player('s2', 'Ossa', 1), player('s3', 'Kai', 2, true), player('s4', 'Brix', 3, true)];
const stock = { food: 0, water: 0, energy: 0, smithore: 0, crystite: 0, rareEarth: 0, alloy: 0, electronics: 0, medicine: 0 };
const CAP_4: TaxPromise = { kind: 'cap', percent: 4 };

/** Month 4's planning, the month's election over; Lena Governor on CAP_4 when `governor`, the tax at `percent` from `start`. */
function month(governor: boolean, percent = 5, start = 5): MuleView {
  const politics: PoliticsView = {
    governor: governor ? 's1' : 's2',
    sheriff: null,
    term: [4, 6],
    next: 7,
    baron: null,
    tax: { percent, start, low: 0, high: 10 },
    fund: 0,
    pay: { governor: 50, sheriff: 30 },
    weights: PLAYERS.map(({ id }) => ({ id, votes: 1, parts: { base: 1, land: 0, reputation: 0, baron: 0, taxes: 0 } })),
    candidates: { governor: [], sheriff: [] },
    promises: {},
    promise: CAP_4,
    promiseFrom: 5,
    election: null,
  };
  const me: MyView = {
    id: 's1',
    species: 'zipwing',
    stock: { ...stock, food: 9 },
    carriedMule: null,
    installedThisTurn: false,
    worthParts: { money: 0, goods: 0, plots: 0, land: 0, mules: 0, muleValue: 0, office: 0, cut: 0 },
    claimsLeft: 0,
    hungry: false,
    sick: false,
    needs: { food: 5, water: 3 },
    monthNeeds: { ...stock, food: 5, water: 3 },
    devEndsAt: null,
    devSeconds: 50,
    produced: null,
    mulePrice: 148,
    outfitCosts: { food: 25, water: 25, energy: 50, smithore: 75, crystite: 100, rareEarth: 100, alloy: 150, electronics: 200, medicine: 150, greenBelt: 40 },
    droneOrder: [],
    politics: { running: null, ballot: {}, canRun: { governor: true, sheriff: true }, paid: 0, reputation: 50 },
  };
  return aMuleView({
    month: 4,
    players: PLAYERS,
    me,
    treasury: { money: 0, salesTax: percent / 100 },
    politics,
  });
}

/** Ossa has said two things: the ticker's usual two lines. */
const SAID: ChatMessage[] = [
  { id: 1, from: 's2', text: 'Anyone selling Smithore?', at: 0 },
  { id: 2, from: 's2', text: 'Lena, keep that tax low!', at: 0 },
];

/**
 * The game's hub slots, less what reads the client's store or the hub's shared state without a server snapshot (the
 * map tools and the Talk desk's unread badge): a static render has neither. The desks that fold are all here.
 */
const RENDERED: HubSlots = { ...HUB_SLOTS, tools: [], desks: HUB_SLOTS.desks.filter((d) => d.id !== 'talk') };

/** Lena's planning hub, as the game draws it on a phone. */
function clientFor(game: MuleView): TableClient {
  return {
    subscribe: () => () => {},
    getState: () => ({ status: 'open', role: 'player', code: 'MULE', seatId: 's1', view: { game }, chat: SAID, emotes: [], toasts: [], clockOffset: 0 }),
    serverNow: () => 0,
    intent: () => {},
  } as unknown as TableClient;
}

function lenasHub(game: MuleView): string {
  const client = clientFor(game);
  const table: TableView<MuleView> = { code: 'MULE', status: 'playing', hostId: 's1', boards: 0, game, seats: PLAYERS.map((p) => ({ id: p.id, name: p.name, isAi: p.isAi, connected: true, color: p.slot })) };
  const value = { table, view: game, me: game.me!, self: PLAYERS[0]!, slot: 0 as Slot };
  const hub = createElement(Hub, { slots: RENDERED });
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(PhoneGameProvider, { value, children: hub }) })).replaceAll('<!-- -->', '');
}

/**
 * What the rail shows: the open desk, the footer's names (shown, not hidden for a screen reader only), where the seat
 * row is (in the rail's header, or under the open desk's body), and the ticker's lines by id, newest first.
 */
function rail(html: string) {
  const row = html.indexOf('data-testid="seat-row"');
  const header = html.indexOf('</header>');
  const desk = html.search(/data-testid="desk-body-[a-z]+"/);
  return {
    desk: /aria-selected="true"[^>]*data-testid="desk-([a-z]+)"/.exec(html)?.[1] ?? null,
    names: html.includes('data-testid="waiting-for"') && !/class="sr-only"[^>]*><span[^>]*data-testid="waiting-for"/.test(html),
    seatRow: row < 0 ? null : row < header ? 'header' : desk >= 0 && row > desk ? 'under the desk' : 'elsewhere',
    ticker: [...html.matchAll(/data-testid="chat-line-(\d+)"/g)].map((m) => Number(m[1])),
    /** The Now card: folded to its title (a button), or whole. */
    now: /<button[^>]*data-testid="now"/.test(html) ? 'folded' : /<section[^>]*data-testid="now"/.test(html) ? 'whole' : null,
  };
}

describe('the Governor desk beside the chat, which follows the rail on a phone (E-11, C20)', () => {
  it.each<[string, MuleView, ReturnType<typeof rail>]>([
    ['Lena governs: her desk opens first; the names and both lines show, the seat row under the desk', month(true), { desk: 'governor', names: true, seatRow: 'under the desk', ticker: [2, 1], now: 'folded' }],
    ['after Set (4% from 5%), the desk stays open and nothing folds', month(true, 4, 5), { desk: 'governor', names: true, seatRow: 'under the desk', ticker: [2, 1], now: 'folded' }],
    // H-7: in an ordinary month, with no desk asking first, Now folds too.
    ['Ossa governs: Lena has no Governor desk, the names and both lines show, and Now is folded all the same', month(false), { desk: 'colony', names: true, seatRow: 'under the desk', ticker: [2, 1], now: 'folded' }],
  ])('E-11, H-7: %s', (_, game, shows) => {
    expect(rail(lenasHub(game))).toEqual(shows);
  });
});
