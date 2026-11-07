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
import { BOARD_TYPE, labelLines } from '../../../packages/ui/src/components/board-layout';

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
  { who: "Lena's phone", size: 'phone' as const, html: phoneScreen(game.viewFor('s1'), 's1') },
  { who: "Brix's phone", size: 'phone' as const, html: phoneScreen(game.viewFor('s2'), 's2') },
  { who: 'the TV', size: 'tv' as const, html: tvScreen(game.viewFor(null)) },
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

/** The rest band's words sit this far in from the band's edge (top-0.5 / bottom-0.5). */
const BAND_INSET = 2;

/**
 * Every line label the board draws, as px boxes down the board: centred where the markup places it, as tall as the
 * board's own label lines make its two rows. Reads only the rendered markup and BOARD_TYPE.
 */
function labelBoxes(html: string, size: 'tv' | 'phone'): { top: number; bottom: number }[] {
  const { room, lineBox, perLine } = BOARD_TYPE[size];
  const label = /<div [^>]*style="top:([\d.]+)%"[^>]*data-testid="limit-[^"]+"><span [^>]*style="width:\d+px;top:(-?[\d.e-]+)(?:px)?"><span[^>]*>([^<]*)<\/span><span>([^<]*)<\/span>/g;
  return [...html.matchAll(label)].map(([, pct, offset, who, text]) => {
    const centre = (Number(pct) / 100) * room + Number(offset);
    const half = ((labelLines(who!, perLine) + labelLines(text!, perLine)) * lineBox) / 2;
    return { top: centre - half, bottom: centre + half };
  });
}

/**
 * A rest band's words as shown, checked against the board's own label lines: one of `forms` (longest first) or none;
 * it fits between the band's inset edge and the nearest line label reaching into the band; and the next longer form
 * would not. The sellers' words sit at the band's top, the buyers' at its bottom.
 */
function bandWords(html: string, size: 'tv' | 'phone', tone: 'seller' | 'buyer', forms: string[], what: string): string {
  const { room, lineBox, perLine } = BOARD_TYPE[size];
  const band = bandOf(html, `rest-${tone}`)!;
  const [top, bottom] = [(band.top / 100) * room, (band.bottom / 100) * room];
  const inside = labelBoxes(html, size).filter((b) => b.top < bottom && b.bottom > top);
  const clear = (tone === 'seller' ? Math.min(bottom, ...inside.map((b) => b.top)) - top : bottom - Math.max(top, ...inside.map((b) => b.bottom))) - BAND_INSET;
  const height = (form: string) => form.split(' · ').reduce((n, part) => n + labelLines(part, perLine), 0) * lineBox;
  const words = textOf(html, `rest-${tone}`) ?? '';
  const shown = forms.findIndex((f) => f.replaceAll(' · ', ' ') === words);
  const where = `${what}: the ${tone}s' band says "${words}" in ${clear.toFixed(0)} px`;
  expect(shown >= 0 || words === '', `${where}: a known form`).toBe(true);
  if (shown >= 0) expect(height(forms[shown]!), where).toBeLessThanOrEqual(clear);
  const longer = shown >= 0 ? forms[shown - 1] : forms.at(-1);
  if (longer) expect(height(longer), `${where}; "${longer}" would not fit`).toBeGreaterThan(clear);
  return words;
}

const SELLERS = ['SELLERS WAIT · NO TRADE', 'SELLERS WAIT'];
const BUYERS = ['BUYERS WAIT · NO TRADE', 'BUYERS WAIT'];
const SHIP_INSIDE = { tv: ['SELLERS WAIT · ONLY THE SHIP BUYS', 'SELLERS WAIT · SHIP ONLY', 'SELLERS WAIT'], phone: ['SELLERS WAIT · SHIP ONLY', 'SELLERS WAIT'] };

/** A price's height on the board, in percent from its top edge, from the board's own range as the view sends it. */
const pctOf = (view: MuleView, price: number) => ((view.auction!.hi - price) / (view.auction!.hi - view.auction!.lo)) * 100;

describe('RULE-6: every board draws the rest zones', () => {
  it("B-AC-D1 (phone, TV): every board draws the sellers' zone from the top edge down to the store's selling line and the buyers' zone from its buying line down to the bottom edge, each saying nobody trades there", () => {
    const { game } = toWalk();
    const view = game.viewFor(null);
    const { buyersTop, sellersBottom } = view.auction!.zones!;
    for (const { who, size, html } of screens(game)) {
      const sellers = bandOf(html, 'rest-seller');
      const buyers = bandOf(html, 'rest-buyer');
      expect(sellers, `${who} draws the sellers' zone`).not.toBeNull();
      expect(buyers, `${who} draws the buyers' zone`).not.toBeNull();
      expect(sellers!.top, `${who}: the sellers' zone starts at the top edge`).toBe(0);
      expect(sellers!.bottom, `${who}: the sellers' zone ends at S`).toBeCloseTo(pctOf(view, sellersBottom), 6);
      expect(buyers!.top, `${who}: the buyers' zone starts at B`).toBeCloseTo(pctOf(view, buyersTop), 6);
      expect(buyers!.bottom, `${who}: the buyers' zone ends at the bottom edge`).toBeCloseTo(100, 6);
      // Each band's words: the longest that fits above the line labels; the TV has room for them whole.
      const words = [bandWords(html, size, 'seller', SELLERS, who), bandWords(html, size, 'buyer', BUYERS, who)];
      if (size === 'tv') expect(words, who).toEqual(['SELLERS WAIT NO TRADE', 'BUYERS WAIT NO TRADE']);
    }
  });

  it("B-AC-D1 (phone, TV): when the ship pays inside the sellers' zone, its band says only the ship buys there: the short form on a phone, the long one on the TV (WS6)", () => {
    const { game } = toWalk();
    const S = game.viewFor(null).auction!.zones!.sellersBottom;
    // The ship a step above S, so its label stacks with the store's at the band's edge, under the words.
    const withShip = (view: MuleView): MuleView => ({ ...view, auction: { ...view.auction!, shipPays: S + 1 } });
    expect(withShip(game.viewFor(null)).auction!.shipPays!, 'the premise: the ship pays above S').toBeGreaterThan(S);
    // Phones: the ship's words, as long as fit (the full short form is reached in the thin-band sweep below).
    for (const id of ['s1', 's2']) bandWords(phoneScreen(withShip(game.viewFor(id)), id), 'phone', 'seller', SHIP_INSIDE.phone, id);
    const tv = tvScreen(withShip(game.viewFor(null)));
    // The TV names the ship on a board tall enough for its words: the store's spread sets how much of the board the
    // sellers' band takes (its full long form is reached in the thin-band sweep below).
    const tall = (view: MuleView): MuleView => ({ ...view, auction: { ...view.auction!, hi: view.auction!.hi + 20 } });
    expect(bandWords(tvScreen(tall(withShip(game.viewFor(null)))), 'tv', 'seller', SHIP_INSIDE.tv, 'the TV')).toMatch(/SHIP/);
    // The buyers' band never changes, and a ship at or under S leaves the sellers' band as it was.
    // On a taller board, so the band has room for the full words: a ship exactly at S is not inside it.
    const atS = (view: MuleView): MuleView => ({ ...view, auction: { ...view.auction!, hi: view.auction!.hi + 20, shipPays: S } });
    expect(bandWords(tv, 'tv', 'buyer', BUYERS, 'the TV')).toBe('BUYERS WAIT NO TRADE');
    expect(bandWords(tvScreen(atS(game.viewFor(null))), 'tv', 'seller', SELLERS, 'the TV, ship at S')).toBe('SELLERS WAIT NO TRADE');
    bandWords(phoneScreen(atS(game.viewFor('s1')), 's1'), 'phone', 'seller', SELLERS, 's1, ship at S');
  });

  it("B-AC-D1 (phone, TV): a rest band shows the longest of its words that fits above the line labels reaching into it, never under them or past its edge (WS4)", () => {
    const { game } = soldOut(0);
    const seen = { tv: new Set<string>(), phone: new Set<string>() };
    const { hi: top, zones } = game.viewFor(null).auction!;
    // Sold out, a bid ever closer to the top edge thins the sellers' band; the ship pays inside it, a step above the bid.
    // The board as it is and a taller one, so the bands run from roomy to a single step.
    const cases = [top, top + 20].flatMap((hi) => Array.from({ length: hi - zones!.sellersBottom - 1 }, (_, i) => ({ hi, bid: zones!.sellersBottom + 1 + i })));
    for (const { hi, bid } of cases) {
      const staged = (view: MuleView): MuleView => ({ ...view, auction: { ...view.auction!, hi, storeSells: bid, storeSellsBid: true, shipPays: bid + 1 } });
      for (const [size, html] of [
        ['tv', tvScreen(staged(game.viewFor(null)))],
        ['phone', phoneScreen(staged(game.viewFor('s1')), 's1')],
      ] as const) {
        const words = bandWords(html, size, 'seller', SHIP_INSIDE[size], `${size}, hi ${hi}, bid ${bid}`);
        seen[size].add(words);
      }
    }
    // The staging reaches both the full words and a shorter form on each board.
    expect([...seen.tv]).toEqual(expect.arrayContaining(['SELLERS WAIT ONLY THE SHIP BUYS']));
    expect([...seen.phone]).toEqual(expect.arrayContaining(['SELLERS WAIT SHIP ONLY']));
    expect(seen.tv.size, `the TV's forms: ${[...seen.tv].join(' | ')}`).toBeGreaterThan(1);
    expect(seen.phone.size, `the phone's forms: ${[...seen.phone].join(' | ')}`).toBeGreaterThan(1);
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

  it("B-AC-E1 (TV): a store that never posted a selling price for the good says bids set it, never a sentence without its number (WS6)", () => {
    const { game } = soldOut(0);
    const view = game.viewFor(null);
    // A store that never had the good: no selling line, and a view without zones (a record from before them).
    const { zones: _, ...auction } = { ...view.auction!, storeSells: null };
    expect(textOf(tvScreen({ ...view, auction }), 'tv-sold-out')).toBe('Store sold out No store price yet: bids set it.');
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
