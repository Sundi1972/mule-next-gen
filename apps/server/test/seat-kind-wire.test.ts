import type { AddressInfo } from 'node:net';
import type { MuleView, ServerEnvelope } from '@mule/protocol';
import { expect, it } from 'vitest';
import WebSocket from 'ws';
import { createMuleServer } from '../src/server.js';

type Envelope = ServerEnvelope<MuleView>;

/** A phone on a real socket. `next` waits for the first message after the last one it returned that matches. */
async function phone(url: string) {
  const socket = new WebSocket(url);
  const inbox: Envelope[] = [];
  socket.on('message', (d) => inbox.push(JSON.parse(d.toString())));
  await new Promise((r) => socket.once('open', r));
  let seen = 0;
  const next = async (match: (m: Envelope) => boolean): Promise<Envelope> => {
    for (let i = 0; i < 200; i++) {
      const at = inbox.findIndex((m, j) => j >= seen && match(m));
      if (at >= 0) {
        seen = at + 1;
        return inbox[at]!;
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('no matching message');
  };
  return { socket, send: (msg: object) => socket.send(JSON.stringify(msg)), next };
}

it('C1 (Task 1.2): setSeatKind crosses the socket to the Room; a malformed one is refused as a bad message', async () => {
  const running = createMuleServer({ seed: () => 7 });
  const sockets: WebSocket[] = [];
  try {
    await new Promise<void>((r) => running.server.listen(0, '127.0.0.1', r));
    const { port } = running.server.address() as AddressInfo;
    const { code } = (await (await fetch(`http://127.0.0.1:${port}/rooms`, { method: 'POST' })).json()) as { code: string };
    const heiko = await phone(`ws://127.0.0.1:${port}/ws`);
    sockets.push(heiko.socket);
    heiko.send({ t: 'join', code, name: 'Heiko' });
    await heiko.next((m) => m.t === 'welcome');
    heiko.send({ t: 'addAi' });
    const added = (await heiko.next((m) => m.t === 'view' && m.view.seats.some((s) => s.isAi))) as Extract<Envelope, { t: 'view' }>;
    const ai = added.view.seats.find((s) => s.isAi)!.id;

    heiko.send({ t: 'setSeatKind', seatId: ai, kind: 'dragon' });
    expect(await heiko.next((m) => m.t === 'error')).toEqual({ t: 'error', message: 'Bad message' });
    heiko.send({ t: 'setSeatKind', seatId: 7, kind: 'claude' });
    expect(await heiko.next((m) => m.t === 'error')).toEqual({ t: 'error', message: 'Bad message' });

    heiko.send({ t: 'setSeatKind', seatId: ai, kind: 'claude' });
    const set = (await heiko.next((m) => m.t === 'view' && m.view.seats.some((s) => s.id === ai && s.kind === 'claude'))) as Extract<Envelope, { t: 'view' }>;
    expect(set.view.seats.find((s) => s.id === ai)!.seatCode).toMatch(/^[A-Z2-9]{4}-\d{2}$/);
  } finally {
    for (const s of sockets) s.terminate();
    running.registry.disposeAll(); // stops any game's phase timers
    await running.close();
  }
});
