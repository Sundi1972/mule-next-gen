import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MuleView, ServerEnvelope } from '@mule/protocol';
import type { ClaudeStatus } from '@tabletop/core';
import { expect, it } from 'vitest';
import WebSocket from 'ws';
import { MuleGame } from '../src/mule-game.js';
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

it('C1 (WS2 contract): with the game recorded, as the real server runs, a code names the MuleGame itself, not the recorder', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mule-seat-kind-'));
  const running = createMuleServer({ seed: () => 7, recordDir: dir });
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
    heiko.send({ t: 'setSeatKind', seatId: ai, kind: 'claude' });
    const set = (await heiko.next((m) => m.t === 'view' && m.view.seats.some((s) => s.id === ai && s.seatCode))) as Extract<Envelope, { t: 'view' }>;
    const answer = running.registry.seatForCode(set.view.seats.find((s) => s.id === ai)!.seatCode!);
    expect(answer).toMatchObject({ state: 'live', seatId: ai });
    expect(answer?.state === 'live' && answer.table, 'the MuleGame that start keys its seats under').toBeInstanceOf(MuleGame);
  } finally {
    for (const s of sockets) s.terminate();
    running.registry.disposeAll();
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it("C6 (B-AC-2): with the game recorded, as the real server runs, the game's Claude status reaches the phone", async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mule-claude-status-'));
  const running = createMuleServer({ seed: () => 7, recordDir: dir });
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
    heiko.send({ t: 'setSeatKind', seatId: ai, kind: 'claude' });
    const set = (await heiko.next((m) => m.t === 'view' && m.view.seats.some((s) => s.id === ai && s.seatCode))) as Extract<Envelope, { t: 'view' }>;
    expect(set.view.seats.find((s) => s.id === ai)!.claude).toBe('waiting');

    const answer = running.registry.seatForCode(set.view.seats.find((s) => s.id === ai)!.seatCode!);
    const game = answer?.state === 'live' ? (answer.table as MuleGame) : null;
    Object.assign(game!, { claudeStatus: (seatId: string): ClaudeStatus | undefined => (seatId === ai ? 'connected' : undefined) });
    running.registry.get(code)!.broadcast();
    const seen = (await heiko.next((m) => m.t === 'view')) as Extract<Envelope, { t: 'view' }>;
    expect(seen.view.seats.find((s) => s.id === ai)!.claude, 'the recorder passes the question to the game it wraps').toBe('connected');
  } finally {
    for (const s of sockets) s.terminate();
    running.registry.disposeAll();
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
