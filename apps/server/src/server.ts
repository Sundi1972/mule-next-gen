import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { RuleError, SPECIES } from '@mule/engine';
import { EMOTES, type MuleIntent, type MuleView } from '@mule/protocol';
import { RoomRegistry, TableError, type ClientEnvelope, type Connection, type Room } from '@tabletop/core';
import { WebSocketServer, type WebSocket } from 'ws';
import { AI_NAMES, MuleGame } from './mule-game.js';

const MAX_MESSAGE_BYTES = 4_096;
/** Messages per second a screen may send before it is told to slow down. */
const RATE_LIMIT = 20;
const IDLE_ROOM_MS = 30 * 60_000;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

export interface MuleServer {
  server: Server;
  registry: RoomRegistry<MuleIntent, MuleView>;
  close(): Promise<void>;
}

/**
 * The game server: an HTTP server for the web client and `POST /rooms`, and a
 * WebSocket endpoint at `/ws` where phones and boards talk to their room.
 * Games play without politics unless `politics` is set: it stays dark until its screens ship.
 */
export function createMuleServer(
  options: { staticDir?: string; seed?: () => number; maxMonths?: number; phaseScale?: number; politics?: boolean } = {},
): MuleServer {
  const seed = options.seed ?? (() => Math.floor(Math.random() * 2 ** 31));
  const registry = new RoomRegistry<MuleIntent, MuleView>({
    createGame: (ctx) => new MuleGame(ctx, seed(), { maxMonths: options.maxMonths, phaseScale: options.phaseScale, politics: options.politics ?? false }),
    aiNames: AI_NAMES,
    emotes: EMOTES,
    picks: SPECIES,
    isUserError: (err) => err instanceof RuleError || err instanceof TableError,
    // The room has already ended itself; only the stack is logged, never what the players sent.
    onError: (err) => console.error(`game error: ${err instanceof Error ? err.stack : String(err)}`),
  });
  const staticDir = options.staticDir && existsSync(options.staticDir) ? resolve(options.staticDir) : null;

  const server = createServer((req, res) => handleHttp(req, res, registry, staticDir));
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_MESSAGE_BYTES });
  wss.on('connection', (socket) => attach(socket, registry));
  const sweeper = setInterval(() => registry.sweep(IDLE_ROOM_MS), 60_000);

  return {
    server,
    registry,
    close: () =>
      new Promise((done) => {
        clearInterval(sweeper);
        for (const client of wss.clients) client.terminate();
        wss.close();
        server.close(() => done());
      }),
  };
}

function handleHttp(
  req: IncomingMessage,
  res: ServerResponse,
  registry: RoomRegistry<MuleIntent, MuleView>,
  staticDir: string | null,
): void {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (req.method === 'POST' && url.pathname === '/rooms') {
    const room = registry.create();
    res.writeHead(201, { 'content-type': 'application/json' }).end(JSON.stringify({ code: room.code }));
    return;
  }
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, rooms: registry.size }));
    return;
  }
  if (!staticDir) {
    res.writeHead(404).end();
    return;
  }
  // Serve the built web client; unknown paths fall back to index.html for client-side routes like /table.
  const path = normalize(join(staticDir, decodeURIComponent(url.pathname)));
  const file = path.startsWith(staticDir) && existsSync(path) && statSync(path).isFile() ? path : join(staticDir, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

function attach(socket: WebSocket, registry: RoomRegistry<MuleIntent, MuleView>): void {
  const conn: Connection<MuleView> = {
    send: (msg) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
    },
  };
  const from = { seatId: null as string | null };
  let room: Room<MuleIntent, MuleView> | undefined;
  let windowStart = Date.now();
  let count = 0;

  socket.on('message', (data) => {
    const now = Date.now();
    if (now - windowStart >= 1_000) {
      windowStart = now;
      count = 0;
    }
    if (++count > RATE_LIMIT) return;

    const msg = parse(data.toString());
    if (!msg) {
      conn.send({ t: 'error', message: 'Bad message' });
      return;
    }
    if (msg.t === 'join' || msg.t === 'board') {
      const target = registry.get(msg.code);
      if (!target) {
        conn.send({ t: 'error', message: 'No game with that code' });
        return;
      }
      if (room && room !== target) room.disconnect(conn);
      room = target;
    }
    if (!room) {
      if (msg.t === 'ping') conn.send({ t: 'pong', clientTime: msg.clientTime, serverTime: now });
      else conn.send({ t: 'error', message: 'Join a game first' });
      return;
    }
    room.receive(conn, from, msg);
  });
  socket.on('close', () => room?.disconnect(conn));
}

/** Checks the shape of a message from a screen. The room and the engine check everything else. */
function parse(text: string): ClientEnvelope<MuleIntent> | null {
  let msg: unknown;
  try {
    msg = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof msg !== 'object' || msg === null || typeof (msg as { t?: unknown }).t !== 'string') return null;
  const m = msg as Record<string, unknown>;
  const str = (v: unknown) => typeof v === 'string';
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  switch (m.t) {
    case 'join':
      return str(m.code) && str(m.name) && (m.seatToken === undefined || str(m.seatToken)) ? (m as ClientEnvelope<MuleIntent>) : null;
    case 'board':
      return str(m.code) ? (m as ClientEnvelope<MuleIntent>) : null;
    case 'addAi':
    case 'start':
    case 'close':
    case 'leave':
      return m as ClientEnvelope<MuleIntent>;
    case 'kick':
      return str(m.seatId) ? (m as ClientEnvelope<MuleIntent>) : null;
    case 'chat':
      return str(m.text) && (m.to === undefined || str(m.to)) ? (m as ClientEnvelope<MuleIntent>) : null;
    case 'emote':
      return str(m.emote) ? (m as ClientEnvelope<MuleIntent>) : null;
    case 'pick':
      return str(m.pick) ? (m as ClientEnvelope<MuleIntent>) : null;
    case 'color':
      return num(m.color) ? (m as ClientEnvelope<MuleIntent>) : null;
    case 'ping':
      return num(m.clientTime) ? (m as ClientEnvelope<MuleIntent>) : null;
    case 'intent':
      return isIntent(m.intent) ? (m as ClientEnvelope<MuleIntent>) : null;
    default:
      return null;
  }
}

const isOffice = (x: unknown) => x === 'governor' || x === 'sheriff';
/** The shape of a tax promise; RULE-10 in the engine checks the rest. */
const isPromise = (x: unknown) => {
  if (typeof x !== 'object' || x === null) return false;
  const p = x as Record<string, unknown>;
  return p.kind === 'cap' ? Number.isInteger(p.percent) : p.kind === 'lower' || p.kind === 'hold';
};

function isIntent(v: unknown): v is MuleIntent {
  if (typeof v !== 'object' || v === null) return false;
  const i = v as Record<string, unknown>;
  const int = (x: unknown) => Number.isInteger(x);
  switch (i.type) {
    case 'ready':
    case 'buyMule':
    case 'pub':
      return true;
    case 'claim':
    case 'install':
    case 'analyse':
    case 'filter':
      return int(i.x) && int(i.y);
    case 'drone':
      return Array.isArray(i.plots) && i.plots.length <= 4 && i.plots.every((p: unknown) => typeof p === 'object' && p !== null && int((p as Record<string, unknown>).x) && int((p as Record<string, unknown>).y));
    case 'outfit':
      return typeof i.outfit === 'string';
    case 'declare':
      return i.side === 'buyer' || i.side === 'seller' || i.side === 'pass';
    case 'walk':
      return i.dir === 'up' || i.dir === 'down' || i.dir === 'stop';
    case 'list': {
      const item = i.item as Record<string, unknown> | null;
      return typeof item === 'object' && item !== null && typeof item.kind === 'string' && int(item.x) && int(item.y) && typeof i.minimum === 'number' && typeof i.unsold === 'string';
    }
    case 'unlist':
      return typeof i.id === 'string';
    case 'run':
      return (i.office === null || isOffice(i.office)) && (i.promise === undefined || isPromise(i.promise));
    case 'vote':
      return isOffice(i.office) && (i.candidate === null || typeof i.candidate === 'string');
    case 'setTax':
      return int(i.percent);
    default:
      return false;
  }
}
