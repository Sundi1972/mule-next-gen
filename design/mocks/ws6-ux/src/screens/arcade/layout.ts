import { HALL } from './sim';

/**
 * The landscape phone's geometry, in the screen's pixels, for the two phones the audits measure: 844 × 390 (the e2e
 * harness's PhoneFrame, 842 × 388 inside its 1 px border) and 667 × 375 (the small-phone audit, 665 × 373 inside).
 * Pure, so the drawing and the overlap measure read the same boxes.
 *
 * - The map fits by height (15 × 9). At 844 the side room either side (98 px) holds the status; at 667 it is 22 px,
 *   under SIDE_MIN, so the status lies over the map's top edge in a bar (spec C11), in the widest run of row 0 with no
 *   plot of yours and no target on it.
 * - The hall fills the height at 844. At 667 (the stick and the button smaller there, 104 and 150 × 80) it is sized
 *   and placed so the works' first bay (9 % across) starts right of the stick and the pub (91 %) ends left of the
 *   button, now that every room is open (AM-9); the left door then ends above the stick.
 * - The stick and the button lie over the bottom corners; the second choice (V-3, V-5) is a line above the button.
 */
export type PhoneSize = 844 | 667;
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const FRAMES: Record<PhoneSize, { outerW: number; outerH: number; w: number; h: number }> = {
  844: { outerW: 844, outerH: 390, w: 842, h: 388 },
  667: { outerW: 667, outerH: 375, w: 665, h: 373 },
};
/** Below this, the side room is too narrow for the status: it goes over the map's top edge. */
export const SIDE_MIN = 90;

export interface PhoneLayout {
  size: PhoneSize;
  small: boolean;
  w: number;
  h: number;
  /** Where the map, or the hall, is drawn. */
  stage: Box;
  /** Pixels per map plot, or per hall unit. */
  cell: number;
  mode: 'side' | 'top';
  left: Box | null;
  right: Box | null;
  stick: Box;
  button: Box;
  alt: Box;
  /** The scramble's banner and the guide's note may use this box (they are only as big as their words). */
  banner: Box;
}

export function phoneLayout(size: PhoneSize, space: 'map' | 'hall', cols = 15, rows = 9): PhoneLayout {
  const f = FRAMES[size];
  const small = size === 667;
  const stick = small ? { x: 8, y: f.h - 6 - 104, w: 104, h: 104 } : { x: 12, y: f.h - 12 - 128, w: 128, h: 128 };
  const button = small ? { x: f.w - 8 - 150, y: f.h - 6 - 80, w: 150, h: 80 } : { x: f.w - 12 - 168, y: f.h - 12 - 88, w: 168, h: 88 };
  const alt = small ? { x: button.x, y: button.y - 5 - 36, w: button.w, h: 36 } : { x: button.x, y: button.y - 6 - 42, w: button.w, h: 42 };
  const base = { size, small, w: f.w, h: f.h, stick, button, alt };
  if (space === 'map') {
    const cell = f.h / rows;
    const mapW = cell * cols;
    const side = (f.w - mapW) / 2;
    const mode = side >= SIDE_MIN ? 'side' : 'top';
    const bx0 = stick.x + stick.w + 8;
    return {
      ...base,
      stage: { x: side, y: 0, w: mapW, h: f.h },
      cell,
      mode,
      left: mode === 'side' ? { x: 0, y: 0, w: side, h: stick.y - 6 } : null,
      right: mode === 'side' ? { x: side + mapW, y: 0, w: f.w - side - mapW, h: alt.y - 6 } : null,
      banner: { x: bx0, y: f.h - cell * 1.45, w: button.x - 8 - bx0, h: cell * 1.45 - 4 },
    };
  }
  const fullW = (f.h * HALL.w) / HALL.h;
  const from = stick.x + stick.w + 2;
  const to = button.x - 2;
  const hallW = small ? Math.min(fullW, (to - from) / 0.82) : fullW;
  const hallH = (hallW * HALL.h) / HALL.w;
  const x = small ? from - 0.09 * hallW : (f.w - hallW) / 2;
  const y = (f.h - hallH) / 2;
  return {
    ...base,
    stage: { x, y, w: hallW, h: hallH },
    cell: hallW / HALL.w,
    mode: 'side',
    left: { x: 0, y: 0, w: x, h: stick.y - 6 },
    right: { x: x + hallW, y: 0, w: f.w - x - hallW, h: button.y - 6 },
    banner: { x: x + 0.09 * hallW, y: y + 0.405 * hallH, w: 0.82 * hallW, h: 0.18 * hallH },
  };
}

/** The widest run of row 0's plots with none of `blocked` on it, as [first, last] column. */
export function freeRun(cols: number, blocked: number[]): [number, number] {
  let best: [number, number] = [0, -1];
  let start = 0;
  for (let c = 0; c <= cols; c++) {
    if (c === cols || blocked.includes(c)) {
      if (c - 1 - start > best[1] - best[0]) best = [start, c - 1];
      start = c + 1;
    }
  }
  return best;
}

export const css = (b: Box) => ({ left: b.x, top: b.y, width: b.w, height: b.h });
