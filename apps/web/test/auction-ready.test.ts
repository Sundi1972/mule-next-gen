import { WALK } from '@mule/engine';
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

type GameContext = ConstructorParameters<typeof MuleGame>[0];

const seats = [
  { id: 's1', name: 'Heiko', isAi: false, color: 0 },
  { id: 's2', name: 'Mia', isAi: false, color: 1 },
  { id: 's3', name: 'The Baron', isAi: true, color: 2 },
];

/** The real game on a manual clock, played to the first good's status screen; nobody presses anything. */
function toFirstStatus() {
  return playToFirstStatus().game;
}

/** As toFirstStatus, with the manual clock's hand to move it on. */
function playToFirstStatus() {
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
  // Planning has no clock: it ends when both humans are Ready.
  for (const s of seats) if (!s.isAi) game.handle(s.id, { type: 'ready' });
  for (let i = 0; i < 20_000 && game.viewFor(null).auction?.stage !== 'status'; i++) advance(WALK.tickMs);
  expect(game.viewFor(null).auction?.stage, "the first good's status screen comes up").toBe('status');
  return { game, advance };
}

/** The real game on a manual clock, played on into the first good's walk. */
function toFirstWalk() {
  const { game, advance } = playToFirstStatus();
  for (let i = 0; i < 20_000 && game.viewFor(null).auction?.stage !== 'walk'; i++) advance(WALK.tickMs);
  expect(game.viewFor(null).auction?.stage, "the first good's walk comes up").toBe('walk');
  return game;
}

/** The phone's auction screen for this seat, drawn from the server's view of it. */
function phoneScreen(view: MuleView, seatId: string): string {
  const self = view.players.find((p) => p.id === seatId)!;
  // The shell's chat block reads the client too: nothing said yet.
  const client = { intent: () => {}, subscribe: () => () => {}, getState: () => ({ chat: [], view: null, seatId }) } as unknown as TableClient;
  const screen = createElement(Auction);
  const game = createElement(PhoneGameProvider, { value: { table: {} as TableView<MuleView>, view, me: view.me!, self, slot: self.slot as Slot }, children: screen });
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: game }));
}

/** The opening tag and label of the phone's Done button. */
const doneButton = (html: string) => html.match(/<button[^>]*data-testid="done"[^>]*>([^<]*)</);

describe("the goods auction's status screen", () => {
  it('FM-FU1: pressing Ready on a good\'s status screen turns the button to "Done · waiting"', () => {
    const game = toFirstStatus();
    game.handle('s1', { type: 'ready' });
    const view = game.viewFor('s1');
    expect(view.auction?.stage).toBe('status');
    const button = doneButton(phoneScreen(view, 's1'));
    expect(button?.[1]).toBe('Done · waiting');
    expect(button?.[0]).toContain('disabled=""');
  });

  it('FM-FU1 (negative): a seat that has not pressed Ready still reads "Ready", and can press it', () => {
    const game = toFirstStatus();
    game.handle('s1', { type: 'ready' });
    const button = doneButton(phoneScreen(game.viewFor('s2'), 's2'));
    expect(button?.[1]).toBe('Ready');
    expect(button?.[0]).not.toContain('disabled=""');
  });
});

/** The text inside the first element carrying `testid`, tags dropped and entities read back; null when absent. */
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
    if (depth === 0) return words(html.slice(start, m.index + m[0].length));
  }
  return null;
}

const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/ ([.,:])/g, '$1')
    .trim();

/** The phone's seat walks `side` in the view's auction, with the store at these prices. */
function withSide(view: MuleView, side: 'buyer' | 'seller', over: Partial<NonNullable<MuleView['auction']>>): MuleView {
  const a = view.auction!;
  return { ...view, auction: { ...a, ...over, walkers: a.walkers.map((w) => (w.id === 's1' ? { ...w, side } : w)) } };
}

describe("the goods auction's status screen, in plain words", () => {
  it('G-8: the table heads say "Goes bad" and "Spare", not Spoils and Surplus', () => {
    const head = textOf(phoneScreen(toFirstStatus().viewFor('s1'), 's1'), 'status-table')!;
    expect(head).toContain('Goes bad');
    expect(head).toContain('Spare');
    expect(head).not.toMatch(/Spoils|Surplus/i);
  });

  it('G-8: a short player\'s spare reads "short 2", a player with more "+4"', () => {
    const view = toFirstStatus().viewFor('s1');
    const a = view.auction!;
    view.auction = { ...a, status: a.status.map((r, i) => (i === 0 ? { ...r, now: 1, need: 3 } : { ...r, now: 6, need: 2 })) };
    const html = phoneScreen(view, 's1');
    expect(textOf(html, `spare-${a.status[0]!.id}`)).toBe('short 2');
    expect(textOf(html, `spare-${a.status[1]!.id}`)).toBe('+4');
  });

  it("G-4: the store's prices are said from your side, never as the store's side", () => {
    const view = toFirstStatus().viewFor('s1');
    view.auction = { ...view.auction!, storeSells: 30, storeBuys: 24, storeForSale: 5 };
    const html = phoneScreen(view, 's1');
    expect(textOf(html, 'my-store')).toBe('You can buy from the store at 30 · sell to it at 24 · it has 5 for sale');
    expect(words(html)).not.toMatch(/STORE SELLS|STORE BUYS/);
  });

  it('G-6: with the ship in port, the status screen says what it wants, when that comes up, and what you have', () => {
    const view = toFirstStatus().viewFor('s1');
    view.ship = { arrives: view.month, inPort: true, wants: { crystite: 24 } };
    view.market = view.market.map((r) => (r.good === 'crystite' ? { ...r, shipPays: 120 } : r));
    view.me = { ...view.me!, stock: { ...view.me!.stock, crystite: 4 } };
    view.auction = { ...view.auction!, good: 'food', next: ['water', 'energy', 'smithore', 'crystite'] };
    expect(textOf(phoneScreen(view, 's1'), 'ship-wants')).toBe('The ship wants 24 Crystite this month. Crystite comes up after Smithore: the ship pays 120 cr for the first. You have 4.');
  });

  it("G-6: on the wanted good's own status screen, it says the ship wants it now, at its price, and what you have", () => {
    const view = toFirstStatus().viewFor('s1');
    view.ship = { arrives: view.month, inPort: true, wants: { crystite: 24 } };
    view.me = { ...view.me!, stock: { ...view.me!.stock, crystite: 4 } };
    view.auction = { ...view.auction!, good: 'crystite', shipPays: 120, next: ['rareEarth'] };
    expect(textOf(phoneScreen(view, 's1'), 'ship-wants')).toBe('The ship wants 24 Crystite this month: it pays 120 cr for the first. You have 4.');
  });

  it('G-6: however many goods the ship wants, the status screen has one panel, the rest in one sentence', () => {
    const view = toFirstStatus().viewFor('s1');
    view.ship = { arrives: view.month, inPort: true, wants: { water: 3, smithore: 9, crystite: 24, rareEarth: 6 } };
    view.market = view.market.map((r) => (r.good === 'water' ? { ...r, shipPays: 12 } : r));
    view.me = { ...view.me!, stock: { ...view.me!.stock, water: 2 } };
    view.auction = { ...view.auction!, good: 'food', next: ['water', 'energy', 'smithore', 'crystite', 'rareEarth'] };
    const html = phoneScreen(view, 's1');
    expect(html.split('data-testid="ship-wants"').length - 1).toBe(1);
    expect(textOf(html, 'ship-wants')).toBe('The ship wants 3 Water this month. Water comes up after Food: the ship pays 12 cr for the first. You have 2. It also wants Smithore, Crystite and Rare earth.');
  });

  it("the status screen's words and your numbers carry the mock's test ids", () => {
    const html = phoneScreen(toFirstStatus().viewFor('s1'), 's1');
    expect(textOf(html, 'status-words')).toMatch(/Pick your side before the bell\.$/);
  });

  it('G-6 (negative): with the ship not in port, no word about it', () => {
    const view = toFirstStatus().viewFor('s1');
    view.ship = { ...view.ship, inPort: false };
    expect(textOf(phoneScreen(view, 's1'), 'ship-wants')).toBeNull();
  });
});

describe("the goods auction's walk, in plain words", () => {
  it('G-2: the walk buttons say "Hold ▲ to walk up" and "Hold ▼ to walk down"', () => {
    const html = phoneScreen(toFirstWalk().viewFor('s1'), 's1');
    expect(textOf(html, 'hold-up')).toBe('Hold ▲ to walk up');
    expect(textOf(html, 'hold-down')).toBe('Hold ▼ to walk down');
    expect(textOf(html, 'have')).toMatch(/^\d+$/);
  });

  it('G-2: on a laptop-wide shell the walk buttons grow to 80 px with 20 px and 16 px words, as the mock sizes them', () => {
    const html = phoneScreen(toFirstWalk().viewFor('s1'), 's1');
    const button = /<button[^>]*data-testid="hold-up"[^>]*>/.exec(html)![0];
    expect(button).toContain('h-12');
    expect(button).toContain('@min-[1100px]/shell:h-20');
    expect(html).toMatch(/text-sm font-semibold leading-none @min-\[1100px\]\/shell:text-xl/);
    expect(html).toMatch(/text-\[11px\] font-medium leading-none @min-\[1100px\]\/shell:text-base/);
  });

  it('G-3: the hint names a price to walk to, and the old "meet the highest bid" is gone', () => {
    const html = phoneScreen(withSide(toFirstWalk().viewFor('s1'), 'buyer', { storeSells: 30, storeForSale: 5 }), 's1');
    expect(textOf(html, 'hint-line')).toMatch(/^Walk up to .*\b\d+\b/);
    expect(textOf(html, 'hint-how')).toBe('Hold ▲ to walk up.');
    expect(words(html)).not.toMatch(/meet the (highest bid|lowest ask)/);
  });

  it("G-4: over the board, the store's prices from your side and what the lines mean; the phone has no LOWEST ASK readout", () => {
    const html = phoneScreen(withSide(toFirstWalk().viewFor('s1'), 'buyer', { storeSells: 30, storeBuys: 24, storeForSale: 5, shipPays: null }), 's1');
    expect(textOf(html, 'store-words')).toBe('You can buy from the store at 30 · sell to it at 24');
    expect(textOf(html, 'lines-legend')).toBe('Red: what sellers ask Green: what buyers bid Walk your bid up to a red line and you buy.');
    expect(textOf(html, 'tv-readout')).toBeNull();
  });

  it('G-6: on a walk with the ship buying, its line says so in words on the board, and the key names it amber', () => {
    const view = withSide(toFirstWalk().viewFor('s1'), 'seller', { good: 'crystite', storeBuys: 86, storeSells: null, storeForSale: 0, shipPays: 120 });
    const html = phoneScreen(view, 's1');
    expect(textOf(html, 'ship-caption')).toBe('The ship buys Crystite at 120');
    expect(textOf(html, 'store-words')).toBe('The store has none to sell · you can sell to it at 86 · the ship buys at 120');
    expect(textOf(html, 'lines-action')).toBe('Walk your ask down to the amber or a green line and you sell.');
  });

  it('G-6 (negative): with no ship buying, no ship caption on the board', () => {
    const html = phoneScreen(withSide(toFirstWalk().viewFor('s1'), 'seller', { shipPays: null }), 's1');
    expect(textOf(html, 'ship-caption')).toBeNull();
  });
});
