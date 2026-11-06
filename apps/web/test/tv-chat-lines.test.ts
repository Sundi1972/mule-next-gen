import { WALK } from '@mule/engine';
import type { ChatMessage, MuleView, PlayerView, TableView } from '@mule/protocol';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MuleGame } from '../../server/src/mule-game.js';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { TvAuction, TvGameOver, TvHeader, TvMonthEnd } from '../src/table/TableApp';
import { aMuleView, aPlayer } from './fixtures/views';

/**
 * TV-CHAT (WS4, PM ruling 6 Nov, rulebook #tv-fit): the TV's chat strip shows the newest line only in every phase of
 * play, where the screens need the height, and three lines at the month end and the game's end.
 */

const CHAT: ChatMessage[] = [
  { id: 1, from: 's2', text: 'Race you to the corral', at: 0 },
  { id: 2, from: 's3', text: 'Who takes the crystite?', at: 1 },
  { id: 3, from: 's2', text: 'Not me, I am on food', at: 2 },
];

const PLAYERS: PlayerView[] = [aPlayer({ id: 's1', name: 'Heiko', slot: 0 }), aPlayer({ id: 's2', name: 'Mia', slot: 1 }), aPlayer({ id: 's3', name: 'The Baron', slot: 2 })];

const game = (over: Partial<MuleView> = {}): MuleView => aMuleView({ players: PLAYERS, me: null, politics: null, month: 3, ...over });

function onTv(screen: ReactElement): string {
  // The chat names its speakers from the room's players.
  const state = { status: 'open', role: 'board', code: 'MULE', seatId: null, view: { game: game() }, chat: CHAT, emotes: [], toasts: [], notice: null, clockOffset: 0, handoffCode: null };
  const client = { subscribe: () => () => {}, getState: () => state, serverNow: () => 0, intent: () => {}, onFrame: () => () => {} } as unknown as TableClient;
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: screen }));
}

const chatLines = (html: string) => [...html.matchAll(/data-testid="chat-line-\d+"/g)].length;

/** The real game on a manual clock, played on to the first good's auction at `stage`. */
function auctionAt(stage: 'status' | 'walk'): MuleView {
  let now = 0;
  const timers: { at: number; fn: () => void }[] = [];
  const game = new MuleGame(
    {
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
    },
    7,
  );
  const advance = () => {
    now += WALK.tickMs;
    for (let due = timers.filter((t) => t.at <= now); due.length > 0; due = timers.filter((t) => t.at <= now))
      for (const t of due) {
        if (!timers.includes(t)) continue;
        timers.splice(timers.indexOf(t), 1);
        t.fn();
      }
  };
  const seats = [
    { id: 's1', name: 'Heiko', isAi: false, color: 0 },
    { id: 's2', name: 'Mia', isAi: true, color: 1 },
    { id: 's3', name: 'The Baron', isAi: true, color: 2 },
  ];
  game.start(seats);
  game.handle('s1', { type: 'ready' });
  for (let i = 0; i < 20_000 && game.viewFor(null).auction?.stage !== 'status'; i++) advance();
  if (stage === 'walk') {
    game.handle('s1', { type: 'ready' });
    for (let i = 0; i < 40_000 && game.viewFor(null).auction?.stage !== 'walk'; i++) advance();
  }
  const view = game.viewFor(null);
  expect(view.auction?.stage).toBe(stage);
  return view;
}

const TABLE = { seats: [], hostId: 's1' } as unknown as TableView<MuleView>;

describe('TV-CHAT (WS4, PM ruling 6 Nov): the chat strip is one line in play, three at the month end and the end', () => {
  it.each(['planning', 'landGrant', 'landAuction', 'development', 'production', 'auction'] as const)('in %s the TV header shows the newest chat line only', (phase) => {
    const html = onTv(createElement(TvHeader, { game: game({ phase }), title: phase }));
    expect(chatLines(html)).toBe(1);
    expect(html).toContain('data-testid="chat-line-3"');
  });

  it("the goods auction's status screen and its walk both show the newest line (the ruling supersedes the walk's no-ticker ruling)", () => {
    for (const stage of ['status', 'walk'] as const) {
      const view = auctionAt(stage);
      expect(chatLines(onTv(createElement(TvAuction, { table: TABLE, game: view, auction: view.auction! }))), stage).toBe(1);
    }
  });

  it('the month end shows three lines', () => {
    expect(chatLines(onTv(createElement(TvMonthEnd, { game: game({ phase: 'upkeep' }) })))).toBe(3);
  });

  it("the game's end shows three lines", () => {
    expect(chatLines(onTv(createElement(TvGameOver, { game: game({ phase: 'upkeep', finished: true }) })))).toBe(3);
  });
});
