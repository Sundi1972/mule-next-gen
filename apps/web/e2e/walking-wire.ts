/**
 * A steered game on the real server, played over the real WebSocket: what a phone and the TV receive, before any
 * screen draws it. One host seat, AI seats, and a board that watches. The test owns the server and drops it.
 */
import type { DevFrame, MuleIntent, MuleView, ServerEnvelope } from '@mule/protocol';
import type { MuleServer } from '../../server/src/server.js';
import { startServer } from './harness';

type Envelope = ServerEnvelope<MuleView, DevFrame>;

/** One connection to the room, with everything it has been sent, in order. */
export interface Wire {
  /** Full views, newest last. */
  views: MuleView[];
  /** Development frames, with the real time each arrived. */
  frames: { frame: DevFrame; receivedAt: number }[];
  send(msg: object): void;
  intent(intent: MuleIntent): void;
  close(): void;
  view(): MuleView | null;
}

async function connect(base: string): Promise<Wire> {
  const socket = new WebSocket(`${base.replace(/^http/, 'ws')}/ws`);
  const wire: Wire = {
    views: [],
    frames: [],
    send: (msg) => socket.send(JSON.stringify(msg)),
    intent: (intent) => wire.send({ t: 'intent', intent }),
    close: () => socket.close(),
    view: () => wire.views.at(-1) ?? null,
  };
  socket.addEventListener('message', (event) => {
    const msg = JSON.parse(String(event.data)) as Envelope;
    if (msg.t === 'view' && msg.view.game) wire.views.push(msg.view.game);
    if (msg.t === 'frame') wire.frames.push({ frame: msg.payload, receivedAt: Date.now() });
  });
  await new Promise((done, fail) => {
    socket.addEventListener('open', done, { once: true });
    socket.addEventListener('error', fail, { once: true });
  });
  return wire;
}

/** Waits until `ready()` holds, checking every few ms; false if it never does within `timeoutMs`. */
export async function until(ready: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (!ready()) {
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, 10));
  }
  return true;
}

export interface SteeredTable {
  server: MuleServer;
  host: Wire;
  board: Wire;
  close(): Promise<void>;
}

/**
 * A started table with steering on: a host seat named Brix, `ais` AI seats, and a board. The server is built with
 * `devSteer`, the per-game switch for steered development; on a server without it development walks by taps and no
 * frame is ever sent.
 */
export async function steeredTable(options: { seed: number; ais: number; phaseScale: number; maxMonths: number }): Promise<SteeredTable> {
  const serverOptions = { seed: () => options.seed, phaseScale: options.phaseScale, maxMonths: options.maxMonths, politics: false, devSteer: true };
  const { server, base } = await startServer(serverOptions);
  const { code } = (await (await fetch(`${base}/rooms`, { method: 'POST' })).json()) as { code: string };
  const host = await connect(base);
  host.send({ t: 'join', code, name: 'Brix' });
  for (let i = 0; i < options.ais; i++) host.send({ t: 'addAi' });
  const board = await connect(base);
  board.send({ t: 'board', code });
  host.send({ t: 'start' });
  return {
    server,
    host,
    board,
    close: async () => {
      host.close();
      board.close();
      await server.close();
    },
  };
}

/** The host presses Ready in every phase but development, so the table reaches development on its own. */
export function hostKeepsPlaying(host: Wire): () => void {
  let pressed = '';
  const timer = setInterval(() => {
    const view = host.view();
    if (!view || view.phase === 'development' || view.finished) return;
    const key = `${view.month}-${view.phase}`;
    if (pressed === key) return;
    pressed = key;
    host.intent({ type: 'ready' });
  }, 50);
  return () => clearInterval(timer);
}
