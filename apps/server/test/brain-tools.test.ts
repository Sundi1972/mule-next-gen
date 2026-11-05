/** The tool loop inside one strategy or playbook call (C9, RULE-A4), at the requests the SDK receives and the ledger. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRAIN, type Strategy } from '@mule/engine';
import type { LandBrief, ToolDef, ToolResult } from '@mule/ai';
import { createBrain, type BrainSeat, type PlaybookAsk } from '../src/brain/index.js';
import { MuleGame } from '../src/mule-game.js';
import { fakeSdk, KEY, promptOf, readLedger, sdkMessage, type SdkMessage, type SdkParams } from './brain-fakes.js';
import { fakeContext, seats as THREE } from './fake-context.js';
import { runTable } from './playbook-fakes.js';

const SEAT: BrainSeat = { id: 'p0', persona: 'trader', level: 'trader' };
const STRATEGY: Strategy = { kind: 'builder', moneyMaker: 'food', monopolyTarget: null, cashFloor: 200, landTarget: { plots: 6, byMonth: 6 }, stances: {}, reason: 'Grow steady.' };
const BRIEF: LandBrief = { text: 'You are P0. The land brief.', plans: [{ id: 'A', label: 'Take the river', ranked: [{ plot: 12, value: 410 }] }], corners: true, strategy: STRATEGY };
const ANSWER = JSON.stringify({ strategy: { kind: 'builder', moneyMaker: 'food', monopolyTarget: null, cashFloor: 200, reason: 'Grow.' }, edits: [{ path: '/landGrant/ranked', to: 'A', reason: 'River.' }], line: '' });

/** One tool the model may call; `answer` is what it returns, or what it throws. */
const DEF: ToolDef = { name: 'worth', description: 'Your Worth.', input_schema: { type: 'object', properties: {} } };
const toolBox = (answer: () => ToolResult) => ({ definitions: [DEF], run: (_name: string, _input: unknown) => answer() });

/** A reply that asks for the worth tool. */
const toolUse = (n: number): SdkMessage =>
  ({ ...sdkMessage('', { input: 100, output: 20 }, 'tool_use'), content: [{ type: 'tool_use', id: `t${n}`, name: 'worth', input: {} }] }) as unknown as SdkMessage;

/** The tool results a request carries, from its last user message. */
const resultsIn = (params: SdkParams) => {
  const last = params.messages.at(-1)!;
  return Array.isArray(last.content) ? last.content.filter((b) => b.type === 'tool_result') : [];
};

let dir: string;
let file: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-tools-'));
  file = path.join(dir, 'ledger.jsonl');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const brainOn = (sdk: ReturnType<typeof fakeSdk>, gameBudgetUsd?: number) =>
  createBrain({ gameId: 'g-tools', env: KEY, logPath: file, sdkFactory: () => sdk, ...(gameBudgetUsd === undefined ? {} : { gameBudgetUsd }) });
const ask = (tools: ReturnType<typeof toolBox>, extra: Partial<PlaybookAsk> = {}): PlaybookAsk => ({ brief: BRIEF, system: 'The manual.', waitMs: 30_000, tools, ...extra });
const callLines = () => readLedger(file).filter((l) => !('type' in l));

describe('the tool loop (C9, RULE-A4)', () => {
  it('T-AC-A8 row 3: a model that only ever calls tools gets BRAIN.toolRounds rounds with tools and one last round without, then its answer plays', async () => {
    const sdk = fakeSdk((n, params) => (params.tool_choice === undefined ? toolUse(n) : sdkMessage(ANSWER, { input: 100, output: 50 })));
    const written = await brainOn(sdk).writerFor(SEAT)!.write('strategy', ask(toolBox(() => ({ content: '{"total":1000}' }))));

    expect(sdk.requests).toHaveLength(BRAIN.toolRounds + 1);
    expect(sdk.requests.slice(0, -1).every((r) => (r.params.tools ?? []).length === 1 && r.params.tool_choice === undefined)).toBe(true);
    // The last round keeps the definitions (a request with tool_use blocks must carry them) and forbids their use.
    expect(sdk.requests.at(-1)!.params.tools).toHaveLength(1);
    expect(sdk.requests.at(-1)!.params.tool_choice).toEqual({ type: 'none' });
    // Each round after the first carries the last round's tool result.
    for (const r of sdk.requests.slice(1)) expect(resultsIn(r.params)).toHaveLength(1);
    expect(written.reply.cause).toBeUndefined();
    // Row 5: every round trip has its ledger line, numbered.
    expect(callLines().map((l) => [l.round, l.outcome])).toEqual([
      ...Array.from({ length: BRAIN.toolRounds }, (_, i) => [i + 1, 'tool']),
      [BRAIN.toolRounds + 1, 'llm'],
    ]);
  });

  it('T-AC-A8 row 4: a share that runs out mid-loop stops it before the next round; the engine playbook plays', async () => {
    const sdk = fakeSdk((n) => toolUse(n));
    // A tool answer long enough that the next round's worst case no longer fits the seat's share.
    const huge = 'x'.repeat(400_000);
    const written = await brainOn(sdk, 0.2).writerFor(SEAT)!.write('strategy', ask(toolBox(() => ({ content: JSON.stringify({ huge }) }))));

    expect(sdk.requests).toHaveLength(1);
    expect(written.reply.cause).toBe('no_reply');
    expect(callLines().map((l) => [l.round, l.outcome])).toEqual([
      [1, 'tool'],
      [2, 'budget'],
    ]);
  });

  it('T-AC-A8 unknown: a throwing handler answers is_error with a code and the loop goes on; its text never reaches a request', async () => {
    const sdk = fakeSdk((n) => (n === 1 ? toolUse(n) : sdkMessage(ANSWER)));
    const box = toolBox(() => {
      throw new Error('secret boom from the handler');
    });
    const written = await brainOn(sdk).writerFor(SEAT)!.write('strategy', ask(box));

    expect(sdk.requests).toHaveLength(2);
    const [result] = resultsIn(sdk.requests[1]!.params) as { is_error?: boolean; content: string }[];
    expect(result).toMatchObject({ is_error: true });
    expect(JSON.parse(result!.content)).toEqual({ error: 'tool_failed' });
    expect(JSON.stringify(sdk.requests.map((r) => r.params))).not.toContain('secret boom');
    expect(written.reply.cause).toBeUndefined();
  });

  it('T-AC-A8 row 1: a deadline passed between rounds stops the loop: no further round trip, no reply plays', async () => {
    const controller = new AbortController();
    const sdk = fakeSdk((n) => {
      // The land grant starts while round 1's answer is on its way.
      controller.abort();
      return toolUse(n);
    });
    const written = await brainOn(sdk).writerFor(SEAT)!.write('strategy', ask(toolBox(() => ({ content: '{}' })), { signal: controller.signal }));

    expect(sdk.requests).toHaveLength(1);
    expect(written.reply.cause).toBe('no_reply');
    expect(callLines().map((l) => [l.round, l.outcome])).toEqual([
      [1, 'tool'],
      [2, 'late'],
    ]);
  });

  it('a write with no tools is one round trip, as before', async () => {
    const sdk = fakeSdk(() => sdkMessage(ANSWER));
    const { tools: _none, ...plain } = ask(toolBox(() => ({ content: '{}' })));
    const written = await brainOn(sdk).writerFor(SEAT)!.write('strategy', plain);
    expect(sdk.requests).toHaveLength(1);
    expect(sdk.requests[0]!.params.tools).toBeUndefined();
    expect(written.reply.cause).toBeUndefined();
    expect(callLines().map((l) => [l.round, l.outcome])).toEqual([[1, 'llm']]);
  });

  it("the game's own write offers its tools end to end: the model calls standings and whatIf, and the next request carries every seat's public Worth and a played month's", async () => {
    vi.useFakeTimers();
    try {
      const isWrite = (params: SdkParams) => promptOf(params).user.includes('What you may change:');
      const sdk = fakeSdk((_n, params) => {
        if (!isWrite(params)) return sdkMessage(JSON.stringify({ option: 'A', line: '' }));
        if (params.messages.length === 1)
          return {
            ...sdkMessage('', {}, 'tool_use'),
            content: [
              { type: 'tool_use', id: 's1', name: 'standings', input: {} },
              { type: 'tool_use', id: 'w1', name: 'whatIf', input: { edits: [] } },
            ],
          } as unknown as SdkMessage;
        return sdkMessage(JSON.stringify({ edits: [], line: '' }));
      });
      const fake = fakeContext({ table: THREE });
      const game = new MuleGame(fake.ctx, 10, { maxMonths: 1, politics: false, brain: brainOn(sdk) });
      game.start(THREE);
      await runTable(game, fake, (v) => v.phase === 'landGrant');

      const writes = sdk.requests.filter((r) => isWrite(r.params));
      expect(writes.map((r) => (r.params.tools ?? []).map((t) => ('name' in t ? t.name : '')).sort())).toEqual([
        ['legalMoves', 'standings', 'whatIf', 'worth'],
        ['legalMoves', 'standings', 'whatIf', 'worth'],
      ]);
      const [standings, whatIf] = resultsIn(writes[1]!.params) as { content: string; is_error?: boolean }[];
      const rows = JSON.parse(standings!.content) as { seat: string; name: string; worth: number }[];
      expect(rows.map((r) => r.seat).sort()).toEqual(THREE.map((s) => s.id).sort());
      for (const row of rows) expect(row.worth).toBeGreaterThan(0);
      // The month the write's playbook is for, played on what the seat could see when it was asked.
      expect(whatIf!.is_error).toBeUndefined();
      const played = JSON.parse(whatIf!.content) as { month: number; worth: { total: number } };
      expect(played.month).toBe(1);
      expect(played.worth.total).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
