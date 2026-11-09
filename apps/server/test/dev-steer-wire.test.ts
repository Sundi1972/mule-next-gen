import type { AddressInfo } from 'node:net';
import { RuleError } from '@mule/engine';
import type { MuleIntent, MuleView, ServerEnvelope } from '@mule/protocol';
import { Room, TableError, type GameContext } from '@tabletop/core';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { AI_NAMES } from '../src/mule-game.js';
import { createMuleServer, FRAME_BACKLOG_BYTES, socketConnection, type MuleServer } from '../src/server.js';

let running: MuleServer | null = null;
afterEach(async () => {
  await running?.close();
  running = null;
});

async function phone() {
  running = createMuleServer({ seed: () => 42 });
  await new Promise<void>((r) => running!.server.listen(0, r));
  const { port } = running.server.address() as AddressInfo;
  const socket = new WebSocket(`ws://localhost:${port}/ws`);
  const inbox: ServerEnvelope<MuleView>[] = [];
  socket.on('message', (d) => inbox.push(JSON.parse(d.toString())));
  await new Promise((r) => socket.once('open', r));
  /** Sends an intent before joining: the parse answers 'Bad message', anything past it 'Join a game first'. */
  const answer = async (intent: unknown) => {
    const seen = inbox.length;
    socket.send(JSON.stringify({ t: 'intent', intent }));
    for (let i = 0; i < 200 && inbox.length === seen; i++) await new Promise((r) => setTimeout(r, 5));
    const msg = inbox[seen];
    return msg?.t === 'error' ? msg.message : msg?.t;
  };
  return { answer };
}

describe('the wire for steering (AM-13, AM-15)', () => {
  it.each([
    { x: 1, y: 0 },
    { x: -0.5, y: 0.625 },
    { x: 0, y: 0, tick: 0 },
    { x: 0.125, y: -1, tick: 412 },
  ])('isIntent accepts a steer of the protocol\'s shape: %o', async (steer) => {
    const p = await phone();
    expect(await p.answer({ type: 'steer', ...steer })).toBe('Join a game first');
  });

  it.each([
    { x: '1', y: 0 },
    { x: 1 },
    { y: 0 },
    { x: 1.5, y: 0 },
    { x: 0, y: -2 },
    { x: 0, y: 0, tick: -1 },
    { x: 0, y: 0, tick: 1.5 },
    { x: 0, y: 0, tick: '3' },
    { x: null, y: 0 },
  ])('isIntent refuses a steer of any other shape: %o', async (steer) => {
    const p = await phone();
    expect(await p.answer({ type: 'steer', ...steer })).toBe('Bad message');
  });

  it('isIntent accepts the one button, act', async () => {
    const p = await phone();
    expect(await p.answer({ type: 'act' })).toBe('Join a game first');
  });
});

describe("server.ts's connection: a socket that is behind gets no frames (#213's review, T-AC-4)", () => {
  /** A stand-in for ws's socket: what it was sent, and a backlog the test sets. */
  function socket() {
    const sent: ServerEnvelope<MuleView>[] = [];
    const s = { OPEN: 1, readyState: 1, bufferedAmount: 0, send: (text: string) => void sent.push(JSON.parse(text)) };
    return { s, sent, kinds: () => sent.map((m) => m.t) };
  }

  /** A real room around a game that only frames, with the server's connection for one phone in it. */
  function room() {
    let ctx: GameContext | null = null;
    const r = new Room<MuleIntent, MuleView>({
      code: 'WIRES',
      createGame: (c) => {
        ctx = c;
        return { start: () => {}, handle: () => {}, viewFor: () => ({}) as MuleView };
      },
      aiNames: AI_NAMES,
      isUserError: (err) => err instanceof RuleError || err instanceof TableError,
    });
    const phone = socket();
    r.receive(socketConnection(phone.s as never), { seatId: null }, { t: 'join', code: 'WIRES', name: 'Heiko' });
    phone.sent.length = 0;
    return { frame: (n: number) => ctx!.frame({ n }), phone, broadcast: () => r.broadcast(), dispose: () => r.dispose() };
  }

  it('the backlog is 64 kB, room for three ~19 kB development views', () => {
    expect(FRAME_BACKLOG_BYTES).toBe(64 * 1024);
  });

  it('behind: a socket holding more than FRAME_BACKLOG_BYTES gets no frames; at FRAME_BACKLOG_BYTES or less it gets every one', () => {
    const t = room();
    t.phone.s.bufferedAmount = FRAME_BACKLOG_BYTES + 1;
    t.frame(1);
    t.frame(2);
    expect(t.phone.sent, 'nothing while behind').toEqual([]);
    t.phone.s.bufferedAmount = FRAME_BACKLOG_BYTES;
    t.frame(3);
    t.phone.s.bufferedAmount = 0;
    t.frame(4);
    expect(t.phone.sent).toEqual([
      { t: 'frame', payload: { n: 3 } },
      { t: 'frame', payload: { n: 4 } },
    ]);
    t.dispose();
  });

  it('behind (negative): a socket that is behind still gets its full view', async () => {
    const t = room();
    t.phone.s.bufferedAmount = FRAME_BACKLOG_BYTES * 2;
    t.broadcast();
    await Promise.resolve();
    expect(t.phone.kinds()).toEqual(['view']);
    t.dispose();
  });

  it('a socket that is not open is sent nothing', () => {
    const t = room();
    t.phone.s.readyState = 3;
    t.frame(1);
    expect(t.phone.sent).toEqual([]);
    t.dispose();
  });
});
