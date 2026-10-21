import type { AddressInfo } from 'node:net';
import type { MuleView, ServerEnvelope } from '@mule/protocol';
import { expect, it } from 'vitest';
import WebSocket from 'ws';
import { AI_NAMES } from '../src/mule-game.js';
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

it('T-AC-3: a species picked over the socket reaches the game; a seat that never picked and an AI seat keep the default', async () => {
  const running = createMuleServer({ seed: () => 42 });
  const sockets: WebSocket[] = [];
  let code = '';
  try {
    await new Promise<void>((r) => running.server.listen(0, '127.0.0.1', r));
    const { port } = running.server.address() as AddressInfo;
    ({ code } = (await (await fetch(`http://127.0.0.1:${port}/rooms`, { method: 'POST' })).json()) as { code: string });
    const ws = `ws://127.0.0.1:${port}/ws`;

    const heiko = await phone(ws);
    sockets.push(heiko.socket);
    heiko.send({ t: 'join', code, name: 'Heiko' });
    await heiko.next((m) => m.t === 'welcome');
    const mia = await phone(ws);
    sockets.push(mia.socket);
    mia.send({ t: 'join', code, name: 'Mia' });
    const { seatId: miaSeat } = (await mia.next((m) => m.t === 'welcome')) as Extract<Envelope, { t: 'welcome' }>;

    mia.send({ t: 'pick', pick: 'quibbit' });
    const picked = await mia.next((m) => m.t === 'error' || (m.t === 'view' && m.view.seats.some((s) => s.id === miaSeat && s.pick === 'quibbit')));
    expect(picked.t === 'error' ? picked.message : 'pick shown').toBe('pick shown');

    heiko.send({ t: 'pick', pick: 'dragon' });
    const refused = await heiko.next((m) => m.t === 'error');
    expect(refused.t === 'error' && refused.message).toBe('Unknown choice');

    heiko.send({ t: 'addAi' });
    heiko.send({ t: 'start' });
    const started = (await heiko.next((m) => m.t === 'view' && m.view.status === 'playing')) as Extract<Envelope, { t: 'view' }>;
    expect(started.view.game?.players.map((p) => [p.name, p.isAi, p.species])).toEqual([
      ['Heiko', false, 'zipwing'], // never picked (its refused pick stored nothing): DEFAULT_SPECIES[0]
      ['Mia', false, 'quibbit'], // picked: not DEFAULT_SPECIES[1], which is bramblet
      [AI_NAMES[0], true, 'gearling'], // AI seats never pick: DEFAULT_SPECIES[2]
    ]);
    const miaView = (await mia.next((m) => m.t === 'view' && m.view.status === 'playing')) as Extract<Envelope, { t: 'view' }>;
    expect(miaView.view.game?.me?.species).toBe('quibbit');
  } finally {
    for (const s of sockets) s.terminate();
    running.registry.get(code)?.dispose(); // stops the game's phase timers
    await running.close();
  }
});
