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
  return game;
}

/** The phone's auction screen for this seat, drawn from the server's view of it. */
function phoneScreen(view: MuleView, seatId: string): string {
  const self = view.players.find((p) => p.id === seatId)!;
  const client = { intent: () => {} } as unknown as TableClient;
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
