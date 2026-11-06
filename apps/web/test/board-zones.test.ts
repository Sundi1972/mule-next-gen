import { WALK, type GameState } from '@mule/engine';
import type { MuleView, TableView } from '@mule/protocol';
import type { Slot } from '@mule/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MuleGame } from '../../server/src/mule-game.js';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { Auction } from '../src/phone/Auction';
import { PhoneGameProvider } from '../src/phone/game';
import { TvAuction } from '../src/table/TableApp';

/**
 * RULE-6 and RULE-7 on the screens (WS6's mock design/mocks/auction-rules, PhoneRest, PhoneSoldOut and TvSoldOut): the
 * board draws the two rest zones, where nobody trades, and a sold-out store's line shows the highest bid. Each screen is
 * rendered from the view the real server sends.
 */
type GameContext = ConstructorParameters<typeof MuleGame>[0];

const seats = [
  { id: 's1', name: 'Lena', isAi: false, color: 0 },
  { id: 's2', name: 'Brix', isAi: false, color: 1 },
  { id: 's3', name: 'The Baron', isAi: true, color: 2 },
];

/**
 * The real game on a manual clock, played into the first good's walk (seed 7's Food), everyone a buyer at the bottom
 * edge. Only Lena (s1) has money, so only her bid counts; Brix (s2) holds 2 of the good and may sell; the AI holds none.
 */
function toWalk() {
  let now = 0;
  const timers: { at: number; fn: () => void }[] = [];
  const ctx: GameContext = {
    now: () => now,
    schedule: (ms, fn) => {
      const t = { at: now + ms, fn };
      timers.push(t);
      return () => {
        const i = timers.indexOf(t);
        if (i >= 0) timers.splice(i, 1);
      };
    },
    changed: () => {},
    frame: () => {},
    hostId: () => 's1',
  };
  const advance = (ms: number) => {
    now += ms;
    for (let due = timers.filter((t) => t.at <= now); due.length > 0; due = timers.filter((t) => t.at <= now)) {
      for (const t of due) {
        const i = timers.indexOf(t);
        if (i < 0) continue;
        timers.splice(i, 1);
        t.fn();
      }
    }
  };
  const game = new MuleGame(ctx, 7);
  game.start(seats);
  for (const s of seats) if (!s.isAi) game.handle(s.id, { type: 'ready' });
  for (let i = 0; i < 20_000 && game.viewFor(null).auction?.stage !== 'status'; i++) advance(WALK.tickMs);
  // The game keeps its engine state private; the test reaches it to arrange the store's shelf and the seats' money.
  const state = (game as unknown as { state: GameState }).state;
  const good = state.auction!.good!;
  state.store.stock[good] = 500;
  state.players.find((p) => p.id === 's2')!.stock[good] = 2;
  state.players.find((p) => p.id === 's3')!.stock[good] = 0;
  state.players.find((p) => p.id === 's1')!.money = 5_000;
  state.players.find((p) => p.id === 's2')!.money = 0;
  state.players.find((p) => p.id === 's3')!.money = 0;
  for (const s of seats) if (!s.isAi) game.handle(s.id, { type: 'ready' });
  for (let i = 0; i < 20_000 && game.viewFor(null).auction?.stage !== 'walk'; i++) advance(WALK.tickMs);
  expect(game.viewFor(null).auction?.stage, 'the premise: the walk has begun').toBe('walk');
  return { game, advance, state, good };
}

const lena = (game: MuleGame) => game.viewFor('s1').auction!.walkers.find((w) => w.id === 's1')!;

/**
 * The store sold out, Brix selling and resting at the sellers' edge, and Lena walking up `past` steps beyond the
 * store's old selling line (0: she stays at the bottom edge).
 */
function soldOut(past: number) {
  const t = toWalk();
  const S = t.state.auction!.zones.sellersBottom;
  t.state.store.stock[t.good] = 0;
  t.game.handle('s2', { type: 'declare', side: 'seller' });
  if (past > 0) {
    t.game.handle('s1', { type: 'walk', dir: 'up' });
    for (let i = 0; i < 2_000 && lena(t.game).price < S + past; i++) t.advance(WALK.tickMs);
    t.game.handle('s1', { type: 'walk', dir: 'stop' });
    expect(lena(t.game).price, 'the premise: Lena bid past the old line').toBe(S + past);
  }
  return { ...t, S };
}

function phoneScreen(view: MuleView, seatId: string): string {
  const self = view.players.find((p) => p.id === seatId)!;
  const client = { intent: () => {}, subscribe: () => () => {}, getState: () => ({ chat: [], view: null, seatId }) } as unknown as TableClient;
  const game = createElement(PhoneGameProvider, { value: { table: {} as TableView<MuleView>, view, me: view.me!, self, slot: self.slot as Slot }, children: createElement(Auction) });
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: game }));
}

function tvScreen(view: MuleView): string {
  const client = { intent: () => {}, subscribe: () => () => {}, getState: () => ({ chat: [], view: null, seatId: null }), serverNow: () => 0 } as unknown as TableClient;
  const table = { seats: [], hostId: 's1' } as unknown as TableView<MuleView>;
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(TvAuction, { table, game: view, auction: view.auction! }) }));
}

/** Lena's phone, Brix's phone and the TV, each as the server sends it. */
const screens = (game: MuleGame) => [
  { who: "Lena's phone", html: phoneScreen(game.viewFor('s1'), 's1') },
  { who: "Brix's phone", html: phoneScreen(game.viewFor('s2'), 's2') },
  { who: 'the TV', html: tvScreen(game.viewFor(null)) },
];

/** The text inside the first element carrying `testid`, tags dropped; null when absent. */
function textOf(html: string, testid: string): string | null {
  const open = html.indexOf(`data-testid="${testid}"`);
  if (open < 0) return null;
  const start = html.lastIndexOf('<', open);
  const tag = /^<(\w+)/.exec(html.slice(start))![1]!;
  let depth = 0;
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
  re.lastIndex = start;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0)
      return html
        .slice(start, m.index + m[0].length)
        .replace(/<[^>]+>/g, ' ')
        .replace(/&#x27;/g, "'")
        .replace(/\s+/g, ' ')
        .replace(/ ([.,:;?])/g, '$1')
        .trim();
  }
  return null;
}

/** Where a band of the board sits, in percent of the board's height from its top edge; null when not drawn. */
function bandOf(html: string, testid: string): { top: number; bottom: number } | null {
  const tag = html.match(new RegExp(`<[^>]*data-testid="${testid}"[^>]*>`))?.[0];
  if (!tag) return null;
  const top = Number(/top:([\d.]+)%/.exec(tag)?.[1]);
  const height = Number(/height:([\d.]+)%/.exec(tag)?.[1]);
  return { top, bottom: top + height };
}

/** A price's height on the board, in percent from its top edge, from the board's own range as the view sends it. */
const pctOf = (view: MuleView, price: number) => ((view.auction!.hi - price) / (view.auction!.hi - view.auction!.lo)) * 100;

describe('RULE-6: every board draws the rest zones', () => {
  it("B-AC-D1 (phone, TV): every board draws the sellers' zone from the top edge down to the store's selling line and the buyers' zone from its buying line down to the bottom edge, each saying nobody trades there", () => {
    const { game } = toWalk();
    const view = game.viewFor(null);
    const { buyersTop, sellersBottom } = view.auction!.zones!;
    for (const { who, html } of screens(game)) {
      const sellers = bandOf(html, 'rest-seller');
      const buyers = bandOf(html, 'rest-buyer');
      expect(sellers, `${who} draws the sellers' zone`).not.toBeNull();
      expect(buyers, `${who} draws the buyers' zone`).not.toBeNull();
      expect(sellers!.top, `${who}: the sellers' zone starts at the top edge`).toBe(0);
      expect(sellers!.bottom, `${who}: the sellers' zone ends at S`).toBeCloseTo(pctOf(view, sellersBottom), 6);
      expect(buyers!.top, `${who}: the buyers' zone starts at B`).toBeCloseTo(pctOf(view, buyersTop), 6);
      expect(buyers!.bottom, `${who}: the buyers' zone ends at the bottom edge`).toBeCloseTo(100, 6);
      expect(textOf(html, 'rest-seller'), who).toBe('SELLERS WAIT NO TRADE');
      expect(textOf(html, 'rest-buyer'), who).toBe('BUYERS WAIT NO TRADE');
    }
  });

  it("B-AC-D1 (phone, TV): once the store stops buying, the buyers' zone keeps its top at the old buying line", () => {
    const { game, state } = toWalk();
    state.auction!.storeBudget = 0;
    const view = game.viewFor(null);
    expect(view.auction!.storeBuys, 'the premise: the store buys no more').toBeNull();
    for (const { who, html } of screens(game)) {
      expect(bandOf(html, 'rest-buyer')?.top, `${who}: the buyers' zone still starts at B`).toBeCloseTo(pctOf(view, view.auction!.zones!.buyersTop), 6);
    }
  });
});

describe("RULE-7: a sold-out store's line shows the highest bid on every screen", () => {
  it("B-AC-E1 (phone, TV): sold out, once Lena bids past the old line every board's store line reads her bid as the highest bid, and the sellers' zone ends at it", () => {
    const { game } = soldOut(3);
    const bid = lena(game).price;
    const view = game.viewFor(null);
    for (const { who, html } of screens(game)) {
      expect(textOf(html, 'limit-follows'), `${who}: the line is her bid`).toBe(`SOLD OUT HIGHEST BID ${bid} ↑`);
      expect(textOf(html, 'limit-sells'), `${who}: the store sells at no line`).toBeNull();
      expect(bandOf(html, 'rest-seller')?.bottom, `${who}: the sellers' zone ends at the bid`).toBeCloseTo(pctOf(view, bid), 6);
    }
  });

  it('B-AC-E1 (phone, TV): sold out, the phone says the store sells none and the TV says bids pass its old price, with the highest bid', () => {
    const { game, S } = soldOut(3);
    const bid = lena(game).price;
    const buys = game.viewFor(null).auction!.storeBuys;
    expect(textOf(phoneScreen(game.viewFor('s1'), 's1'), 'sold-out-note')).toBe(`Store sold out. Nobody can buy from it; it still buys at ${buys}. Highest bid ${bid}.`);
    const tv = tvScreen(game.viewFor(null));
    expect(textOf(tv, 'tv-sold-out')).toBe(`Store sold out Bids can go past its old ${S}. Highest bid ${bid}`);
    expect(textOf(tv, 'tv-store'), "the TV's store box: it sells none").toMatch(/^Sells out /);
  });

  it("B-AC-E1 (phone, TV): sold out with no bid past the old line, every board's line reads the store sold out at its old price, never a bid", () => {
    const { game, S } = soldOut(0);
    for (const { who, html } of screens(game)) {
      expect(textOf(html, 'limit-follows'), who).toBe(`STORE SOLD OUT ${S}`);
    }
    expect(textOf(tvScreen(game.viewFor(null)), 'tv-sold-out')).toBe(`Store sold out Bids can go past its old ${S}.`);
    const buys = game.viewFor(null).auction!.storeBuys;
    expect(textOf(phoneScreen(game.viewFor('s1'), 's1'), 'sold-out-note')).toBe(`Store sold out. Nobody can buy from it; it still buys at ${buys}.`);
  });

  it("B-AC-E1 (TV): a store with none of the good and no old price to name says it is sold out and nothing more, never a sentence without its number", () => {
    const { game } = soldOut(0);
    const view = game.viewFor(null);
    // A store that never had the good: no selling line, and a view without zones (a record from before them).
    const { zones: _, ...auction } = { ...view.auction!, storeSells: null };
    expect(textOf(tvScreen({ ...view, auction }), 'tv-sold-out')).toBe('Store sold out');
  });

  it('B-AC-E1 (phone, TV): while the store sells, its line is its selling price, and no screen says sold out', () => {
    const { game } = toWalk();
    const S = game.viewFor(null).auction!.storeSells;
    for (const { who, html } of screens(game)) {
      expect(textOf(html, 'limit-sells'), who).toMatch(new RegExp(`^STORE SELLS ${S} · \\d+ LEFT$`));
      expect(textOf(html, 'limit-follows'), who).toBeNull();
      expect(textOf(html, 'sold-out-note'), who).toBeNull();
      expect(textOf(html, 'tv-sold-out'), who).toBeNull();
    }
  });
});
