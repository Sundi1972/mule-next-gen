import { afterAll, beforeAll, onTestFinished } from 'vitest';
import { STRATEGIST } from '@mule/engine';

/** The PM's strategist rule switches: S1's Energy first (on by default), S2's Medicine despite its inputs (off until PR-13). */
type RuleSwitch = 'energyFirst' | 'medicineDespiteInputs';

/**
 * Turns the named rules off for the calling test file, and restores what they were after it. For files that pin a behaviour the rule
 * would override (a seat with no Energy plant weighing other installs, canFeed's block on a Medicine works); each rule
 * has its own tests with it on (energy-first.test.ts, medicine-despite-inputs.test.ts).
 */
export function rulesOff(...rules: RuleSwitch[]): void {
  const saved = rules.map((r) => STRATEGIST[r]);
  beforeAll(() => {
    for (const r of rules) STRATEGIST[r] = false;
  });
  afterAll(() => {
    rules.forEach((r, i) => (STRATEGIST[r] = saved[i]!));
  });
}

/** rulesOff for the one test that calls it: the rules come back on when it finishes. */
export function rulesOffInTest(...rules: RuleSwitch[]): void {
  const saved = rules.map((r) => STRATEGIST[r]);
  for (const r of rules) STRATEGIST[r] = false;
  onTestFinished(() => rules.forEach((r, i) => (STRATEGIST[r] = saved[i]!)));
}

/**
 * STRATEGIST.analyseWhenClose widened for the one test that calls it, back when it finishes. For cases about what follows
 * an analysis: AM-18's Water use took many plots' best use (often a well) clear of the next, so the draft analyses less.
 */
export function analyseInTest(close = 1): void {
  const saved = STRATEGIST.analyseWhenClose;
  STRATEGIST.analyseWhenClose = close;
  onTestFinished(() => void (STRATEGIST.analyseWhenClose = saved));
}
