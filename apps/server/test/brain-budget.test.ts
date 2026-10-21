import { describe, expect, it } from 'vitest';
import { BRAIN } from '@mule/engine';
import { createBudget } from '../src/brain/budget.js';
import { usd } from '../src/brain/ledger.js';

/** A budget over a fake ledger whose totals the test sets directly. */
function setup() {
  const spent = new Map<string, number>();
  const key = (game: string, seat: string) => `${game}/${seat}`;
  const budget = createBudget({ seatSpent: (game, seat) => spent.get(key(game, seat)) ?? 0 });
  return { budget, setSpent: (game: string, seat: string, v: number) => spent.set(key(game, seat), v) };
}

describe('RULE-3 budget table', () => {
  it('B-AC-4 (RULE-3): spent 0, next 0.0005 → call', () => {
    const { budget } = setup();
    expect(budget.allow('g', 's', 0.0005)).toBe(true);
  });

  it('B-AC-4 (RULE-3): spent 0.059, next 0.0005 → call (0.0595 is within 0.06)', () => {
    const { budget, setSpent } = setup();
    setSpent('g', 's', 0.059);
    expect(budget.allow('g', 's', 0.0005)).toBe(true);
  });

  it('B-AC-4 (RULE-3): spent 0.0596, next 0.0005 → over budget', () => {
    const { budget, setSpent } = setup();
    setSpent('g', 's', 0.0596);
    expect(budget.allow('g', 's', 0.0005)).toBe(false);
  });

  it('B-AC-4 (RULE-3): exactly at the boundary (spent + next = 0.06) → call', () => {
    const { budget, setSpent } = setup();
    setSpent('g', 's', 0.05);
    expect(budget.allow('g', 's', BRAIN.seatBudgetUsd - 0.05)).toBe(true);
  });

  it('B-AC-4 (RULE-3): after a refusal the same seat stays refused even when a call would fit', () => {
    const { budget, setSpent } = setup();
    setSpent('g', 's', 0.0596);
    expect(budget.allow('g', 's', 0.0005)).toBe(false);
    setSpent('g', 's', 0);
    expect(budget.allow('g', 's', 0)).toBe(false);
  });

  it('B-AC-4 (RULE-3): a refusal on one seat leaves a different seat in the same game alone', () => {
    const { budget, setSpent } = setup();
    setSpent('g', 'a', 0.0596);
    expect(budget.allow('g', 'a', 0.0005)).toBe(false);
    expect(budget.allow('g', 'b', 0.0005)).toBe(true);
  });

  it('B-AC-4 (RULE-3): a refusal leaves the same seat id in another game alone', () => {
    const { budget, setSpent } = setup();
    setSpent('g1', 's', 0.0596);
    expect(budget.allow('g1', 's', 0.0005)).toBe(false);
    expect(budget.allow('g2', 's', 0.0005)).toBe(true);
  });

  it("B-AC-4 (RULE-3): release(game) forgets that game's locks", () => {
    const { budget, setSpent } = setup();
    setSpent('g', 's', 0.0596);
    expect(budget.allow('g', 's', 0.0005)).toBe(false);
    budget.release('g');
    setSpent('g', 's', 0);
    expect(budget.allow('g', 's', 0.0005)).toBe(true);
  });

  it('B-AC-4 (RULE-3): worstCase prices a 4,000-character prompt at 1000 input and 200 output tokens', () => {
    const { budget } = setup();
    const expected = usd({ input: 1000, cached_read: 0, cache_write: 0, output: 200 });
    expect(budget.worstCase('x'.repeat(4000))).toBe(expected);
    expect(budget.worstCase(['x'.repeat(1500), 'y'.repeat(2500)])).toBe(expected);
    // 1000 × 0.10 + 200 × 0.50 per MTok, written out by hand
    expect(budget.worstCase('x'.repeat(4000))).toBeCloseTo(0.0002, 10);
  });
});
