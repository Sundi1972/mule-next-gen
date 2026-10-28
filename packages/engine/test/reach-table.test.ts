import { describe, expect, it } from 'vitest';
import { mapSize } from '../src/config.js';
import { reachTable } from '../src/grid.js';

/** The plain definition the table stands in for: every other plot, kept when within `limit` steps, in index order. */
function byFilter(width: number, height: number, skip: number, limit: number): number[][] {
  const steps = (a: number, b: number) => Math.abs((a % width) - (b % width)) + Math.abs(Math.floor(a / width) - Math.floor(b / width));
  const plots = [...Array(width * height).keys()];
  return plots.map((i) => plots.filter((j) => j !== skip && steps(i, j) <= limit));
}

describe('reachTable', () => {
  it('lists exactly the plots within the limit, the skipped plot left out, in index order, for every map size', () => {
    for (const players of [2, 4, 6]) {
      const { width, height } = mapSize(players);
      const store = Math.floor(height / 2) * width + Math.floor(width / 2);
      for (let limit = 0; limit <= width; limit++) {
        for (const skip of [store, -1]) expect(reachTable(width, height, skip, limit), `${width}x${height} skip ${skip} limit ${limit}`).toEqual(byFilter(width, height, skip, limit));
      }
    }
  });

  it('cannot be written to, so one game can never change the next game of that size', () => {
    const table = reachTable(15, 9, 67, 3) as number[][];
    expect(() => table[0]!.push(1)).toThrow(TypeError);
    expect(() => table.pop()).toThrow(TypeError);
  });
});
