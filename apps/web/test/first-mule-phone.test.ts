import { DEVELOPMENT, tileIndex, type GameState } from '@mule/engine';
import type { MuleView, TableView } from '@mule/protocol';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { MuleGame } from '../../server/src/mule-game';
import { tapThere, toDevelopment, walkers } from '../../server/test/fake-context';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { Develop } from '../src/phone/Develop';
import { PhoneGameProvider } from '../src/phone/game';
import { startClockQuestion } from '../src/phone/Develop';

const LENA = 's1';
const OSSA = 's2';
const KAI = 's3';
/** Lena and Ossa, and Kai for a table where two are still to come. */
const TABLE = [...walkers, { id: KAI, name: 'Kai', isAi: false, color: 2 }];

/** Month 1's development on the real server: `owners` (Lena, the host, and Ossa by default) each own a plot next to the store, no MULE yet. */
function firstMonth(owners: string[] = [LENA, OSSA], players = walkers) {
  const plots: Record<string, number> = {};
  const g = toDevelopment({
    players,
    firstMonthWaits: true,
    prepare: (state: GameState) => {
      const store = state.tiles.find((t) => t.terrain === 'store')!;
      const near = state.tiles.filter((t) => t.terrain !== 'store' && t.owner === null && Math.abs(t.x - store.x) + Math.abs(t.y - store.y) <= 2);
      owners.forEach((id, k) => {
        near[k]!.owner = id;
        plots[id] = tileIndex(state.width, near[k]!.x, near[k]!.y);
      });
    },
  });
  const installFirst = (id: string) => {
    const at = { x: plots[id]! % g.state.width, y: Math.floor(plots[id]! / g.state.width) };
    tapThere(g.game, g, id, { type: 'buyMule' });
    tapThere(g.game, g, id, { type: 'outfit', outfit: 'food' });
    tapThere(g.game, g, id, { type: 'install', ...at });
  };
  return { ...g, installFirst };
}

/** Develop as a seat's phone draws it from the server's view, the phone's clock in step with the server's. */
function phone(game: MuleGame, now: number, seat: string, sent: unknown[] = []): string {
  const view = game.viewFor(seat);
  const client = {
    subscribe: () => () => {},
    getState: () => ({ status: 'open', role: 'player', code: 'MULE', seatId: seat, view: null, chat: [], emotes: [], toasts: [], clockOffset: 0 }),
    serverNow: () => now,
    intent: (i: unknown) => sent.push(i),
  } as unknown as TableClient;
  const table = { code: 'MULE', status: 'playing', hostId: LENA, boards: 1, seats: TABLE.map((s) => ({ id: s.id, name: s.name, isAi: s.isAi, connected: true, color: s.color })), game: view } as TableView<MuleView>;
  const self = view.players.find((p) => p.id === seat)!;
  const value = { table, view, me: view.me!, self, slot: 0 as const };
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(PhoneGameProvider, { value, children: createElement(Develop) }) }));
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ').trim();

describe("A-1: the phone while month 1's development clock waits", () => {
  it('A-1: the turn is not over; the corral, the walk out and the pub are there; the clock waits, full, in the mock’s words', () => {
    const { game, ctx } = firstMonth();
    const html = phone(game, ctx.now(), LENA);
    expect(text(html)).not.toContain('Time is up');
    expect(html).toContain('aria-label="Go to the pub and end your turn"');
    expect(text(html)).toContain('Walk out to the map');
    expect(text(html)).toContain('Buy a MULE at the corral');
    expect(text(html)).toContain('Your first month: no rush. The clock starts when your first MULE is in.');
    expect(text(html)).toContain('The clock starts when your first MULE is in');
    expect(html).toContain('data-testid="clock-waits"');
    expect(text(html.slice(html.indexOf('data-testid="clock-waits"')))).toMatch(new RegExp(`^[^<]*0:${DEVELOPMENT.fullSeconds}`));
    // The pub pays as for the full clock while it waits.
    const { base, start, perMonth } = DEVELOPMENT.pub;
    expect(text(html)).toContain(`≈${base + start + perMonth} cr`);
  });

  it('A-1: once your MULE is in and another is still to come, you wait: "Your MULE is in · waiting for Ossa", the corral shut and the pub open', () => {
    const { game, ctx, installFirst } = firstMonth();
    installFirst(LENA);
    const html = phone(game, ctx.now(), LENA);
    expect(text(html)).toContain('Your MULE is in · waiting for Ossa');
    expect(text(html)).toContain('Buying, installing and analysing wait for the clock.');
    expect(text(html)).not.toContain('The pub is open');
    // Once in, you wait: the corral is shut, the pub open.
    expect(html).not.toMatch(/<button[^>]*data-shop="corral"(?![^>]*disabled="")[^>]*>/);
    expect(html).toMatch(/<button(?![^>]*disabled="")[^>]*aria-label="Go to the pub and end your turn"/);
    expect(text(html)).toContain('The clock starts when every first MULE is in');
    expect(text(html)).not.toContain('Time is up');
  });

  it('A-1: once everyone is in the clock runs and the waiting words go', () => {
    const { game, ctx, installFirst } = firstMonth();
    installFirst(LENA);
    installFirst(OSSA);
    const html = phone(game, ctx.now(), LENA);
    expect(html).not.toContain('data-testid="clock-waits"');
    expect(text(html)).not.toContain('The clock starts when');
    expect(text(html)).not.toContain('Time is up');
  });
});

describe("A-1: the host's Start the clock while month 1's development clock waits", () => {
  const BUTTON = 'data-testid="continue"';

  it('A-1: the host sees "Start the clock without Ossa" once the host’s own first MULE is in and Ossa’s is still to come', () => {
    const { game, ctx, installFirst } = firstMonth();
    expect(phone(game, ctx.now(), LENA), "before the host's own MULE is in").not.toContain(BUTTON);
    installFirst(LENA);
    const host = phone(game, ctx.now(), LENA);
    expect(host).toContain(BUTTON);
    expect(text(host)).toContain('Start the clock without Ossa');
    expect(phone(game, ctx.now(), OSSA), 'never on a non-host phone').not.toContain(BUTTON);
  });

  it('A-1: the confirm asks in the agreed words, for one and for two', () => {
    expect(startClockQuestion(['Kai'])).toBe("Start the month's clock now? Kai has no MULE in yet, and loses no time until now.");
    expect(startClockQuestion(['Kai', 'Ossa'])).toBe("Start the month's clock now? Kai and Ossa have no MULE in yet, and lose no time until now.");
  });

  it('A-1: after the host starts the clock, the button is gone and the passed player’s Now says the month is running, its title the same', () => {
    const { game, ctx, installFirst } = firstMonth();
    installFirst(LENA);
    game.handle(LENA, { type: 'continue' });
    expect(game.viewFor(null).news[0]).toBe('Lena started the clock without Ossa.');
    expect(phone(game, ctx.now(), LENA)).not.toContain(BUTTON);
    const ossa = text(phone(game, ctx.now(), OSSA));
    expect(ossa).toContain('The host started the clock: your month is running.');
    // A freshly drawn phone opens on the start card's row; the press changes its detail, never its title.
    expect(ossa).toContain('You eat, and the clock starts for everyone');
    expect(ossa).not.toContain('no rush');
  });
});

describe('A-1: a seat with no plot is in from the start, and waits', () => {
  it('A-1: with no plot, the Now card says so and names who the clock waits for; the corral is shut and the pub open', () => {
    const { game, ctx } = firstMonth([OSSA]);
    const html = phone(game, ctx.now(), LENA);
    expect(text(html)).toContain('No plot this month · waiting for Ossa');
    expect(text(html)).toContain('The clock starts when every first MULE is in.');
    expect(text(html)).not.toContain('Your MULE is in');
    expect(html).not.toMatch(/<button[^>]*data-shop="corral"(?![^>]*disabled="")[^>]*>/);
    expect(html).toMatch(/<button(?![^>]*disabled="")[^>]*aria-label="Go to the pub and end your turn"/);
  });
});

describe('A-1: with two or more still to come, the wait names the first and counts the rest', () => {
  it('A-1: "Your MULE is in · waiting for Ossa +1" when Ossa and Kai are still to come', () => {
    const { game, ctx, installFirst } = firstMonth([LENA, OSSA, KAI], TABLE);
    installFirst(LENA);
    expect(text(phone(game, ctx.now(), LENA))).toContain('Your MULE is in · waiting for Ossa +1');
  });

  it('A-1: "No plot this month · waiting for Ossa +1" for a plotless seat', () => {
    const { game, ctx } = firstMonth([OSSA, KAI], TABLE);
    expect(text(phone(game, ctx.now(), LENA))).toContain('No plot this month · waiting for Ossa +1');
  });
});
