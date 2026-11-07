import type { AddressInfo } from 'node:net';
import type { MuleView, ServerEnvelope } from '@mule/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { MuleGame } from '../src/mule-game.js';
import { createMuleServer, type MuleServer } from '../src/server.js';

let running: MuleServer | null = null;
afterEach(async () => {
  await running?.close();
  running = null;
  vi.restoreAllMocks();
});

async function start() {
  running = createMuleServer({ seed: () => 42 });
  await new Promise<void>((r) => running!.server.listen(0, r));
  const { port } = running.server.address() as AddressInfo;
  return { http: `http://localhost:${port}`, ws: `ws://localhost:${port}/ws` };
}

/** A test screen that records everything the server sends it. */
async function screen(url: string) {
  const socket = new WebSocket(url);
  const inbox: ServerEnvelope<MuleView>[] = [];
  socket.on('message', (d) => inbox.push(JSON.parse(d.toString())));
  await new Promise((r) => socket.once('open', r));
  const send = (msg: object) => socket.send(JSON.stringify(msg));
  const waitFor = async <T extends ServerEnvelope<MuleView>['t']>(t: T, pred: (m: Extract<ServerEnvelope<MuleView>, { t: T }>) => boolean = () => true) => {
    for (let i = 0; i < 200; i++) {
      const hit = inbox.filter((m) => m.t === t).reverse().find((m) => pred(m as never));
      if (hit) return hit as Extract<ServerEnvelope<MuleView>, { t: T }>;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`no ${t} message`);
  };
  return { socket, inbox, send, waitFor };
}

/** A started table with two phones and a big screen. No AI, so only these phones make moves. */
async function table(http: string, ws: string) {
  const { code } = (await (await fetch(`${http}/rooms`, { method: 'POST' })).json()) as { code: string };
  const heiko = await screen(ws);
  heiko.send({ t: 'join', code, name: 'Heiko' });
  const { seatId } = await heiko.waitFor('welcome');
  const mia = await screen(ws);
  mia.send({ t: 'join', code, name: 'Mia' });
  await mia.waitFor('welcome');
  const tv = await screen(ws);
  tv.send({ t: 'board', code });
  await tv.waitFor('welcome');
  heiko.send({ t: 'start' });
  await tv.waitFor('view', (m) => m.view.status === 'playing');
  return { code, heiko, mia, tv, seatId: seatId! };
}

describe('game server', () => {
  it('a game error ends only its own table: its screens hear "error" and it leaves the registry, while another table plays on and /healthz answers', async () => {
    const { http, ws } = await start();
    const started = vi.spyOn(MuleGame.prototype, 'start');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const a = await table(http, ws);
    const b = await table(http, ws);
    const doomed = started.mock.contexts[0];
    const handle = MuleGame.prototype.handle;
    vi.spyOn(MuleGame.prototype, 'handle').mockImplementation(function (this: MuleGame, seatId, intent) {
      if (this === doomed) throw new Error('boom');
      handle.call(this, seatId, intent);
    });

    a.heiko.send({ t: 'intent', intent: { type: 'ready' } });

    for (const s of [a.heiko, a.mia, a.tv]) expect(await s.waitFor('removed')).toStrictEqual({ t: 'removed', reason: 'error' });
    expect(running!.registry.get(a.code)).toBeUndefined();
    expect(running!.registry.get(b.code)).toBeDefined();
    expect(logged).toHaveBeenCalledOnce();
    expect(logged.mock.calls[0]!.join(' ')).toContain('boom');

    b.heiko.send({ t: 'intent', intent: { type: 'ready' } });
    await b.mia.waitFor('view', (m) => m.view.game?.players.find((p) => p.id === b.seatId)?.ready === true);
    const health = await fetch(`${http}/healthz`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true, rooms: 1 });
  });
});
