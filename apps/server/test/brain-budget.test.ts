import { describe, expect, it } from 'vitest';
import { BRAIN } from '@mule/engine';
import type { Prompt } from '@mule/ai';
import { createBudget, worstCaseUsd } from '../src/brain/budget.js';

/** A budget over a fake ledger whose totals the test sets directly. */
function setup() {
  const spent = new Map<string, number>();
  const key = (game: string, seat: string) => `${game}/${seat}`;
  const budget = createBudget({ seatSpent: (game, seat) => spent.get(key(game, seat)) ?? 0 });
  return { budget, setSpent: (game: string, seat: string, v: number) => spent.set(key(game, seat), v) };
}

const SCHEMA: Prompt['schema'] = {
  type: 'object',
  properties: { option: { type: 'string', enum: ['a', 'b'] }, line: { type: 'string' } },
  required: ['option'],
  additionalProperties: false,
};
const SCHEMA_CHARS = JSON.stringify(SCHEMA).length;
/** A prompt whose system + user + schema JSON total exactly `total` characters. */
const promptOf = (total: number, schema = SCHEMA): Prompt => ({
  system: 'x'.repeat(1000),
  user: 'y'.repeat(total - 1000 - JSON.stringify(schema).length),
  schema,
});

/** allow's answers: call; refused by this check, which locks the seat; refused because it was already locked. */
const CALL = { allowed: true, lockedNow: false };
const LOCKS = { allowed: false, lockedNow: true };
const LOCKED = { allowed: false, lockedNow: false };

describe('RULE-3 budget table', () => {
  it('B-AC-4 (RULE-3): spent 0, next 0.0005 → call', () => {
    const { budget } = setup();
    expect(budget.allow('g', 's', 0.0005)).toEqual(CALL);
  });

  it('B-AC-4 (RULE-3): spent 0.059, next 0.0005 → call (0.0595 is within 0.06)', () => {
    const { budget, setSpent } = setup();
    setSpent('g', 's', 0.059);
    expect(budget.allow('g', 's', 0.0005)).toEqual(CALL);
  });

  it('B-AC-4 (RULE-3): spent 0.0596, next 0.0005 → over budget; a NaN spent or next fails closed', () => {
    const { budget, setSpent } = setup();
    setSpent('g', 's', 0.0596);
    expect(budget.allow('g', 's', 0.0005)).toEqual(LOCKS);
    setSpent('g', 'nan-spent', NaN);
    expect(budget.allow('g', 'nan-spent', 0.0005)).toEqual(LOCKS);
    expect(budget.allow('g', 'nan-next', NaN)).toEqual(LOCKS);
    // and each is locked afterwards, even once the numbers are sane
    setSpent('g', 'nan-spent', 0);
    expect(budget.allow('g', 'nan-spent', 0)).toEqual(LOCKED);
    expect(budget.allow('g', 'nan-next', 0)).toEqual(LOCKED);
  });

  it('B-AC-4 (RULE-3): a negative or non-finite next, or a non-finite spent, fails closed even when the sum would fit', () => {
    const { budget, setSpent } = setup();
    setSpent('g', 'neg-next', 0.0596);
    expect(budget.allow('g', 'neg-next', -0.0005)).toEqual(LOCKS);
    expect(budget.allow('g', 'neg-inf-next', -Infinity)).toEqual(LOCKS);
    expect(budget.allow('g', 'inf-next', Infinity)).toEqual(LOCKS);
    setSpent('g', 'neg-inf-spent', -Infinity);
    expect(budget.allow('g', 'neg-inf-spent', 0.0005)).toEqual(LOCKS);
    // Negative: a next of exactly 0 is a valid worst case.
    expect(budget.allow('g', 'zero-next', 0)).toEqual(CALL);
  });

  it('B-AC-4 (RULE-3): exactly at the boundary (spent + next = 0.06) → call', () => {
    const { budget, setSpent } = setup();
    setSpent('g', 's', 0.05);
    expect(budget.allow('g', 's', BRAIN.seatBudgetUsd - 0.05)).toEqual(CALL);
  });

  it('B-AC-4 (RULE-3): after a refusal the same seat stays refused even when a call would fit; only the first refusal reports the lock', () => {
    const { budget, setSpent } = setup();
    setSpent('g', 's', 0.0596);
    expect(budget.allow('g', 's', 0.0005)).toEqual(LOCKS);
    setSpent('g', 's', 0);
    expect(budget.allow('g', 's', 0)).toEqual(LOCKED);
  });

  it('B-AC-4 (RULE-3): a refusal on one seat leaves a different seat in the same game alone', () => {
    const { budget, setSpent } = setup();
    setSpent('g', 'a', 0.0596);
    expect(budget.allow('g', 'a', 0.0005)).toEqual(LOCKS);
    expect(budget.allow('g', 'b', 0.0005)).toEqual(CALL);
  });

  it('B-AC-4 (RULE-3): a refusal leaves the same seat id in another game alone', () => {
    const { budget, setSpent } = setup();
    setSpent('g1', 's', 0.0596);
    expect(budget.allow('g1', 's', 0.0005)).toEqual(LOCKS);
    expect(budget.allow('g2', 's', 0.0005)).toEqual(CALL);
  });

  it("B-AC-4 (RULE-3): release(game) forgets that game's locks and unknown bills, and only that game's", () => {
    const { budget, setSpent } = setup();
    setSpent('g1', 's', 0.0596);
    setSpent('g2', 's', 0.0596);
    expect(budget.allow('g1', 's', 0.0005)).toEqual(LOCKS);
    expect(budget.allow('g2', 's', 0.0005)).toEqual(LOCKS);
    // Seat u has no ledger spend; only its unknown bills bring it near the budget.
    budget.countUnknownBill('g1', 'u', 0.0596);
    budget.countUnknownBill('g2', 'u', 0.0596);
    budget.release('g1');
    setSpent('g1', 's', 0);
    setSpent('g2', 's', 0);
    expect(budget.allow('g1', 's', 0.0005)).toEqual(CALL);
    expect(budget.allow('g2', 's', 0.0005)).toEqual(LOCKED);
    expect(budget.allow('g1', 'u', 0.0005)).toEqual(CALL);
    expect(budget.allow('g2', 'u', 0.0005)).toEqual(LOCKS);
  });

  it('B-AC-4 (RULE-3): worstCase counts system, user and schema, rounds tokens up, prices input at the cache-write rate', () => {
    const p = BRAIN.pricesPerMTok;
    const priced = (tokens: number) => (tokens * p.cacheWrite + BRAIN.maxTokens * p.output) / 1_000_000;
    const TOKENS = 1000;
    const whole = TOKENS * BRAIN.charsPerToken; // chars that make exactly TOKENS tokens
    expect(Number.isInteger(whole)).toBe(true);
    expect(worstCaseUsd(promptOf(whole))).toBeCloseTo(priced(TOKENS), 12);
    // one char more is one token more: pins ceil
    expect(worstCaseUsd(promptOf(whole + 1))).toBeCloseTo(priced(TOKENS + 1), 12);
    // the schema's JSON is what carries a prompt over a token boundary: without it these chars price one token less
    const sys = 'x'.repeat(1000);
    const user = 'y'.repeat(whole - 1000 - SCHEMA_CHARS + 1);
    const chars = 1000 + user.length; // system + user alone
    expect(chars + SCHEMA_CHARS).toBe(whole + 1);
    const tokensWithout = Math.ceil(chars / BRAIN.charsPerToken);
    expect(tokensWithout).toBeLessThan(TOKENS + 1);
    expect(worstCaseUsd({ system: sys, user, schema: SCHEMA })).toBeCloseTo(priced(TOKENS + 1), 12);
  });
});
