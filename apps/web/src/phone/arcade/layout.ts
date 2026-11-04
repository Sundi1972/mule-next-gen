import { HALL } from '@mule/engine';

/**
 * The landscape phone's geometry, in the screen's pixels (the arcade mock's layout.ts at d30ae057), for the frame the
 * phone has: the two the audits measure are 844 × 390 (the e2e harness's PhoneFrame, 842 × 388 inside its 1 px
 * border) and 667 × 375 (the small-phone audit, 665 × 373 inside). Pure, so the drawing and the overlap measure read
 * the same boxes.
 *
 * - The map fits by height. At 844 the side room either side (98 px) holds the status; at 667 it is 22 px, under
 *   SIDE_MIN, so the status lies over the map's top edge in a bar (spec C11), in the widest run of row 0 with no plot
 *   of yours and no target on it.
 * - The hall fills the height at 844. At 667 (the stick and the button smaller there, 104 and 150 × 80) it is sized
 *   and placed so the works' first bay (9 % across) starts right of the stick and the pub (91 %) ends left of the
 *   button; the left door then ends above the stick.
 * - The stick and the button lie over the bottom corners.
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
/** A frame narrower than this is laid out as the small phone: between the two the audits measure (665 and 842). */
const SMALL_UNDER = 760;
/** The hall's rooms run from 9 % to 91 % across (Store.tsx's X0 and X1): the share the small phone fits between its controls. */
const ROOMS_FROM = 0.09;
const ROOMS_SHARE = 0.82;

export interface PhoneLayout {
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
  /** The guide's note may use this box (it is only as big as its words). */
  banner: Box;
}

export function phoneLayout(frame: { w: number; h: number }, space: 'map' | 'hall', cols = 15, rows = 9): PhoneLayout {
  const f = frame;
  const small = f.w < SMALL_UNDER;
  const stick = small ? { x: 8, y: f.h - 6 - 104, w: 104, h: 104 } : { x: 12, y: f.h - 12 - 128, w: 128, h: 128 };
  const button = small ? { x: f.w - 8 - 150, y: f.h - 6 - 80, w: 150, h: 80 } : { x: f.w - 12 - 168, y: f.h - 12 - 88, w: 168, h: 88 };
  const base = { small, w: f.w, h: f.h, stick, button };
  if (space === 'map') {
    const cell = Math.min(f.h / rows, f.w / cols);
    const mapW = cell * cols;
    const mapH = cell * rows;
    const side = (f.w - mapW) / 2;
    const mode = side >= SIDE_MIN ? 'side' : 'top';
    const bx0 = stick.x + stick.w + 8;
    return {
      ...base,
      stage: { x: side, y: (f.h - mapH) / 2, w: mapW, h: mapH },
      cell,
      mode,
      left: mode === 'side' ? { x: 0, y: 0, w: side, h: stick.y - 6 } : null,
      right: mode === 'side' ? { x: side + mapW, y: 0, w: f.w - side - mapW, h: button.y - 6 } : null,
      banner: { x: bx0, y: f.h - cell * 1.45, w: button.x - 8 - bx0, h: cell * 1.45 - 4 },
    };
  }
  const fullW = (f.h * HALL.w) / HALL.h;
  const from = stick.x + stick.w + 2;
  const to = button.x - 2;
  const hallW = small ? Math.min(fullW, (to - from) / ROOMS_SHARE) : Math.min(fullW, f.w);
  const hallH = (hallW * HALL.h) / HALL.w;
  const x = small ? from - ROOMS_FROM * hallW : (f.w - hallW) / 2;
  const y = (f.h - hallH) / 2;
  return {
    ...base,
    stage: { x, y, w: hallW, h: hallH },
    cell: hallW / HALL.w,
    mode: 'side',
    left: { x: 0, y: 0, w: x, h: stick.y - 6 },
    right: { x: x + hallW, y: 0, w: f.w - x - hallW, h: button.y - 6 },
    banner: { x: x + ROOMS_FROM * hallW, y: y + 0.405 * hallH, w: ROOMS_SHARE * hallW, h: 0.18 * hallH },
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

/** How many square pixels two boxes share. */
export function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export const css = (b: Box) => ({ left: b.x, top: b.y, width: b.w, height: b.h });
