import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRAIN } from '@mule/engine';
import type { MuleIntent, MuleView } from '@mule/protocol';
import type { Game, SeatInfo } from '@tabletop/core';
import { SeatCodeBook } from '../src/claude-seat/lookup.js';
import { createMcpEndpoint } from '../src/claude-seat/mcp.js';
import { claudeSeatAt, type SeatKind } from '../src/claude-seat/seats.js';
import { MuleGame, type PlaybookNote } from '../src/mule-game.js';
import { createMuleServer } from '../src/server.js';
import { fakeContext } from './fake-context.js';

/** The host, two Claude seats and a built-in one, as the Room will hand them to the game once seats carry a kind (C1). */
const TABLE: (SeatInfo & { kind?: SeatKind })[] = [
  { id: 's1', name: 'Heiko', isAi: false, color: 0 },
  { id: 's2', name: 'Claudia', isAi: true, color: 1, kind: 'claude' },
  { id: 's3', name: 'Claude B', isAi: true, color: 2, kind: 'claude' },
  { id: 's4', name: 'The Accountant', isAi: true, color: 3 },
];
/** Short, so a wait with no ask comes back at once; the game's own hold is BRAIN.claudeSeat.holdMs. */
const HOLD_MS = 50;
const STEP_MS = 500;

interface Reply {
  status: number;
  headers: Headers;
  body: { result?: { structuredContent?: Record<string, unknown>; tools?: { name: string }[] }; error?: { code: number } } | null;
}

/** A Claude app's MCP client, as little of one as the tools need: one JSON-RPC POST per call, no session, no handshake. */
function mcpClient(url: string, headers: Record<string, string> = {}) {
  const seen: Reply[] = [];
  let id = 0;
  const post = async (body: string): Promise<Reply> => {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body });
    const text = await res.text();
    const reply = { status: res.status, headers: res.headers, body: text ? (JSON.parse(text) as Reply['body']) : null };
    seen.push(reply);
    return reply;
  };
  const rpc = (method: string, params: object) => post(JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }));
  return {
    seen,
    post,
    rpc,
    async call(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
      const reply = await rpc('tools/call', { name, arguments: args });
      return reply.body!.result!.structuredContent!;
    },
  };
}

let servers: Server[];
let logged: string[];

beforeEach(() => {
  servers = [];
  logged = [];
  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logged.push(args.map(String).join(' ')));
  }
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
});

/** The endpoint on its own port over `codes`, with a clock the test moves. */
async function serve(codes: SeatCodeBook, clock = { now: 0 }) {
  const endpoint = createMcpEndpoint({ lookup: codes.lookup, holdMs: HOLD_MS, now: () => clock.now });
  const server = createServer((req, res) => void endpoint.handle(req, res));
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
}

/** A started one-month game with its Claude seats' codes issued. */
function startedGame(codes: SeatCodeBook) {
  const fake = fakeContext({ table: TABLE });
  const notes: PlaybookNote[] = [];
  const game = new MuleGame(fake.ctx, 10, { maxMonths: 1, recordPlaybook: (note) => notes.push(note) });
  const codeA = codes.issue(game, 's2');
  const codeB = codes.issue(game, 's3');
  game.start(TABLE);
  return { game, fake, notes, codeA, codeB };
}

/** Plays the game on its clock, every person pressing Ready, until `until` holds or the game is over. */
async function playUntil(game: MuleGame, fake: ReturnType<typeof fakeContext>, until: () => boolean = () => false) {
  for (let t = 0; t < 30 * 60_000 && !until() && game.viewFor(null).phase !== 'gameOver'; t += STEP_MS) {
    const view = game.viewFor(null);
    if (view.phase === 'planning' || view.phase === 'upkeep' || (view.phase === 'auction' && view.auction?.stage === 'status')) game.handle('s1', { type: 'ready' });
    fake.advance(STEP_MS);
    await Promise.resolve();
  }
}

const openPhase = (game: MuleGame, seat: string) => claudeSeatAt(game, seat)?.writer.openAsk()?.phase ?? null;

describe('/mcp, stateless, the seat code on every call', () => {
  it('T-AC-1: every tool resolves the seat from its code only; no session id issued or read', async () => {
    const codes = new SeatCodeBook();
    const { game, codeA, codeB } = startedGame(codes);
    const url = await serve(codes);
    const a = mcpClient(url);
    // A session id a client makes up is never read: the code alone says which seat.
    const b = mcpClient(url, { 'mcp-session-id': 'made-up-session' });

    const listed = await a.rpc('tools/list', {});
    expect(listed.body!.result!.tools!.map((t) => t.name).sort()).toEqual(['join', 'submit_plan', 'wait_for_my_turn']);
    expect(await a.call('join', { code: codeA })).toMatchObject({ kind: 'joined', seat: 's2', name: 'Claudia' });
    expect(await b.call('join', { code: codeB.toLowerCase() })).toMatchObject({ kind: 'joined', seat: 's3', name: 'Claude B' });

    const askA = await a.call('wait_for_my_turn', { code: codeA });
    const askB = await b.call('wait_for_my_turn', { code: codeB });
    expect(askA).toMatchObject({ kind: 'ask', phase: 'land' });
    expect(askA.ask_id).toBe(claudeSeatAt(game, 's2')!.writer.openAsk()!.id);
    expect(askB.ask_id).toBe(claudeSeatAt(game, 's3')!.writer.openAsk()!.id);
    expect(askA.ask_id).not.toBe(askB.ask_id);

    expect(await a.call('submit_plan', { code: codeA, ask_id: askA.ask_id, edits: [{ path: '/landGrant/ranked', to: 'A', reason: 'mine' }], line: 'Mine.' })).toMatchObject({ kind: 'accepted' });
    expect(openPhase(game, 's2')).toBeNull();
    expect(openPhase(game, 's3')).toBe('land');

    for (const reply of [...a.seen, ...b.seen]) {
      expect(reply.status).toBe(200);
      expect(reply.headers.get('mcp-session-id')).toBeNull();
    }
  });

  it('T-AC-1: the game server routes POST /mcp to the endpoint, which knows no code before the Room holds codes', async () => {
    const mule = createMuleServer();
    servers.push(mule.server);
    await new Promise<void>((done) => mule.server.listen(0, '127.0.0.1', done));
    const url = `http://127.0.0.1:${(mule.server.address() as AddressInfo).port}/mcp`;
    const client = mcpClient(url);

    const listed = await client.rpc('tools/list', {});
    expect(listed.body!.result!.tools!.map((t) => t.name).sort()).toEqual(['join', 'submit_plan', 'wait_for_my_turn']);
    expect(await client.call('wait_for_my_turn', { code: 'K7QM-42' })).toMatchObject({ kind: 'no_such_seat' });
    expect(listed.headers.get('mcp-session-id')).toBeNull();
    // No session means no GET stream to open: refused, never the web client's page.
    expect((await fetch(url)).status).toBe(405);
    await mule.close();
    servers.pop();
  });

  it('B-AC-3: two seats, two clients, each seat\'s plans only from its own code', async () => {
    const codes = new SeatCodeBook();
    const { game, fake, notes, codeA, codeB } = startedGame(codes);
    const url = await serve(codes);
    const a = mcpClient(url);
    const b = mcpClient(url);
    /** One turn of a client's loop: wait, and answer the ask with the first land plan, signed by this client. */
    const play = async (client: typeof a, code: string, who: string) => {
      const ask = await client.call('wait_for_my_turn', { code });
      if (ask.kind !== 'ask') return ask;
      const edits = ask.phase === 'land' ? [{ path: '/landGrant/ranked', to: 'A', reason: `client ${who}` }] : [];
      return client.call('submit_plan', { code, ask_id: ask.ask_id, edits, line: `Plan by ${who}.` });
    };

    const askB = await b.call('wait_for_my_turn', { code: codeB });
    expect(await a.call('submit_plan', { code: codeA, ask_id: askB.ask_id, edits: [], line: 'Not mine.' })).toMatchObject({ kind: 'unknown_ask' });
    expect(openPhase(game, 's3')).toBe('land');

    expect(await play(a, codeA, 'A')).toMatchObject({ kind: 'accepted' });
    expect(await play(b, codeB, 'B')).toMatchObject({ kind: 'accepted' });
    await playUntil(game, fake, () => openPhase(game, 's2') === 'auction' && openPhase(game, 's3') === 'auction');
    expect(await play(a, codeA, 'A')).toMatchObject({ kind: 'accepted' });
    expect(await play(b, codeB, 'B')).toMatchObject({ kind: 'accepted' });
    await playUntil(game, fake);

    expect(game.viewFor(null).phase).toBe('gameOver');
    const reasons = (seat: string) => notes.filter((n) => n.seat === seat && n.playbook.by === 'llm').flatMap((n) => (n.playbook.edits ?? []).map((e) => e.reason));
    expect(reasons('s2')).toEqual(['client A']);
    expect(reasons('s3')).toEqual(['client B']);
    expect(await a.call('wait_for_my_turn', { code: codeA })).toMatchObject({ kind: 'game_over' });
    for (const seat of ['s2', 's3']) expect((game as unknown as { away: Set<string> }).away.has(seat)).toBe(false);

    // T-AC-5's capture: the game said its seats' lines, and none carries a code.
    expect(logged.some((line) => line.startsWith('claude seat s2:'))).toBe(true);
    expect(logged.filter((line) => line.includes(codeA) || line.includes(codeB))).toEqual([]);
  });

  it('B-AC-6: a new client with the same code carries on and gets the open ask', async () => {
    const codes = new SeatCodeBook();
    const { game, codeA } = startedGame(codes);
    const url = await serve(codes);

    const first = await mcpClient(url).call('wait_for_my_turn', { code: codeA });
    const again = mcpClient(url);
    const resumed = await again.call('wait_for_my_turn', { code: codeA });

    expect(resumed).toMatchObject({ kind: 'ask', ask_id: first.ask_id, phase: 'land' });
    expect(await again.call('submit_plan', { code: codeA, ask_id: resumed.ask_id, edits: [], line: 'Back.' })).toMatchObject({ kind: 'accepted' });
    expect(openPhase(game, 's2')).toBeNull();
  });

  it("T-AC-1: submit_plan's strategy goes through the API writer's parser: played on a land ask, refused on an auction ask", async () => {
    const codes = new SeatCodeBook();
    const { game, fake, notes, codeA } = startedGame(codes);
    const client = mcpClient(await serve(codes));
    const strategy = { kind: 'spoiler', moneyMaker: 'smithore', reason: 'Starve the rest of ore.' };
    const strategyEdits = [
      { path: '/strategy/kind', to: 'spoiler', reason: strategy.reason },
      { path: '/strategy/moneyMaker', to: 'smithore', reason: strategy.reason },
      { path: '/strategy/reason', to: strategy.reason, reason: strategy.reason },
    ];

    const land = await client.call('wait_for_my_turn', { code: codeA });
    expect(await client.call('submit_plan', { code: codeA, ask_id: land.ask_id, strategy, edits: [], line: 'Ore is mine.' })).toEqual({ kind: 'accepted', accepted: strategyEdits, refused: [] });
    await playUntil(game, fake, () => openPhase(game, 's2') === 'auction');
    const played = notes.find((n) => n.seat === 's2' && n.phase === 'landGrant');
    expect(played?.playbook.by).toBe('llm');
    expect(played?.playbook.strategy).toMatchObject(strategy);

    const auction = await client.call('wait_for_my_turn', { code: codeA });
    expect(await client.call('submit_plan', { code: codeA, ask_id: auction.ask_id, strategy, edits: [], line: 'Still ore.' })).toEqual({
      kind: 'accepted',
      accepted: [],
      refused: strategyEdits.map((e) => ({ edit: e.path, why: 'path_not_offered' })),
    });
  });

  it('B-AC-7: after switching to Built-in, the next call gets "seat taken back"', async () => {
    const codes = new SeatCodeBook();
    const lobby = new MuleGame(fakeContext({ table: TABLE }).ctx, 10);
    const code = codes.issue(lobby, 's2');
    const url = await serve(codes);
    const client = mcpClient(url);
    expect(await client.call('join', { code })).toMatchObject({ kind: 'joined', seat: 's2' });
    expect(await client.call('wait_for_my_turn', { code })).toMatchObject({ kind: 'again' });

    codes.takeBack(code);

    for (const tool of ['join', 'wait_for_my_turn', 'submit_plan']) {
      expect(await client.call(tool, { code, ask_id: 'x', edits: [], line: '' })).toMatchObject({ kind: 'taken_back' });
    }
  });

  it('T-AC-8: after wrongCodesPerMinute wrong codes every call gets busy until refill; taken-back codes don\'t draw; big bodies refused', async () => {
    const codes = new SeatCodeBook();
    const { codeA } = startedGame(codes);
    const takenBack = codes.issue({}, 's9');
    codes.takeBack(takenBack);
    const clock = { now: 0 };
    const url = await serve(codes, clock);
    const client = mcpClient(url);
    const limit = BRAIN.claudeSeat.wrongCodesPerMinute;

    for (let i = 0; i < limit - 1; i++) expect(await client.call('join', { code: `WRNG-${String(i).padStart(2, '0')}` })).toMatchObject({ kind: 'no_such_seat' });
    expect(await client.call('join', { code: takenBack })).toMatchObject({ kind: 'taken_back' });
    expect(await client.call('join', { code: codeA })).toMatchObject({ kind: 'joined', seat: 's2' });
    expect(await client.call('join', {})).toMatchObject({ kind: 'no_such_seat' });
    expect(await client.call('join', { code: codeA })).toMatchObject({ kind: 'busy' });
    expect(await client.call('join', { code: takenBack })).toMatchObject({ kind: 'busy' });

    clock.now += 60_000;
    expect(await client.call('join', { code: codeA })).toMatchObject({ kind: 'joined', seat: 's2' });

    const big = await client.post(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { pad: 'x'.repeat(BRAIN.claudeSeat.maxRequestBytes) } }));
    expect(big.status).toBe(413);
    expect(logged.filter((line) => line.includes(codeA) || line.includes(takenBack))).toEqual([]);
  });
});

describe('a late Claude seat', () => {
  /** A one-month game of `table` on its own clock, recording every playbook that takes effect. */
  function gameOf(table: (SeatInfo & { kind?: SeatKind })[]) {
    const fake = fakeContext({ table });
    const notes: PlaybookNote[] = [];
    const game = new MuleGame(fake.ctx, 10, { maxMonths: 1, recordPlaybook: (note) => notes.push(note) });
    return { game, fake, notes };
  }
  const inLandGrant = (game: MuleGame) => () => game.viewFor(null).phase === 'landGrant';

  it('B-AC-4: a Claude seat whose client never answers plays its built-in plan; the land grant starts on time', async () => {
    const builtinTable = TABLE.map(({ kind: _kind, ...seat }) => seat);
    const builtin = gameOf(builtinTable);
    builtin.game.start(builtinTable);
    await playUntil(builtin.game, builtin.fake, inLandGrant(builtin.game));
    const codes = new SeatCodeBook();
    const client = mcpClient(await serve(codes));
    const { game, fake, notes } = gameOf(TABLE);
    const code = codes.issue(game, 's2');
    game.start(TABLE);
    const ask = await client.call('wait_for_my_turn', { code });
    expect(ask).toMatchObject({ kind: 'ask', phase: 'land' });

    await playUntil(game, fake, inLandGrant(game));

    expect(fake.ctx.now()).toBe(builtin.fake.ctx.now());
    expect(notes.filter((n) => n.seat === 's2' && n.phase === 'landGrant').map((n) => n.playbook.by)).toEqual(['engine']);
    expect(await client.call('submit_plan', { code, ask_id: ask.ask_id, edits: [{ path: '/landGrant/ranked', to: 'A', reason: 'late' }], line: 'Late.' })).toMatchObject({ kind: 'too_late' });

    await playUntil(game, fake);
    expect(game.viewFor(null).phase).toBe('gameOver');
    expect(notes.some((n) => n.seat === 's2' && n.playbook.by === 'llm')).toBe(false);
    expect((game as unknown as { away: Set<string> }).away.has('s2')).toBe(false);
  });
});
