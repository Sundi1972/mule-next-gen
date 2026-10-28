import { describe, expect, it } from 'vitest';
import { EVENT_FRONT, eventFrontAt, eventHitAt, eventScript, eventSegments, eventStageAt, type ShowEventKey, type ShowEventView, type ShowGrid, type ShowMode } from '../src/index';

const G15: ShowGrid = { width: 15, height: 9 };
const G19: ShowGrid = { width: 19, height: 11 };
const SWEEPS: ShowEventKey[] = ['dustStorm', 'drought', 'acidRain', 'solarFlare', 'cometPass'];

/** One fired event as the view sends it: `n` hits along row 4 from the map's east edge, landing in `orders` (0, 1, 2… by default). */
function fired(key: ShowEventKey, playMs: number, n: number, { width = 15, orders }: { width?: number; orders?: number[] } = {}): ShowEventView {
  return {
    key,
    kind: key,
    title: key,
    line: `${key} happens.`,
    sign: 'bad',
    scope: 'colony',
    origin: { x: 0, y: 4 },
    from: 'w',
    hits: Array.from({ length: n }, (_, i) => ({ x: width - 1 - i, y: 4, order: orders?.[i] ?? i, delta: -1 })),
    phase: 'production',
    weight: 'headline',
    playMs,
  };
}

interface Row {
  what: string;
  events: ShowEventView[];
  start: number;
  mode: ShowMode;
  grid: ShowGrid;
  /** The segment boundaries in seconds: the start, then each segment's end. */
  bounds: number[];
  /** [segment, hit] that the settle clamp must catch. */
  clamped?: [number, number][];
  /** Every hit lands before its settle: the grid is the one the hits sit on. */
  unclamped?: boolean;
}

const ROWS: Row[] = [
  { what: 'one dust storm on the TV', events: [fired('dustStorm', 9400, 6)], start: 4.8, mode: 'tv', grid: G15, bounds: [4.8, 14.2] },
  {
    what: 'three events on a phone alone, in fired order',
    events: [fired('drought', 8000, 4), fired('pestSwarm', 12000, 5), fired('bumperHarvest', 7000, 1)],
    start: 4.8,
    mode: 'solo',
    grid: G15,
    bounds: [4.8, 12.8, 24.8, 31.8],
  },
  { what: 'a short sweep: its motion squeezes into 3 s, the far plot still lands inside', events: [fired('acidRain', 3000, 15)], start: 0, mode: 'tv', grid: G15, bounds: [0, 3] },
  { what: 'a long spread in a short segment', events: [fired('wildfire', 2500, 9), fired('flood', 4000, 3)], start: 10, mode: 'tv', grid: G15, bounds: [10, 12.5, 16.5] },
  { what: 'a spread whose orders skip: the late hit is clamped to the settle', events: [fired('pestSwarm', 6000, 2, { orders: [0, 7] })], start: 0, mode: 'tv', grid: G15, bounds: [0, 6], clamped: [[0, 1]] },
  { what: 'a 19 × 11 map: the far plot is timed on its own grid', events: [fired('dustStorm', 9400, 19, { width: 19 })], start: 0, mode: 'tv', grid: G19, bounds: [0, 9.4], unclamped: true },
  { what: 'a 0 ms event between two: a moment, never a stalled clock', events: [fired('drought', 6000, 3), fired('flood', 0, 3), fired('wildfire', 4000, 2)], start: 0, mode: 'tv', grid: G15, bounds: [0, 6, 6, 10] },
  { what: 'a negative length counts as 0', events: [fired('dustStorm', -500, 3), fired('solarFlare', 5000, 3)], start: 2, mode: 'solo', grid: G15, bounds: [2, 2, 7] },
];

describe('the show timing core', () => {
  it.each(ROWS)('T-AC-4: a segment per event, in fired order, of the view’s playMs: $what', ({ events, start, mode, grid, bounds, clamped = [], unclamped }) => {
    const segs = eventSegments(events, start, mode);

    expect(segs).toHaveLength(events.length);
    segs.forEach((seg, i) => {
      const ev = events[i]!;
      expect(seg.events).toEqual([ev]);
      expect([seg.n, seg.count]).toEqual([i + 1, events.length]);
      expect(seg.startAt).toBeCloseTo(bounds[i]!, 9);
      expect(seg.endAt).toBeCloseTo(bounds[i + 1]!, 9);
      if (i > 0) expect(seg.announceAt).toBe(seg.startAt);
      expect(seg.startAt <= seg.announceAt && seg.announceAt <= seg.playAt && seg.playAt <= seg.settleAt && seg.settleAt <= seg.endAt).toBe(true);
      expect(seg.pace).toBeGreaterThan(0);
      expect(Number.isFinite(eventFrontAt(seg, seg.settleAt))).toBe(true);
      // The front leaves its edge `lead` into the play and is off the far side `cross` later, both at the segment's pace.
      expect(eventFrontAt(seg, seg.playAt + EVENT_FRONT.lead * seg.pace)).toBeCloseTo(0, 9);
      expect(eventFrontAt(seg, seg.playAt + (EVENT_FRONT.lead + EVENT_FRONT.cross) * seg.pace)).toBeCloseTo(1, 9);

      const at = ev.hits.map((h) => eventHitAt(seg, ev, h, false, grid));
      at.forEach((a) => {
        expect(a).toBeGreaterThanOrEqual(seg.playAt);
        expect(a).toBeLessThanOrEqual(seg.settleAt);
        if (unclamped) expect(a).toBeLessThan(seg.settleAt);
      });
      for (const h of ev.hits) expect(eventHitAt(seg, ev, h, true, grid)).toBe(Math.min(seg.settleAt, seg.playAt + 0.2 * seg.pace));
      if (seg.endAt > seg.startAt) {
        // A sweep from the west reaches the lower x first; everything else lands in its hits' order.
        const sweep = SWEEPS.includes(ev.key);
        const inTurn = ev.hits.map((h, k) => ({ h, a: at[k]! })).sort((p, q) => (sweep ? p.h.x - q.h.x : p.h.order - q.h.order));
        inTurn.slice(1).forEach((l, k) => expect(l.a).toBeGreaterThan(inTurn[k]!.a));
      }
    });
    for (const [g, k] of clamped) expect(eventHitAt(segs[g]!, events[g]!, events[g]!.hits[k]!, false, grid)).toBe(segs[g]!.settleAt);
    const total = segs.reduce((n, s) => n + (s.endAt - s.startAt), 0);
    expect(total).toBeCloseTo(events.reduce((n, e) => n + Math.max(0, e.playMs), 0) / 1000, 9);
  });

  it('T-AC-4: the gallery’s beats, scaled to fill a 9.4 s dust storm on the TV', () => {
    const [seg] = eventSegments([fired('dustStorm', 9400, 6)], 4.8, 'tv');
    // intro 1.8 + announce 2.2 + sweep 3.6 + settle 1.2 = 8.8 gallery seconds into 9.4.
    const k = 9.4 / 8.8;
    expect(seg!.announceAt).toBeCloseTo(4.8 + 1.8 * k, 9);
    expect(seg!.playAt).toBeCloseTo(4.8 + 4 * k, 9);
    expect(seg!.settleAt).toBeCloseTo(4.8 + 7.6 * k, 9);
    expect(seg!.pace).toBeCloseTo(k, 9);
  });

  it('T-AC-4: on a phone alone the solo beats, and the motion at 75% of its share', () => {
    const [drought, pests] = eventSegments([fired('drought', 8000, 4), fired('pestSwarm', 12000, 5)], 4.8, 'solo');
    // intro 1.1 + announce 1.4 + sweep 3.6 × 0.75 + settle 0.8 = 6 gallery seconds into 8.
    const k1 = 8 / 6;
    expect(drought!.announceAt).toBeCloseTo(4.8 + 1.1 * k1, 9);
    expect(drought!.playAt).toBeCloseTo(4.8 + 2.5 * k1, 9);
    expect(drought!.settleAt).toBeCloseTo(4.8 + 5.2 * k1, 9);
    expect(drought!.pace).toBeCloseTo(k1 * 0.75, 9);
    // No intro; announce 1.4 + spread (0.6 + 5 × 0.9) × 0.75 + settle 0.8 = 6.025 into 12.
    const k2 = 12 / 6.025;
    expect(pests!.playAt).toBeCloseTo(12.8 + 1.4 * k2, 9);
    expect(pests!.settleAt).toBeCloseTo(12.8 + 5.225 * k2, 9);
    expect(pests!.pace).toBeCloseTo(k2 * 0.75, 9);
  });

  it('T-AC-4: the stage at every boundary, and the script ends with its last segment', () => {
    const s = eventScript([fired('dustStorm', 9400, 6), fired('pestSwarm', 6000, 3)], 4.8, 'tv');
    const [a, b] = s.segments;
    const e = 1e-6;
    const at = (t: number) => {
      const { stage, seg } = eventStageAt(s, t);
      return [stage, seg?.n ?? null];
    };
    expect(s.end).toBe(b!.endAt);
    expect(s.intro).toBe(a!.announceAt);
    expect(at(4.8 - e)).toEqual(['before', null]);
    expect(at(4.8 + e)).toEqual(['intro', null]);
    expect(at(a!.announceAt - e)).toEqual(['intro', null]);
    expect(at(a!.announceAt + e)).toEqual(['announce', 1]);
    expect(at(a!.playAt - e)).toEqual(['announce', 1]);
    expect(at(a!.playAt + e)).toEqual(['play', 1]);
    expect(at(a!.settleAt - e)).toEqual(['play', 1]);
    expect(at(a!.settleAt + e)).toEqual(['settle', 1]);
    expect(at(a!.endAt - e)).toEqual(['settle', 1]);
    expect(at(a!.endAt + e)).toEqual(['announce', 2]);
    expect(at(b!.playAt + e)).toEqual(['play', 2]);
    expect(at(b!.settleAt + e)).toEqual(['settle', 2]);
    expect(at(b!.endAt - e)).toEqual(['settle', 2]);
    expect(at(b!.endAt + e)).toEqual(['outro', null]);
  });

  it('T-AC-4: a quiet phase has no segments, and its script is over where it starts', () => {
    expect(eventSegments([], 4.8, 'tv')).toEqual([]);
    const s = eventScript([], 4.8, 'tv');
    expect(s.end).toBe(4.8);
    expect(eventStageAt(s, 4.7).stage).toBe('before');
    expect(eventStageAt(s, 4.8).stage).toBe('outro');
  });
});
