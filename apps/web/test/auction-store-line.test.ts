import { WALK, type GameState } from '@mule/engine';
import type { AuctionView, MuleView, TableView } from '@mule/protocol';
import type { Slot } from '@mule/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MuleGame } from '../../server/src/mule-game.js';
import { aimWords, lineAsk, lineHint, lineLimits, lineMoment, sellAsksFirst, startAmount, walkHint } from '../src/components/AuctionParts';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { Auction } from '../src/phone/Auction';
import { PhoneGameProvider } from '../src/phone/game';

/**
 * A-6 on the phone (UX audit G-1 and G-2's step), from the approved mock #audit-auction-store-line
 * (design/mocks/ws6-ux/src/screens/audit/auction/parts.tsx: LineQuestion, SellConfirm, LineAction, StepHold).
 */
type GameContext = ConstructorParameters<typeof MuleGame>[0];

const seats = [
  { id: 's1', name: 'Heiko', isAi: false, color: 0 },
  { id: 's2', name: 'Mia', isAi: false, color: 1 },
  { id: 's3', name: 'The Baron', isAi: true, color: 2 },
];

/** The real game on a manual clock, played into the first good's walk, s1 buying from a well-stocked store, alone. */
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
  game.handle('s1', { type: 'declare', side: 'buyer' });
  game.handle('s2', { type: 'declare', side: 'pass' });
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

describe('A-6 on the phone: at the store line you choose how many', () => {
  it('B-AC: at the store line the rail asks "Buy how many?" set to what you need, and the footer offers "Buy N for X cr"; nothing has traded', () => {
    const { game } = atTheLine();
    const view = game.viewFor('s1');
    const html = phoneScreen(view, 's1');
    const a = view.auction!;
    const have = view.me!.stock[a.good];
    const need = a.status.find((r) => r.id === 's1')!.need;
    const start = startAmount(Math.max(0, need - have), Math.min(a.storeForSale, Math.floor(view.players.find((p) => p.id === 's1')!.money / a.storeSells!)));
    expect(textOf(html, 'line-question')).toContain('Buy how many?');
    expect(textOf(html, 'amount')).toBe(String(start));
    expect(textOf(html, 'amount-aim')).toContain('Nothing trades until you tap Buy.');
    expect(textOf(html, 'line-go')).toBe(`Buy ${start} for ${start * a.storeSells!} cr`);
    // The question carries have and need, so the good's card steps aside; Hold ▼ stays to walk away.
    expect(tagOf(html, 'good-row')).toBeNull();
    expect(tagOf(html, 'hold-down')).not.toBeNull();
    expect(tagOf(html, 'hold-up')).toBeNull();
    expect(mine(game).order).toBeNull();
  });

  it('B-AC: while the chosen units move the rail says "Buying from the store: 1 of 2…" and Done waits; then "You bought 2 … for N cr"', () => {
    const { game, advance } = atTheLine();
    game.handle('s1', { type: 'lineTrade', units: 2 });
    for (let i = 0; i < 400 && mine(game).order!.traded < 1; i++) advance(WALK.tickMs);
    let html = phoneScreen(game.viewFor('s1'), 's1');
    expect(textOf(html, 'line-hint')).toBe('Buying from the store: 1 of 2… Press ▲ or ▼ to stop.');
    expect(tagOf(html, 'done')).toContain('disabled=""');
    expect(tagOf(html, 'hold-up')).not.toBeNull();
    for (let i = 0; i < 400 && mine(game).order!.traded < 2; i++) advance(WALK.tickMs);
    const view = game.viewFor('s1');
    html = phoneScreen(view, 's1');
    const name = { food: 'Food', water: 'Water', energy: 'Energy' }[view.auction!.good as 'food'] ?? '';
    expect(textOf(html, 'line-hint')).toContain(`You bought 2 ${name} for ${mine(game).order!.cr} cr.`);
    expect(tagOf(html, 'done')).not.toContain('disabled=""');
  });

  it('B-AC: letting go of ▲ while units move stops them, and the phone says what was traded', () => {
    const { game, advance } = atTheLine();
    game.handle('s1', { type: 'lineTrade', units: 9 });
    for (let i = 0; i < 400 && mine(game).order!.traded < 1; i++) advance(WALK.tickMs);
    game.handle('s1', { type: 'walk', dir: 'up' });
    game.handle('s1', { type: 'walk', dir: 'stop' });
    for (let i = 0; i < 20; i++) advance(WALK.tickMs);
    expect(mine(game).order).toMatchObject({ units: 1, traded: 1 });
    expect(textOf(phoneScreen(game.viewFor('s1'), 's1'), 'line-hint')).toMatch(/^You bought 1 /);
  });

  it('G-2: the walk buttons and the hint say a tap moves one step', () => {
    const { game } = toWalk();
    const html = phoneScreen(game.viewFor('s1'), 's1');
    expect(tagOf(html, 'hold-up')).toContain('aria-label="Hold to walk up; a tap moves one step"');
    expect(textOf(html, 'hint-how')).toBe('Hold ▲ to walk up; a tap moves 1 cr.');
  });
});

describe('A-6 the line, in pure parts', () => {
  const auction = (over: Partial<AuctionView> = {}): AuctionView =>
    ({ good: 'water', storeSells: 30, storeBuys: 8, storeForSale: 4, shipQuote: [], ...over }) as AuctionView;

  it('the moment follows the engine: walk, line, trading, done', () => {
    expect(lineMoment(undefined)).toEqual({ kind: 'walk' });
    expect(lineMoment({ side: 'pass', line: 'store', order: null })).toEqual({ kind: 'walk' });
    expect(lineMoment({ side: 'buyer', line: null, order: null })).toEqual({ kind: 'walk' });
    expect(lineMoment({ side: 'buyer', line: 'store', order: null })).toEqual({ kind: 'line', house: 'store' });
    expect(lineMoment({ side: 'buyer', line: 'store', order: { house: 'store', units: 2, traded: 1, cr: 30 } }).kind).toBe('trading');
    expect(lineMoment({ side: 'buyer', line: 'store', order: { house: 'store', units: 2, traded: 2, cr: 60 } }).kind).toBe('done');
  });

  it('negative: the amount is clamped to what the store has and you can pay for, and never under 1', () => {
    expect(lineLimits(auction(), 'buyer', 'store', 0, 9, 1_000)).toEqual({ aim: 9, max: 4 });
    expect(lineLimits(auction(), 'buyer', 'store', 0, 9, 65)).toEqual({ aim: 9, max: 2 });
    expect(lineAsk(auction(), 'buyer', 'store', 9, 0, 9, 65)).toMatchObject({ amount: 2, total: 60 });
    expect(lineAsk(auction(), 'buyer', 'store', 0, 0, 9, 65).amount).toBe(1);
  });

  it('negative: a seller can choose no more than it holds, and at the ship no more than it still wants', () => {
    expect(lineLimits(auction(), 'seller', 'store', 3, 2, 0)).toEqual({ aim: 1, max: 3 });
    expect(lineLimits(auction({ shipQuote: [120, 116] }), 'seller', 'ship', 5, 0, 0)).toEqual({ aim: 5, max: 2 });
  });

  it("the ship's total adds its falling prices", () => {
    expect(lineAsk(auction({ shipQuote: [120, 116, 112] }), 'seller', 'ship', 2, 5, 0, 0).total).toBe(236);
  });

  it('selling past your spare asks first; at or under it does not', () => {
    const ask = (amount: number) => lineAsk(auction(), 'seller', 'store', amount, 3, 2, 0);
    expect(sellAsksFirst(ask(1))).toBe(false);
    expect(sellAsksFirst(ask(2))).toBe(true);
    expect(sellAsksFirst(lineAsk(auction(), 'buyer', 'store', 4, 0, 1, 1_000))).toBe(false);
  });

  it("the mock's words under the amount", () => {
    expect(aimWords(lineAsk(auction(), 'buyer', 'store', 2, 0, 2, 1_000))).toBe('what you need');
    expect(aimWords(lineAsk(auction(), 'buyer', 'store', 3, 0, 2, 1_000))).toBe('1 more than you need');
    expect(aimWords(lineAsk(auction(), 'seller', 'store', 1, 3, 2, 0))).toBe('your spare one');
    expect(aimWords(lineAsk(auction(), 'seller', 'store', 2, 3, 2, 0))).toBe('1 more than your spare');
    expect(aimWords(lineAsk(auction(), 'seller', 'store', 1, 2, 2, 0))).toBe('you need all you have');
  });

  it("the trading and done words: a sale is told after the tax, and a stop that traded nothing says so", () => {
    expect(lineHint({ kind: 'trading', house: 'ship', units: 3, traded: 1, cr: 108 }, 'seller', 'crystite', 4, 0).line).toBe('Selling to the ship: 1 of 3…');
    expect(lineHint({ kind: 'done', house: 'store', units: 2, traded: 2, cr: 14 }, 'seller', 'water', 1, 2)).toEqual({
      line: 'You sold 2 Water for 14 cr.',
      how: 'You have 1 of the 2 you need. Tap Done with Water when you’re finished.',
    });
    expect(lineHint({ kind: 'done', house: 'store', units: 0, traded: 0, cr: 0 }, 'buyer', 'food', 0, 2).line).toBe('Stopped: nothing traded.');
  });

  it('G-2: the hint says a tap moves one step, for a seller too', () => {
    const view = { players: [], me: null } as unknown as MuleView;
    expect(walkHint(view, auction({ walkers: [{ id: 'lena', side: 'seller', price: 40, at: 40, dir: 0, done: false, units: 3 }] }), 'lena', 3).how).toBe('Hold ▼ to walk down; a tap moves 1 cr.');
  });
});
