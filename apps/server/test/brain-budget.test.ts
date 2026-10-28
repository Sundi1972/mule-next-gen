import { describe, expect, it } from 'vitest';
import { BRAIN } from '@mule/engine';
import type { Prompt } from '@mule/ai';
import { createBudget, worstCaseUsd } from '../src/brain/budget.js';
import { WRITE_CALLS, WRITE_FALLBACK_MODEL, WRITE_KINDS } from '../src/brain/client.js';

/** The game budget these tests use; two registered seats get a share of 0.5 each. */
const GAME_BUDGET = 1;

/**
 * A $1 game budget over a fake ledger whose totals the test sets directly. `seats` names each game's registered
 * Smart seats; `register` adds one later, as the brain does when it builds a seat's decider.
 */
function setup(seats: Record<string, string[]>) {
  const spent = new Map<string, number>();
  const registered = new Map(Object.entries(seats));
  const key = (game: string, seat: string) => `${game}/${seat}`;
  const budget = createBudget(
    { seatSpent: (game, seat) => spent.get(key(game, seat)) ?? 0 },
    { budgetUsd: GAME_BUDGET, seats: (game) => registered.get(game) ?? [] },
  );
  return {
    budget,
    setSpent: (game: string, seat: string, v: number) => spent.set(key(game, seat), v),
    register: (game: string, seat: string) => registered.set(game, [...(registered.get(game) ?? []), seat]),
  };
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
    const { budget } = setup({ g: ['s', 't'] });
    expect(budget.allow('g', 's', 0.0005)).toEqual(CALL);
  });

  it("B-AC-4 (RULE-3): two Smart seats at a $1 game budget, spent 0.499, next 0.0005 → call (0.4995 is within the seat's 0.5 share)", () => {
    const { budget, setSpent } = setup({ g: ['s', 't'] });
    setSpent('g', 's', 0.499);
    expect(budget.allow('g', 's', 0.0005)).toEqual(CALL);
  });

  it("B-AC-4 (RULE-3): spent 0.4996, next 0.0005 → over the seat's 0.5 share though the table has room; a NaN spent or next fails closed", () => {
    const { budget, setSpent } = setup({ g: ['s', 't'], 'g-nan': ['nan-spent', 'nan-next'] });
    setSpent('g', 's', 0.4996);
    expect(budget.allow('g', 's', 0.0005)).toEqual(LOCKS);
    setSpent('g-nan', 'nan-spent', NaN);
    expect(budget.allow('g-nan', 'nan-spent', 0.0005)).toEqual(LOCKS);
    expect(budget.allow('g-nan', 'nan-next', NaN)).toEqual(LOCKS);
    // and each is locked afterwards, even once the numbers are sane
    setSpent('g-nan', 'nan-spent', 0);
    expect(budget.allow('g-nan', 'nan-spent', 0)).toEqual(LOCKED);
    expect(budget.allow('g-nan', 'nan-next', 0)).toEqual(LOCKED);
  });

  it('B-AC-4 (RULE-3): a negative or non-finite next, or a non-finite spent, fails closed even when the sum would fit', () => {
    const { budget, setSpent } = setup({ g: ['neg-next', 'neg-inf-next', 'inf-next', 'zero-next'], 'g-inf': ['neg-inf-spent'] });
    setSpent('g', 'neg-next', 0.2);
    expect(budget.allow('g', 'neg-next', -0.0005)).toEqual(LOCKS);
    expect(budget.allow('g', 'neg-inf-next', -Infinity)).toEqual(LOCKS);
    expect(budget.allow('g', 'inf-next', Infinity)).toEqual(LOCKS);
    setSpent('g-inf', 'neg-inf-spent', -Infinity);
    expect(budget.allow('g-inf', 'neg-inf-spent', 0.0005)).toEqual(LOCKS);
    // Negative: a next of exactly 0 is a valid worst case.
    expect(budget.allow('g', 'zero-next', 0)).toEqual(CALL);
  });

  it("B-AC-4 (RULE-3): exactly at the seat's share (spent + next = 0.5) → call; a hair past it → refused", () => {
    const { budget, setSpent } = setup({ g: ['s', 't'], h: ['s', 't'] });
    setSpent('g', 's', 0.25);
    expect(budget.allow('g', 's', GAME_BUDGET / 2 - 0.25)).toEqual(CALL);
    setSpent('h', 's', 0.25);
    expect(budget.allow('h', 's', GAME_BUDGET / 2 - 0.25 + 1e-9)).toEqual(LOCKS);
  });

  it('B-AC-4 (RULE-3): after a refusal the same seat stays refused even when a call would fit; only the first refusal reports the lock', () => {
    const { budget, setSpent } = setup({ g: ['s', 't'] });
    setSpent('g', 's', 0.4996);
    expect(budget.allow('g', 's', 0.0005)).toEqual(LOCKS);
    setSpent('g', 's', 0);
    expect(budget.allow('g', 's', 0)).toEqual(LOCKED);
  });

  it('B-AC-4 (RULE-3): a refusal on one seat leaves a different seat in the same game alone', () => {
    const { budget, setSpent } = setup({ g: ['a', 'b'] });
    setSpent('g', 'a', 0.4996);
    expect(budget.allow('g', 'a', 0.0005)).toEqual(LOCKS);
    expect(budget.allow('g', 'b', 0.0005)).toEqual(CALL);
  });

  it('B-AC-4 (RULE-3): a refusal leaves the same seat id in another game alone', () => {
    const { budget, setSpent } = setup({ g1: ['s', 't'], g2: ['s', 't'] });
    setSpent('g1', 's', 0.4996);
    expect(budget.allow('g1', 's', 0.0005)).toEqual(LOCKS);
    expect(budget.allow('g2', 's', 0.0005)).toEqual(CALL);
  });

  it("B-AC-4 (RULE-3): release(game) forgets that game's locks and unknown bills, and only that game's", () => {
    const { budget, setSpent } = setup({ g1: ['s', 'u'], g2: ['s', 'u'] });
    setSpent('g1', 's', 0.4996);
    setSpent('g2', 's', 0.4996);
    expect(budget.allow('g1', 's', 0.0005)).toEqual(LOCKS);
    expect(budget.allow('g2', 's', 0.0005)).toEqual(LOCKS);
    // Seat u has no ledger spend; only its unknown bills bring it near its share.
    budget.countUnknownBill('g1', 'u', 0.4996);
    budget.countUnknownBill('g2', 'u', 0.4996);
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

describe("INV-price-by-model: a call's worst case is at its own model's prices and its own reply cap", () => {
  const TOKENS = 1000;
  const whole = TOKENS * BRAIN.charsPerToken;
  /** RULE-3's worst case at a price table and reply cap, from BRAIN's constants. */
  const pricedAt = (p: Readonly<Record<keyof typeof BRAIN.pricesPerMTok, number>>, maxTokens: number) =>
    (TOKENS * Math.max(p.input, p.cacheWrite) + maxTokens * p.output) / 1_000_000;

  it('INV-price-by-model: a Sonnet 5.5 call is priced at Sonnet rates, never at Haiku rates', () => {
    const maxTokens = 3_000;
    const sonnet = worstCaseUsd(promptOf(whole), { model: 'claude-sonnet-5-5', maxTokens });
    expect(sonnet).toBeCloseTo(pricedAt(BRAIN.sonnetPricesPerMTok, maxTokens), 12);
    expect(sonnet).not.toBeCloseTo(pricedAt(BRAIN.pricesPerMTok, maxTokens), 8);
  });

  it.each(WRITE_KINDS)("INV-price-by-model: a %s call's worst case is at its kind's model and reply cap, and so is the fallback's", (kind) => {
    const { model, maxTokens } = WRITE_CALLS[kind];
    expect(worstCaseUsd(promptOf(whole), WRITE_CALLS[kind])).toBeCloseTo(pricedAt(BRAIN[BRAIN.priceTable[model]], maxTokens), 12);
    expect(worstCaseUsd(promptOf(whole), { model: WRITE_FALLBACK_MODEL, maxTokens })).toBeCloseTo(
      pricedAt(BRAIN[BRAIN.priceTable[WRITE_FALLBACK_MODEL]], maxTokens),
      12,
    );
  });

  it('INV-price-by-model: a move call is unchanged: BRAIN.model at its prices, BRAIN.maxTokens', () => {
    expect(worstCaseUsd(promptOf(whole))).toBeCloseTo(pricedAt(BRAIN[BRAIN.priceTable[BRAIN.model]], BRAIN.maxTokens), 12);
    expect(worstCaseUsd(promptOf(whole))).toBe(worstCaseUsd(promptOf(whole), { model: BRAIN.model, maxTokens: BRAIN.maxTokens }));
  });
});

describe('INV-table-budget', () => {
  it('INV-table-budget: a seat registered after spending began shrinks the shares; the first seat is then past its share, and the newcomer is refused a call that fits its share but not the table', () => {
    const { budget, setSpent, register } = setup({ g: ['a'] });
    setSpent('g', 'a', 0.9);
    // Alone, a's share is the whole game budget.
    expect(budget.allow('g', 'a', 0.05)).toEqual(CALL);
    register('g', 'b');
    expect(budget.allow('g', 'a', 0.0005)).toEqual(LOCKS);
    // 0.2 is within b's 0.5 share, but 0.9 + 0.2 passes the game budget.
    expect(budget.allow('g', 'b', 0.2)).toEqual(LOCKS);
  });

  it('INV-table-budget: the newcomer may still make a call that fits both its share and what is left of the table', () => {
    const { budget, setSpent, register } = setup({ g: ['a'] });
    setSpent('g', 'a', 0.9);
    register('g', 'b');
    expect(budget.allow('g', 'b', 0.05)).toEqual(CALL);
  });

  it("INV-table-budget: a call within both the seat's share and the table's budget → call", () => {
    const { budget, setSpent } = setup({ g: ['a', 'b'] });
    setSpent('g', 'a', 0.3);
    setSpent('g', 'b', 0.2);
    expect(budget.allow('g', 'a', 0.1)).toEqual(CALL);
    expect(budget.allow('g', 'b', 0.3)).toEqual(CALL);
  });

  it("INV-table-budget: the table counts every seat's unknown bills at their worst case", () => {
    const { budget, setSpent, register } = setup({ g: ['a'] });
    setSpent('g', 'a', 0.5);
    budget.countUnknownBill('g', 'a', 0.4);
    register('g', 'b');
    // On the ledger alone the table would hold 0.5 + 0.2.
    expect(budget.allow('g', 'b', 0.2)).toEqual(LOCKS);
  });

  it("INV-table-budget: a non-finite spend at any seat fails every seat's check closed", () => {
    const { budget, setSpent } = setup({ g: ['a', 'b'], h: ['a', 'b'] });
    setSpent('g', 'a', NaN);
    expect(budget.allow('g', 'b', 0.0005)).toEqual(LOCKS);
    setSpent('h', 'a', -Infinity);
    expect(budget.allow('h', 'b', 0.0005)).toEqual(LOCKS);
  });

  it('INV-table-budget: a seat asking before it is registered counts as one more seat, so it can neither widen the shares nor slip past the table', () => {
    const { budget, setSpent } = setup({ g: ['a'], h: ['a'] });
    // As one of two seats, x's share is 0.5.
    expect(budget.allow('g', 'x', 0.6)).toEqual(LOCKS);
    // x's own spend is on the table: 0.9 + 0.1 + 0.05 passes the game budget.
    setSpent('h', 'a', 0.9);
    setSpent('h', 'x', 0.1);
    expect(budget.allow('h', 'x', 0.05)).toEqual(LOCKS);
  });
});
