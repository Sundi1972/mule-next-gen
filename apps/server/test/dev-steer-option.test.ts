import type { AddressInfo } from 'node:net';
import { DEV_STEER } from '@mule/engine';
import type { DevFrame, MuleView, ServerEnvelope } from '@mule/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createMuleServer, type MuleServer } from '../src/server.js';

const servers: MuleServer[] = [];
const sockets: WebSocket[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.terminate();
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

/** Fast enough that development comes round in a few seconds, slow enough that a tick is still a timer of its own. */
const PHASE_SCALE = 0.1;

/**
 * A server on seed 42, with or without `devSteer`, and one phone that hosts a game with one AI seat: it presses Ready whenever it
 * may until development opens. Returns what the phone received and a way to send.
 */
async function phoneInDevelopment(devSteer: boolean | undefined) {
  const server = createMuleServer({ seed: () => 42, phaseScale: PHASE_SCALE, politics: false, maxMonths: 1, ...(devSteer === undefined ? {} : { devSteer }) });
  servers.push(server);
  await new Promise<void>((r) => server.server.listen(0, r));
  const { port } = server.server.address() as AddressInfo;
  const { code } = (await (await fetch(`http://localhost:${port}/rooms`, { method: 'POST' })).json()) as { code: string };
  const socket = new WebSocket(`ws://localhost:${port}/ws`);
  sockets.push(socket);
  const inbox: ServerEnvelope<MuleView>[] = [];
  socket.on('message', (d) => inbox.push(JSON.parse(d.toString())));
  await new Promise((r) => socket.once('open', r));
  const send = (msg: object) => socket.send(JSON.stringify(msg));
  send({ t: 'join', code, name: 'Heiko' });
  // A game needs two players: an AI seat makes the second.
  send({ t: 'addAi' });
  send({ t: 'start' });
  const phase = () => inbox.filter((m) => m.t === 'view').at(-1)?.view.game?.phase;
  for (let i = 0; i < 2_000 && phase() !== 'development'; i++) {
    // Ten a second at most, under the server's RATE_LIMIT, so the steer that follows is not dropped.
    if (i % 10 === 0 && (phase() === 'planning' || phase() === 'landGrant')) send({ t: 'intent', intent: { type: 'ready' } });
    await new Promise((r) => setTimeout(r, 10));
  }
  expect(phase(), 'the game reached development').toBe('development');
  const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));
  return { inbox, send, settle, phase };
}

describe('createMuleServer({ devSteer }): steering for one game, with DEV_STEER.on off', { timeout: 30_000 }, () => {
  it('a devSteer game ticks and takes steer intents; a default game on the same seed refuses steer and sends no frames', async () => {
    expect(DEV_STEER.on, "trunk's flag stays off").toBe(false);
    const steered = await phoneInDevelopment(true);
    const plain = await phoneInDevelopment(undefined);
    for (const p of [steered, plain]) {
      p.inbox.length = 0;
      p.send({ t: 'intent', intent: { type: 'steer', x: 1, y: 0 } });
    }
    await steered.settle(20 * DEV_STEER.tickMs * PHASE_SCALE);

    const frames = steered.inbox.filter((m): m is Extract<ServerEnvelope<MuleView>, { t: 'frame' }> => m.t === 'frame').map((m) => m.payload as DevFrame);
    expect(frames.length, 'the steered game ticks').toBeGreaterThan(5);
    expect(frames.at(-1)!.colonists[0]!.moving, 'and its colonist walks on the steer').toBe(true);
    expect(steered.inbox.filter((m) => m.t === 'error'), 'the steer was taken').toEqual([]);
    const me = steered.inbox.filter((m) => m.t === 'view').at(-1)?.view.game?.me;
    expect(me?.reach, 'its phone has the button').toBeDefined();

    expect(plain.inbox.filter((m) => m.t === 'frame'), 'the default game sends no frames').toEqual([]);
    for (let i = 0; i < 200 && !plain.inbox.some((m) => m.t === 'error'); i++) await plain.settle(10);
    const refused = plain.inbox.filter((m) => m.t === 'error');
    expect(refused.map((m) => (m as { message: string }).message)).toEqual([expect.stringMatching(/steer/i)]);
    expect(plain.phase()).toBe('development');
    const view = plain.inbox.filter((m) => m.t === 'view').at(-1)?.view.game;
    expect(view?.me?.reach, "the default game's phone has today's screens").toBeUndefined();
  });
});
