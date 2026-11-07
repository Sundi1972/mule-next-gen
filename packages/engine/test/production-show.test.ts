import { describe, expect, it } from 'vitest';
import { PRODUCTION_SHOW, productionEventAtMs, productionShow, productionShowMs } from '../src/index.js';

/**
 * T-AC-14 (ws6-ux spec AM-19, RULE-3): the production show in Heiko's order C, as one pure timeline the server sets
 * production's length from and the screens play. Good by good for every player at once, then every bonus at once,
 * then every loss at once, then the month's events, then the flight into the silos.
 */
describe('T-AC-14: the production show timeline (order C)', () => {
  it('six goods, a quiet month: 16.95 s, the bonuses after the last good and the losses after the bonuses', () => {
    const s = productionShow(6, 0);
    expect(s.goodAtMs).toEqual([1000, 2100, 3200, 4300, 5400, 6500]);
    expect(s.bonusAtMs).toBe(8100);
    expect(s.lossAtMs).toBe(9700);
    expect(s.eventsAtMs).toBeNull();
    expect(s.flightAtMs).toBe(11800);
    expect(s.endMs).toBe(16950);
    expect(productionShowMs(6, 0)).toBe(16950);
  });

  it('a month with events: they play after the losses, and the flight waits for them', () => {
    const s = productionShow(6, 3000);
    expect(s.eventsAtMs).toBe(11800);
    expect(productionEventAtMs(6)).toBe(11800);
    expect(s.flightAtMs).toBe(15300);
    expect(s.endMs).toBe(20450);
  });

  it('the length follows the goods made, not the plots: nine goods 20.25 s; a month with none still ends', () => {
    expect(productionShowMs(9, 0)).toBe(20250);
    expect(productionShowMs(0, 0)).toBe(10350);
  });

  it('every plot takes off within the flights, the first gaps longest, the last at the flights’ end', () => {
    const s = productionShow(6, 0);
    const at = Array.from({ length: 5 }, (_, i) => s.flyAtMs(i, 5));
    expect(at[0]).toBe(s.flightAtMs);
    expect(at[4]).toBe(s.flightAtMs + PRODUCTION_SHOW.flightsMs);
    const gaps = at.slice(1).map((t, i) => t - at[i]!);
    expect(gaps[0]).toBeGreaterThan(gaps[3]!);
    expect(s.flyAtMs(0, 1)).toBe(s.flightAtMs);
  });

  it('PRODUCTION_SHOW keeps the order of goods: the crops, then the mines, then the factories', () => {
    expect(PRODUCTION_SHOW.order).toEqual(['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth', 'alloy', 'electronics', 'medicine']);
  });
});
