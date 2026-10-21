import { describe, expect, it } from 'vitest';
import { bubbleSchedule } from '../src/chat/queue';

const line = (id: number, at: number) => ({ id, at });
const shown = (lines: { id: number; at: number }[], phaseFrom?: number) =>
  bubbleSchedule(lines, phaseFrom).map((b) => [b.line.id, b.from, b.to]);

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
    const lines = [line(1, 0), line(2, 800), line(3, 1_500)];
    expect(shown(lines, 1_000)).toEqual([[3, 1_500, 6_000]]);
  });
});
