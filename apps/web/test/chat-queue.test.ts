import { describe, expect, it } from 'vitest';
import { bubbleAt, bubbleSchedule } from '../src/chat/queue';

type Line = { id: number; at: number; phase?: number };
const line = (id: number, at: number, phase?: number): Line => ({ id, at, ...(phase === undefined ? {} : { phase }) });
const shown = (lines: Line[], phase?: number) => bubbleSchedule(lines, phase).map((b) => [b.line.id, b.from, b.to]);

describe('the bubble queue (RULE-9)', () => {
  it.each([
    ['one line shows 4.5 s', [line(1, 0)], [[1, 0, 4_500]]],
    ['two lines 0.8 s apart: the first 2 s, the second from 2 s to 6.5 s', [line(1, 0), line(2, 800)], [[1, 0, 2_000], [2, 2_000, 6_500]]],
    [
      'five lines in one second: three show, the fourth and fifth would wait over 4 s and get none',
      [line(1, 0), line(2, 250), line(3, 500), line(4, 750), line(5, 1_000)],
      [[1, 0, 2_000], [2, 2_000, 4_000], [3, 4_000, 8_500]],
    ],
    ['a line waiting exactly 4 s still gets its bubble', [line(1, 0), line(2, 0), line(3, 0)], [[1, 0, 2_000], [2, 2_000, 4_000], [3, 4_000, 8_500]]],
    ['a later line after a quiet spell shows at once', [line(1, 0), line(2, 9_000)], [[1, 0, 4_500], [2, 9_000, 13_500]]],
  ])('T-AC-11: one bubble at a time, each at least the minimum, a line that would wait too long gets none — %s', (_, lines, expected) => {
    expect(shown(lines)).toEqual(expected);
  });

  it('T-AC-11: a phase change ends every bubble and drops the queue: a line after it shows at once', () => {
    const lines = [line(1, 0, 1), line(2, 800, 1), line(3, 1_500, 2)];
    expect(shown(lines, 2)).toEqual([[3, 1_500, 6_000]]);
  });

  it('T-AC-11: a line belongs to the phase it was received in, whatever its time: two lines in one millisecond, either side of a phase change', () => {
    expect(shown([line(1, 1_000, 1), line(2, 1_000, 2)], 2)).toEqual([[2, 1_000, 5_500]]);
  });

  it.each([
    ['at its start the bubble shows', 0, 1],
    ['just before the cut the first still shows', 1_999, 1],
    ['at the cut the second takes over', 2_000, 2],
    ['just before its end the second still shows', 6_499, 2],
    ['at its end nothing shows', 6_500, null],
  ])('T-AC-11: the bubble showing at a moment, for two lines 0.8 s apart — %s', (_, now, expected) => {
    const schedule = bubbleSchedule([line(1, 0), line(2, 800)]);
    expect(bubbleAt(schedule, now)?.line.id ?? null).toBe(expected);
  });
});
