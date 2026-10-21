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

/** A real server on a free port, and Brix's phone seated in a started room with one AI seat. */
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
  const games = () => inbox.flatMap((m) => (m.t === 'view' && m.view.game ? [m.view.game] : []));
  /** The latest game view that matches. */
  const waitForGame = async (pred: (g: MuleView) => boolean) => {
    for (let i = 0; i < 200; i++) {
      const hit = games().reverse().find(pred);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('no such view');
  };
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
  const first = await waitForGame((g) => g.phase === 'planning');
  const intent = (i: object) => send({ t: 'intent', intent: i });
  return { first, intent, nextError, waitForGame };
}

describe('politics over the wire', () => {
  it('C1: the server a player joins plays politics by default', async () => {
    const { first } = await seatedPhone();
    expect(first.month).toBe(1);
    expect(first.politics, 'the board-wide politics view').toBeTruthy();
    expect(first.politics!.election?.stage).toBe('nominate');
    expect(first.me!.politics, "the phone's own politics").toBeTruthy();
  });

  it('C9: the wire accepts run, vote and setTax and refuses malformed ones', async () => {
    const phone = await seatedPhone();
    phone.intent({ type: 'run', office: 'governor' });
    const running = await phone.waitForGame((g) => g.me?.politics?.running === 'governor');
    expect(running.politics!.election!.candidates.governor).toEqual([running.me!.id]);

    // Well-formed, so they reach the rules, which refuse them in nominate.
    let error = phone.nextError();
    phone.intent({ type: 'vote', office: 'governor', candidate: null });
    expect(await error).toBe('The ballot is not open yet');
    error = phone.nextError();
    phone.intent({ type: 'setTax', percent: 8 });
    expect(await error).toBe('Wait for the election to end');

    const malformed = [
      { type: 'run', office: 'mayor' },
      { type: 'run' },
      { type: 'vote', office: 'mayor', candidate: null },
      { type: 'vote', office: 'governor', candidate: 7 },
      { type: 'vote', office: 'governor' },
      { type: 'setTax', percent: 8.5 },
      { type: 'setTax', percent: '8' },
    ];
    for (const bad of malformed) {
      error = phone.nextError();
      phone.intent(bad);
      expect(await error, JSON.stringify(bad)).toBe('Bad message');
    }
    phone.intent({ type: 'run', office: null });
    await phone.waitForGame((g) => g.me?.politics?.running === null);
  });
});
