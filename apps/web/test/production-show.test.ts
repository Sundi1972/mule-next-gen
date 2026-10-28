import type { ProductionView } from '@mule/protocol';
import { EventCard, ProductionMap, SHOW, showTime, type EventKind, type MapTile } from '@mule/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

const W = 6;
const H = 3;
const tiles: MapTile[] = Array.from({ length: W * H }, (_, i) => ({ x: i % W, y: Math.floor(i / W), terrain: 'plains', owner: null }));
const KINDS: EventKind[] = ['storm', 'drought', 'flare', 'comet', 'flood', 'quake', 'blight', 'fire', 'bounty'];

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

/** When the month's event window ends: it opens at SHOW.eventAt and runs the events' playMs, never under a quiet month's. */
const windowEnd = (p: ProductionView) => SHOW.eventAt + Math.max(SHOW.flyStart - SHOW.eventAt, p.events.reduce((n, e) => n + e.playMs, 0) / 1000);

describe('the production show on the map', () => {
  // Each wave-1 key's own story is T-AC-4 in events-production.test.ts; here, every kind reaches its plots in time.
  it('B-AC-7: whatever its kind, the event has reached every plot it hit by the end of its window, and never a plot it missed', () => {
    for (const kind of KINDS) {
      const late = render(month(kind), windowEnd(month(kind)) - 0.05);
      expect(plot(late, 1, 0), `${kind}: the plot that lost`).toContain('data-testid="hit-1-0"');
      expect(plot(late, 4, 0), `${kind}: the plot that gained`).toContain('data-testid="hit-4-0"');
      expect(plot(late, 2, 2), `${kind}: a plot it missed is never badged`).not.toContain('data-testid="hit-');
    }
  });

  it("B-AC-7: a hit plot's bars change by the event's delta", () => {
    const before = render(month('storm'), SHOW.eventAt - 0.1);
    expect(bars(plot(before, 1, 0))).toBe(4);
    expect(bars(plot(before, 4, 0))).toBe(3);
    const after = render(month('storm'), windowEnd(month('storm')) - 0.05);
    expect(bars(plot(after, 1, 0))).toBe(2);
    expect(plot(after, 1, 0)).toMatch(/data-testid="hit-1-0"[^>]*>−2</);
    expect(bars(plot(after, 4, 0))).toBe(5);
    expect(plot(after, 4, 0)).toMatch(/data-testid="hit-4-0"[^>]*>\+2</);
    expect(bars(plot(after, 2, 2))).toBe(2);
    // The TV keeps the plot's reason beside the event's badge; the phone has room for one badge, and the event's wins.
    expect(reasons(plot(after, 4, 0))).toBe(1);
    const phone = render(month('storm'), windowEnd(month('storm')) - 0.05, false);
    expect(plot(phone, 4, 0)).toMatch(/data-testid="hit-4-0"[^>]*>\+2</);
    expect(reasons(plot(phone, 4, 0))).toBe(0);
    expect(reasons(plot(render(month('storm'), SHOW.eventAt - 0.1, false), 4, 0))).toBe(1);
  });

  it('B-AC-7: a fire that spreads through every plot of a long cluster reaches each one before the goods fly', () => {
    const lines = Array.from({ length: W * H }, (_, i) => ({ x: i % W, y: Math.floor(i / W), owner: 'lena', good: 'food' as const, made: 3, parts: [] }));
    const fire: ProductionView = {
      lines,
      events: [{ ...month('fire').events[0]!, hits: lines.map((l, order) => ({ x: l.x, y: l.y, order, delta: -1 })) }],
      lengthMs: 15_000,
    };
    const html = render(fire, windowEnd(fire) - 0.05);
    for (const l of lines) expect(html, `hit-${l.x}-${l.y}`).toContain(`data-testid="hit-${l.x}-${l.y}"`);
  });

  it("B-AC-6: the show's clock runs 0 to 15 over the phase's scheduled length, at phaseScale 1 and 0.1, and resumes mid-show", () => {
    for (const lengthMs of [15_000, 1_500]) {
      const start = 1_000_000;
      const endsAt = start + lengthMs;
      expect(showTime(endsAt, start, lengthMs)).toBe(0);
      expect(showTime(endsAt, start + lengthMs * 0.4, lengthMs)).toBeCloseTo(6, 9);
      expect(showTime(endsAt, endsAt, lengthMs)).toBe(SHOW.end);
      // A screen that joins late, or reloads, picks the show up where the phase is.
      expect(showTime(endsAt, start + lengthMs * (SHOW.flyStart / SHOW.end), lengthMs)).toBeCloseTo(SHOW.flyStart, 9);
      expect(showTime(endsAt, start - 500, lengthMs)).toBe(0);
      expect(showTime(endsAt, endsAt + 500, lengthMs)).toBe(SHOW.end);
    }
    expect(showTime(null, 0, 15_000)).toBe(SHOW.end);
  });

  it('INV-1: the show draws no loss the engine did not record', () => {
    for (const tv of [true, false]) {
      const html = render(month('quake', [-2, -1]), SHOW.flyStart - 0.05, tv);
      expect(plot(html, 1, 0)).toMatch(/data-testid="hit-1-0"[^>]*>−2</);
      expect(html).not.toContain('MULE LOST');
      expect(html).not.toContain('✕');
      expect(bars(plot(html, 1, 0))).toBe(2);
    }
  });

  it('B-AC-7: the event card names the event once it is due, never before', () => {
    const ev = month('quake').events[0]!;
    expect(renderToStaticMarkup(createElement(EventCard, { ev, t: SHOW.cardAt - 0.1 }))).toBe('');
    expect(renderToStaticMarkup(createElement(EventCard, { ev, t: SHOW.cardAt }))).toContain('Something happens!');
  });
});
