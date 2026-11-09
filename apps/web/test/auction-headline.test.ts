import { WALK, type GameState } from '@mule/engine';
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

/**
 * Heiko at the table (5 Nov, the PM's ruling): what the goods auction is about leads the headline, the good's symbol
 * and name, large, on every goods-auction screen: the status screen, the walk and the close, on the phone (and the
 * laptop's wide shell, the same screen) and on the TV. Before, the phone named it only in the rail's small phase line.
 */
type GameContext = ConstructorParameters<typeof MuleGame>[0];

const seats = [
  { id: 's1', name: 'Heiko', isAi: false, color: 0 },
  { id: 's2', name: 'Mia', isAi: false, color: 1 },
  { id: 's3', name: 'The Baron', isAi: true, color: 2 },
];

/** The real game on a manual clock, at the first good's status screen. */
function toStatus() {
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
  expect(game.viewFor(null).auction?.stage).toBe('status');
  const state = (game as unknown as { state: GameState }).state;
  return { game, advance, state };
}

/** Plays on until the auction's stage is `stage`, pressing Ready on the status screen. */
function until(t: ReturnType<typeof toStatus>, stage: 'walk' | 'close') {
  for (const s of seats) if (!s.isAi) t.game.handle(s.id, { type: 'ready' });
  for (let i = 0; i < 40_000 && t.game.viewFor(null).auction?.stage !== stage; i++) t.advance(WALK.tickMs);
  expect(t.game.viewFor(null).auction?.stage).toBe(stage);
}

function phoneScreen(view: MuleView, seatId: string): string {
  const self = view.players.find((p) => p.id === seatId)!;
  const client = { intent: () => {}, subscribe: () => () => {}, getState: () => ({ chat: [], view: null, seatId }) } as unknown as TableClient;
  const game = createElement(PhoneGameProvider, { value: { table: { seats: [], boards: 1 } as unknown as TableView<MuleView>, view, me: view.me!, self, slot: self.slot as Slot }, children: createElement(Auction) });
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: game }));
}

function tvScreen(view: MuleView): string {
  const client = { intent: () => {}, subscribe: () => () => {}, getState: () => ({ chat: [], view: null, seatId: null }), serverNow: () => 0 } as unknown as TableClient;
  const table = { seats: [], hostId: 's1' } as unknown as TableView<MuleView>;
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

/** The phone's headline: in the main pane (the stage), never only the rail, with the good's glyph before its name. */
function expectPhoneHeadline(html: string, good: string, words: RegExp) {
  const stage = inside(html, 'stage');
  const head = inside(stage, 'auction-headline');
  expect(head, 'the headline is in the main pane').not.toBe('');
  expect(head).toMatch(new RegExp(`data-good="${good}"`));
  // The glyph first (an svg), then the name, large.
  expect(head.indexOf('<svg')).toBeGreaterThan(-1);
  expect(head.indexOf('<svg')).toBeLessThan(head.indexOf(GOOD_NAME[good as keyof typeof GOOD_NAME]));
  expect(textOf(head)).toMatch(new RegExp(`^${GOOD_NAME[good as keyof typeof GOOD_NAME]}\\b`));
  expect(textOf(head)).toMatch(words);
  // The first thing the main pane shows.
  expect(stage.indexOf('data-testid="auction-headline"')).toBeLessThan(stage.indexOf('data-testid="status-table"') === -1 ? Infinity : stage.indexOf('data-testid="status-table"'));
}

describe("the goods auction's headline leads with the good (Heiko, 5 Nov)", () => {
  it('the status screen: "<glyph> Smithore · 2 / 3 picked" (an AI counts as picked) heads the main pane, before the status table', () => {
    const t = toStatus();
    const good = t.game.viewFor(null).auction!.good;
    t.game.handle('s1', { type: 'ready' });
    const html = phoneScreen(t.game.viewFor('s2'), 's2');
    expectPhoneHeadline(html, good, /2 \/ 3 picked/i);
  });

  it('the walk: the headline heads the main pane, above the clock', () => {
    const t = toStatus();
    const good = t.game.viewFor(null).auction!.good;
    until(t, 'walk');
    const html = phoneScreen(t.game.viewFor('s1'), 's1');
    expectPhoneHeadline(html, good, /./);
    expect(inside(html, 'stage').indexOf('data-testid="auction-headline"')).toBeLessThan(inside(html, 'stage').indexOf('data-testid="time-bar"'));
  });

  it('the close: the headline says the good is closed', () => {
    const t = toStatus();
    const good = t.game.viewFor(null).auction!.good;
    until(t, 'close');
    const html = phoneScreen(t.game.viewFor('s1'), 's1');
    expectPhoneHeadline(html, good, /closed/i);
  });

  it('the TV: its title leads with the glyph and the name ("<glyph> Smithore auction")', () => {
    const t = toStatus();
    const good = t.game.viewFor(null).auction!.good;
    const name = GOOD_NAME[good];
    for (const html of [tvScreen(t.game.viewFor(null)), (until(t, 'walk'), tvScreen(t.game.viewFor(null)))]) {
      const h1 = inside(html, 'tv-phase');
      expect(h1.indexOf('<svg')).toBeGreaterThan(-1);
      expect(h1.indexOf('<svg')).toBeLessThan(h1.indexOf(name));
      expect(textOf(h1)).toBe(`${name} auction`);
    }
  });
});
