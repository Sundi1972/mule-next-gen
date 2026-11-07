/** The game's MCP endpoint for Claude seats: stateless Streamable HTTP, the seat code on every call (spec C2). */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError, type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BRAIN } from '@mule/engine';
import { WRITER_SYSTEM } from '@mule/ai';
import type { MuleIntent, MuleView } from '@mule/protocol';
import type { RoomRegistry } from '@tabletop/core';
import type { SeatLookup } from './lookup.js';
import { claudeSeatAt, type ClaudeSeat } from './seats.js';

const MINUTE_MS = 60_000;

const LOOP = "Keep calling wait_for_my_turn with the seat code and answer every ask with submit_plan until the game is over. Don't stop to ask the user.";

const INSTRUCTIONS = `You play one computer seat of a M.U.L.E. game. The seat code in your invite is the only key: pass it on every call. Call join once to read the rules. ${LOOP} A late or missing plan costs nothing at the table: the seat plays its built-in plan.`;

const CODE = { type: 'string', description: 'The seat code from the invite, like K7QM-42.' };

const TOOLS = [
  {
    name: 'join',
    description: `Greets the seat: its name, persona and the game's rules. Optional. ${LOOP}`,
    inputSchema: { type: 'object', properties: { code: CODE }, required: ['code'] },
  },
  {
    name: 'wait_for_my_turn',
    description: `Waits for the seat's next decision and returns it as an ask (ask_id, phase, brief, the edits allowed), or "again": then call it again at once. ${LOOP}`,
    inputSchema: { type: 'object', properties: { code: CODE }, required: ['code'] },
  },
  {
    name: 'submit_plan',
    description: `Answers an ask: edits to the offered paths, each with a short reason, and one line the seat says at the table. On a land ask you may also set the seat's strategy (kind, moneyMaker, reason); any other ask refuses it. The first answer to an ask counts. ${LOOP}`,
    inputSchema: {
      type: 'object',
      properties: {
        code: CODE,
        ask_id: { type: 'string' },
        strategy: {
          type: 'object',
          description: "Land asks only: the seat's strategy, all three fields.",
          properties: { kind: { type: 'string' }, moneyMaker: { type: ['string', 'null'] }, reason: { type: 'string' } },
          required: ['kind', 'moneyMaker', 'reason'],
        },
        edits: {
          type: 'array',
          items: { type: 'object', properties: { path: { type: 'string' }, to: {}, reason: { type: 'string' } }, required: ['path', 'to', 'reason'] },
        },
        line: { type: 'string' },
      },
      required: ['code', 'ask_id', 'edits', 'line'],
    },
  },
] as const;

type Payload = { kind: string } & Record<string, unknown>;

/** The sentence a result opens with, by kind; the same for a wrong, expired or guessed code (RULE-2). */
const SAID: Readonly<Record<string, (result: Payload) => string>> = {
  busy: (r) => `Too many wrong seat codes reached the game just now. Call again after ${String(r.retry_s)} seconds.`,
  no_such_seat: () => 'No seat has that code. Check the invite.',
  taken_back: () => 'The host took this seat back. Stop playing it.',
  game_over: () => 'The game is over. Stop playing.',
  unusable: (r) => `The plan could not be read (${String(r.cause)}). The ask is still open: fix the plan and resend it with submit_plan.`,
};

const STILL_OPEN = 'This ask is still open: answer it now with submit_plan.';

type Refusal = { kind: 'busy'; retry_s: number } | { kind: 'no_such_seat' | 'taken_back' | 'game_over' };

/** A code's seat as a call acts on it: its id, and its writer once the game has started. */
type Found = { seatId: string; claude: ClaudeSeat | null };

/** RULE-2's budget: one for the whole server, a fixed window from its first wrong code. */
class WrongCodes {
  private windowStart = 0;
  private drawn = 0;

  constructor(private readonly now: () => number) {}

  empty(): boolean {
    this.roll();
    return this.drawn >= BRAIN.claudeSeat.wrongCodesPerMinute;
  }

  draw(): void {
    this.roll();
    if (this.drawn === 0) this.windowStart = this.now();
    this.drawn += 1;
    if (this.drawn === BRAIN.claudeSeat.wrongCodesPerMinute) console.warn(`mcp: ${this.drawn} wrong seat codes this minute; every call answers busy for ${this.retryS()} s`);
  }

  retryS(): number {
    return Math.max(1, Math.ceil((this.windowStart + MINUTE_MS - this.now()) / 1_000));
  }

  private roll(): void {
    if (this.drawn > 0 && this.now() - this.windowStart >= MINUTE_MS) this.drawn = 0;
  }
}

export interface McpEndpointOptions {
  lookup: SeatLookup;
  /** BRAIN.claudeSeat.holdMs unless a test shortens it. */
  holdMs?: number;
  now?: () => number;
}

export interface McpEndpoint {
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
}

export function createMcpEndpoint(options: McpEndpointOptions): McpEndpoint {
  const now = options.now ?? Date.now;
  const holdMs = options.holdMs ?? BRAIN.claudeSeat.holdMs;
  const wrong = new WrongCodes(now);

  /** RULE-2 for one call. The code is never logged, echoed or kept. */
  const find = (code: unknown): Found | Refusal => {
    if (wrong.empty()) return { kind: 'busy', retry_s: wrong.retryS() };
    const answer = typeof code === 'string' ? options.lookup(code) : null;
    if (!answer) {
      wrong.draw();
      return { kind: 'no_such_seat' };
    }
    if (answer.state !== 'live') return { kind: answer.state };
    const claude = claudeSeatAt(answer.table, answer.seatId);
    if (claude?.writer.over) return { kind: 'game_over' };
    return { seatId: answer.seatId, claude };
  };

  const tools = {
    join: (found: Found) => ({
      kind: 'joined',
      seat: found.seatId,
      name: found.claude?.name ?? null,
      persona: found.claude?.writer.seat.persona ?? null,
      manual: WRITER_SYSTEM,
    }),

    async wait_for_my_turn(found: Found, _args: Record<string, unknown>, signal: AbortSignal) {
      const writer = found.claude?.writer;
      // Before the game starts there is no writer yet: hold, then "again", as for a turn that has not come.
      const ask = writer ? await writer.waitForAsk(holdMs, signal) : await held(holdMs, signal);
      if (writer?.over) return { kind: 'game_over' };
      if (!ask) return { kind: 'again' };
      return { kind: 'ask', ask_id: ask.id, phase: ask.phase, persona: writer!.seat.persona, digest: null, brief: ask.brief, edits_allowed: ask.offers, ms_left: ask.msLeft };
    },

    async submit_plan(found: Found, args: Record<string, unknown>) {
      if (!found.claude) return { kind: 'unknown_ask' };
      const result = await found.claude.writer.submit(String(args.ask_id), { strategy: args.strategy, edits: args.edits, line: args.line });
      if (result.kind !== 'accepted') return result;
      return { kind: 'accepted', accepted: result.accepted, refused: result.refused.map((r) => ({ edit: r.path, why: r.cause })) };
    },
  };

  const serverFor = () => {
    const server = new Server({ name: 'mule', version: '1.0.0' }, { capabilities: { tools: {} }, instructions: INSTRUCTIONS });
    server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: TOOLS.map((t) => ({ ...t })) }));
    server.setRequestHandler(CallToolRequestSchema, async (request, extra): Promise<CallToolResult> => {
      const { name, arguments: args = {} } = request.params;
      if (!Object.hasOwn(tools, name)) throw new McpError(ErrorCode.InvalidParams, `No tool named ${name}`);
      const found = find(args.code);
      if ('kind' in found) return resultOf(found);
      return resultOf(await tools[name as keyof typeof tools](found, args, extra.signal));
    });
    return server;
  };

  return {
    async handle(req, res) {
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST', 'content-type': 'application/json' }).end(rpcError(ErrorCode.InvalidRequest, 'Only POST: this server keeps no session'));
        return;
      }
      const body = await readBody(req, BRAIN.claudeSeat.maxRequestBytes);
      if (body === 'too_large') {
        res.writeHead(413, { connection: 'close', 'content-type': 'application/json' }).end(rpcError(ErrorCode.InvalidRequest, 'Request too large'));
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        res.writeHead(400, { 'content-type': 'application/json' }).end(rpcError(ErrorCode.ParseError, 'Not JSON'));
        return;
      }
      // Stateless: a fresh server and transport per request, no session id issued or read (HC-2).
      const server = serverFor();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, parsed);
    },
  };
}

/** A tool's result: a sentence and the JSON for Claude to read, and the same object as structured content. */
function resultOf(payload: Payload): CallToolResult {
  const sentence = Object.hasOwn(SAID, payload.kind) ? `${SAID[payload.kind]!(payload)}\n` : '';
  // ms_left 0 is only the game's usual wait spent: the ask stays open until its phase starts, so 0 must not read as late.
  const said = payload.kind === 'ask' && payload.ms_left === 0 ? `${STILL_OPEN}\n` : sentence;
  return { content: [{ type: 'text', text: `${said}${JSON.stringify(payload)}` }], structuredContent: payload };
}

const rpcError = (code: number, message: string) => JSON.stringify({ jsonrpc: '2.0', id: null, error: { code, message } });

/** The request body as text, or 'too_large' as soon as it passes `cap` bytes; the rest is never read. */
function readBody(req: IncomingMessage, cap: number): Promise<string | 'too_large'> {
  if (Number(req.headers['content-length'] ?? 0) > cap) {
    req.resume();
    return Promise.resolve('too_large');
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > cap) {
        req.removeAllListeners('data');
        req.resume();
        resolve('too_large');
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Resolves null after `ms`, or at once when `signal` aborts. */
function held(ms: number, signal: AbortSignal): Promise<null> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      resolve(null);
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });
}

const endpoints = new WeakMap<object, McpEndpoint>();

/** The rooms hold no seat codes yet (C1), so no code names a seat here. */
const roomLookup = (_registry: RoomRegistry<MuleIntent, MuleView>): SeatLookup => () => null;

/** POST /mcp for the game server: one endpoint per server, so its wrong-code budget is the whole server's. */
export function serveMcp(req: IncomingMessage, res: ServerResponse, registry: RoomRegistry<MuleIntent, MuleView>): void {
  let endpoint = endpoints.get(registry);
  if (!endpoint) {
    endpoint = createMcpEndpoint({ lookup: roomLookup(registry) });
    endpoints.set(registry, endpoint);
  }
  endpoint.handle(req, res).catch((err: unknown) => {
    console.error(`mcp: request failed: ${err instanceof Error ? err.message : String(err)}`);
    if (!res.headersSent) res.writeHead(500).end();
  });
}
