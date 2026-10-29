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
import { deskAsks, drawnSlots, goTo, settle, type HubSeat, type HubSlots } from '../src/phone/hub/slots';
import { HUB_SLOTS } from '../src/phone/hub/today';

/**
 * E-11 (UX audit, WS6's mock 7f7f1814): while the Governor's desk is open the rail gives it the room. The footer folds
 * its "Waiting for" names (the header's ready count says it in brief) and the chat ticker keeps its newest line; the
 * seat row stays. Picking another desk brings both back; Set does not. The browser half, where the desk is measured
 * against the footer, is e2e/governor-desk.ts.
 */

const player = (id: string, name: string, slot: number, isAi = false): PlayerView => ({ id, name, isAi, color: '', species: 'zipwing', money: 1000, worth: 0, plots: 0, ready: false, doneDeveloping: false, condition: null, colonist: null, slot });
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
  return {
    finished: false,
    month: 4,
    maxMonths: 12,
    phase: 'planning',
    phaseEndsAt: null,
    width: 1,
    height: 1,
    tiles: [],
    lit: null,
    players: PLAYERS,
    me,
    market: [],
    storeMules: 0,
    mulePrice: 0,
    colonists: 0,
    air: { level: 22, band: 'clean' },
    ship: { arrives: 6, inPort: false, wants: null },
    treasury: { money: 0, salesTax: percent / 100 },
    news: [],
    scores: null,
    auction: null,
    listings: [],
    lotSlots: { used: 0, max: 4 },
    landAuction: null,
    production: null,
    politics,
  };
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

/** Lena's planning hub, with the table chat in the rail's header, as the game draws it. */
function lenasHub(game: MuleView): string {
  const client = {
    subscribe: () => () => {},
    getState: () => ({ status: 'open', role: 'player', code: 'MULE', seatId: 's1', view: { game }, chat: SAID, emotes: [], toasts: [], clockOffset: 0 }),
    serverNow: () => 0,
    intent: () => {},
  } as unknown as TableClient;
  const table: TableView<MuleView> = { code: 'MULE', status: 'playing', hostId: 's1', boards: 0, game, seats: PLAYERS.map((p) => ({ id: p.id, name: p.name, isAi: p.isAi, connected: true, color: p.slot })) };
  const value = { table, view: game, me: game.me!, self: PLAYERS[0]!, slot: 0 as Slot };
  const hub = createElement(Hub, { slots: RENDERED });
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(PhoneGameProvider, { value, children: hub }) })).replaceAll('<!-- -->', '');
}

/** What the rail shows: the open desk, the footer's names, the seat row, and the ticker's lines by id, newest first. */
function rail(html: string) {
  return {
    desk: /aria-selected="true"[^>]*data-testid="desk-([a-z]+)"/.exec(html)?.[1] ?? null,
    names: html.includes('data-testid="waiting-for"'),
    seatRow: html.includes('data-testid="seat-row"'),
    ticker: [...html.matchAll(/data-testid="chat-line-(\d+)"/g)].map((m) => Number(m[1])),
  };
}

describe('the Governor desk folds (E-11)', () => {
  it.each<[string, MuleView, ReturnType<typeof rail>]>([
    ['Lena governs: her desk opens first, the names fold, the ticker keeps its newest line', month(true), { desk: 'governor', names: false, seatRow: true, ticker: [2] }],
    ['after Set (4% from 5%), the desk stays open and still folded', month(true, 4, 5), { desk: 'governor', names: false, seatRow: true, ticker: [2] }],
    ['Ossa governs: Lena has no Governor desk, the names and both lines show', month(false), { desk: 'colony', names: true, seatRow: true, ticker: [2, 1] }],
  ])('E-11: %s', (_, game, shows) => {
    expect(rail(lenasHub(game))).toEqual(shows);
  });

  it('E-11: the fold holds while the desk that asked first is open: another desk unfolds, back to it folds again', () => {
    const game = month(true);
    const seat: HubSeat = { view: game, me: game.me!, self: PLAYERS[0]! };
    const drawn = drawnSlots(HUB_SLOTS, seat);
    const opens = settle({ desk: 'colony', tool: 'look', focus: null, first: null }, drawn, seat);
    const colony = goTo(opens, { desk: 'colony' }, drawn);
    const back = goTo(colony, { desk: 'governor' }, drawn);
    const door = goTo(colony, { desk: 'governor', focus: 'tax' }, drawn);
    expect([opens, colony, back, door].map(deskAsks)).toEqual([true, false, true, true]);
    // Nobody asks first (Ossa governs): nothing folds, whatever is open.
    const ossas: HubSeat = { view: month(false), me: game.me!, self: PLAYERS[0]! };
    expect(deskAsks(settle({ desk: 'colony', tool: 'look', focus: null, first: null }, drawnSlots(HUB_SLOTS, ossas), ossas))).toBe(false);
  });
});
