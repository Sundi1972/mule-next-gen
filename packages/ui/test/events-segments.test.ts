import { describe, expect, it } from 'vitest';
import { eventHitAt, eventSegments, type ShowEventKey, type ShowEventView, type ShowMode } from '../src/index';

/** One fired event as the view sends it: `n` hits in a row, landing in that order. */
function fired(key: ShowEventKey, playMs: number, n: number): ShowEventView {
  return {
    key,
    kind: key,
    title: key,
    line: `${key} happens.`,
    sign: 'bad',
    scope: 'colony',
    origin: { x: 0, y: 4 },
    from: 'w',
    hits: Array.from({ length: n }, (_, i) => ({ x: 14 - i, y: 4, order: i, delta: -1 })),
    phase: 'production',
    weight: 'headline',
    playMs,
  };
}

/** [what, events, start, mode, the segment boundaries in seconds: start, then each segment's end]. */
const ROWS: [string, ShowEventView[], number, ShowMode, number[]][] = [
  ['one dust storm on the TV', [fired('dustStorm', 9400, 6)], 4.8, 'tv', [4.8, 14.2]],
  [
    'three events on a phone alone, in fired order',
    [fired('drought', 8000, 4), fired('pestSwarm', 12000, 5), fired('bumperHarvest', 7000, 1)],
    4.8,
    'solo',
    [4.8, 12.8, 24.8, 31.8],
  ],
  ['a short sweep: its motion squeezes into 3 s, the far plot still lands inside', [fired('acidRain', 3000, 15)], 0, 'tv', [0, 3]],
  ['a long spread in a short segment', [fired('wildfire', 2500, 9), fired('flood', 4000, 3)], 10, 'tv', [10, 12.5, 16.5]],
];

describe('the show timing core', () => {
  it.each(ROWS)('T-AC-4: a segment per event, in fired order, of the view’s playMs: %s', (_what, events, start, mode, bounds) => {
    const segs = eventSegments(events, start, mode);

    expect(segs).toHaveLength(events.length);
    segs.forEach((seg, i) => {
      expect(seg.events).toEqual([events[i]]);
      expect(seg.startAt).toBeCloseTo(bounds[i]!, 9);
      expect(seg.endAt).toBeCloseTo(bounds[i + 1]!, 9);
      for (const reduced of [false, true]) {
        for (const h of events[i]!.hits) {
          const at = eventHitAt(seg, events[i]!, h, reduced, { width: 15, height: 9 });
          expect(at).toBeGreaterThanOrEqual(seg.startAt);
          expect(at).toBeLessThan(seg.endAt);
        }
      }
    });
    const total = segs.reduce((n, s) => n + (s.endAt - s.startAt), 0);
    expect(total).toBeCloseTo(events.reduce((n, e) => n + e.playMs, 0) / 1000, 9);
  });

  it('T-AC-4: a quiet phase has no segments', () => {
    expect(eventSegments([], 4.8, 'tv')).toEqual([]);
  });
});
