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

/** A real server on a free port, and a phone seated in a started room. Copied in shape from server.test.ts. */
async function seatedPhone() {
  running = createMuleServer({ seed: () => 42 });
  await new Promise<void>((r) => running!.server.listen(0, r));
  const { port } = running.server.address() as AddressInfo;
  const { code } = (await (await fetch(`http://localhost:${port}/rooms`, { method: 'POST' })).json()) as { code: string };
  const socket = new WebSocket(`ws://localhost:${port}/ws`);
  const inbox: ServerEnvelope<MuleView>[] = [];
  socket.on('message', (d) => inbox.push(JSON.parse(d.toString())));
  await new Promise((r) => socket.once('open', r));
  const send = (msg: object) => socket.send(JSON.stringify(msg));
  /** The next error after the ones already seen. */
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
  return { send, nextError };
}

describe('land auction over the wire', () => {
  it('B-AC-1: a phone\'s list and unlist reach the game, and a malformed one is refused at the wire', async () => {
    const phone = await seatedPhone();
    // Brix owns nothing in month 1, so a well-formed listing reaches the rules and they refuse it.
    let error = phone.nextError();
    phone.send({ t: 'intent', intent: { type: 'list', item: { kind: 'plot', x: 0, y: 0 }, minimum: 250, unsold: 'keep' } });
    expect(await error).toBe('Not your plot');
    error = phone.nextError();
    phone.send({ t: 'intent', intent: { type: 'unlist', id: 'plot-0-0' } });
    expect(await error).toBe('No such listing');
    error = phone.nextError();
    phone.send({ t: 'intent', intent: { type: 'list', item: { kind: 'plot', x: 0, y: 0 }, minimum: '250', unsold: 'keep' } });
    expect(await error).toBe('Bad message');
    error = phone.nextError();
    phone.send({ t: 'intent', intent: { type: 'unlist', id: 7 } });
    expect(await error).toBe('Bad message');
  });
});
