import { describe, expect, it } from 'vitest';
import { HALL, HALL_DOORS, HALL_OUTFITTERS, HALL_ROOMS, isOpenFloor, placeAt, RAW_GOODS, type HallPlace, type HallPoint, type HallRect } from '../src/index.js';

/** Hall units between the flood fill's samples: well under the narrowest wall or opening in the plan. */
const STEP = 0.04;

const PLACES: HallPlace[] = [...HALL_ROOMS, ...HALL_DOORS];
const boxOf = (place: HallPlace): HallRect => (place === 'doorL' || place === 'doorR' ? HALL.doors[place] : HALL.rooms[place]);
const overlaps = (a: HallRect, b: HallRect) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Every place a colonist reaches from `from` in small steps across and down, on open floor only. */
function placesReached(from: HallPoint): Set<HallPlace | null> {
  const cols = Math.ceil(HALL.w / STEP);
  const rows = Math.ceil(HALL.h / STEP);
  const at = (i: number, j: number) => ({ x: (i + 0.5) * STEP, y: (j + 0.5) * STEP });
  const start = [Math.floor(from.x / STEP), Math.floor(from.y / STEP)] as const;
  const seen = new Set<number>([start[1] * cols + start[0]]);
  const queue: (readonly [number, number])[] = [start];
  const reached = new Set<HallPlace | null>();
  while (queue.length > 0) {
    const [i, j] = queue.pop()!;
    reached.add(placeAt(at(i, j)));
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const [ni, nj] = [i + di, j + dj];
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows || seen.has(nj * cols + ni) || !isOpenFloor(at(ni, nj))) continue;
      seen.add(nj * cols + ni);
      queue.push([ni, nj]);
    }
  }
  return reached;
}

describe('the hall plan', () => {
  it('INV-hall: the places RULE-3 names exist, inside the hall and apart, and every one is a walk on open floor from either door', () => {
    expect([...HALL_OUTFITTERS].sort(), 'an outfitter for every raw good').toEqual([...RAW_GOODS].sort());
    expect(Object.keys(HALL.rooms).sort()).toEqual([...HALL_ROOMS].sort());
    expect(Object.keys(HALL.doors).sort()).toEqual([...HALL_DOORS].sort());
    for (const place of PLACES) {
      const b = boxOf(place);
      expect(0 <= b.x0 && b.x0 < b.x1 && b.x1 <= HALL.w && 0 <= b.y0 && b.y0 < b.y1 && b.y1 <= HALL.h, `${place} lies inside the hall`).toBe(true);
      for (const other of PLACES) if (other !== place) expect(overlaps(b, boxOf(other)), `${place} and ${other} overlap`).toBe(false);
      expect(isOpenFloor(HALL.spots[place]), `${place}'s spot is open floor`).toBe(true);
    }
    for (const door of HALL_DOORS) {
      expect(placeAt(HALL.spots[door]), 'coming in, a colonist stands at the door it came through').toBe(door);
      const reached = placesReached(HALL.spots[door]);
      expect(PLACES.filter((p) => !reached.has(p)), `places no walk from ${door} gets into`).toEqual([]);
    }
  });
});
