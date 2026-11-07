import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { advancePhase, COLONY_SELLER, createGame, WALK } from '@mule/engine';
import type { MuleView, ServerEnvelope } from '@mule/protocol';
import { GRANT_TICK_MS, MuleGame } from '../src/mule-game.js';
import { createMuleServer, type MuleServer } from '../src/server.js';
import { fakeContext, readyAll, seats } from './fake-context.js';

const humans = ['s1', 's2'];
const goodsWalker = (v: MuleView, id: string) => v.auction!.walkers.find((w) => w.id === id)!;
const lotWalker = (v: MuleView, id: string) => v.landAuction!.walkers.find((w) => w.id === id)!;

/** Plays month 1 to the goods auction's status stage for its first good, where each seat picks its side (WS3 C4). */
function toGoodsStatus() {
  const { ctx, advance } = fakeContext();
  const game = new MuleGame(ctx, 7);
  game.start(seats);
  readyAll(game);
  while (game.viewFor(null).phase === 'landGrant') advance(GRANT_TICK_MS);
  while (game.viewFor(null).phase === 'development') advance(1_000);
  while (game.viewFor(null).phase === 'production') advance(1_000);
  expect(game.viewFor(null).auction!.stage).toBe('status');
  return { game, advance };
}

/** The first seed whose month-1 roll brings a colony lot, so every seat can bid; found by playing the engine. */
function colonySeed(): number {
  for (let seed = 1; seed < 1_000; seed++) {
    const state = createGame({ seed, players: seats });
    while (state.phase !== 'landGrant') advancePhase(state);
    advancePhase(state);
    if (state.landAuction?.lot?.seller === COLONY_SELLER) return seed;
  }
  throw new Error('no colony seed under 1000');
}

/** Plays month 1 to the colony lot's intro at the land auction. */
function toLotIntro() {
  const { ctx, advance } = fakeContext();
  const game = new MuleGame(ctx, colonySeed());
  game.start(seats);
  for (const id of humans) game.handle(id, { type: 'ready' });
  while (game.viewFor(null).phase === 'landGrant') advance(GRANT_TICK_MS);
  expect(game.viewFor(null).landAuction!.stage).toBe('intro');
  return { game, advance };
}

describe('MuleGame: a seat moved to another device (AM-19)', () => {
  it('T-AC-11: a held walk stops when the seat moves — goods auction: s1 stays where it was, and is not Done', () => {
    const { game, advance } = toGoodsStatus();
    game.handle('s1', { type: 'declare', side: 'buyer' });
    for (const id of humans) game.handle(id, { type: 'ready' });
    advance(WALK.tickMs * 2);
    expect(game.viewFor(null).auction!.stage).toBe('walk');
    game.handle('s1', { type: 'walk', dir: 'up' });
    advance(1_000);
    const held = goodsWalker(game.viewFor(null), 's1');
    expect(held.dir).toBe(1);

    game.seatMoved('s1');
    advance(WALK.tickMs * 5);

    const view = game.viewFor(null);
    expect(view.auction!.stage).toBe('walk');
    expect(goodsWalker(view, 's1')).toMatchObject({ at: held.at, dir: 0, done: false });
  });

  it("T-AC-11: a held walk stops when the seat moves — land auction: s1's bid stops rising, and s1 is not Done", () => {
    const { game, advance } = toLotIntro();
    for (const id of humans) game.handle(id, { type: 'ready' });
    for (let i = 0; i < 200 && game.viewFor(null).landAuction!.stage === 'intro'; i++) advance(WALK.tickMs);
    expect(game.viewFor(null).landAuction!.stage).toBe('walk');
    game.handle('s1', { type: 'walk', dir: 'up' });
    advance(WALK.tickMs * 5);
    const held = lotWalker(game.viewFor(null), 's1');
    expect(held.dir).toBe(1);
    expect(held.price).toBeGreaterThan(0);

    game.seatMoved('s1');
    advance(WALK.tickMs * 5);

    const view = game.viewFor(null);
    expect(view.landAuction!.stage).toBe('walk');
    expect(lotWalker(view, 's1')).toMatchObject({ price: held.price, at: held.at, dir: 0, done: false });
  });

  it.each([
    { stage: "the goods auction's status stage", reach: toGoodsStatus },
    { stage: "the land auction's intro", reach: toLotIntro },
  ])('T-AC-11: a seat moving during $stage throws nothing and changes nothing', ({ reach }) => {
    const { game } = reach();
    const before = game.viewFor(null);

    expect(() => game.seatMoved('s1')).not.toThrow();

    expect(game.viewFor(null)).toStrictEqual(before);
  });
});

let running: MuleServer | null = null;
afterEach(async () => {
  await running?.close();
  running = null;
});

/** A screen on a fresh room's socket that records what the server sends it. */
async function screenOnNewRoom() {
  running = createMuleServer({ seed: () => 42 });
  await new Promise<void>((r) => running!.server.listen(0, r));
  const { port } = running.server.address() as AddressInfo;
  const { code } = (await (await fetch(`http://localhost:${port}/rooms`, { method: 'POST' })).json()) as { code: string };
  const socket = new WebSocket(`ws://localhost:${port}/ws`);
  const inbox: ServerEnvelope<MuleView>[] = [];
  socket.on('message', (d) => inbox.push(JSON.parse(d.toString())));
  await new Promise((r) => socket.once('open', r));
  const firstError = async () => {
    for (let i = 0; i < 200; i++) {
      const hit = inbox.find((m) => m.t === 'error');
      if (hit?.t === 'error') return hit.message;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('no error message');
  };
  return { code, inbox, send: (msg: object) => socket.send(JSON.stringify(msg)), firstError };
}

describe('the wire: join with a handoff code (AM-19)', () => {
  it('T-AC-11: a non-string handoff is "Bad message"', async () => {
    const phone = await screenOnNewRoom();

    phone.send({ t: 'join', code: phone.code, name: 'Mia', handoff: 123 });

    expect(await phone.firstError()).toBe('Bad message');
    expect(phone.inbox.some((m) => m.t === 'welcome')).toBe(false);
  });
});
