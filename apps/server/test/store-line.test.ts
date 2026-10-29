import type { AddressInfo } from 'node:net';
import type { MuleView, ServerEnvelope } from '@mule/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { RuleError, WALK, type GameState } from '@mule/engine';
import { GRANT_TICK_MS, MuleGame } from '../src/mule-game.js';
import { createMuleServer, type MuleServer } from '../src/server.js';
import { fakeContext, readyAll, seats } from './fake-context.js';

/**
 * A-6 (UX audit G-1, G-2's one-tap step) at the server: the lineTrade and walkStep intents reach the engine, the view
 * says which house line each walker stands at and what they chose there, and the wire refuses malformed ones.
 */
const engineOf = (game: MuleGame) => (game as unknown as { state: GameState }).state;

/** Into the first good's walk, s1 passing and s2 buying, with only the store selling, and plenty. */
function toWalk() {
  const { ctx, advance } = fakeContext();
  const game = new MuleGame(ctx, 7);
  game.start(seats);
  readyAll(game);
  while (game.viewFor('s1').phase === 'landGrant') advance(GRANT_TICK_MS);
  while (game.viewFor('s1').phase === 'development') advance(1_000);
  while (game.viewFor('s1').phase === 'production') advance(1_000);
  const state = engineOf(game);
  state.store.stock[state.auction!.good!] = 500;
  // Only the store sells: the AI seat holds none of the good, so it can't meet s2 on the way.
  state.players.find((p) => p.id === 's3')!.stock[state.auction!.good!] = 0;
  game.handle('s1', { type: 'declare', side: 'pass' });
  game.handle('s2', { type: 'declare', side: 'buyer' });
  game.handle('s1', { type: 'ready' });
  game.handle('s2', { type: 'ready' });
  advance(WALK.tickMs * 2);
  const auction = game.viewFor('s2').auction!;
  expect(auction.stage).toBe('walk');
  state.players.find((p) => p.id === 's2')!.money = 5_000;
  return { game, advance, state, good: auction.good };
}

/** The fake clock runs one auction tick per call: step it a tick at a time. */
const ticks = (advance: (ms: number) => void, ms: number) => {
  for (let t = 0; t < ms; t += WALK.tickMs) advance(WALK.tickMs);
};

const mine = (game: MuleGame) => game.viewFor('s2').auction!.walkers.find((w) => w.id === 's2')!;

/** s2 holds Up until the view says it stands at the store's line, then lets go. */
function upToTheLine(game: MuleGame, advance: (ms: number) => void) {
  game.handle('s2', { type: 'walk', dir: 'up' });
  for (let i = 0; i < 400 && mine(game).line !== 'store'; i++) advance(WALK.tickMs);
  game.handle('s2', { type: 'walk', dir: 'stop' });
  expect(mine(game).line).toBe('store');
}

describe('A-6 at the server: choose how many at the line, and a tap is one step', () => {
  it('B-AC: the view shows the walker at the store line with nothing chosen, and nothing trades while it stands there', () => {
    const { game, advance, state, good } = toWalk();
    expect(mine(game)).toMatchObject({ line: null, order: null });
    upToTheLine(game, advance);
    expect(mine(game).order).toBeNull();
    // The store's shelf: players (the AI seat) may still trade with s2 where they meet.
    const before = state.store.stock[good];
    ticks(advance, 3_000);
    expect(state.store.stock[good]).toBe(before);
  });

  it('B-AC: lineTrade 2 buys exactly 2 from the store, and the view says so', () => {
    const { game, advance, state, good } = toWalk();
    upToTheLine(game, advance);
    const before = state.store.stock[good];
    const price = game.viewFor('s2').auction!.storeSells!;
    game.handle('s2', { type: 'lineTrade', units: 2 });
    expect(mine(game).order).toEqual({ house: 'store', units: 2, traded: 0, cr: 0 });
    ticks(advance, 4_000);
    expect(state.store.stock[good]).toBe(before - 2);
    expect(mine(game).order).toEqual({ house: 'store', units: 2, traded: 2, cr: 2 * price });
  });

  it('a lineTrade takes back a Done, as walking does', () => {
    const { game, advance } = toWalk();
    upToTheLine(game, advance);
    game.handle('s2', { type: 'ready' });
    expect(mine(game).done).toBe(true);
    game.handle('s2', { type: 'lineTrade', units: 1 });
    expect(mine(game).done).toBe(false);
  });

  it('B-AC: walkStep up moves the bid exactly one step, and the view shows it', () => {
    const { game } = toWalk();
    const from = mine(game).price;
    game.handle('s2', { type: 'walkStep', dir: 'up' });
    expect(mine(game).price).toBe(from + 1);
    game.handle('s2', { type: 'walkStep', dir: 'down' });
    expect(mine(game).price).toBe(from);
  });

  it('refuses a lineTrade away from a line with the rules\' message, and changes nothing', () => {
    const { game } = toWalk();
    expect(() => game.handle('s2', { type: 'lineTrade', units: 1 })).toThrow(RuleError);
    expect(mine(game).order).toBeNull();
  });
});

let running: MuleServer | null = null;
afterEach(async () => {
  await running?.close();
  running = null;
});

describe('A-6 over the wire', () => {
  it('the wire accepts lineTrade and walkStep, so the rules answer them, and refuses malformed ones', async () => {
    running = createMuleServer({ seed: () => 42 });
    await new Promise<void>((r) => running!.server.listen(0, r));
    const { port } = running.server.address() as AddressInfo;
    const { code } = (await (await fetch(`http://localhost:${port}/rooms`, { method: 'POST' })).json()) as { code: string };
    const socket = new WebSocket(`ws://localhost:${port}/ws`);
    const inbox: ServerEnvelope<MuleView>[] = [];
    socket.on('message', (d) => inbox.push(JSON.parse(d.toString())));
    await new Promise((r) => socket.once('open', r));
    const send = (msg: object) => socket.send(JSON.stringify(msg));
    const nextError = async () => {
      const seen = inbox.filter((m) => m.t === 'error').length;
      for (let i = 0; i < 200; i++) {
        const errors = inbox.filter((m) => m.t === 'error');
        if (errors.length > seen) return (errors.at(-1) as Extract<ServerEnvelope<MuleView>, { t: 'error' }>).message;
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error('no error message');
    };
    send({ t: 'join', code, name: 'Brix' });
    send({ t: 'addAi' });
    send({ t: 'start' });
    for (let i = 0; i < 200 && !inbox.some((m) => m.t === 'view' && m.view.game?.phase === 'planning'); i++) await new Promise((r) => setTimeout(r, 10));

    // Well-formed: they reach the rules, which refuse them outside the auction.
    for (const ok of [{ type: 'lineTrade', units: 2 }, { type: 'walkStep', dir: 'up' }]) {
      const error = nextError();
      send({ t: 'intent', intent: ok });
      expect(await error, JSON.stringify(ok)).toBe('The auction is not running');
    }
    const malformed = [{ type: 'lineTrade' }, { type: 'lineTrade', units: '2' }, { type: 'lineTrade', units: 1.5 }, { type: 'walkStep' }, { type: 'walkStep', dir: 'stop' }];
    for (const bad of malformed) {
      const error = nextError();
      send({ t: 'intent', intent: bad });
      expect(await error, JSON.stringify(bad)).toBe('Bad message');
    }
    socket.close();
  });
});
