import { document, FakeElement } from './fake-dom';
import { EVENT_SHOW } from '@mule/engine';
import type { EventView, MarketRow, MuleView, MyView, PlayerView, TableView, TileView } from '@mule/protocol';
import { eventSegments, type ShowEventView, type ShowMode } from '@mule/ui';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TableClient } from '../src/net/client';

/**
 * The riot's shelves on the screens that play it (G-5 C26), at promise altitude: the TV's overlay and a phone alone,
 * rendered through TableApp and PhoneApp from a month-end view as the server sends it, its market already after the riot.
 */

// The fake document has no dataset (the map's theme reads the page's) and no layout (the shell measures).
Object.assign(document.documentElement, { dataset: {} });
Object.assign(FakeElement.prototype, { getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }), offsetWidth: 0, offsetHeight: 0, querySelectorAll: () => [], focus: () => undefined });

const W = 9;
const H = 5;
const NOW = 5_000_000;
const LENA = 's1';
const OSSA = 's2';
/** The table's pace: the server's clock runs the show at a quarter of its full-pace length. */
const SCALE = 0.25;

const RIOT = {
  key: 'riot',
  kind: 'riot',
  title: 'Riot',
  line: 'One prestige object is damaged (no prestige until repaired); the store loses a third of its stock.',
  sign: 'bad',
  scope: 'colony',
  origin: { x: 4, y: 2 },
  hits: [],
  phase: 'upkeep',
  weight: 'headline',
  playMs: EVENT_SHOW.playMs.headline,
  objects: [{ id: 'hospital', becomes: 'damaged' }],
  effects: [
    { on: 'store', what: 'food', delta: -6 },
    { on: 'store', what: 'energy', delta: -4 },
    { on: 'store', what: 'smithore', delta: -5 },
  ],
} as unknown as EventView;
const SHOW_MS = EVENT_SHOW.introMs + RIOT.playMs;

const row = (good: MarketRow['good'], storeStock: number) => ({ good, price: 30, storeBuys: 25, storeSells: 35, storeStock, cover: 1, demand: 4, shipPays: null }) as MarketRow;
/** The store after the riot: 11 Food, 9 Energy and 10 Smithore left, so 17, 13 and 15 before it. */
const AFTER_RIOT = [row('food', 11), row('energy', 9), row('smithore', 10), row('crystite', 3)];

const person = (id: string, name: string, slot: number): PlayerView =>
  ({ id, name, isAi: false, color: '', slot, species: 'mollox', money: 640, worth: 0, plots: 1, ready: false, doneDeveloping: false, colonist: null, condition: { foodShare: 1, sick: false, sickBecause: null, conditionPace: 1 } }) as unknown as PlayerView;
const players = [person(LENA, 'Lena', 0), person(OSSA, 'Ossa', 1)];
const tiles: TileView[] = Array.from({ length: W * H }, (_, i) => {
  const x = i % W;
  const y = Math.floor(i / W);
  return { x, y, terrain: x === 4 && y === 2 ? 'store' : 'plains', peaks: 0, owner: null, outfit: null, pollution: 0, filter: false } as TileView;
});
const STOCK = { food: 3, water: 2, energy: 2, smithore: 0, crystite: 0, rareEarth: 0, alloy: 0, electronics: 0, medicine: 0 };

/** The month end at riot story second `u` on `mode`'s clock: the server's clock is the show's full-pace seconds × SCALE past its start. */
function viewAt(u: number, mode: ShowMode, market: MarketRow[]): MuleView {
  const seg = eventSegments({ events: [RIOT as ShowEventView], introMs: EVENT_SHOW.introMs }, 0, mode)[0]!;
  const t = seg.playAt + u * seg.pace;
  const startsAt = NOW - t * 1000 * SCALE;
  return {
    finished: false,
    month: 5,
    maxMonths: 12,
    phase: 'upkeep',
    phaseEndsAt: null,
    width: W,
    height: H,
    tiles,
    lit: null,
    players,
    me: null,
    market,
    storeMules: 8,
    mulePrice: 120,
    colonists: 1000,
    air: { level: 40, band: 'smoggy' },
    lastAir: null,
    colonistsFed: null,
    ship: { wants: [] },
    treasury: { money: 0, salesTax: 0 },
    news: [],
    scores: null,
    auction: null,
    listings: [],
    lotSlots: { used: 0, max: 0 },
    landAuction: null,
    production: { lines: [], events: [], lengthMs: 15_000, introMs: 0 },
    events: [RIOT],
    eventShow: { startsAt, showMs: SHOW_MS, introMs: EVENT_SHOW.introMs, endsAt: startsAt + Math.round(SHOW_MS * SCALE), held: true },
    politics: null,
  } as unknown as MuleView;
}
const mine = (id: string): MyView =>
  ({
    id,
    species: 'mollox',
    stock: STOCK,
    carriedMule: null,
    claimsLeft: 0,
    hungry: false,
    sick: false,
    needs: { food: 3, water: 2 },
    monthNeeds: STOCK,
    devEndsAt: null,
    devSeconds: 60,
    produced: null,
    mulePrice: 120,
    outfitCosts: { food: 25, water: 25, energy: 50, smithore: 75, crystite: 100, rareEarth: 100, greenBelt: 25 },
    droneOrder: [],
    politics: null,
    installedThisTurn: false,
    worthParts: {},
  }) as unknown as MyView;

const table = (game: MuleView, boards: number): TableView<MuleView> => ({ code: 'ABCD', status: 'playing', hostId: LENA, boards, seats: [], game }) as unknown as TableView<MuleView>;
function client(state: object): TableClient {
  return {
    subscribe: () => () => undefined,
    getState: () => state,
    serverNow: () => NOW,
    savedSeat: () => null,
    join: () => undefined,
    watch: () => undefined,
    intent: () => undefined,
    chat: () => undefined,
    onFrame: () => () => undefined,
    roundTripMs: () => null,
  } as unknown as TableClient;
}
const base = { status: 'playing', chat: [], emotes: [], toasts: [], notice: null, clockOffset: 0, handoffCode: null, code: 'ABCD' };

async function phoneAlone(view: MuleView) {
  const { PhoneApp } = await import('../src/phone/PhoneApp');
  const { ClientProvider } = await import('../src/net/react');
  const game = { ...view, me: mine(OSSA) };
  return createElement(ClientProvider, { client: client({ ...base, role: 'player', seatId: OSSA, view: table(game, 0) }), children: createElement(PhoneApp, { room: 'ABCD' }) });
}
async function tv(view: MuleView) {
  const { TableApp } = await import('../src/table/TableApp');
  const { ClientProvider } = await import('../src/net/react');
  return createElement(ClientProvider, { client: client({ ...base, role: 'board', seatId: null, view: table(view, 1) }), children: createElement(TableApp, { room: 'ABCD' }) });
}

/** The markup inside the element carrying this data-testid, by balancing its tag. */
function inside(html: string, testid: string): string {
  const open = html.match(new RegExp(`<(\\w+)[^>]*data-testid="${testid}"[^>]*>`));
  if (!open) return '';
  const name = open[1]!;
  const from = open.index! + open[0].length;
  let depth = 1;
  const re = new RegExp(`<${name}[\\s>]|</${name}>`, 'g');
  re.lastIndex = from;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(from, m.index);
  }
  return html.slice(from);
}
const text = (html: string) => html.replace(/<[^>]*>/g, ' ');

const mounted = new Set<() => void>();
afterEach(() => {
  for (const unmount of mounted) unmount();
  mounted.clear();
  delete (window as { matchMedia?: unknown }).matchMedia;
  vi.unstubAllGlobals();
});

/** The screen's markup once mounted in the fake DOM: the apps read the client's store, which a server render cannot. */
async function render(el: ReturnType<typeof createElement>): Promise<string> {
  Object.assign(window, { matchMedia: (q: string) => ({ media: q, matches: false, addEventListener() {}, removeEventListener() {} }) });
  Object.assign(window, { setInterval: () => 0, clearInterval: () => undefined });
  const doc = document as unknown as { createElementNS?: (ns: string, tag: string) => FakeElement };
  doc.createElementNS ??= (_ns, t) => document.createElement(t);
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host as unknown as HTMLElement);
  flushSync(() => root.render(el));
  mounted.add(() => {
    root.unmount();
    document.body.removeChild(host);
  });
  return outer(host);
}
function outer(node: FakeElement): string {
  const attrs = [...node.attributes].map(([k, v]) => ` ${k}="${v}"`).join('');
  const inner = node.childNodes.map((c) => (c instanceof FakeElement ? outer(c) : c.textContent)).join('');
  return `<${node.tagName.toLowerCase()}${attrs}>${inner}</${node.tagName.toLowerCase()}>`;
}

/** Story seconds of the riot: every shelf still full, and every shelf emptied with the box still up. */
const FULL_U = 1.5;
const EMPTIED_U = 4.3;

const screens = [
  { name: 'TV', overlay: 'tv-event-overlay', mode: 'tv' as ShowMode, at: (v: MuleView) => tv(v) },
  { name: 'phone alone', overlay: 'phone-event-overlay', mode: 'solo' as ShowMode, at: (v: MuleView) => phoneAlone(v) },
];
async function shelves(screen: (typeof screens)[number], u: number, market: MarketRow[]): Promise<string[] | null> {
  const html = await render(await screen.at(viewAt(u, screen.mode, market)));
  const box = inside(inside(html, screen.overlay), 'riot-storage');
  expect(box, `${screen.name} shows the riot's storage box`).not.toBe('');
  return text(box).match(/[−-]?\d+/g);
}

describe('B-AC-26-3: the riot’s shelves on the TV and a phone alone', () => {
  it.each(screens)('B-AC-26-3: $name: each shelf counts down from the store’s real stock to what the market shows after the riot', async (screen) => {
    expect(await shelves(screen, FULL_U, AFTER_RIOT)).toEqual(['17', '13', '15']);
    expect(await shelves(screen, EMPTIED_U, AFTER_RIOT)).toEqual(['11', '9', '10']);
  });

  it.each(screens)('B-AC-26-3: $name: with no market rows for the riot’s goods, each shelf shows only what it lost, never a guessed count', async (screen) => {
    for (const market of [[], [row('crystite', 3)]]) {
      expect(await shelves(screen, FULL_U, market), `market ${market.length}`).toBeNull();
      expect(await shelves(screen, EMPTIED_U, market), `market ${market.length}`).toEqual(['−6', '−4', '−5']);
    }
  });
});
