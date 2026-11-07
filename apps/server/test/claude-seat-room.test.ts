import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRAIN } from '@mule/engine';
import type { MuleIntent, MuleView } from '@mule/protocol';
import type { Room, ServerEnvelope, TableView } from '@tabletop/core';
import type { MuleRecord } from '../src/record.js';
import { createMuleServer, type MuleServer } from '../src/server.js';

/**
 * The Claude seat as production plays it: the real server (its game recorded, as index.ts runs it), a real Room the
 * host fills from the lobby, and /mcp on the server's own registry. The seat's code is read from the host's view.
 */

/** claude-seat-mcp.test.ts's fake Claude client, the part these tests call: one JSON-RPC POST per call, no session. */
function mcpClient(endpoint: string) {
  let id = 0;
  return {
    async call(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
      const body = JSON.stringify({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } });
      const res = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body });
      return ((await res.json()) as { result: { structuredContent: Record<string, unknown> } }).result.structuredContent;
    },
  };
}

/** Short phases, so a one-month game ends in a few seconds of real time. */
const PHASE_SCALE = 0.005;
const STEP_MS = 20;
const GAME_LIMIT_MS = 60_000;
/** A test that plays a game to its end: the game's limit and the record's write. */
const PLAYED = { timeout: GAME_LIMIT_MS + 10_000 };

let mule: MuleServer;
let dir: string;
let url: string;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mule-claude-seat-room-'));
  mule = createMuleServer({ seed: () => 10, maxMonths: 1, phaseScale: PHASE_SCALE, recordDir: dir });
  await new Promise<void>((done) => mule.server.listen(0, '127.0.0.1', done));
  url = `http://127.0.0.1:${(mule.server.address() as AddressInfo).port}/mcp`;
});
afterEach(async () => {
  mule.server.closeAllConnections();
  await mule.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

/** A room made through POST /rooms, the host on a screen, two computer seats: s2 set to Claude, s3 left builtin. */
async function lobby() {
  const { code } = (await (await fetch(url.replace('/mcp', '/rooms'), { method: 'POST' })).json()) as { code: string };
  const room = mule.registry.get(code)! as Room<MuleIntent, MuleView>;
  let view: TableView<MuleView> | null = null;
  const said: { from: string; text: string }[] = [];
  const conn = {
    send: (msg: ServerEnvelope<MuleView>) => {
      if (msg.t === 'view') view = msg.view;
      if (msg.t === 'chat') said.push({ from: msg.message.from, text: msg.message.text });
    },
  };
  const from = { seatId: null as string | null };
  const send = (msg: Parameters<typeof room.receive>[2]) => room.receive(conn, from, msg);
  /** The room sends its views a microtask after the move: this lets them reach the host's screen. */
  const delivered = () => new Promise((done) => setImmediate(done));
  send({ t: 'join', code, name: 'Heiko' });
  send({ t: 'addAi' });
  send({ t: 'addAi' });
  await delivered();
  const host = () => view!;
  const ais = host().seats.filter((s) => s.isAi).map((s) => s.id);
  /** The host sets a computer seat's kind; a claude seat's code is read from the host's own view. */
  const setKind = async (seatId: string, kind: 'claude' | 'builtin') => {
    send({ t: 'setSeatKind', seatId, kind });
    await delivered();
    return host().seats.find((s) => s.id === seatId)!.seatCode ?? null;
  };
  const game = () => host().game;
  /** Plays on the real clock, the host pressing Ready wherever the game waits for him, until `until` or game over. */
  const playUntil = async (until: () => boolean = () => false) => {
    for (let t = 0; t < GAME_LIMIT_MS && !until() && game()?.phase !== 'gameOver'; t += STEP_MS) {
      const v = game();
      if (v &&(v.phase === 'planning' || v.phase === 'landGrant' || v.phase === 'upkeep' || (v.phase === 'auction' && v.auction?.stage === 'status'))) send({ t: 'intent', intent: { type: 'ready' } });
      await new Promise((done) => setTimeout(done, STEP_MS));
    }
  };
  return { room, host, ais, said, send, setKind, game, playUntil, start: () => send({ t: 'start' }) };
}

/** The game's record, as the server wrote it at game over. */
async function writtenRecord(): Promise<MuleRecord> {
  await vi.waitFor(() => expect(fs.readdirSync(dir)).toHaveLength(1), { timeout: 5_000 });
  return JSON.parse(fs.readFileSync(path.join(dir, fs.readdirSync(dir)[0]!), 'utf8')) as MuleRecord;
}

describe('/mcp on the real server, its codes from the Room (real Room)', () => {
  it("T-AC-1: join greets the seat the host set to Claude, by the code in the host's view (real Room)", async () => {
    const table = await lobby();
    const [claude] = table.ais;
    const code = await table.setKind(claude!, 'claude');
    expect(code).toMatch(/^[A-Z2-9]{4}-\d{2}$/);
    const client = mcpClient(url);

    expect(await client.call('join', { code })).toMatchObject({ kind: 'joined', seat: claude });
    expect(await client.call('join', { code: code!.toLowerCase() })).toMatchObject({ kind: 'joined', seat: claude });
  });

  it("B-AC-3: after Start, wait_for_my_turn gets the month-1 land ask, and the accepted plan plays in the land grant by 'llm' (real Room)", PLAYED, async () => {
    const table = await lobby();
    const [claude, builtin] = table.ais;
    const code = await table.setKind(claude!, 'claude');
    const client = mcpClient(url);
    table.start();

    const ask = await client.call('wait_for_my_turn', { code });
    expect(ask).toMatchObject({ kind: 'ask', phase: 'land' });
    const plan = { code, ask_id: ask.ask_id, edits: [{ path: '/landGrant/ranked', to: 'A', reason: 'Claude chose it.' }], line: 'The best plot is mine.' };
    expect(await client.call('submit_plan', plan)).toMatchObject({ kind: 'accepted' });
    await table.playUntil();

    expect(table.game()?.phase).toBe('gameOver');
    const playbooks = (await writtenRecord()).events.filter((e) => e.type === 'playbook');
    const played = (seat: string) => playbooks.filter((e) => e.seat === seat && e.phase === 'landGrant').map((e) => e.playbook.by);
    expect(played(claude!)).toEqual(['llm']);
    expect(played(builtin!)).not.toContain('llm');
    expect(playbooks.find((e) => e.seat === claude && e.playbook.by === 'llm')?.playbook.edits?.map((e) => e.reason)).toEqual(['Claude chose it.']);
    expect(table.said, "the table heard the seat's line").toContainEqual({ from: claude, text: 'The best plot is mine.' });
  });

  it('RULE-2 row 4: a code no seat holds gets no_such_seat (real Room)', async () => {
    const table = await lobby();
    const code = (await table.setKind(table.ais[0]!, 'claude'))!;
    const client = mcpClient(url);
    // The same shape as a real code, one digit off: no seat holds it.
    const wrong = code.replace(/\d$/, (d) => String((Number(d) + 1) % 10));

    for (const tool of ['join', 'wait_for_my_turn', 'submit_plan']) {
      expect(await client.call(tool, { code: wrong, ask_id: 'x', edits: [], line: '' })).toMatchObject({ kind: 'no_such_seat' });
    }
  });

  it('B-AC-7: after the host takes the seat back, its code gets taken_back and draws nothing from the wrong-code budget (real Room)', async () => {
    const table = await lobby();
    const [kept, takenBack] = table.ais;
    const live = await table.setKind(kept!, 'claude');
    const code = await table.setKind(takenBack!, 'claude');
    const client = mcpClient(url);
    expect(await client.call('join', { code })).toMatchObject({ kind: 'joined', seat: takenBack });

    expect(await table.setKind(takenBack!, 'builtin')).toBeNull();

    for (const tool of ['join', 'wait_for_my_turn', 'submit_plan']) {
      expect(await client.call(tool, { code, ask_id: 'x', edits: [], line: '' })).toMatchObject({ kind: 'taken_back' });
    }
    // More taken-back calls than the budget holds: had they drawn on it, the live code would now get busy.
    for (let i = 0; i < BRAIN.claudeSeat.wrongCodesPerMinute; i++) expect(await client.call('join', { code })).toMatchObject({ kind: 'taken_back' });
    expect(await client.call('join', { code: live })).toMatchObject({ kind: 'joined', seat: kept });
  });

  it('RULE-2 row 3: after game over the code gets game_over (real Room)', PLAYED, async () => {
    const table = await lobby();
    const code = await table.setKind(table.ais[0]!, 'claude');
    const client = mcpClient(url);
    table.start();
    await table.playUntil();
    expect(table.game()?.phase).toBe('gameOver');

    for (const tool of ['join', 'wait_for_my_turn', 'submit_plan']) {
      expect(await client.call(tool, { code, ask_id: 'x', edits: [], line: '' })).toMatchObject({ kind: 'game_over' });
    }
  });
});
