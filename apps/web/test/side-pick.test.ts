import { WALK } from '@mule/engine';
import type { MuleView, TableView } from '@mule/protocol';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MuleGame } from '../../server/src/mule-game.js';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { MoveOn, sideWords } from '../src/phone/Auction';
import { stillPicking } from '../src/phone/hub/ready';
import { TableApp } from '../src/table/TableApp';

type GameContext = ConstructorParameters<typeof MuleGame>[0];

const seats = [
  { id: 's1', name: 'Heiko', isAi: false, color: 0 },
  { id: 's2', name: 'Kai', isAi: false, color: 1 },
  { id: 's3', name: 'Lena', isAi: false, color: 2 },
  { id: 's4', name: 'The Baron', isAi: true, color: 3 },
];

/** The real game on a manual clock, at the first good's side pick; Heiko has pressed Ready, nobody else has. */
function toSidePick(): MuleGame {
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
  expect(game.viewFor(null).auction?.stage, "the first good's side pick comes up").toBe('status');
  game.handle('s1', { type: 'ready' });
  return game;
}

/** Text with tags dropped, as a reader sees it. */
const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/ ([.,:;?])/g, '$1')
    .trim();

/** The host's Move on confirm for these seats, as the phone draws it. */
function confirmFor(view: MuleView, away: readonly string[], only?: readonly string[]): string {
  const left = stillPicking(view, (id) => !away.includes(id)).filter((s) => s.id !== 's1' && (!only || only.includes(s.id)));
  const html = renderToStaticMarkup(createElement(MoveOn, { auction: view.auction!, seats: left, onNow: () => {}, onKeep: () => {} }));
  return words(html);
}

describe("A-7's Move on confirm (review F3)", () => {
  it('with the only seat left away, it says the seat sits out and the walk starts without them', () => {
    const view = toSidePick().viewFor('s1');
    const text = confirmFor(view, ['s2'], ['s2']);
    expect(text).toContain('Move on without Kai?');
    expect(text).toContain('Kai is away and sits');
    expect(text).toContain('The walk starts without them.');
    expect(text).not.toContain('side shown');
  });

  it('with one away and one here, the one here starts on the side shown', () => {
    const view = toSidePick().viewFor('s1');
    const lena = sideWords(view.auction!, { id: 's3', name: 'Lena', isAi: false, ready: false, slot: 2, away: false }, view.auction!.good).line;
    const text = confirmFor(view, ['s2']);
    expect(text).toContain('Move on without Kai and Lena?');
    expect(text).toContain(`Kai is away and sits`);
    expect(text).toContain(lena);
    expect(text).toContain('The others start on the side shown; the walk starts.');
  });

  it('with nobody away, the sides are the ones the numbers give, and the walk starts for everyone', () => {
    const text = confirmFor(toSidePick().viewFor('s1'), []);
    expect(text).toContain('That is the side the numbers give; the walk starts for everyone.');
  });
});

let state: { status: 'open'; role: 'board'; code: string; seatId: null; view: TableView<MuleView>; notice: null; chat: []; emotes: []; toasts: []; clockOffset: number };

// The TV reads the room through useClientState, whose store has no server snapshot to render from.
vi.mock('../src/net/react', async (actual) => ({ ...(await actual<typeof import('../src/net/react')>()), useClientState: () => state }));

/** The TV's screen for this game, with these seats' phones dropped. */
function onTv(game: MuleGame, away: readonly string[]): string {
  const g = game.viewFor(null);
  const table: TableView<MuleView> = { code: 'MULE', status: 'playing', hostId: 's1', seats: seats.map((p) => ({ id: p.id, name: p.name, isAi: p.isAi, connected: !away.includes(p.id), color: p.color })), boards: 1, game: g };
  state = { status: 'open', role: 'board', code: 'MULE', seatId: null, view: table, notice: null, chat: [], emotes: [], toasts: [], clockOffset: 0 };
  const client = { subscribe: () => () => {}, getState: () => state, serverNow: () => 0, watch: () => {} } as unknown as TableClient;
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(TableApp, { room: 'MULE' }) })).replaceAll('<!-- -->', '');
}

/** The words inside the TV's picked-list row for one seat. */
const rowOf = (html: string, id: string) => {
  const at = html.indexOf(`data-testid="tv-picked-${id}"`);
  expect(at, `the TV lists ${id}`).toBeGreaterThan(0);
  return words(html.slice(at, html.indexOf('</li>', at)));
};

describe("A-7's TV side pick (review F3)", () => {
  it('a dropped phone reads AWAY · PICKING, a phone still deciding PICKING, a pick its side with a tick; the host can move on', () => {
    const html = onTv(toSidePick(), ['s2']);
    expect(rowOf(html, 's2')).toContain('AWAY · PICKING');
    expect(rowOf(html, 's3')).toContain('PICKING');
    expect(rowOf(html, 's3')).not.toContain('AWAY');
    expect(rowOf(html, 's1')).toMatch(/(BUY|SELL|PASS) ✓/);
    expect(words(html)).toContain('Heiko, the host, can move on for them.');
    expect(words(html)).toContain('No clock: the walk starts when everyone has picked.');
  });
});
