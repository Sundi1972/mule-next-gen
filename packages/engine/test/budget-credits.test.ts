import { describe, expect, it } from 'vitest';
import { budgetCredits, COLONY, createGame, lineCredits, lineMaxCredits, POLITICS, spare, spareOf } from '../src/index.js';

describe('S5-T-AC-2 (S5-RULE-3): what a share pays at a fund', () => {
  it('S5-T-AC-2: spareOf is the fund above the reserve, and 0 at or below it', () => {
    expect(spareOf(COLONY.reserve + 437)).toBe(437);
    expect(spareOf(COLONY.reserve)).toBe(0);
    expect(spareOf(COLONY.reserve - 1)).toBe(0);
    expect(spareOf(0)).toBe(0);
  });

  it('S5-T-AC-2: lineCredits is the share of the spare, floored, capped by the line; Projects has no credit cap', () => {
    expect(lineCredits('projects', 60, 1000)).toBe(600);
    expect(lineCredits('projects', 33, 100)).toBe(33);
    expect(lineCredits('projects', 15, 7)).toBe(1);
    expect(lineCredits('welfare', 10, 1000)).toBe(100);
    const max = lineMaxCredits('welfare')!;
    expect(max).toBe(POLITICS.budget.welfare.maxCredits);
    expect(lineCredits('welfare', POLITICS.budget.welfare.maxShare, 100_000)).toBe(max);
    expect(lineCredits('projects', 100, 100_000)).toBe(100_000);
  });

  it('S5-T-AC-2: budgetCredits and spare are the same figures lineCredits and spareOf give', () => {
    const state = createGame({ seed: 7, players: ['a', 'b', 'c'].map((id) => ({ id, name: id, isAi: false })) });
    state.treasury.money = COLONY.reserve + 1234;
    expect(spare(state)).toBe(spareOf(state.treasury.money));
    const credits = budgetCredits(state);
    expect(credits.projects).toBe(lineCredits('projects', 100, spare(state)));
    expect(credits.welfare).toBe(lineCredits('welfare', 0, spare(state)));
  });
});
