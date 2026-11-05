/**
 * A steered game on the real server, played over the real WebSocket: what a phone and the TV receive, before any
 * screen draws it. One host seat, AI seats, and a board that watches. The test owns the server and drops it.
 */
import { DEV_STEER } from '@mule/engine';
import type { DevFrame, MuleIntent, MuleView, ServerEnvelope } from '@mule/protocol';
import type { MuleServer } from '../../server/src/server.js';
import { check, startServer } from './harness';

/** Time for the room to answer a join. */
const WELCOME_MS = 5_000;
/** Time for the room to hear every screen leave once its sockets are closed. */
const LEAVE_MS = 2_000;

type Envelope = ServerEnvelope<MuleView, DevFrame>;

/** One connection to the room, with everything it has been sent, in order. */
export interface Wire {
  /** Full views, newest last. */
  views: MuleView[];
  /** Development frames, with the real time each arrived. */
  frames: { frame: DevFrame; receivedAt: number }[];
  /** The seat this connection holds, and its token to take it back, from the room's welcome. */
  seatId: string | null;
  seatToken: string | null;
  send(msg: object): void;
  intent(intent: MuleIntent): void;
  close(): void;
  view(): MuleView | null;
}

export async function connect(base: string): Promise<Wire> {
  const socket = new WebSocket(`${base.replace(/^http/, 'ws')}/ws`);
  const wire: Wire = {
    views: [],
    frames: [],
    seatId: null,
    seatToken: null,
    send: (msg) => socket.send(JSON.stringify(msg)),
    intent: (intent) => wire.send({ t: 'intent', intent }),
    close: () => socket.close(),
    view: () => wire.views.at(-1) ?? null,
  };
  socket.addEventListener('message', (event) => {
    const msg = JSON.parse(String(event.data)) as Envelope;
    if (msg.t === 'view' && msg.view.game) wire.views.push(msg.view.game);
    if (msg.t === 'frame') wire.frames.push({ frame: msg.payload, receivedAt: Date.now() });
    if (msg.t === 'welcome') Object.assign(wire, { seatId: msg.seatId, seatToken: msg.seatToken });
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
  base: string;
  code: string;
  host: Wire;
  /** Other human seats, in the order of `guests`. */
  guests: Wire[];
  board: Wire;
  close(): Promise<void>;
}

/**
 * A started table: a host seat named Brix, `ais` AI seats, and a board. Every game steers its development.
 */
export async function steeredTable(options: { seed: number; ais: number; phaseScale: number; maxMonths: number; guests?: string[] }): Promise<SteeredTable> {
  const serverOptions = { seed: () => options.seed, phaseScale: options.phaseScale, maxMonths: options.maxMonths, politics: false };
  const { server, base } = await startServer(serverOptions);
  const { code } = (await (await fetch(`${base}/rooms`, { method: 'POST' })).json()) as { code: string };
  const host = await connect(base);
  host.send({ t: 'join', code, name: 'Brix' });
  check(await until(() => host.seatId !== null, WELCOME_MS), 'the host was never seated');
  const guests: Wire[] = [];
  for (const name of options.guests ?? []) {
    const guest = await connect(base);
    guest.send({ t: 'join', code, name });
    check(await until(() => guest.seatId !== null, WELCOME_MS), `${name} was never seated`);
    guests.push(guest);
  }
  for (let i = 0; i < options.ais; i++) host.send({ t: 'addAi' });
  const board = await connect(base);
  board.send({ t: 'board', code });
  host.send({ t: 'start' });
  return {
    server,
    base,
    code,
    host,
    guests,
    board,
    close: async () => {
      host.close();
      for (const guest of guests) guest.close();
      board.close();
      // The server's close lets its sockets go but leaves the game running, and a test table rarely plays to the end:
      // a phase that waits for its departed players would tick on and keep the process alive. The room is disposed
      // once every screen has left it, because a leave arriving later would start the next phase's ticks again.
      const room = server.registry.get(code);
      await until(() => room?.isIdle ?? true, LEAVE_MS);
      room?.dispose();
      await server.close();
    },
  };
}

/**
 * A human seat presses Ready in every phase and auction stage but development, so the table plays on. In the land
 * grant it first claims `plot`, when the light is on it, if one is given.
 */
export function keepsPlaying(host: Wire, plot?: { x: number; y: number }): () => void {
  let pressed = '';
  let claimed = false;
  const timer = setInterval(() => {
    const view = host.view();
    if (!view || view.phase === 'development' || view.finished) return;
    if (view.phase === 'landGrant' && plot && !claimed) {
      if (view.lit?.x !== plot.x || view.lit?.y !== plot.y) return;
      host.intent({ type: 'claim', x: plot.x, y: plot.y });
      claimed = true;
    }
    // Once per stage: each good's side pick waits for every seat's Done, and so does each land lot.
    const key = `${view.month}-${view.phase}-${view.auction?.good}-${view.auction?.stage}-${view.landAuction?.lot.id}-${view.landAuction?.stage}`;
    if (pressed === key) return;
    pressed = key;
    host.intent({ type: 'ready' });
  }, 10);
  return () => clearInterval(timer);
}

/** A seat's own colonist in the newest frame. */
export function me(wire: Wire): DevFrame['colonists'][number] | null {
  return wire.frames.at(-1)?.frame.colonists.find((c) => c.id === wire.seatId) ?? null;
}

/** The stick's step: each component a multiple of 1/8, as the phone sends it. */
const STICK_STEPS = 8;

/** A direction towards (dx, dy) at `strength` (at most 1), each component on the stick's steps. */
export function stick(dx: number, dy: number, strength = 1): { x: number; y: number } {
  const length = Math.hypot(dx, dy);
  if (length === 0) return { x: 0, y: 0 };
  // Rounded towards zero, so the quantised vector never grows past length 1; a nudge keeps at least one step.
  const q = (v: number) => {
    const steps = Math.trunc((v / length) * Math.min(1, strength) * STICK_STEPS);
    return (steps === 0 && Math.abs(v) / length > 1 / 2 ? Math.sign(v) : steps) / STICK_STEPS;
  };
  return { x: q(dx), y: q(dy) };
}

/** Time a walk to one point may take: across the whole map at the slowest land we walk. */
const WALK_MS = 30_000;
/** The thumb moves the stick as often as a phone sends steers, no more: the server drops a screen's excess. */
const THUMB_MS = 1000 / DEV_STEER.steerMaxPerSecond;
/** Within this many units of the target the thumb eases off, as a player does, so it stops on it. */
const EASE_UNITS = { map: 1, hall: 3 } as const;

/**
 * Steers this seat's colonist to (x, y) in `space`, straight, as a thumb on the stick would, and lets go there.
 * True once it stands within `within` of it; false if the walk timed out.
 */
export async function steerTo(wire: Wire, space: 'map' | 'hall', x: number, y: number, within: number): Promise<boolean> {
  let sent = { x: 0, y: 0 };
  const deadline = Date.now() + WALK_MS;
  try {
    while (Date.now() < deadline) {
      const c = me(wire);
      if (c && c.space === space && Math.hypot(x - c.x, y - c.y) <= within) return true;
      const dir = c && c.space === space ? stick(x - c.x, y - c.y, Math.hypot(x - c.x, y - c.y) / EASE_UNITS[space]) : { x: 0, y: 0 };
      if (dir.x !== sent.x || dir.y !== sent.y) {
        wire.intent({ type: 'steer', ...dir });
        sent = dir;
      }
      await new Promise((r) => setTimeout(r, THUMB_MS));
    }
    return false;
  } finally {
    wire.intent({ type: 'steer', x: 0, y: 0 });
  }
}

/** Walks a hall route: each point in turn, the last one to the middle of `place`'s box. */
export async function steerHall(wire: Wire, points: { x: number; y: number }[], within: number): Promise<boolean> {
  for (const p of points) if (!(await steerTo(wire, 'hall', p.x, p.y, within))) return false;
  return true;
}

/** Time for a press to come back as a changed view. */
const PRESS_MS = 3_000;

/** The button's words for this seat now, from its newest full view. */
export const reachOf = (wire: Wire) => wire.view()?.me?.reach ?? null;

/** Presses the button and waits for the next full view; true if one came. */
export async function press(wire: Wire): Promise<boolean> {
  const seen = wire.views.length;
  wire.intent({ type: 'act' });
  return until(() => wire.views.length > seen, PRESS_MS);
}
