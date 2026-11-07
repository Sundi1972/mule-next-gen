/** The grounds' camera: the occupied extent on its plate, or without one the built area, filling the canvas as look.html's colony render does (AM-7 iv). */
import { centreOf, MASSING, type GridPlace } from './layout';
import type { GroundsManifest, PictureKind } from './pick';
import { iso, W } from './projection';

/** The camera for a full-screen canvas; without it the grounds keep their own framing. */
export interface Framing {
  /** The canvas's width over its height. */
  aspect: number;
  /** The places the view leans in on. */
  leanOn?: GridPlace[];
  /** 0 frames the built area, 1 the places leaned on. */
  lean?: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Room left round the built area, as a share of its size. */
const MARGIN = 0.05;
/** Ground left round the occupied extent: half a place each way, on screen. */
const ROOM = { x: W / 2, y: W / 4 };
/** How much closer the leaned-in view is: the scaffold's month-end move (look/Living.tsx, scale 1.55). */
const LEAN_ZOOM = 1.55;
/** Leaning in centres this high over the places' ground, in place units, so the buildings rather than their feet sit mid-screen. */
const LEAN_LIFT = 0.3;

/**
 * The highest a thing at (c, r) reaches on screen: its picture frame's top edge, or without art its SVG shape's roof.
 * The frame is what the picture can fill, so a tall kind (the Spaceport's rocket) is never cut.
 */
export function topOf(kind: PictureKind, c: number, r: number, manifest: GroundsManifest | null): number {
  const frame = manifest ? (manifest.pictures[kind]?.frame ?? manifest.frame) : null;
  const ground = iso(c, r)[1];
  return frame ? ground - (frame.centre[1] * W) / frame.place : iso(c, r, MASSING[kind].height)[1];
}

function toAspect({ x, y, w, h }: Box, aspect: number): Box {
  if (w / h < aspect) return { x: x - (h * aspect - w) / 2, y, w: h * aspect, h };
  return { x, y: y - (w / aspect - h) / 2, w, h: w / aspect };
}

/** The rings in use (`rings` out from the hall) from the highest top down to the plaza's front corner, at the canvas's aspect. */
function builtArea(rings: number, tops: number[], aspect: number): Box {
  const half = rings + 0.55;
  const top = Math.min(-half * (W / 2), ...tops);
  const bottom = half * (W / 2);
  const [w, h] = [2 * half * W, bottom - top];
  return toAspect({ x: -half * W - MARGIN * w, y: top - MARGIN * h, w: w * (1 + 2 * MARGIN), h: h * (1 + 2 * MARGIN) }, aspect);
}

/** The built area's box narrowed by LEAN_ZOOM round the places' middle, kept inside the built area. */
function leanedIn(area: Box, places: GridPlace[]): Box {
  const points = places.map((p) => {
    const { col, row } = centreOf(p);
    return iso(col, row, LEAN_LIFT);
  });
  const mx = points.reduce((s, [x]) => s + x, 0) / points.length;
  const my = points.reduce((s, [, y]) => s + y, 0) / points.length;
  const [w, h] = [area.w / LEAN_ZOOM, area.h / LEAN_ZOOM];
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return { x: clamp(mx - w / 2, area.x, area.x + area.w - w), y: clamp(my - h / 2, area.y, area.y + area.h - h), w, h };
}

/** The part of `area` a canvas of `aspect` shows: cropped round its centre, never padded. */
export function cropTo({ x, y, w, h }: Box, aspect: number): Box {
  if (w / h > aspect) return { x: x + (w - h * aspect) / 2, y, w: h * aspect, h };
  return { x, y: y + (h - w / aspect) / 2, w, h: w / aspect };
}

/**
 * The blocks' ground and each one's top, with ROOM round them. Footprints rather than picture frames: a flush picture's
 * frame reaches far past its building for the shadow, and would loosen the view.
 */
function occupied(blocks: GridPlace[], tops: number[]): Box {
  const corners = blocks.flatMap((block) => {
    const { col, row } = centreOf(block);
    const [dc, dr] = [block.w / 2, block.h / 2];
    return [iso(col - dc, row - dr), iso(col + dc, row - dr), iso(col + dc, row + dr), iso(col - dc, row + dr)];
  });
  const xs = corners.map(([x]) => x);
  const top = Math.min(...tops, ...corners.map(([, y]) => y)) - ROOM.y;
  const left = Math.min(...xs) - ROOM.x;
  return { x: left, y: top, w: Math.max(...xs) + ROOM.x - left, h: Math.max(...corners.map(([, y]) => y)) + ROOM.y - top };
}

/** `box` moved inside `plate`, shrunk round its centre first only if it is larger. */
function within(box: Box, plate: Box): Box {
  const k = Math.min(1, plate.w / box.w, plate.h / box.h);
  const [w, h] = [box.w * k, box.h * k];
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return { x: clamp(box.x + (box.w - w) / 2, plate.x, plate.x + plate.w - w), y: clamp(box.y + (box.h - h) / 2, plate.y, plate.y + plate.h - h), w, h };
}

/** The view before any lean-in: the occupied extent at the canvas's aspect inside the plate, or without one the built area. */
export function viewOf(aspect: number, rings: number, blocks: GridPlace[], tops: number[], plate: Box | null): Box {
  return plate ? within(toAspect(occupied(blocks, tops), aspect), plate) : builtArea(rings, tops, aspect);
}

/** Whether `view` stops short of the plate's edges, where the plate's own vignette fades it out. */
export function shortOfPlate(view: Box, plate: Box | null): boolean {
  return !!plate && view.w < cropTo(plate, view.w / view.h).w * (1 - 1e-9);
}

/** `area` eased towards the places leaned on as `lean` goes to 1. */
export function leaning(area: Box, { leanOn = [], lean = 0 }: Framing): Box {
  if (leanOn.length === 0 || lean <= 0) return area;
  const close = leanedIn(area, leanOn);
  const k = Math.min(1, lean);
  return { x: area.x + (close.x - area.x) * k, y: area.y + (close.y - area.y) * k, w: area.w + (close.w - area.w) * k, h: area.h + (close.h - area.h) * k };
}
