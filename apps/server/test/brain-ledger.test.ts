import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRAIN } from '@mule/engine';
import { createLedger, defaultLedgerPath, NO_USAGE, type CallRecord } from '../src/brain/ledger.js';
import { readLedger } from './brain-fakes.js';

let dir: string;
let file: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-ledger-'));
  file = path.join(dir, 'nested', 'costs.jsonl');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

const NOW = '2026-10-21T18:02:11.000Z';
const call = (over: Partial<CallRecord> = {}): CallRecord => ({
  game: 'g1', seat: 's1', persona: 'aggressive', level: 'tycoon', model: 'claude-haiku-5-5',
  kind: 'develop', input: 410, cached_read: 620, cache_write: 50, output: 38, ms: 840,
  outcome: 'llm', ...over,
});
/** US dollars for `tokens` at one of BRAIN's per-million prices. */
const at = (tokens: number, perMTok: number) => (tokens * perMTok) / 1_000_000;
const P = BRAIN.pricesPerMTok;
/** What one call() is billed. */
const ONE = at(410, P.input) + at(620, P.cacheRead) + at(50, P.cacheWrite) + at(38, P.output);
const lines = () => readLedger(file);
const ledger = () => createLedger({ path: file, clock: () => new Date(NOW) });

describe('T-AC-4: every call appends one RULE-4 line; finish appends a game line whose usd is the sum', () => {
  it('T-AC-4: a call appends exactly the 15-field line, priced 410*0.10 + 620*0.01 + 50*0.125 + 38*0.50 per MTok', () => {
    ledger().record(call());
    expect(lines()).toEqual([
      {
        t: NOW, game: 'g1', seat: 's1', persona: 'aggressive', level: 'tycoon', model: 'claude-haiku-5-5',
        kind: 'develop', input: 410, cached_read: 620, cache_write: 50, output: 38,
        usd: expect.closeTo(ONE, 10),
        ms: 840, timed_out: false, outcome: 'llm',
      },
    ]);
  });

  it('T-AC-4: a timeout records the usage it is given: none is 0 and 0, billed tokens are charged', () => {
    const l = ledger();
    l.record(call({ ...NO_USAGE, outcome: 'timeout', ms: 5000 }));
    expect(lines()[0]).toMatchObject({ ...NO_USAGE, usd: 0, timed_out: true, outcome: 'timeout' });
    expect(l.seatSpent('g1', 's1')).toBe(0);

    l.record(call({ input: 100, cached_read: 0, cache_write: 0, output: 10, outcome: 'timeout', ms: 5000 }));
    expect(lines()[1]).toMatchObject({ input: 100, output: 10, timed_out: true, outcome: 'timeout' });
    expect(lines()[1]!.usd).toBeCloseTo(at(100, P.input) + at(10, P.output), 12);
    expect(l.seatSpent('g1', 's1')).toBeCloseTo(at(100, P.input) + at(10, P.output), 12);
  });

  it('T-AC-4: finish writes one game line: usd is the sum of that game, split by seat, and seatSpent agrees', () => {
    const l = ledger();
    l.record(call({ seat: 's1' }));
    l.record(call({ seat: 's2', output: 138 }));
    l.record(call({ seat: 's3', outcome: 'timeout', ...NO_USAGE }));
    l.record(call({ seat: 's1' }));
    // A budget refusal is a line, not a model call: it adds nothing to calls.
    l.record(call({ seat: 's2', outcome: 'budget', ...NO_USAGE, ms: 0 }));
    l.record(call({ game: 'other', seat: 's1', output: 1038 }));
    expect(l.seatSpent('g1', 's1')).toBeCloseTo(2 * ONE, 12);
    expect(l.seatSpent('other', 's1')).toBeCloseTo(ONE + at(1000, P.output), 12);
    l.finish('g1');
    expect(l.seatSpent('other', 's1')).toBeCloseTo(ONE + at(1000, P.output), 12);
    const all = lines();
    const sum = all
      .filter((x) => x.type === undefined && x.game === 'g1')
      .reduce((a, x) => a + (x.usd as number), 0);
    const game = all.filter((x) => x.type === 'game');
    expect(game).toHaveLength(1);
    expect(game[0]).toMatchObject({ t: NOW, game: 'g1', type: 'game', seats: 3, calls: 4 });
    expect(game[0]!.usd as number).toBeCloseTo(sum, 12);
    const bySeat = game[0]!.by_seat as Record<string, { calls: number; usd: number }>;
    expect(bySeat.s1!.calls).toBe(2);
    expect(bySeat.s1!.usd).toBeCloseTo(2 * ONE, 12);
    expect(bySeat.s2!.calls).toBe(1);
    expect(bySeat.s2!.usd).toBeCloseTo(ONE + at(100, P.output), 12);
    expect(bySeat.s3).toEqual({ calls: 1, usd: 0 });
  });

  it('T-AC-4: a call that settles after finish writes its line but never re-opens the game', () => {
    const l = ledger();
    l.record(call());
    l.finish('g1');
    l.record(call({ outcome: 'timeout' }));
    expect(lines().map((x) => x.type ?? x.outcome)).toEqual(['llm', 'game', 'timeout']);
    expect(l.seatSpent('g1', 's1')).toBe(0);
    l.finish('g1');
    expect(lines().filter((x) => x.type === 'game')).toHaveLength(1);
  });

  it('T-AC-4: finish for a game with no calls writes calls 0 and usd 0', () => {
    ledger().finish('empty');
    expect(lines()).toEqual([
      { t: NOW, game: 'empty', type: 'game', seats: 0, calls: 0, usd: 0, by_seat: {} },
    ]);
  });

  it('T-AC-4: finish releases the game: a second finish writes no second line', () => {
    const l = ledger();
    l.record(call());
    l.finish('g1');
    l.finish('g1');
    expect(lines().filter((x) => x.type === 'game')).toHaveLength(1);
    expect(l.seatSpent('g1', 's1')).toBe(0);
  });

  it('T-AC-4: the ledger path is MULE_BRAIN_LOG when set, else apps/server/data/brain-costs.jsonl', () => {
    vi.stubEnv('MULE_BRAIN_LOG', '/somewhere/else.jsonl');
    expect(defaultLedgerPath()).toBe('/somewhere/else.jsonl');
    vi.stubEnv('MULE_BRAIN_LOG', undefined);
    expect(defaultLedgerPath().split(path.sep).join('/')).toMatch(/apps\/server\/data\/brain-costs\.jsonl$/);
  });
});

describe('FM-ledger-write', () => {
  it('FM-ledger-write: a failed append still charges the seat and does not throw', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const asDirectory = path.join(dir, 'is-a-directory');
    fs.mkdirSync(asDirectory);
    const l = createLedger({ path: asDirectory, clock: () => new Date(NOW) });

    expect(() => l.record(call())).not.toThrow();
    expect(() => l.record(call())).not.toThrow();
    expect(l.seatSpent('g1', 's1')).toBeCloseTo(2 * ONE, 12);
    expect(() => l.finish('g1')).not.toThrow();
    expect(err).toHaveBeenCalledTimes(1);
    expect(String(err.mock.calls[0]![0])).toContain(asDirectory);
  });
});
