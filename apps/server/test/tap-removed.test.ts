import { DEV_STEER } from '@mule/engine';
import type { AddressInfo } from 'node:net';
import type { MuleIntent, MuleView, ServerEnvelope } from '@mule/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { MuleGame } from '../src/mule-game.js';
import { createMuleServer, type MuleServer } from '../src/server.js';
import { fakeContext, readyAll, seats } from './fake-context.js';

/**
 * C14 (PR-12): the tap walk is gone. Every game steers its development, whatever options it was built with, so a record
 * made before the removal (its options say `devSteer: false`) replays on the floor; the colonist view carries no walk;
 * and a development tap is refused.
 */
function inDevelopment(options: Record<string, unknown>) {
  const fake = fakeContext();
  const game = new MuleGame(fake.ctx, 7, options as ConstructorParameters<typeof MuleGame>[2]);
  game.start(seats);
  readyAll(game);
  for (let i = 0; i < 10_000 && game.viewFor(null).phase !== 'development'; i++) fake.advance(100);
  expect(game.viewFor(null).phase).toBe('development');
  return { game, ...fake };
}

describe('C14: no tap walk left', () => {
  it("C14-1: a game built with an old record's devSteer: false still steers its development", () => {
    const flag = DEV_STEER.on;
    DEV_STEER.on = false;
    try {
      const { game } = inDevelopment({ devSteer: false });
      expect(() => game.handle(seats[0]!.id, { type: 'steer', x: 1, y: 0 })).not.toThrow();
      // Steered, as every screen sees it: the seat's button, and its colonist's place on the floor.
      const view = game.viewFor(seats[0]!.id);
      expect(view.me!.reach).toBeDefined();
      expect(view.players.find((p) => p.id === seats[0]!.id)!.colonist!.space).toBeDefined();
    } finally {
      DEV_STEER.on = flag;
    }
  });

  it('C14-2: the colonist view has no walk; it keeps at and assayUntil', () => {
    const { game } = inDevelopment({});
    const colonist = game.viewFor(seats[0]!.id).players.find((p) => p.id === seats[0]!.id)!.colonist!;
    expect(colonist).not.toHaveProperty('walk');
    expect(colonist).toHaveProperty('at');
    expect(colonist).toHaveProperty('assayUntil');
  });

  it('C14-3: a development tap is refused in words: the floor plays every move through a press', () => {
    const { game } = inDevelopment({});
    for (const tap of [{ type: 'buyMule' }, { type: 'pub' }, { type: 'outfit', outfit: 'food' }, { type: 'analyse', x: 0, y: 0 }]) {
      expect(() => game.handle(seats[0]!.id, tap as unknown as MuleIntent), tap.type).toThrow(/walk there and press the button/);
    }
  });

  it("C14-3: on the wire an old bundle's tap passes the parse, so the phone gets the game's words, not 'Bad message'", async () => {
    running = createMuleServer({ seed: () => 42 });
    await new Promise<void>((r) => running!.server.listen(0, r));
    const { port } = running.server.address() as AddressInfo;
    const socket = new WebSocket(`ws://localhost:${port}/ws`);
    const inbox: ServerEnvelope<MuleView>[] = [];
    socket.on('message', (d) => inbox.push(JSON.parse(d.toString())));
    await new Promise((r) => socket.once('open', r));
    try {
      for (const tap of [{ type: 'buyMule' }, { type: 'pub' }, { type: 'outfit', outfit: 'food' }, { type: 'install', x: 1, y: 1 }, { type: 'analyse', x: 1, y: 1 }, { type: 'filter', x: 1, y: 1 }]) {
        const seen = inbox.length;
        socket.send(JSON.stringify({ t: 'intent', intent: tap }));
        for (let i = 0; i < 200 && inbox.length === seen; i++) await new Promise((r) => setTimeout(r, 5));
        const msg = inbox[seen];
        // Before joining, a parsed intent is answered 'Join a game first'; one the parse drops, 'Bad message'.
        expect(msg?.t === 'error' ? msg.message : msg?.t, tap.type).toBe('Join a game first');
      }
    } finally {
      socket.terminate();
    }
  });
});

let running: MuleServer | null = null;
afterEach(async () => {
  await running?.close();
  running = null;
});
