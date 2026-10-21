import { describe, expect, it } from 'vitest';
import { zoomBox, type MapTile, type Slot } from '../src/index';

const W = 19;
const H = 11;
const ME: Slot = 2;

/** A six-seat 19×11 map where `owners` maps "x,y" to the plot's owner. */
function map(owners: Record<string, Slot>): MapTile[] {
  const tiles: MapTile[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) tiles.push({ x, y, terrain: 'plains', owner: owners[`${x},${y}`] ?? null });
  }
  return tiles;
}

function mine(...plots: [number, number][]): Record<string, Slot> {
  return Object.fromEntries(plots.map(([x, y]) => [`${x},${y}`, ME]));
}

function expectInsideMap(box: { scale: number; x: number; y: number }) {
  expect(Number.isFinite(box.scale)).toBe(true);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + W / box.scale).toBeLessThanOrEqual(W + 1e-9);
  expect(box.y + H / box.scale).toBeLessThanOrEqual(H + 1e-9);
}

describe("T-AC-8: zoomBox for RULE-4's examples", () => {
  it('T-AC-8: frames a 4×2 block as a 6×4 box grown to the map shape, at scale 2.75', () => {
    const box = zoomBox(map(mine([5, 3], [6, 3], [7, 3], [8, 3], [5, 4], [6, 4], [7, 4], [8, 4])), W, H, ME);

    expect(box).not.toBeNull();
    expect(box!.scale).toBeCloseTo(2.75, 5);
    // The 6×4 box spans x 4..10, y 2..6; the view is 19/2.75 wide, centred on it.
    expect(box!.x).toBeCloseTo(7 - W / 2.75 / 2, 5);
    expect(box!.y).toBeCloseTo(2, 5);
    expectInsideMap(box!);
  });

  it('T-AC-8: clips the box at the top-left corner and keeps the view inside the map', () => {
    const box = zoomBox(map(mine([0, 0], [1, 0])), W, H, ME);

    expect(box).not.toBeNull();
    expect(box!.scale).toBeCloseTo(5.5, 5);
    expect(box!.x).toBeCloseTo(0, 5);
    expect(box!.y).toBeCloseTo(0, 5);
    expectInsideMap(box!);
  });

  it('T-AC-8: clips the box at the bottom-right corner and keeps the view inside the map', () => {
    const box = zoomBox(map(mine([18, 10])), W, H, ME);

    expect(box).not.toBeNull();
    expect(box!.scale).toBeCloseTo(5.5, 5);
    expect(box!.x).toBeCloseTo(W - W / 5.5, 5);
    expect(box!.y).toBeCloseTo(H - 2, 5);
    expectInsideMap(box!);
  });

  it('T-AC-8: frames a single plot as a 3×3 box grown to the map shape', () => {
    const box = zoomBox(map(mine([9, 5])), W, H, ME);

    expect(box).not.toBeNull();
    expect(box!.scale).toBeCloseTo(11 / 3, 5);
    expect(box!.x).toBeCloseTo(9.5 - W / (11 / 3) / 2, 5);
    expect(box!.y).toBeCloseTo(4, 5);
    expectInsideMap(box!);
  });

  it('T-AC-8: ignores plots owned by other players', () => {
    const owners: Record<string, Slot> = { ...mine([9, 5]), '0,0': 0, '18,10': 5, '3,8': 1 };

    expect(zoomBox(map(owners), W, H, ME)).toEqual(zoomBox(map(mine([9, 5])), W, H, ME));
  });

  it('T-AC-8: returns null when you own no plots', () => {
    expect(zoomBox(map({}), W, H, ME)).toBeNull();
    expect(zoomBox(map({ '4,4': 0, '5,5': 3 }), W, H, ME)).toBeNull();
  });
});
