import type { GameState } from '@mule/engine';
import type { MuleView, TableView } from '@mule/protocol';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MuleGame } from '../../server/src/mule-game';
import { fakeContext, readyAll, walkers } from '../../server/test/fake-context';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { PhoneGameProvider } from '../src/phone/game';
import { LandGrant } from '../src/phone/LandGrant';

/**
 * H-3 (WS6 UX audit, A-2's named edit in WS3's LandGrant.tsx): while the land grant's lit plot is one your drone
 * surveyed, your phone's rail says so: "Your drone: 12·5 Desert, good for Energy". Only yours: never another seat's
 * phone, never the TV. Drawn from a real server's views, seed 7, Lena (s1) and Ossa (s2).
 */
const LENA = 's1';
const OSSA = 's2';

type Plot = { x: number; y: number };
const same = (a: Plot | null | undefined, b: Plot) => !!a && a.x === b.x && a.y === b.y;

/** Month 1 on the real server: Lena sends her drone over the last two free plots in planning, then both press Ready. */
function droneMonth() {
  const fake = fakeContext({ table: walkers });
  const game = new MuleGame(fake.ctx, 7);
  game.start(walkers);
  const state = (game as unknown as { state: GameState }).state;
  const free = state.tiles.filter((t) => t.owner === null && t.terrain !== 'store');
  // The last free plots light up last, so the grant lights other plots first.
  const surveyed: Plot[] = free.slice(-2).map((t) => ({ x: t.x, y: t.y }));
  game.handle(LENA, { type: 'drone', plots: surveyed });
  readyAll(game);
  expect(game.viewFor(null).phase).toBe('landGrant');
  /** Runs the grant's light on until `until` holds for the lit plot. */
  const runTo = (until: (lit: Plot) => boolean) => {
    for (let i = 0; i < 10_000; i++) {
      const lit = game.viewFor(null).lit;
      if (game.viewFor(null).phase === 'landGrant' && lit && until(lit)) return lit;
      fake.advance(100);
    }
    throw new Error('the light never got there');
  };
  return { game, fake, surveyed, runTo };
}

/** The land grant as a seat's phone draws it from the server's view. */
function phone(game: MuleGame, now: number, seat: string): string {
  const view = game.viewFor(seat);
  const client = {
    subscribe: () => () => {},
    getState: () => ({ status: 'open', role: 'player', code: 'MULE', seatId: seat, view: null, chat: [], emotes: [], toasts: [], clockOffset: 0 }),
    serverNow: () => now,
    intent: () => {},
  } as unknown as TableClient;
  const table = { code: 'MULE', status: 'playing', hostId: LENA, boards: 1, seats: walkers.map((s) => ({ id: s.id, name: s.name, isAi: s.isAi, connected: true, color: s.color })), game: view } as TableView<MuleView>;
  const self = view.players.find((p) => p.id === seat)!;
  const value = { table, view, me: view.me!, self, slot: 0 as const };
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(PhoneGameProvider, { value, children: createElement(LandGrant) }) }));
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ').trim();
/** The drone's line on a phone's rail, or null when there is none. */
const droneLine = (html: string) => {
  const at = html.indexOf('data-testid="drone-found"');
  if (at < 0) return null;
  const open = html.lastIndexOf('<', at);
  const close = html.indexOf('</', at);
  return text(html.slice(open, close));
};

describe('H-3: the land grant names what your drone found, on your phone only', () => {
  it('H-3: while a plot your drone surveyed is lit, the rail reads "Your drone: <x>·<y> <Terrain>, good for <goods>"', () => {
    const { game, fake, surveyed, runTo } = droneMonth();
    const lit = runTo((l) => same(l, surveyed[0]!));
    expect(lit).toEqual(surveyed[0]);
    expect(droneLine(phone(game, fake.ctx.now(), LENA))).toBe(EXPECTED_FIRST);
    runTo((l) => same(l, surveyed[1]!));
    expect(droneLine(phone(game, fake.ctx.now(), LENA))).toBe(EXPECTED_SECOND);
  });

  it('H-3: with a plot the drone did not survey lit, there is no drone line', () => {
    const { game, fake, surveyed, runTo } = droneMonth();
    runTo((l) => !surveyed.some((s) => same(l, s)));
    const html = phone(game, fake.ctx.now(), LENA);
    expect(html).toContain('data-testid="lit"');
    expect(droneLine(html)).toBeNull();
    expect(text(html)).not.toContain('Your drone');
  });

  it("H-3: only the sender's view carries the surveyed plots: not the other seat's, not the TV's", () => {
    const { game, fake, surveyed, runTo } = droneMonth();
    runTo((l) => same(l, surveyed[0]!));
    expect(game.viewFor(LENA).me!.droneFound).toEqual(surveyed);
    expect(game.viewFor(OSSA).me!.droneFound).toEqual([]);
    const tv = game.viewFor(null);
    expect(tv.me).toBeNull();
    expect(JSON.stringify(tv)).not.toContain('droneFound');
    expect(JSON.stringify(game.viewFor(OSSA))).not.toContain(JSON.stringify(surveyed));
    const ossa = phone(game, fake.ctx.now(), OSSA);
    expect(droneLine(ossa)).toBeNull();
    expect(text(ossa)).not.toContain('Your drone');
  });
});

/**
 * Seed 7's two surveyed plots. 12·7 Plains reads Rare earth 3 of 4 above everything else (Water, Energy, Crystite 2);
 * 13·7 Tundra reads Water and Energy both 4 of 4, so the line names both, as the ground card's pips show them.
 */
const EXPECTED_FIRST = 'Your drone: 12·7 Plains, good for Rare earth';
const EXPECTED_SECOND = 'Your drone: 13·7 Tundra, good for Water and Energy';
