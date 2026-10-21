import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BRAIN } from '@mule/engine';
import { buildPrompt, PERSONAS, WAIT_MS, type Prompt } from '@mule/ai';
import { CallFailed, type HaikuReply, type HaikuSdk } from '../src/brain/client.js';
import { createBudget } from '../src/brain/budget.js';
import { createLedger } from '../src/brain/ledger.js';
import { capFor, collectPrompts, main, runSpike, type SpikeItem } from '../src/brain/spike.js';

// Dummy values only: nothing here reads a real credential, calls the network or builds a real client.
const DUMMY_KEY = 'test-key-not-real';

let dir: string;
let file: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-spike-'));
  file = path.join(dir, 'spike.jsonl');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const SYSTEM = 300;
const USER = 600;
const prompt = (system = SYSTEM): Prompt => ({ system: 's'.repeat(system), user: 'u'.repeat(USER), schema: { type: 'object' } as Prompt['schema'] });
const SCHEMA_CHARS = JSON.stringify({ type: 'object' }).length;

const item = (n: number, system = SYSTEM, kind: SpikeItem['kind'] = 'develop'): SpikeItem =>
  ({ prompt: prompt(system), kind, seat: `ai${n % 4}`, persona: 'trader', level: 'trader' }) as SpikeItem;
const items = (n: number, system = SYSTEM) => Array.from({ length: n }, (_, i) => item(i, system));

const reply = (ms: number, billed: Partial<HaikuReply['usage']> = {}, stopReason: HaikuReply['stopReason'] = 'end_turn'): HaikuReply => ({
  text: '{}',
  ms,
  stopReason,
  usage: { input: 100, cached_read: 10, cache_write: 5, output: 20, ...billed },
});

const rig = () => {
  const ledger = createLedger({ path: file, clock: () => new Date('2026-10-21T00:00:00Z') });
  return { ledger, budget: createBudget(ledger) };
};
const run = (list: SpikeItem[], complete: (p: Prompt, waitMs: number) => Promise<HaikuReply>, cap: number = BRAIN.spikeCapUsd) =>
  runSpike({ prompts: list, complete, ...rig(), cap, now: () => new Date('2026-10-21T00:00:00Z'), log: () => {} });
const ledgerLines = (): Record<string, unknown>[] =>
  fs
    .readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as Record<string, unknown>)
    .filter((l) => l.type !== 'game'); // the closing total line is not a call

describe('brain:spike', () => {
  it('§7-S1: the spike stops at its hard cap even when --max-usd is higher', async () => {
    expect(capFor(1)).toBe(BRAIN.spikeCapUsd);
    expect(capFor(0.01)).toBe(0.01);
    const waits: number[] = [];
    // 270,000 chars estimate to 90,000 tokens, and the fake bills exactly that: 0.009 USD a call, so five calls fit.
    const report = await run(items(40, 270_000), async (_p, w) => (waits.push(w), reply(100, { input: 90_000, cached_read: 0, cache_write: 0 })), capFor(1));
    expect(report.stopped).toBe('cap');
    expect(report.countedUsd).toBeLessThanOrEqual(BRAIN.spikeCapUsd);
    expect(report.calls).toBeGreaterThan(0);
    expect(report.calls).toBeLessThan(40);
    expect(report.planned).toBe(40);
    expect(waits.every((w) => w === WAIT_MS.develop)).toBe(true);
    const lines = ledgerLines();
    expect(lines).toHaveLength(report.calls);
    expect(lines[0]).toMatchObject({ game: 'spike-2026-10-21', model: BRAIN.model, kind: 'develop', outcome: 'llm' });
  });

  it('§7-S1: a timed-out call counts at its worst case toward the cap (AM-8)', async () => {
    const list = items(100, 150_000);
    const worst = rig().budget.worstCase(list[0]!.prompt);
    const report = await run(list, async () => {
      throw new CallFailed('model call timed out', 'timeout', false, WAIT_MS.develop);
    });
    expect(report.ledgerUsd).toBe(0);
    expect(report.timeouts).toBe(report.calls);
    expect(report.countedUsd).toBeCloseTo(report.calls * worst, 9);
    expect(report.countedUsd).toBeLessThanOrEqual(BRAIN.spikeCapUsd);
    expect(report.countedUsd + worst).toBeGreaterThan(BRAIN.spikeCapUsd);
    expect(report.stopped).toBe('cap');
    expect(ledgerLines()[0]).toMatchObject({ outcome: 'timeout', timed_out: true });
  });

  it('§7-S1: the report gives p50/p90/max, first-call latency, shares inside 1.5 s and 2.5 s, timeouts, refusals, cache tokens and chars per token', async () => {
    const ms = [400, 800, 1200, 1400, 1600, 1800, 2000, 2400, 2600, 3000];
    let n = 0;
    const report = await run(items(11), async () => {
      const i = n++;
      if (i === 10) throw new CallFailed('model call timed out', 'timeout', false, 1500);
      return reply(ms[i]!, {}, i === 4 ? 'refusal' : 'end_turn');
    });
    expect(report.stopped).toBe('done');
    expect(report.calls).toBe(11);
    expect(report.timeouts).toBe(1);
    expect(report.refusals).toBe(1);
    expect(report.errors).toBe(0);
    expect(report.authFailures).toBe(0);
    expect(report.answered).toBe(10);
    expect(report.latency).toEqual({ p50: 1600, p90: 2600, max: 3000, first: 400 });
    expect(report.within1500).toBeCloseTo(0.4);
    expect(report.within2500).toBeCloseTo(0.8);
    expect(report.cacheRead).toBe(100);
    expect(report.cacheWrite).toBe(50);
    const perToken = (SYSTEM + USER + SCHEMA_CHARS) / 115;
    expect(report.charsPerToken!.min).toBeCloseTo(perToken, 6);
    expect(report.charsPerToken!.median).toBeCloseTo(perToken, 6);
    expect(ledgerLines().map((l) => l.outcome)).toEqual(['llm', 'llm', 'llm', 'llm', 'refused', 'llm', 'llm', 'llm', 'llm', 'llm', 'timeout']);
  });

  it('§7-S1: an auth failure stops the spike at once', async () => {
    let calls = 0;
    const report = await run(items(10), async () => {
      calls++;
      throw new CallFailed('model call failed: api status 401', 'error', true, 80);
    });
    expect(calls).toBe(1);
    expect(report.calls).toBe(1);
    expect(report.stopped).toBe('auth');
    expect(report.authFailures).toBe(1);
    expect(report.latency.first).toBe(80);
  });

  it('HC-2: with no ANTHROPIC_API_KEY, main prints one line, builds no client and exits 1', async () => {
    let built = 0;
    const out: string[] = [];
    for (const env of [{}, { ANTHROPIC_API_KEY: '   ' }]) {
      const code = await main(['--calls', '3'], env, { sdkFactory: () => (built++, {} as HaikuSdk), ledgerPath: file, out: (l) => out.push(l) });
      expect(code).toBe(1);
    }
    expect(built).toBe(0);
    expect(out).toEqual(['ANTHROPIC_API_KEY is not set; nothing called.', 'ANTHROPIC_API_KEY is not set; nothing called.']);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('§7-S1: main prints the cap and the planned count before the first call, caps a high --max-usd, and never prints the key', async () => {
    const out: string[] = [];
    let calls = 0;
    const sdk: HaikuSdk = {
      messages: {
        create: (() => {
          calls++;
          expect(out.join('\n')).toMatch(/cap \$0\.05/);
          expect(out.join('\n')).toMatch(/planned 4 calls/);
          return Promise.resolve({
            content: [{ type: 'text', text: '{}' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 120, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 20 },
          });
        }) as unknown as HaikuSdk['messages']['create'],
      },
    };
    const code = await main(['--calls', '4', '--max-usd', '1', '--seed', '101'], { ANTHROPIC_API_KEY: DUMMY_KEY }, { sdkFactory: () => sdk, ledgerPath: file, out: (l) => out.push(l) });
    expect(code).toBe(0);
    expect(calls).toBe(4);
    expect(out.join('\n')).not.toContain(DUMMY_KEY);
    expect(out.join('\n')).toMatch(/p50/);
    expect(ledgerLines()).toHaveLength(4);
    if (process.env.SPIKE_SAMPLE_OUT) fs.writeFileSync(process.env.SPIKE_SAMPLE_OUT, out.join('\n'));
  });

  it('§7-S1: decisions mix kinds and build real prompts from one strategist game', () => {
    const list = collectPrompts(101, 6);
    expect(list).toHaveLength(6);
    expect(new Set(list.map((i) => i.kind)).size).toBeGreaterThanOrEqual(2);
    // Round-robin: the first three are three different kinds.
    expect(new Set(list.slice(0, 3).map((i) => i.kind)).size).toBe(3);
    for (const it of list) {
      expect(it.prompt).toEqual(buildPrompt(it.shortlist, PERSONAS[it.persona], it.context));
      expect(it.prompt.system.length).toBeGreaterThan(0);
      expect(it.context).toMatchObject({ kind: it.kind, seat: it.seat, tableTalk: [] });
      expect(it.context.summary.length).toBeGreaterThan(0);
    }
  });
});
