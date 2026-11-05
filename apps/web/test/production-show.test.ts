import type { ProductionView } from '@mule/protocol';
import { ProductionMap, showEnd, showTime, showTimes, type MapTile } from '@mule/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

const W = 6;
const H = 3;
const tiles: MapTile[] = Array.from({ length: W * H }, (_, i) => ({ x: i % W, y: Math.floor(i / W), terrain: 'plains', owner: null }));
/** The view's `kind` strings: the show draws by the event's key, whatever its kind. */
const KINDS = ['storm', 'drought', 'flare', 'comet', 'flood', 'quake', 'blight', 'fire', 'bounty'] as const;
type EventKind = (typeof KINDS)[number];

/** Three working plots; the event hits the first two: (1, 0) loses 2, (4, 0) gains 2. (2, 2) is never hit. */
function month(kind: EventKind, deltas: [number, number] = [-2, 2]): ProductionView {
  return {
    lines: [
      { x: 1, y: 0, owner: 'lena', good: 'food', made: 4, parts: [] },
      { x: 4, y: 0, owner: 'ossa', good: 'energy', made: 3, parts: [{ why: 'cluster', delta: 1 }] },
      { x: 2, y: 2, owner: 'lena', good: 'water', made: 2, parts: [] },
    ],
    events: [
      {
        key: 'drought',
        kind,
        title: 'Something happens',
        line: 'It does something to two plots.',
        sign: 'mixed',
        scope: 'colony',
        origin: { x: 0, y: 0 },
        from: 'w',
        hits: [
          { x: 1, y: 0, order: 0, delta: deltas[0] },
          { x: 4, y: 0, order: 1, delta: deltas[1] },
        ],
        phase: 'production',
        weight: 'headline',
        playMs: 7000,
      },
    ],
    lengthMs: 15_000,
    introMs: 0,
  };
}

const render = (production: ProductionView, t: number, tv = true) =>
  renderToStaticMarkup(createElement(ProductionMap, { width: W, height: H, tiles, production, t, slots: { lena: 0, ossa: 1 }, tv }));

/** The markup of one plot's box, from its test id to the next plot's. */
function plot(html: string, x: number, y: number): string {
  const start = html.indexOf(`data-testid="plot-${x}-${y}"`);
  if (start < 0) return '';
  const next = html.indexOf('data-testid="plot-', start + 1);
  return html.slice(start, next < 0 ? undefined : next);
}
const bars = (html: string) => (html.match(/data-bar="unit"/g) ?? []).length;
const reasons = (html: string) => (html.match(/data-badge="reason"/g) ?? []).length;
/** The events' chips on one plot (the module's marks), in the order they are drawn. */
const chips = (html: string, x: number, y: number) => [...html.matchAll(new RegExp(`data-testid="mark-${x}-${y}"[^]*?data-delta="(-?\\d+)"`, 'g'))].map((m) => Number(m[1]));

/** When the month's events start and end (RULE-3, AM-19): after the losses, for the events' playMs, then the flight. */
const eventAt = (p: ProductionView) => showTimes(p).eventsAt!;
const windowEnd = (p: ProductionView) => showTimes(p).flightAt - 0.5;

describe('the production show on the map', () => {
  // Each wave-1 key's own story is T-AC-4 in events-production.test.ts; here, every kind reaches its plots in time.
  it('B-AC-7: whatever its kind, the event has reached every plot it hit by the end of its window, and never a plot it missed', () => {
    for (const kind of KINDS) {
      const late = render(month(kind), windowEnd(month(kind)) - 0.05);
      expect(chips(late, 1, 0), `${kind}: the plot that lost`).toEqual([-2]);
      expect(chips(late, 4, 0), `${kind}: the plot that gained`).toEqual([2]);
      expect(chips(late, 2, 2), `${kind}: a plot it missed is never badged`).toEqual([]);
    }
  });

  it("B-AC-7: a hit plot's bars change by the event's delta", () => {
    const before = render(month('storm'), eventAt(month('storm')) - 0.1);
    expect(bars(plot(before, 1, 0))).toBe(4);
    expect(bars(plot(before, 4, 0))).toBe(3);
    const after = render(month('storm'), windowEnd(month('storm')) - 0.05);
    expect(bars(plot(after, 1, 0))).toBe(2);
    expect(chips(after, 1, 0)).toEqual([-2]);
    expect(bars(plot(after, 4, 0))).toBe(5);
    expect(chips(after, 4, 0)).toEqual([2]);
    expect(bars(plot(after, 2, 2))).toBe(2);
    // The TV keeps the plot's reason beside the event's badge; the phone has room for one badge, and the event's wins.
    expect(reasons(plot(after, 4, 0))).toBe(1);
    const phone = render(month('storm'), windowEnd(month('storm')) - 0.05, false);
    expect(chips(phone, 4, 0)).toEqual([2]);
    expect(reasons(plot(phone, 4, 0))).toBe(0);
    expect(reasons(plot(render(month('storm'), eventAt(month('storm')) - 0.1, false), 4, 0))).toBe(1);
  });

  it('B-AC-7: a fire that spreads through every plot of a long cluster reaches each one before the goods fly', () => {
    const lines = Array.from({ length: W * H }, (_, i) => ({ x: i % W, y: Math.floor(i / W), owner: 'lena', good: 'food' as const, made: 3, parts: [] }));
    const fire: ProductionView = {
      lines,
      events: [{ ...month('fire').events[0]!, hits: lines.map((l, order) => ({ x: l.x, y: l.y, order, delta: -1 })) }],
      lengthMs: 15_000,
      introMs: 0,
    };
    const html = render(fire, windowEnd(fire) - 0.05);
    for (const l of lines) expect(chips(html, l.x, l.y), `the chip on ${l.x}, ${l.y}`).toEqual([-1]);
  });

  it("B-AC-6: the show's clock runs from 0 to its end over the phase's scheduled length, at phaseScale 1 and 0.1, and resumes mid-show", () => {
    const show = month('storm');
    const end = showEnd(show);
    const fly = showTimes(show).flightAt;
    for (const lengthMs of [end * 1000, end * 100]) {
      const start = 1_000_000;
      const endsAt = start + lengthMs;
      expect(showTime(endsAt, start, lengthMs, show)).toBe(0);
      expect(showTime(endsAt, start + lengthMs * 0.4, lengthMs, show)).toBeCloseTo(end * 0.4, 9);
      expect(showTime(endsAt, endsAt, lengthMs, show)).toBe(end);
      // A screen that joins late, or reloads, picks the show up where the phase is.
      expect(showTime(endsAt, start + lengthMs * (fly / end), lengthMs, show)).toBeCloseTo(fly, 9);
      expect(showTime(endsAt, start - 500, lengthMs, show)).toBe(0);
      expect(showTime(endsAt, endsAt + 500, lengthMs, show)).toBe(end);
    }
    expect(showTime(null, 0, 15_000, show)).toBe(end);
  });

  it('INV-1: the show draws no loss the engine did not record', () => {
    for (const tv of [true, false]) {
      const html = render(month('quake', [-2, -1]), showTimes(month('quake', [-2, -1])).flightAt - 0.25, tv);
      expect(chips(html, 1, 0)).toEqual([-2]);
      expect(html).not.toContain('MULE LOST');
      expect(html).not.toContain('✕');
      expect(bars(plot(html, 1, 0))).toBe(2);
    }
  });
});
