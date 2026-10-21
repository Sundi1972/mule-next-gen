import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLedger, usd, type CallRecord } from '../src/brain/ledger.js';

const FIELDS = [
  't', 'game', 'seat', 'persona', 'level', 'model', 'kind', 'input', 'cached_read',
  'cache_write', 'output', 'usd', 'ms', 'timed_out', 'outcome',
].sort();

let dir: string;
let file: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-ledger-'));
  file = path.join(dir, 'nested', 'costs.jsonl');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const call = (over: Partial<CallRecord> = {}): CallRecord => ({
  game: 'g1', seat: 's1', persona: 'aggressive', level: 'trader', model: 'claude-haiku-5-5',
  kind: 'develop', input: 410, cached_read: 620, cache_write: 0, output: 38, ms: 840,
  outcome: 'llm', ...over,
});
const lines = () =>
  fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
const ledger = () => createLedger({ path: file, clock: () => new Date('2026-10-21T18:02:11.000Z') });

describe('T-AC-4: every call appends one RULE-4 line; finish appends a game line whose usd is the sum', () => {
  it('prices the worked example at 0.0000662 and writes all 15 fields', () => {
    expect(usd({ input: 410, cached_read: 620, cache_write: 0, output: 38 })).toBeCloseTo(0.0000662, 10);
    ledger().record(call());
    const [line] = lines();
    expect(Object.keys(line!).sort()).toEqual(FIELDS);
    expect(line).toMatchObject({
      t: '2026-10-21T18:02:11.000Z', game: 'g1', seat: 's1', input: 410, cached_read: 620,
      output: 38, ms: 840, timed_out: false, outcome: 'llm',
    });
    expect(line!.usd as number).toBeCloseTo(0.0000662, 10);
  });

  it('logs a timed-out call with tokens 0, usd 0 and outcome timeout', () => {
    const l = ledger();
    l.record(call({ input: 0, cached_read: 0, cache_write: 0, output: 0, outcome: 'timeout', ms: 5000 }));
    expect(lines()[0]).toMatchObject({
      input: 0, cached_read: 0, cache_write: 0, output: 0, usd: 0, timed_out: true, outcome: 'timeout',
    });
    expect(l.seatSpent('g1', 's1')).toBe(0);
  });

  it('finish writes one game line: usd is the sum of the call lines, split by seat', () => {
    const l = ledger();
    l.record(call({ seat: 's1' }));
    l.record(call({ seat: 's2', output: 138 }));
    l.record(call({ seat: 's1', outcome: 'timeout', input: 0, cached_read: 0, output: 0 }));
    l.record(call({ game: 'other', seat: 's9' }));
    l.finish('g1');
    const all = lines();
    const calls = all.filter((x) => x.type === undefined && x.game === 'g1');
    const sum = calls.reduce((a, x) => a + (x.usd as number), 0);
    const game = all.filter((x) => x.type === 'game');
    expect(game).toHaveLength(1);
    expect(game[0]).toMatchObject({ t: '2026-10-21T18:02:11.000Z', game: 'g1', type: 'game', seats: 2, calls: 3 });
    expect(game[0]!.usd as number).toBeCloseTo(sum, 12);
    const bySeat = game[0]!.by_seat as Record<string, { calls: number; usd: number }>;
    expect(bySeat.s1!.calls).toBe(2);
    expect(bySeat.s1!.usd).toBeCloseTo(0.0000662, 10);
    expect(bySeat.s2!.calls).toBe(1);
    expect(bySeat.s2!.usd).toBeCloseTo(0.0000662 + 100 * 0.5e-6, 10);
    expect(l.seatSpent('g1', 's2')).toBeCloseTo(bySeat.s2!.usd, 12);
  });

  it('finish for a game with no calls writes calls 0 and usd 0', () => {
    ledger().finish('empty');
    expect(lines()).toEqual([
      { t: '2026-10-21T18:02:11.000Z', game: 'empty', type: 'game', seats: 0, calls: 0, usd: 0, by_seat: {} },
    ]);
  });
});
