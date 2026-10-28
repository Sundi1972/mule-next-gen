import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRAIN } from '@mule/engine';
import { createBudget } from '../src/brain/budget.js';
import { WRITE_CALLS, WRITE_FALLBACK_MODEL, WRITE_KINDS } from '../src/brain/client.js';
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

/** US dollars for one call() at a price table. */
const billedAt = (p: Readonly<Record<keyof typeof BRAIN.pricesPerMTok, number>>) =>
  at(410, p.input) + at(620, p.cacheRead) + at(50, p.cacheWrite) + at(38, p.output);
/** A model's own price table, as BRAIN names it. */
const tableOf = (model: keyof typeof BRAIN.priceTable) => BRAIN[BRAIN.priceTable[model]];

describe('T-AC-A4 (ledger): strategy and playbook calls each write a ledger line with their usage and count against the game budget', () => {
  it.each(WRITE_KINDS)("T-AC-A4 (ledger): a %s call writes its line with its kind, model and usage, priced at its model's table", (kind) => {
    const model = WRITE_CALLS[kind].model;
    const l = ledger();
    l.record(call({ kind, model }));
    expect(lines()).toEqual([
      {
        t: NOW, game: 'g1', seat: 's1', persona: 'aggressive', level: 'tycoon', model,
        kind, input: 410, cached_read: 620, cache_write: 50, output: 38,
        usd: expect.closeTo(billedAt(tableOf(model)), 10),
        ms: 840, timed_out: false, outcome: 'llm',
      },
    ]);
    expect(l.seatSpent('g1', 's1')).toBeCloseTo(billedAt(tableOf(model)), 12);
  });

  it.each(WRITE_KINDS)("T-AC-A4 (ledger): a %s line's dollars are the seat's spend, so budget.allow refuses the call that would pass its share", (kind) => {
    const l = ledger();
    l.record(call({ kind, model: WRITE_CALLS[kind].model }));
    l.record(call({ kind, model: WRITE_FALLBACK_MODEL }));
    const spent = billedAt(tableOf(WRITE_CALLS[kind].model)) + billedAt(tableOf(WRITE_FALLBACK_MODEL));
    expect(l.seatSpent('g1', 's1')).toBeCloseTo(spent, 12);
    // Two seats: s1's share is spent plus one micro-dollar.
    const room = 1e-6;
    const budget = createBudget(l, { budgetUsd: 2 * (spent + room), seats: () => ['s1', 's2'] });
    expect(budget.spent('g1', 's1')).toBeCloseTo(spent, 12);
    expect(budget.allow('g1', 's1', room / 2)).toEqual({ allowed: true, lockedNow: false });
    expect(budget.allow('g1', 's1', 2 * room)).toEqual({ allowed: false, lockedNow: true });
    // The other seat's share is untouched.
    expect(budget.allow('g1', 's2', spent)).toEqual({ allowed: true, lockedNow: false });
  });

  it('T-AC-A4 (ledger): finish totals write calls with the move calls, per seat', () => {
    const l = ledger();
    l.record(call({ kind: 'land' }));
    l.record(call({ kind: 'strategy', model: WRITE_CALLS.strategy.model }));
    l.record(call({ kind: 'playbook', model: WRITE_CALLS.playbook.model }));
    l.finish('g1');
    const game = lines().find((x) => x.type === 'game')!;
    const total = ONE + billedAt(tableOf(WRITE_CALLS.strategy.model)) + billedAt(tableOf(WRITE_CALLS.playbook.model));
    expect(game).toMatchObject({ calls: 3, seats: 1 });
    expect(game.usd as number).toBeCloseTo(total, 12);
  });
});

describe('INV-price-by-model: each call is billed at its own model\'s prices, so the game budget is never overspent', () => {
  it('INV-price-by-model: a Sonnet 5.5 line is billed at Sonnet rates, never at Haiku rates', () => {
    const l = ledger();
    l.record(call({ model: 'claude-sonnet-5-5' }));
    expect(lines()[0]!.usd as number).toBeCloseTo(billedAt(BRAIN.sonnetPricesPerMTok), 12);
    expect(lines()[0]!.usd as number).not.toBeCloseTo(billedAt(BRAIN.pricesPerMTok), 8);
    expect(l.seatSpent('g1', 's1')).toBeCloseTo(billedAt(BRAIN.sonnetPricesPerMTok), 12);
  });

  it('INV-price-by-model: a Haiku 5.5 line is billed at Haiku rates', () => {
    ledger().record(call({ model: 'claude-haiku-5-5' }));
    expect(lines()[0]!.usd as number).toBeCloseTo(billedAt(BRAIN.pricesPerMTok), 12);
  });

  it('INV-price-by-model: a model with no price table is billed at the dearest rate of every table, never less', () => {
    ledger().record(call({ model: 'claude-unpriced' as CallRecord['model'] }));
    const tables = Object.values(BRAIN.priceTable).map((t) => BRAIN[t]);
    const dearest = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
    for (const t of tables) for (const k of Object.keys(dearest) as (keyof typeof dearest)[]) dearest[k] = Math.max(dearest[k], t[k]);
    expect(lines()[0]!.usd as number).toBeCloseTo(billedAt(dearest), 12);
    for (const t of tables) expect(lines()[0]!.usd as number).toBeGreaterThanOrEqual(billedAt(t));
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
