import { describe, expect, it } from 'vitest';
import { FAN, fanOut } from '../src/index';

/** Colonists by id at a point, in seat order. */
const pts = (...ps: [string, number, number][]) => ps.map(([id, x, y]) => ({ id, x, y }));
const dx = (fan: ReturnType<typeof fanOut>, id: string) => fan.get(id)?.dx ?? 0;

describe('C13: colonists on one spot fan out, so each stays visible (drawing only)', () => {
  it('two at one point: side by side, a step apart, in seat order', () => {
    const fan = fanOut(pts(['s1', 5, 4], ['s2', 5, 4]), 'map');
    expect(dx(fan, 's1')).toBeCloseTo(-FAN.step.map / 2, 9);
    expect(dx(fan, 's2')).toBeCloseTo(FAN.step.map / 2, 9);
    expect(fan.get('s1')?.dy ?? 0).toBe(0);
  });

  it('three at one point: left, middle, right in seat order; the hall steps by its own, larger, sprite', () => {
    const fan = fanOut(pts(['s3', 8, 6], ['s1', 8, 6], ['s2', 8, 6]), 'hall');
    expect([dx(fan, 's3'), dx(fan, 's1'), dx(fan, 's2')]).toEqual([-FAN.step.hall, 0, FAN.step.hall]);
    expect(FAN.step.hall).toBeGreaterThan(FAN.step.map);
  });

  it('within 0.3 counts as one spot, and a chain of near ones is one group', () => {
    const fan = fanOut(pts(['s1', 5, 4], ['s2', 5.25, 4], ['s3', 5.5, 4]), 'map');
    expect([dx(fan, 's1'), dx(fan, 's2'), dx(fan, 's3')]).toEqual([-FAN.step.map, 0, FAN.step.map]);
  });

  it('negative: apart by more than 0.3, or alone, nobody moves', () => {
    expect(fanOut(pts(['s1', 5, 4], ['s2', 5 + FAN.within + 0.01, 4]), 'map').size).toBe(0);
    expect(fanOut(pts(['s1', 5, 4]), 'map').size).toBe(0);
    expect(fanOut([], 'hall').size).toBe(0);
  });
});
