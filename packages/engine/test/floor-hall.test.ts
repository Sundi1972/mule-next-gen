import { describe, expect, it } from 'vitest';
import {
  boxOf,
  HALL,
  HALL_BAYS,
  HALL_DOORS,
  HALL_OUTFITTERS,
  HALL_PLACES,
  HALL_ROOMS,
  isOpenFloor,
  placeAt,
  PROCESSED_GOODS,
  RAW_GOODS,
  type HallPlace,
  type HallPoint,
  type HallRect,
} from '../src/index.js';

/** Hall units between the flood fill's samples: well under the narrowest wall or opening in the plan. */
const STEP = 0.04;

const COLS = Math.ceil(HALL.w / STEP);
const ROWS = Math.ceil(HALL.h / STEP);
const isDoor = (place: HallPlace) => place === 'doorL' || place === 'doorR';
const overlaps = (a: HallRect, b: HallRect) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const cellOf = (p: HallPoint) => Math.floor(p.y / STEP) * COLS + Math.floor(p.x / STEP);

/** Every place a colonist reaches from `from` in small steps across and down, on open floor only, and the cells it crossed. */
function placesReached(from: HallPoint): { places: Set<HallPlace | null>; cells: Set<number> } {
  const at = (i: number, j: number) => ({ x: (i + 0.5) * STEP, y: (j + 0.5) * STEP });
  const start = [Math.floor(from.x / STEP), Math.floor(from.y / STEP)] as const;
  const seen = new Set<number>([start[1] * COLS + start[0]]);
  const queue: (readonly [number, number])[] = [start];
  const reached = new Set<HallPlace | null>();
  while (queue.length > 0) {
    const [i, j] = queue.pop()!;
    reached.add(placeAt(at(i, j)));
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const [ni, nj] = [i + di, j + dj];
      if (ni < 0 || nj < 0 || ni >= COLS || nj >= ROWS || seen.has(nj * COLS + ni) || !isOpenFloor(at(ni, nj))) continue;
      seen.add(nj * COLS + ni);
      queue.push([ni, nj]);
    }
  }
  return { places: reached, cells: seen };
}

describe('the hall plan', () => {
  it('INV-hall: the places RULE-3 names exist, inside the hall and apart, and every one is a walk on open floor from either door', () => {
    expect([...HALL_OUTFITTERS].sort(), 'an outfitter for every raw good').toEqual([...RAW_GOODS].sort());
    expect([...HALL_BAYS].sort(), 'a fitting bay in the works for every factory good').toEqual([...PROCESSED_GOODS].sort());
    expect(Object.keys(HALL.rooms).sort()).toEqual([...HALL_ROOMS].sort());
    expect(Object.keys(HALL.bays).sort()).toEqual([...HALL_BAYS].sort());
    expect(Object.keys(HALL.doors).sort()).toEqual([...HALL_DOORS].sort());
    expect(Object.keys(HALL.spots).sort(), 'a spot for every place').toEqual([...HALL_PLACES].sort());
    for (const place of HALL_PLACES) {
      const b = boxOf(place);
      expect(0 <= b.x0 && b.x0 < b.x1 && b.x1 <= HALL.w && 0 <= b.y0 && b.y0 < b.y1 && b.y1 <= HALL.h, `${place} lies inside the hall`).toBe(true);
      for (const other of HALL_PLACES) if (other !== place) expect(overlaps(b, boxOf(other)), `${place} and ${other} overlap`).toBe(false);
      const spot = HALL.spots[place];
      expect(isOpenFloor(spot), `${place}'s spot is open floor`).toBe(true);
      if (!isDoor(place)) expect(b.x0 < spot.x && spot.x < b.x1, `${place}'s spot stands before it`).toBe(true);
    }
    const works = HALL.rooms.works;
    const offBay: HallPoint[] = [];
    for (let x = works.x0; x <= works.x1; x += STEP)
      for (let y = works.y0; y <= works.y1; y += STEP) if (!(HALL_BAYS as readonly (HallPlace | null)[]).includes(placeAt({ x, y }))) offBay.push({ x, y });
    expect(offBay, 'points of the works at none of its bays').toEqual([]);
    for (const door of HALL_DOORS) {
      expect(placeAt(HALL.spots[door]), 'coming in, a colonist stands at the door it came through').toBe(door);
      const { places, cells } = placesReached(HALL.spots[door]);
      expect(HALL_PLACES.filter((p) => !places.has(p)), `places no walk from ${door} gets into`).toEqual([]);
      expect(HALL_PLACES.filter((p) => !cells.has(cellOf(HALL.spots[p]))), `spots no walk from ${door} gets to`).toEqual([]);
    }
  });
});
