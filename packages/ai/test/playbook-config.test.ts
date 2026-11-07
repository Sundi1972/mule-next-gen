import { describe, expect, it } from 'vitest';
import { AI_PLANS } from '@mule/engine';
import { applySets } from '../src/sim.js';

describe('AI_PLANS is a sweepable config block', () => {
  // trace-allow: the plan's C3 contract test (spec C3, HC-5): the spec gives the --set reachability no AC id
  it('C3: every AI_PLANS number is reachable by --set', () => {
    const saved = { cashFloorMax: AI_PLANS.bounds.cashFloorMax, monopolist: AI_PLANS.leaning.trader.monopolist, on: AI_PLANS.on };
    try {
      applySets(['AI_PLANS.bounds.cashFloorMax=1500', 'AI_PLANS.leaning.trader.monopolist=0.5', 'AI_PLANS.on=false']);
      expect(AI_PLANS.bounds.cashFloorMax).toBe(1500);
      expect(AI_PLANS.leaning.trader.monopolist).toBe(0.5);
      expect(AI_PLANS.on).toBe(false);
    } finally {
      AI_PLANS.bounds.cashFloorMax = saved.cashFloorMax;
      AI_PLANS.leaning.trader.monopolist = saved.monopolist;
      AI_PLANS.on = saved.on;
    }
    // Every number in the block, walked from the live object, takes a --set and reads back.
    const paths: [string, number][] = [];
    const walk = (at: unknown, path: string): void => {
      if (typeof at === 'number') paths.push([path, at]);
      else if (at !== null && typeof at === 'object' && !Array.isArray(at)) for (const [k, v] of Object.entries(at)) walk(v, `${path}.${k}`);
    };
    walk(AI_PLANS, 'AI_PLANS');
    expect(paths.length).toBeGreaterThan(30);
    for (const [path, value] of paths) {
      const read = () => path.split('.').slice(1).reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], AI_PLANS);
      try {
        applySets([`${path}=${value + 7}`]);
        expect(read(), path).toBe(value + 7);
      } finally {
        applySets([`${path}=${value}`]);
      }
    }
    for (const bad of ['AI_PLANS.bounds.nope=1', 'AI_PLANS.leaning.nobody.builder=1', 'AI_PLANS.bounds=1']) {
      expect(() => applySets([bad]), bad).toThrow(bad.split('=')[0]);
    }
  });
});
