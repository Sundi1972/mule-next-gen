import { describe, expect, it } from 'vitest';
import { placeBubble, type Box } from '../src/chat/place';

/**
 * T-AC-15 (serves B-AC-18, AM-22): where a creature's speech bubble goes. Above its speaker by default; where that
 * covers a label's text (a name in a list, a line's caption), the first of below, right and left that covers none,
 * inside its frame. Geometry from WS4's TV couch read on trunk (1920×1080, tv-3-landgrant.png and tv-6-auction-walking.png).
 */
const box = (l: number, t: number, r: number, b: number): Box => ({ l, t, r, b });
const GAP = 8;
const EDGE = 4;
const SCREEN = box(0, 0, 1920, 1080);

describe('T-AC-15: a bubble covers no label when a free place exists', () => {
  it('the land grant: the Baron’s bubble went over “The Accountant” in the plot list; it goes below the Baron instead', () => {
    const names = [box(1197, 642, 1276, 672), box(1197, 696, 1430, 726), box(1197, 750, 1343, 780)];
    const plots = [box(1745, 642, 1860, 672), box(1745, 696, 1860, 726), box(1745, 750, 1860, 780)];
    const help = box(1146, 878, 1800, 1015);
    const fit = placeBubble({ at: box(1148, 752, 1176, 780), w: 360, h: 44, within: SCREEN, labels: [...names, ...plots, help], gap: GAP, edge: EDGE });
    expect(fit.place).toBe('below');
  });

  it('the auction walk: above covers the gap’s “10 APART”, below the units and the names row, right leaves the board; it goes left', () => {
    const board = box(62, 340, 1372, 1030);
    const labels = [
      box(1050, 748, 1197, 790), // 10 APART
      box(1065, 860, 1115, 925), // the Baron's BID 24
      box(968, 940, 1055, 968), // 2 (-1)
      box(955, 988, 1130, 1015), // The Baron ✓, the names row
      box(1265, 722, 1366, 780), // STORE BUYS 30
      box(118, 735, 148, 760), // the price axis
      box(118, 855, 152, 905),
    ];
    const fit = placeBubble({ at: box(970, 848, 1052, 932), w: 432, h: 56, within: board, labels, gap: GAP, edge: EDGE });
    expect(fit.place).toBe('left');
    expect(fit.dx).toBe(0);
  });

  it('a long line beside the plot list: every side meets text centred, so it slides down off the map’s “STORE”', () => {
    // Measured in Chromium (the chat e2e): a three-line bubble beside the middle row, the map's STORE label to its left.
    const store = box(553.5, 620.2, 616.5, 647.2);
    const labels = [store, box(1197, 589.5, 1266.5, 628.5), box(1197, 643.5, 1240.8, 682.5), box(1197, 697.5, 1429.8, 736.5), box(1146, 873, 1801.3, 919.5)];
    const fit = placeBubble({ at: box(1146, 700.5, 1179, 733.5), w: 540, h: 141.75, within: SCREEN, labels, gap: GAP, edge: EDGE });
    expect(fit.place).toBe('left');
    for (const l of labels) expect(fit.box.t >= l.b || fit.box.b <= l.t || fit.box.l >= l.r || fit.box.r <= l.l, JSON.stringify(l)).toBe(true);
    // The tail, at the speaker's middle, is still on the bubble's side.
    expect(fit.box.t + 14).toBeLessThanOrEqual(717);
  });

  it('nothing to avoid: above, as before', () => {
    expect(placeBubble({ at: box(500, 500, 540, 540), w: 200, h: 40, within: SCREEN, labels: [], gap: GAP, edge: EDGE }).place).toBe('above');
  });

  it('no room above (the frame’s top): below, as before', () => {
    expect(placeBubble({ at: box(500, 20, 540, 60), w: 200, h: 40, within: SCREEN, labels: [], gap: GAP, edge: EDGE }).place).toBe('below');
  });

  it('near the frame’s right edge, above slides left to stay inside, its tail still at the speaker', () => {
    const fit = placeBubble({ at: box(1880, 500, 1910, 540), w: 200, h: 40, within: SCREEN, labels: [], gap: GAP, edge: EDGE });
    expect(fit.place).toBe('above');
    expect(fit.dx).toBe(1920 - EDGE - (1895 + 100));
  });

  it('a side bubble near the frame’s bottom slides up to stay inside', () => {
    const labels = [box(900, 0, 1145, 1035)]; // text above it and to its left; no room below
    const fit = placeBubble({ at: box(1100, 1040, 1140, 1076), w: 200, h: 60, within: SCREEN, labels, gap: GAP, edge: EDGE });
    expect(fit.place).toBe('right');
    expect(fit.dy).toBe(1080 - EDGE - (1058 + 30));
  });

  it('every place covers some text: the one that covers least', () => {
    const at = box(500, 500, 540, 540);
    const labels = [box(0, 0, 1920, 495), box(0, 545, 1920, 1080), box(545, 495, 1920, 545), box(300, 520, 492, 545)];
    // Above and below are fully covered; right is too; left is half covered.
    expect(placeBubble({ at, w: 200, h: 40, within: SCREEN, labels, gap: GAP, edge: EDGE }).place).toBe('left');
  });

  it('stays where it is while that still covers nothing (no hopping between free places)', () => {
    const at = box(500, 500, 540, 540);
    expect(placeBubble({ at, w: 200, h: 40, within: SCREEN, labels: [], gap: GAP, edge: EDGE, current: 'left' }).place).toBe('left');
  });
});
