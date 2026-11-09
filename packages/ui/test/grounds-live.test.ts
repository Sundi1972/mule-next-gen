import { describe, expect, it } from 'vitest';
import { glowOpacity, walkersOut, type GlowInput, type WalkersInput } from '../src/grounds/live';

describe('the live layer rules (spec §2)', () => {
  // RULE-2's examples; the last row is the clamp past WEALTH_FULL (4 000).
  it.each<[string, GlowInput, number]>([
    ['dusk, standing, wealth 0 → 0.25 (dim, never dark)', { light: 'dusk', stage: 'standing', wealth: 0 }, 0.25],
    ['dusk, standing, wealth 4 000 → 1', { light: 'dusk', stage: 'standing', wealth: 4000 }, 1],
    ['dusk, standing, wealth 10 000 → 1 (wealth ≥ 4 000)', { light: 'dusk', stage: 'standing', wealth: 10000 }, 1],
    ['dusk, closed, wealth 4 000 → 0', { light: 'dusk', stage: 'closed', wealth: 4000 }, 0],
    ['day, standing, wealth 4 000 → 0', { light: 'day', stage: 'standing', wealth: 4000 }, 0],
  ])('T-AC-3: %s', (_, input, opacity) => {
    expect(glowOpacity(input)).toBeCloseTo(opacity, 9);
  });

  // RULE-3's examples; the last two rows are the cap of 14 (6 standing reach it, 7 stay on it).
  it.each<[string, WalkersInput, number]>([
    ['happiness 72, 5 standing → 9', { happiness: 72, standing: 5, strike: false }, 9],
    ['strike → 0', { happiness: 72, standing: 5, strike: true }, 0],
    ['nothing standing, happiness 100 → 2', { happiness: 100, standing: 0, strike: false }, 2],
    ['happiness 100, 6 standing → 14 (the cap)', { happiness: 100, standing: 6, strike: false }, 14],
    ['happiness 100, 7 standing → 14 (past the cap)', { happiness: 100, standing: 7, strike: false }, 14],
  ])('T-AC-4: %s', (_, input, walkers) => {
    expect(walkersOut(input)).toBe(walkers);
  });
});
