import type { AddressInfo } from 'node:net';
import type { MuleView, ServerEnvelope } from '@mule/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createMuleServer, type MuleServer } from '../src/server.js';

let running: MuleServer | null = null;
afterEach(async () => {
  await running?.close();
  running = null;
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

describe('game server', () => {
  it('runs a room with two phones, an AI and a big screen', async () => {
    const { http, ws } = await start();
    const { code } = (await (await fetch(`${http}/rooms`, { method: 'POST' })).json()) as { code: string };

    const heiko = await screen(ws);
    heiko.send({ t: 'join', code, name: 'Heiko' });
    const welcome = await heiko.waitFor('welcome');
    expect(welcome.seatToken).toBeTruthy();

    const mia = await screen(ws);
    mia.send({ t: 'join', code, name: 'Mia' });
    await mia.waitFor('welcome');

    const tv = await screen(ws);
    tv.send({ t: 'board', code });
    await tv.waitFor('welcome');

    heiko.send({ t: 'addAi' });
    heiko.send({ t: 'start' });
    const mine = await heiko.waitFor('view', (m) => m.view.status === 'playing');
    expect(mine.view.seats).toHaveLength(3);
    expect(mine.view.game?.me?.stock.food).toBeGreaterThan(0);

    const shared = await tv.waitFor('view', (m) => m.view.status === 'playing');
    expect(shared.view.game?.me).toBeNull();
    expect(shared.view.boards).toBe(1);
  });

  it('rejects malformed messages and unknown rooms', async () => {
    const { ws } = await start();
    const phone = await screen(ws);
    phone.socket.send('not json');
    expect((await phone.waitFor('error')).message).toBe('Bad message');
    phone.send({ t: 'join', code: 'ZZZZ', name: 'Heiko' });
    expect((await phone.waitFor('error', (m) => m.message !== 'Bad message')).message).toBe('No game with that code');
  });

  it('gives a dropped phone its seat back', async () => {
    const { http, ws } = await start();
    const { code } = (await (await fetch(`${http}/rooms`, { method: 'POST' })).json()) as { code: string };
    const first = await screen(ws);
    first.send({ t: 'join', code, name: 'Heiko' });
    const { seatId, seatToken } = await first.waitFor('welcome');
    first.socket.close();

    const again = await screen(ws);
    again.send({ t: 'join', code, name: 'Heiko', seatToken });
    expect((await again.waitFor('welcome')).seatId).toBe(seatId);
  });
});
