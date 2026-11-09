import type { AddressInfo } from 'node:net';
import type { MuleView, ServerEnvelope } from '@mule/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { WALK, type GameState } from '@mule/engine';
import { GRANT_TICK_MS, MuleGame } from '../src/mule-game.js';
import { createMuleServer, type MuleServer } from '../src/server.js';
import { fakeContext, readyAll, seats } from './fake-context.js';

/**
 * G-2's one-tap step at the server: the walkStep intent reaches the engine, the view says which house line each walker
 * stands at and quotes the ship's falling price, and the wire refuses malformed intents, lineTrade among them now that
 * a house line trades by itself (the auto-trade amendment; its promises are auction-self-trade.test.ts's).
 */
const engineOf = (game: MuleGame) => (game as unknown as { state: GameState }).state;

/** Into the first good's walk, everyone a buyer (s1 and the AI with no money), with only the store selling, and plenty. */
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
  state.players.find((p) => p.id === 's1')!.money = 0;
  state.players.find((p) => p.id === 's3')!.money = 0;
  game.handle('s1', { type: 'ready' });
  game.handle('s2', { type: 'ready' });
  advance(WALK.tickMs * 2);
  const auction = game.viewFor('s2').auction!;
  expect(auction.stage).toBe('walk');
  // Only s2 can pay: the AI seat and s1 have no money, so they buy nothing wherever they walk.
  state.players.find((p) => p.id === 's2')!.money = 5_000;
  return { game, advance, state, good: auction.good };
}

/** The fake clock runs one auction tick per call: step it a tick at a time. */
const ticks = (advance: (ms: number) => void, ms: number) => {
  for (let t = 0; t < ms; t += WALK.tickMs) advance(WALK.tickMs);
};

const mine = (game: MuleGame) => game.viewFor('s2').auction!.walkers.find((w) => w.id === 's2')!;

describe('G-2 at the server: a tap is one step, and the view quotes the ship', () => {
  it('B-AC: walkStep up moves the bid exactly one step, and the view shows it', () => {
    const { game } = toWalk();
    const from = mine(game).price;
    game.handle('s2', { type: 'walkStep', dir: 'up' });
    expect(mine(game).price).toBe(from + 1);
    game.handle('s2', { type: 'walkStep', dir: 'down' });
    expect(mine(game).price).toBe(from);
  });

  it("the view quotes the ship's price for each unit it still wants, next first, so the phone can total a sale", () => {
    const { game, state, good } = toWalk();
    expect(game.viewFor('s2').auction!.shipQuote).toEqual([]);
    state.ship = { arrives: state.month, goods: [good], hold: { [good]: 3 }, bought: {} };
    state.store.offWorld[good] = 200;
    const auction = game.viewFor('s2').auction!;
    expect(auction.shipQuote).toHaveLength(3);
    expect(auction.shipQuote![0]).toBe(auction.shipPays);
    expect(auction.shipQuote![2]).toBeLessThan(auction.shipQuote![0]!);
  });

});

let running: MuleServer | null = null;
afterEach(async () => {
  await running?.close();
  running = null;
});

describe('G-2 over the wire', () => {
  it('the wire accepts walkStep, so the rules answer it, and refuses malformed ones and the retired lineTrade', async () => {
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
    for (const ok of [{ type: 'walkStep', dir: 'up' }]) {
      const error = nextError();
      send({ t: 'intent', intent: ok });
      expect(await error, JSON.stringify(ok)).toBe('The auction is not running');
    }
    const malformed = [{ type: 'lineTrade', units: 2 }, { type: 'walkStep' }, { type: 'walkStep', dir: 'stop' }];
    for (const bad of malformed) {
      const error = nextError();
      send({ t: 'intent', intent: bad });
      expect(await error, JSON.stringify(bad)).toBe('Bad message');
    }
    socket.close();
  });
});
