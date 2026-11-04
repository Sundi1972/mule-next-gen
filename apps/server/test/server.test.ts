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
  it("close() disposes every live room, so no game's timers outlive the server", async () => {
    await start();
    const rooms = [running!.registry.create(), running!.registry.create()];
    const disposed: string[] = [];
    for (const room of rooms) {
      const dispose = room.dispose.bind(room);
      room.dispose = () => {
        disposed.push(room.code);
        dispose();
      };
    }
    await running!.close();
    running = null;
    expect(disposed.sort()).toEqual(rooms.map((r) => r.code).sort());
  });

  it('close() still disposes the other rooms when one room fails to dispose, and resolves', async () => {
    await start();
    const [bad, good] = [running!.registry.create(), running!.registry.create()];
    bad.dispose = () => {
      throw new Error('a game that will not stop');
    };
    let goodDisposed = false;
    const dispose = good.dispose.bind(good);
    good.dispose = () => {
      goodDisposed = true;
      dispose();
    };
    await running!.close();
    running = null;
    expect(goodDisposed, 'the room after the failing one is disposed too').toBe(true);
  });

  it('after close(), a started game holds no timers, even once its phones\' sockets have closed (a late leave reaches no game)', async () => {
    const { http, ws } = await start();
    const { code } = (await (await fetch(`${http}/rooms`, { method: 'POST' })).json()) as { code: string };
    const heiko = await screen(ws);
    heiko.send({ t: 'join', code, name: 'Heiko' });
    await heiko.waitFor('welcome');
    heiko.send({ t: 'addAi' });
    heiko.send({ t: 'start' });
    await heiko.waitFor('view', (m) => m.view.status === 'playing');
    const room = running!.registry.get(code)!;
    const timers = () => (room as unknown as { timers: Set<unknown> }).timers.size;
    const closed = new Promise((r) => heiko.socket.once('close', r));
    await running!.close();
    running = null;
    await closed;
    // The socket's close reached the server too: give its leave a turn of the event loop to run.
    await new Promise((r) => setTimeout(r, 20));
    expect(timers(), 'no timer of the game outlives close()').toBe(0);
  });

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

  it('FM-kick-no-seat: rejects a kick that names no seat', async () => {
    const { ws } = await start();
    const phone = await screen(ws);
    phone.send({ t: 'kick' });
    expect((await phone.waitFor('error')).message).toBe('Bad message');
    // A well-formed kick gets past the parse, so the line above is the parse's doing.
    phone.send({ t: 'kick', seatId: 's1' });
    expect((await phone.waitFor('error', (m) => m.message !== 'Bad message')).message).toBe('Join a game first');
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
