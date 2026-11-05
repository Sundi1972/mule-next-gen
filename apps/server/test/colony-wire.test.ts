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

/** A socket that sends an intent before joining: the parse answers 'Bad message', anything past it 'Join a game first'. */
async function phone() {
  running = createMuleServer({ seed: () => 42 });
  await new Promise<void>((r) => running!.server.listen(0, r));
  const { port } = running.server.address() as AddressInfo;
  const socket = new WebSocket(`ws://localhost:${port}/ws`);
  const inbox: ServerEnvelope<MuleView>[] = [];
  socket.on('message', (d) => inbox.push(JSON.parse(d.toString())));
  await new Promise((r) => socket.once('open', r));
  return async (intent: unknown) => {
    const seen = inbox.length;
    socket.send(JSON.stringify({ t: 'intent', intent }));
    for (let i = 0; i < 200 && inbox.length === seen; i++) await new Promise((r) => setTimeout(r, 5));
    const msg = inbox[seen];
    return msg?.t === 'error' ? msg.message : msg?.t;
  };
}

describe("the wire for the colony's and the council's intents", () => {
  it.each([
    { type: 'commission', id: 'hospital' },
    { type: 'repair', id: 'park' },
    { type: 'donate', id: 'hospital', credits: 100 },
    { type: 'donate', id: 'hospital', credits: 0, goods: { electronics: 1, alloy: 0 } },
    { type: 'propose', proposal: { kind: 'enact', law: 'landTax', setting: 10 } },
    { type: 'propose', proposal: { kind: 'enact', law: 'landTax', setting: 10, replaces: 'exportTax' } },
    { type: 'propose', proposal: { kind: 'repeal', law: 'landTax' } },
    { type: 'propose', proposal: null },
    { type: 'voteLaw', yes: false },
    { type: 'payStrike' },
  ] as unknown[])('isIntent accepts %o', async (intent) => {
    expect(await (await phone())(intent)).toBe('Join a game first');
  });

  it.each([
    { type: 'donate', id: 'hospital', credits: 0, goods: { toString: 1 } },
    { type: 'donate', id: 'hospital', credits: 0, goods: [1] },
    { type: 'donate', id: 'hospital', credits: 0, goods: { electronics: 1.5 } },
    { type: 'donate', id: 'hospital', credits: -1.5 },
    { type: 'commission' },
    { type: 'propose', proposal: { kind: 'enact', law: 'landTax', setting: 'ten' } },
    { type: 'propose', proposal: { kind: 'abolish', law: 'landTax' } },
    { type: 'voteLaw', yes: 'yes' },
  ] as unknown[])('isIntent refuses %o at the boundary (WS3: a non-good key corrupted state)', async (intent) => {
    expect(await (await phone())(intent)).toBe('Bad message');
  });
});
