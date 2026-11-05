import { WALK, type GameState } from '@mule/engine';
import type { AuctionView, MuleView, TableView } from '@mule/protocol';
import type { Slot } from '@mule/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MuleGame } from '../../server/src/mule-game.js';
import { dealSpeed, keepWords, lineHint, lineMoment, linePrice, toggleSide, walkHint } from '../src/components/AuctionParts';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { Auction } from '../src/phone/Auction';
import { TvAuction } from '../src/table/TableApp';
import { PhoneGameProvider } from '../src/phone/game';

/**
 * The auto-trade amendment on the phone, until WS6's screen (mock design/mocks/goods-auction, variant A) replaces the
 * rail and footer: at a house's line nothing is asked, the rail says what is trading and how to stop, selling below
 * next month's need is shown, never asked, and there is no Pass. G-2's step words stay.
 */
type GameContext = ConstructorParameters<typeof MuleGame>[0];

const seats = [
  { id: 's1', name: 'Heiko', isAi: false, color: 0 },
  { id: 's2', name: 'Mia', isAi: false, color: 1 },
  { id: 's3', name: 'The Baron', isAi: true, color: 2 },
];

/** The real game on a manual clock, played into the first good's walk, s1 buying from a well-stocked store, alone (s2 has no money). */
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
  const state = (game as unknown as { state: GameState }).state;
  const good = state.auction!.good!;
  state.store.stock[good] = 500;
  for (const p of state.players) if (p.id !== 's1') p.stock[good] = 0;
  state.players.find((p) => p.id === 's1')!.money = 5_000;
  state.players.find((p) => p.id === 's2')!.money = 0;
  state.players.find((p) => p.id === 's3')!.money = 0;
  // The side pick has no clock (A-7): both phones press Ready once their sides are picked.
  for (const s of seats) if (!s.isAi) game.handle(s.id, { type: 'ready' });
  for (let i = 0; i < 20_000 && game.viewFor(null).auction?.stage !== 'walk'; i++) advance(WALK.tickMs);
  expect(game.viewFor(null).auction?.stage).toBe('walk');
  return { game, advance, state, good };
}

/** s1 walks up to the store's line and lets go. */
function atTheLine() {
  const t = toWalk();
  t.game.handle('s1', { type: 'walk', dir: 'up' });
  for (let i = 0; i < 400 && mine(t.game).line !== 'store'; i++) t.advance(WALK.tickMs);
  t.game.handle('s1', { type: 'walk', dir: 'stop' });
  expect(mine(t.game).line).toBe('store');
  return t;
}

const mine = (game: MuleGame) => game.viewFor('s1').auction!.walkers.find((w) => w.id === 's1')!;

function phoneScreen(view: MuleView, seatId: string): string {
  const self = view.players.find((p) => p.id === seatId)!;
  const client = { intent: () => {}, subscribe: () => () => {}, getState: () => ({ chat: [], view: null, seatId }) } as unknown as TableClient;
  const screen = createElement(Auction);
  const game = createElement(PhoneGameProvider, { value: { table: {} as TableView<MuleView>, view, me: view.me!, self, slot: self.slot as Slot }, children: screen });
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: game }));
}

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
        .replace(/ ([.,:?])/g, '$1')
        .trim();
  }
  return null;
}

const tagOf = (html: string, testid: string) => html.match(new RegExp(`<[^>]*data-testid="${testid}"[^>]*>`))?.[0] ?? null;

describe('the auto-trade amendment on the phone: at the store line units trade by themselves', () => {
  it('B-AC-2 (phone): at the store line the phone asks nothing; the rail says she is buying and how to stop, and both walk buttons stay', () => {
    const { game, advance } = atTheLine();
    for (let i = 0; i < 400 && game.viewFor('s1').auction!.deals.length === 0; i++) advance(WALK.tickMs);
    const view = game.viewFor('s1');
    const html = phoneScreen(view, 's1');
    const name = { food: 'Food', water: 'Water', energy: 'Energy' }[view.auction!.good as 'food'] ?? '';
    expect(textOf(html, 'line-hint')).toBe(`Buying ${name} from the store at ${view.auction!.storeSells} cr, faster and faster. Tap ▼ to stop.`);
    for (const gone of ['line-question', 'line-go', 'amount', 'sell-confirm']) expect(tagOf(html, gone), gone).toBeNull();
    expect(tagOf(html, 'hold-up')).not.toBeNull();
    expect(tagOf(html, 'hold-down')).not.toBeNull();
  });

  it('F5 (WS6 ruling): a buyer at the store line who can\'t pay for one is told why: "You can\'t pay for one at N cr"', () => {
    const { game, state, advance } = atTheLine();
    const price = game.viewFor('s1').auction!.storeSells!;
    state.players.find((p) => p.id === 's1')!.money = price - 1;
    // Mia can still pay, so the good stays open; one tick, so the deal the last one ran ends.
    state.players.find((p) => p.id === 's2')!.money = 5_000;
    advance(WALK.tickMs);
    const html = phoneScreen(game.viewFor('s1'), 's1');
    expect(textOf(html, 'line-reason')).toBe(`You can't pay for one at ${price} cr`);
  });

  it('F5 (WS6 ruling): a seller at the store line with none left is told why: "You have no <Good> to sell"', () => {
    const { game, advance, state, good } = toWalk();
    const s1 = state.players.find((p) => p.id === 's1')!;
    s1.stock[good] = 5;
    game.handle('s1', { type: 'declare', side: 'seller' });
    game.handle('s1', { type: 'walk', dir: 'down' });
    for (let i = 0; i < 400 && mine(game).line !== 'store'; i++) advance(WALK.tickMs);
    game.handle('s1', { type: 'walk', dir: 'stop' });
    expect(mine(game).line).toBe('store');
    s1.stock[good] = 0;
    state.players.find((p) => p.id === 's2')!.money = 5_000;
    advance(WALK.tickMs);
    const view = game.viewFor('s1');
    const html = phoneScreen(view, 's1');
    const name = { food: 'Food', water: 'Water', energy: 'Energy', smithore: 'Smithore' }[view.auction!.good as 'food'];
    expect(textOf(html, 'line-reason')).toBe(`You have no ${name} to sell`);
  });

  it('G-2: the walk buttons and the hint say a tap moves one step', () => {
    const { game } = toWalk();
    const html = phoneScreen(game.viewFor('s1'), 's1');
    expect(tagOf(html, 'hold-up')).toContain('aria-label="Hold to walk up; a tap moves one step"');
    expect(textOf(html, 'hint-how')).toBe('Hold ▲ to walk up; a tap moves 1 cr.');
  });

  it('RULE-2 (phone): the walk offers Buyer and Seller only, no Pass', () => {
    const { game } = toWalk();
    const html = phoneScreen(game.viewFor('s1'), 's1');
    expect(html).toContain('>Buyer<');
    expect(html).toContain('>Seller<');
    expect(html).not.toContain('>Pass<');
  });
});

describe('the line, in pure parts', () => {
  const deal = (buyer: string, seller: string) => ({ buyer, seller });

  it('the moment follows the engine: walking; at a line trading by itself; at a line with nothing moving', () => {
    expect(lineMoment(undefined, [])).toEqual({ kind: 'walk' });
    expect(lineMoment({ id: 'a', side: 'buyer', line: null }, [])).toEqual({ kind: 'walk' });
    expect(lineMoment({ id: 'a', side: 'buyer', line: 'store' }, [])).toEqual({ kind: 'line', house: 'store' });
    expect(lineMoment({ id: 'a', side: 'buyer', line: 'store' }, [deal('a', 'store')])).toEqual({ kind: 'trading', house: 'store' });
    expect(lineMoment({ id: 'a', side: 'seller', line: 'ship' }, [deal('ship', 'a')])).toEqual({ kind: 'trading', house: 'ship' });
    // Two at one line take its units in turns: the deal names whoever got the last one, and the rail holds still.
    expect(lineMoment({ id: 'a', side: 'buyer', line: 'store' }, [deal('b', 'store')])).toEqual({ kind: 'trading', house: 'store' });
    expect(lineMoment({ id: 'a', side: 'seller', line: 'store' }, [deal('store', 'b')])).toEqual({ kind: 'trading', house: 'store' });
    // One who can't pay (or holds none) is not trading, whoever else is.
    expect(lineMoment({ id: 'a', side: 'buyer', line: 'store' }, [deal('b', 'store')], false)).toEqual({ kind: 'line', house: 'store' });
  });

  it('variant A: the hint says what trades, at what price, faster and faster; what you keep is its own note, never a question', () => {
    expect(lineHint({ kind: 'trading', house: 'store' }, 'seller', 'water', 27)).toEqual({ line: 'Selling Water to the store at 27 cr, faster and faster.', how: 'Tap ▲ to stop.' });
    expect(lineHint({ kind: 'trading', house: 'ship' }, 'seller', 'crystite', 120)).toEqual({ line: 'Selling Crystite to the ship at 120 cr, faster and faster.', how: 'Tap ▲ to stop.' });
    expect(lineHint({ kind: 'trading', house: 'store' }, 'buyer', 'food', 36).how).toBe('Tap ▼ to stop.');
    expect(keepWords('water', 1, 3)).toBe('You keep 1 of the 3 Water you need next month.');
  });

  it('RULE-2: a tap on your own side keeps it; there is no Pass to toggle into', () => {
    expect(toggleSide('buyer', 'buyer')).toBe('buyer');
    expect(toggleSide('buyer', 'seller')).toBe('seller');
    expect(toggleSide('seller', 'seller')).toBe('seller');
  });

  it('G-2: the hint says a tap moves one step, for a seller too', () => {
    const view = { players: [], me: null } as unknown as MuleView;
    const auction = { good: 'water', storeSells: 30, storeBuys: 8, storeForSale: 4, shipQuote: [], walkers: [{ id: 'lena', side: 'seller', price: 40, at: 40, dir: 0, done: false, units: 3 }] } as unknown as AuctionView;
    expect(walkHint(view, auction, 'lena', 3).how).toBe('Hold ▼ to walk down; a tap moves 1 cr.');
  });
});

/**
 * WS6's screen for the auto-trade amendment (mock design/mocks/goods-auction at b0279fd8, variant A, Heiko's pick):
 * the deal's speed-up on the board, the rail's words while units trade, the keep note when selling into your need,
 * the switch's caption, and the TV's deal row. Supersedes the interim rows above where their words changed.
 */
describe('WS6 variant A: the auction trades by itself, faster and faster, on the board', () => {
  /** s1 a seller with `extra` units over its need, walked down to the store's buying line. */
  function sellingAtTheLine(extra: number) {
    const t = toWalk();
    const s1 = t.state.players.find((p) => p.id === 's1')!;
    const need = t.game.viewFor('s1').auction!.status.find((r) => r.id === 's1')!.need;
    s1.stock[t.good] = need + extra;
    t.game.handle('s1', { type: 'declare', side: 'seller' });
    t.game.handle('s1', { type: 'walk', dir: 'down' });
    for (let i = 0; i < 400 && mine(t.game).line !== 'store'; i++) t.advance(WALK.tickMs);
    t.game.handle('s1', { type: 'walk', dir: 'stop' });
    return { ...t, need };
  }
  const lit = (html: string) => Number(/aria-label="speed (\d) of 4"/.exec(html)?.[1] ?? 0);

  it('B-AC-1 (variant A): while units trade the board lights the deal’s chevrons, more of them as it speeds up', () => {
    const { game, advance } = atTheLine();
    for (let i = 0; i < 400 && game.viewFor('s1').auction!.deals.length === 0; i++) advance(WALK.tickMs);
    const first = lit(phoneScreen(game.viewFor('s1'), 's1'));
    expect(first).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < 30 && game.viewFor('s1').auction!.deals[0]!.units < 9; i++) advance(WALK.tickMs);
    const later = lit(phoneScreen(game.viewFor('s1'), 's1'));
    expect(later).toBe(4);
    expect(later).toBeGreaterThan(first);
  });

  it('B-AC-1 (variant A): the rail says what is trading, at what price, faster and faster, and how to stop', () => {
    const { game, advance } = atTheLine();
    for (let i = 0; i < 400 && game.viewFor('s1').auction!.deals.length === 0; i++) advance(WALK.tickMs);
    const view = game.viewFor('s1');
    const name = { food: 'Food', water: 'Water', energy: 'Energy' }[view.auction!.good as 'food'] ?? '';
    expect(textOf(phoneScreen(view, 's1'), 'line-hint')).toBe(`Buying ${name} from the store at ${view.auction!.storeSells} cr, faster and faster. Tap ▼ to stop.`);
  });

  it('"show, don\'t stop" (variant A): selling into next month’s need turns HAVE amber and says what you keep, apart from the hint', () => {
    const { game, advance, need } = sellingAtTheLine(1);
    expect(need).toBeGreaterThan(0);
    for (let i = 0; i < 400 && (game.viewFor('s1').me!.stock[game.viewFor('s1').auction!.good] ?? 0) >= need; i++) advance(WALK.tickMs);
    const view = game.viewFor('s1');
    const have = view.me!.stock[view.auction!.good];
    const html = phoneScreen(view, 's1');
    const name = { food: 'Food', water: 'Water', energy: 'Energy', smithore: 'Smithore' }[view.auction!.good as 'food'];
    expect(textOf(html, 'keep')).toBe(`You keep ${have} of the ${need} ${name} you need next month.`);
    expect(tagOf(html, 'have')).toContain('text-warn');
    expect(textOf(html, 'line-hint')).not.toContain('you keep');
  });

  it('the rail’s price is the line’s own: its running deal, else its house’s line, the ship’s too (WS3’s review of #335)', () => {
    const auction = { storeSells: 38, storeBuys: 30, shipPays: 120, deals: [] as AuctionView['deals'] };
    // A seller at the ship's line, no unit moving this tick: the ship's price, never the store's.
    expect(linePrice(auction, 'seller', 'ship')).toBe(120);
    expect(linePrice(auction, 'seller', 'store')).toBe(30);
    expect(linePrice(auction, 'buyer', 'store')).toBe(38);
    // Two sellers share the store's line: the deal names whoever took the last unit; the price is still the line's.
    const shared = { ...auction, deals: [{ buyer: 'store', seller: 'mia', price: 29, units: 4 }] };
    expect(linePrice(shared, 'seller', 'store')).toBe(29);
  });

  it('the speed follows WALK’s curve: 0 at the first unit, 1 from the floor on', () => {
    expect(dealSpeed(0)).toBe(0);
    expect(dealSpeed(1)).toBeGreaterThan(0);
    expect(dealSpeed(20)).toBe(1);
  });

  it('RULE-2 (variant A): the switch says where a tap puts you', () => {
    const { game } = toWalk();
    expect(textOf(phoneScreen(game.viewFor('s1'), 's1'), 'sides-caption')).toBe('Sell puts you at the top, asking.');
  });

  it('B-AC-1 (variant A, TV): each running deal’s row shows its speed and says faster and faster', () => {
    const { game, advance } = atTheLine();
    for (let i = 0; i < 400 && game.viewFor(null).auction!.deals.length === 0; i++) advance(WALK.tickMs);
    const board = game.viewFor(null);
    const client = { intent: () => {}, subscribe: () => () => {}, getState: () => ({ chat: [], view: null, seatId: null }), serverNow: () => 0 } as unknown as TableClient;
    const table = { seats: [], hostId: 's1' } as unknown as TableView<MuleView>;
    const html = renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(TvAuction, { table, game: board, auction: board.auction! }) }));
    expect(textOf(html, 'tv-deal')).toMatch(/faster and faster/);
    expect(tagOf(html, 'tv-deal-speed')).toMatch(/aria-label="speed [1-4] of 4"/);
  });
});
