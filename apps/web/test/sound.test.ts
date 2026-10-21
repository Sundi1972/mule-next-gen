import { describe, expect, it } from 'vitest';
import { tickGap } from '../src/game/sound';

describe('the auction clock tick', () => {
  it('ticks faster as time runs out, and slower while a trade slows the clock', () => {
    expect(tickGap(0.9, false)).toBe(1000);
    expect(tickGap(0.4, false)).toBe(500);
    expect(tickGap(0.2, false)).toBe(250);
    expect(tickGap(0.05, false)).toBe(160);
    expect(tickGap(0.9, true)).toBe(4000);
  });
});
