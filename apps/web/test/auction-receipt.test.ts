import { WALK } from '@mule/engine';
import type { MuleView, TableView } from '@mule/protocol';
import { GOOD_NAME, type Slot } from '@mule/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MuleGame } from '../../server/src/mule-game.js';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { Auction } from '../src/phone/Auction';
import { PhoneGameProvider } from '../src/phone/game';
import { TvAuction } from '../src/table/TableApp';

type GameContext = ConstructorParameters<typeof MuleGame>[0];

const seats = [
  { id: 's1', name: 'Heiko', isAi: false, color: 0 },
  { id: 's2', name: 'Mia', isAi: false, color: 1 },
  { id: 's3', name: 'The Baron', isAi: true, color: 2 },
];

/**
 * A-5 (UX audit G-5, mock #audit-auction-receipt): the real game on a manual clock, played into the first good's walk
 * with Heiko selling and Mia buying, walked together until the walk ends: the close stage.
 */
function toClose() {
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
  const opened = { s1: game.viewFor('s1').players.find((p) => p.id === 's1')!.money, s2: game.viewFor('s2').players.find((p) => p.id === 's2')!.money };
  game.handle('s1', { type: 'declare', side: 'seller' });
  game.handle('s2', { type: 'declare', side: 'buyer' });
  game.handle('s1', { type: 'ready' });
  game.handle('s2', { type: 'ready' });
  for (let i = 0; i < 20_000 && game.viewFor(null).auction?.stage !== 'walk'; i++) advance(WALK.tickMs);
  game.handle('s1', { type: 'walk', dir: 'down' });
  game.handle('s2', { type: 'walk', dir: 'up' });
  for (let i = 0; i < 2_000 && game.viewFor(null).auction?.stage === 'walk'; i++) advance(WALK.tickMs);
  expect(game.viewFor(null).auction?.stage, 'the walk ends in the close stage').toBe('close');
  return { game, opened };
}

/** The phone's auction screen for this seat, drawn from the server's view of it. */
function phoneScreen(view: MuleView, seatId: string): string {
  const self = view.players.find((p) => p.id === seatId)!;
  const client = { intent: () => {}, subscribe: () => () => {}, getState: () => ({ chat: [], view: null, seatId }) } as unknown as TableClient;
  const screen = createElement(Auction);
  const game = createElement(PhoneGameProvider, { value: { table: {} as TableView<MuleView>, view, me: view.me!, self, slot: self.slot as Slot }, children: screen });
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: game }));
}

function tvScreen(view: MuleView): string {
  const client = { intent: () => {}, subscribe: () => () => {}, getState: () => ({ chat: [], view: null, seatId: null }) } as unknown as TableClient;
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(TvAuction, { table: {} as TableView<MuleView>, game: view, auction: view.auction! }) }));
}

/** The text inside the first element with this test id, tags stripped. */
function textOf(html: string, testid: string): string | null {
  const at = html.indexOf(`data-testid="${testid}"`);
  if (at < 0) return null;
  const open = html.lastIndexOf('<', at);
  const tag = html.slice(open + 1).match(/^[a-z0-9]+/)![0];
  let depth = 0;
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
  re.lastIndex = open;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(open, m.index + m[0].length).replace(/<[^>]+>/g, '').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&');
  }
  return null;
}

const fmt = (n: number) => Math.round(n).toLocaleString('en');
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '±0');

type Receipt = NonNullable<NonNullable<MuleView['auction']>['receipt']>;
const side = (units: number, price: number, tax: number, ...ids: string[]) => ({ units, gross: units * price, tax: units * tax, prices: Array<number>(units).fill(price), with: ids });
const none = side(0, 0, 0);

/** Heiko's real close-stage view (Mia and The Baron at the table), with the receipt and the good up next set by hand. */
function closeWith(receipt: Receipt, upNext: MuleView['auction'] extends infer A ? (A extends { upNext: infer U } ? U : never) : never = 'water'): MuleView {
  const view = toClose().game.viewFor('s1');
  return { ...view, auction: { ...view.auction!, good: 'food', receipt, upNext } };
}

describe('A-5 the receipt words, from hand-built views (the review fix round)', () => {
  it('B-AC-A5-6: 6 sold at 95 says the tax the engine took, 60 cr, not a rate that does not add up', () => {
    const html = phoneScreen(closeWith({ bought: none, sold: side(6, 95, 10, 's2') }), 's1');
    expect(textOf(html, 'receipt-title-sold')).toBe('Food: you sold 6 for 510 cr');
    expect(textOf(html, 'receipt-each')).toBe('6 × 95 cr to Mia');
    expect(textOf(html, 'receipt-tax')).toBe('570 cr, less 60 cr sales tax: 510The tax goes to the colony fund.');
  });

  it('B-AC-A5-7: a seat that bought and sold in one good gets a line for each side', () => {
    const html = phoneScreen(closeWith({ bought: side(2, 30, 0, 'store'), sold: side(1, 40, 4, 's2') }), 's1');
    expect(textOf(html, 'receipt-title-bought')).toBe('Food: you bought 2 for 60 cr');
    expect(textOf(html, 'receipt-title-sold')).toBe('Food: you sold 1 for 36 cr');
    expect(textOf(html, 'receipt-tax')).toBe('40 cr, less 4 cr sales tax: 36The tax goes to the colony fund.');
  });

  it('B-AC-A5-8: three counterparties are listed "Mia, the store and the ship"', () => {
    const html = phoneScreen(closeWith({ bought: none, sold: side(3, 50, 5, 's2', 'store', 'ship') }), 's1');
    expect(textOf(html, 'receipt-each')).toBe('3 × 50 cr to Mia, the store and the ship');
  });

  it("B-AC-A5-9: a seat that passed reads that it didn't trade", () => {
    const html = phoneScreen(closeWith({ bought: none, sold: none }), 's1');
    expect(textOf(html, 'receipt-title-none')).toBe('Food: you didn’t trade');
    expect(textOf(html, 'receipt-each')).toBeNull();
    expect(textOf(html, 'receipt-tax')).toBeNull();
  });

  it('B-AC-A5-10: after the last good there is no "Next:", and the button says the auction is closing', () => {
    const html = phoneScreen(closeWith({ bought: side(1, 30, 0, 'store'), sold: none }, null), 's1');
    expect(textOf(html, 'receipt')).not.toContain('Next:');
    expect(textOf(html, 'hint-how')).toBeNull();
    expect(textOf(html, 'done')).toBe('The auction is closing…');
    // Positive check of the same reads with a next good.
    const next = phoneScreen(closeWith({ bought: side(1, 30, 0, 'store'), sold: none }, 'water'), 's1');
    expect(textOf(next, 'receipt')).toContain('Next: Water, buy or sell?');
    expect(textOf(next, 'done')).toBe('Next: Water…');
  });
});

describe('A-5 the receipt on the phone (#audit-auction-receipt)', () => {
  it('B-AC-A5-1: the seller reads what it sold, for what after tax, with the tax spelled out', () => {
    const { game } = toClose();
    const view = game.viewFor('s1');
    const r = view.auction!.receipt!;
    const good = GOOD_NAME[view.auction!.good];
    const net = r.sold.gross - r.sold.tax;
    const html = phoneScreen(view, 's1');
    expect(html).toContain('data-testid="receipt-layer"');
    expect(textOf(html, 'receipt-title-sold')).toBe(`${good}: you sold ${r.sold.units} for ${fmt(net)} cr`);
    // The tax the engine took, unit by unit: the sentence adds up.
    expect(textOf(html, 'receipt-tax')).toBe(`${fmt(r.sold.gross)} cr, less ${fmt(r.sold.tax)} cr sales tax: ${fmt(net)}The tax goes to the colony fund.`);
    expect(textOf(html, 'receipt-title-bought')).toBeNull();
    expect(textOf(html, 'receipt-each')).toMatch(/ to (.* and )?Mia( and .*)?$/);
    const have = view.me!.stock[view.auction!.good];
    expect(textOf(html, 'receipt-stand')).toMatch(new RegExp(`^You have ${have} ${good}`));
  });

  it('B-AC-A5-2: the buyer reads what it bought and for how much, with no tax line', () => {
    const { game } = toClose();
    const view = game.viewFor('s2');
    const r = view.auction!.receipt!;
    const html = phoneScreen(view, 's2');
    expect(textOf(html, 'receipt-title-bought')).toBe(`${GOOD_NAME[view.auction!.good]}: you bought ${r.bought.units} for ${fmt(r.bought.gross)} cr`);
    expect(textOf(html, 'receipt-title-sold')).toBeNull();
    expect(textOf(html, 'receipt-tax')).toBeNull();
  });

  it("B-AC-A5-3: the header's month total under the money is what the auction did to that money", () => {
    const { game, opened } = toClose();
    for (const id of ['s1', 's2'] as const) {
      const view = game.viewFor(id);
      const money = view.players.find((p) => p.id === id)!.money;
      expect(textOf(phoneScreen(view, id), 'tally')).toBe(`this month${signed(money - opened[id])} cr`);
    }
  });

  it('B-AC-A5-4: the walk is over on the phone: no walking, the next good named', () => {
    const { game } = toClose();
    const view = game.viewFor('s1');
    const html = phoneScreen(view, 's1');
    const next = view.auction!.upNext;
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="hold-up"/);
    expect(textOf(html, 'hint-line')).toBe(`${GOOD_NAME[view.auction!.good]} is closed.`);
    if (next) expect(textOf(html, 'done')).toBe(`Next: ${GOOD_NAME[next]}…`);
  });

  it('B-AC-A5-5: the TV shows the close stage, and no seat’s receipt', () => {
    const { game } = toClose();
    const html = tvScreen(game.viewFor(null));
    expect(html).toContain('data-stage="close"');
    expect(textOf(html, 'tv-stage')).toBe('Closed');
    expect(html).not.toContain('data-testid="receipt"');
  });
});
