import { WALK } from '@mule/engine';
import type { AuctionView, MuleView, TableView } from '@mule/protocol';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MuleGame } from '../../server/src/mule-game.js';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { TvAuction } from '../src/table/TableApp';

/** The TV goods auction, as the 6 Nov screen sweep found it: what the table reads off the big screen. */
type GameContext = ConstructorParameters<typeof MuleGame>[0];

const seats = [
  { id: 's1', name: 'Heiko', isAi: false, color: 0 },
  { id: 's2', name: 'The Accountant', isAi: true, color: 1 },
  { id: 's3', name: 'The Big Spender', isAi: true, color: 2 },
  { id: 's4', name: 'The Grudge', isAi: true, color: 3 },
];

/** A real game's board view at the first good's status screen. */
function statusView(): MuleView {
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
  game.handle('s1', { type: 'ready' });
  for (let i = 0; i < 20_000 && game.viewFor(null).auction?.stage !== 'status'; i++) advance(WALK.tickMs);
  const view = game.viewFor(null);
  expect(view.auction?.stage).toBe('status');
  return view;
}

let base: MuleView | null = null;
/** The status screen's view, its auction then set to `auction`. */
function tvView(auction: Partial<AuctionView>): MuleView {
  base ??= statusView();
  return { ...base, auction: { ...base.auction!, ...auction } };
}

function tvScreen(view: MuleView): string {
  const client = { intent: () => {}, subscribe: () => () => {}, getState: () => ({ chat: [], view: null, seatId: null }), serverNow: () => 0 } as unknown as TableClient;
  const table = { seats: [], hostId: 's1', code: 'HSQB' } as unknown as TableView<MuleView>;
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(TvAuction, { table, game: view, auction: view.auction! }) }));
}

/** The markup of the first element carrying `testid`, by balancing its tag; '' if none. */
function inside(html: string, testid: string): string {
  const open = html.match(new RegExp(`<(\\w+)[^>]*data-testid="${testid}"[^>]*>`));
  if (!open) return '';
  const name = open[1]!;
  const from = open.index!;
  let depth = 0;
  const re = new RegExp(`<${name}[\\s>]|</${name}>`, 'g');
  re.lastIndex = from;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(from, m.index + m[0].length);
  }
  return html.slice(from);
}
const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
/** The class list of the element carrying `testid`. */
const classOf = (html: string, testid: string) => html.match(new RegExp(`<\\w+[^>]*class="([^"]*)"[^>]*data-testid="${testid}"|<\\w+[^>]*data-testid="${testid}"[^>]*class="([^"]*)"`))?.slice(1).find(Boolean) ?? '';

const walker = (id: string, side: 'buyer' | 'seller', price: number, units: number) => ({ id, side, price, at: price, dir: 0 as const, done: false, units });

/** Month 6's Alloy walk (m06-136): The Big Spender asks 115, everyone else bids 66; the store sells at 100 (1 left) and buys at 81; the ship pays 99. */
const alloyWalk: Partial<AuctionView> = {
  good: 'alloy',
  stage: 'walk',
  lo: 56,
  hi: 125,
  storeSells: 100,
  storeBuys: 81,
  storeForSale: 1,
  shipPays: 99,
  walkers: [walker('s1', 'buyer', 66, 0), walker('s2', 'buyer', 66, 0), walker('s3', 'seller', 115, 5), walker('s4', 'buyer', 66, 0)],
  deals: [],
  skipped: [],
  next: ['energy', 'smithore', 'crystite'],
  upNext: null,
};

describe('SWEEP-C1: one gap number on the TV screen', () => {
  it('SWEEP-C1: the chart chip and the side panel both say the gap is 16 (the seller asks 115, the ship pays 99), not the houses’ 1 (FM-house-meet)', () => {
    const html = tvScreen(tvView(alloyWalk));
    const panel = textOf(inside(html, 'tv-readout'));
    const chip = textOf(inside(html, 'gap-label'));
    expect(panel).toContain('NEAREST TRADE 16 apart');
    expect(chip).toBe('16 APART');
  });
});

describe('SWEEP-C3: the TV names the same next good as the phone', () => {
  it('SWEEP-C3: during the walk the queue may still skip goods, so the TV names none (the phone names none either)', () => {
    const room = textOf(inside(tvScreen(tvView(alloyWalk)), 'tv-room-line'));
    expect(room).toBe('ROOM HSQB');
  });

  it('SWEEP-C3: at the close, the good that really comes up next: "NEXT SMITHORE", not the skipped Energy', () => {
    const room = textOf(inside(tvScreen(tvView({ ...alloyWalk, stage: 'close', next: ['energy', 'smithore', 'crystite'], upNext: 'smithore' })), 'tv-room-line'));
    expect(room).toBe('ROOM HSQB · NEXT SMITHORE');
  });

  it('SWEEP-C3: at the close of the last good to trade, the TV says so', () => {
    const room = textOf(inside(tvScreen(tvView({ ...alloyWalk, stage: 'close', next: ['medicine'], upNext: null })), 'tv-room-line'));
    expect(room).toBe('ROOM HSQB · LAST GOOD');
  });
});

describe('SWEEP-C8: a TV trade card keeps its units and price; the names give way first', () => {
  it('SWEEP-C8: "Heiko → The Accountant" may cut short, "1 unit @ 14" never does, on the newest card and the older ones', () => {
    const html = tvScreen(
      tvView({
        ...alloyWalk,
        good: 'water',
        deals: [
          { buyer: 's2', seller: 's1', price: 14, units: 1 },
          { buyer: 's4', seller: 's3', price: 15, units: 3 },
        ],
      }),
    );
    const cards = html.split('data-testid="tv-deal"').slice(1);
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      const names = classOf(card, 'tv-deal-names');
      const terms = classOf(card, 'tv-deal-terms');
      expect(names, 'the names truncate').toContain('truncate');
      expect(terms, 'the terms never shrink').toContain('shrink-0');
      expect(terms).not.toContain('truncate');
    }
    expect(textOf(inside(html, 'tv-deal-terms'))).toMatch(/^· (1 unit @ 14|3 units @ 15)$/);
    expect(textOf(html)).toContain('Heiko → The Accountant');
  });
});

describe('SWEEP-C10: the TV status row shows its whole line', () => {
  const skipped: AuctionView['skipped'] = [
    { good: 'energy', reason: 'nobody has any' },
    { good: 'smithore', reason: 'nobody has any' },
    { good: 'crystite', reason: 'nobody has any' },
    { good: 'rareEarth', reason: 'nobody buys' },
  ];

  it('SWEEP-C10: "No clock: the walk starts when everyone has picked." shows in full, never cut', () => {
    const html = tvScreen(tvView({ ...alloyWalk, stage: 'status', skipped }));
    const bar = inside(html, 'tv-pick-bar');
    expect(textOf(bar)).toContain('No clock: the walk starts when everyone has picked.');
    const line = bar.match(/<(?:span|p) class="([^"]*)"[^>]*>(?:<span[^>]*>)?<strong[^>]*>No clock:<\/strong>/);
    expect(line, 'the no-clock line').not.toBeNull();
    expect(line![1]).not.toContain('truncate');
  });

  it('SWEEP-C10: the skipped goods keep their reasons, as on the phone, and wrap rather than cut', () => {
    const html = tvScreen(tvView({ ...alloyWalk, stage: 'status', skipped }));
    expect(textOf(inside(html, 'skipped'))).toBe('Skipped: Energy, Smithore, Crystite, Rare earth: nobody has any, nobody buys');
    expect(classOf(html, 'skipped')).not.toContain('truncate');
  });
});
