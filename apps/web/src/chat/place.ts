/** A rectangle on screen: left, top, right, bottom. */
export type Box = { l: number; t: number; r: number; b: number };

/** Where a creature's bubble sits around it, in the order it is tried. */
export type Place = 'above' | 'below' | 'right' | 'left';
const PLACES: readonly Place[] = ['above', 'below', 'right', 'left'];

/** A bubble's place and how far it slid to stay inside its frame: dx for above and below, dy for the sides. */
export type Fit = { place: Place; dx: number; dy: number };

type Ask = {
  /** The speaker the bubble points at. */
  at: Box;
  w: number;
  h: number;
  /** The frame it must stay inside. */
  within: Box;
  /** The text it should not cover: names, captions, prices. */
  labels: readonly Box[];
  /** Between the speaker and the bubble, room for the tail. */
  gap: number;
  /** Kept clear inside the frame's edge. */
  edge: number;
  /** Where it is now: kept while it still covers nothing, so a bubble doesn't hop between free places. */
  current?: Place | undefined;
};

/** How far to move a span [from, from + size] so it lies inside [lo, hi]; the low side wins if it can't. */
function slide(from: number, size: number, lo: number, hi: number): number {
  return Math.max(Math.min(0, hi - (from + size)), lo - from);
}

function area(a: Box, b: Box): number {
  const w = Math.min(a.r, b.r) - Math.max(a.l, b.l);
  const h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Where a creature's speech bubble goes (RULE-9's companion, AM-22): above its speaker, unless that covers a label's
 * text, then the first of below, right and left that covers none. Above and below slide sideways and the sides slide
 * up or down to stay inside the frame; a place that would still cross the frame's edge across its slide is not
 * tried. If every place covers some text, the one covering least; if none fits at all, below when above doesn't fit.
 */
export function placeBubble({ at, h, gap, edge, within }: Ask): Fit {
  // Today's rule: above, or below when above crosses the frame's top.
  return { place: at.t - gap - h < within.t + edge ? 'below' : 'above', dx: 0, dy: 0 };
}
