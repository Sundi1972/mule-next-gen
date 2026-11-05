/**
 * What a creature's bubble must stay inside: the nearest of these around it. A stage that clips its creatures marks
 * itself with data-bubble-bounds.
 */
export const BOUNDS = '[data-bubble-bounds],[data-testid=store-hall],[data-testid=walk-board],[data-testid=stage],[data-phase]';
/** Kept clear inside the frame's edge, in screen px. */
export const EDGE = 4;
/** Between a speaker and its bubble, in css px: room for the tail. */
export const GAP = 8;

/** A rectangle on screen: left, top, right, bottom. */
export type Box = { l: number; t: number; r: number; b: number };

/** Where a creature's bubble sits around it, in the order it is tried. */
export type Place = 'above' | 'below' | 'right' | 'left';
const PLACES: readonly Place[] = ['above', 'below', 'right', 'left'];

/** A bubble's place and how far it slid from centred on its speaker: dx for above and below, dy for the sides. */
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
  /** Where it is now: kept while it can still cover nothing there, so a bubble doesn't hop between free places. */
  current?: Place | undefined;
};

/** How far the tail stays from the bubble's corners when it slides. */
const TAIL_ROOM = 14;

function area(a: Box, b: Box): number {
  const w = Math.min(a.r, b.r) - Math.max(a.l, b.l);
  const h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
  return w > 0 && h > 0 ? w * h : 0;
}

/** `moved`: how far it slid to clear a label, past what the frame's edge asked. */
type Option = Fit & { box: Box; covers: number; moved: number };

/**
 * One place's options: centred on the speaker, then slid along its side just clear of each label in its way, never
 * so far the tail leaves the bubble (unless `loose`), and never across the frame's edge. None if it can't stay inside.
 */
function options(place: Place, { at, w, h, within, labels, gap, edge }: Ask, loose = false): Option[] {
  const side = place === 'left' || place === 'right';
  const l0 = side ? (place === 'right' ? at.r + gap : at.l - gap - w) : (at.l + at.r) / 2 - w / 2;
  const t0 = side ? (at.t + at.b) / 2 - h / 2 : place === 'above' ? at.t - gap - h : at.b + gap;
  // The slide that keeps it inside the frame along its side, and as far as the tail allows.
  const lo = side ? within.t + edge - t0 : within.l + edge - l0;
  const hi = side ? within.b - edge - (t0 + h) : within.r - edge - (l0 + w);
  const reach = loose ? Infinity : Math.max(0, (side ? h : w) / 2 - TAIL_ROOM);
  const from = Math.max(lo, -reach);
  const to = Math.min(hi, reach);
  // Across its side, sliding can't help.
  const across = side ? l0 < within.l + edge - 0.5 || l0 + w > within.r - edge + 0.5 : t0 < within.t + edge - 0.5 || t0 + h > within.b - edge + 0.5;
  if (across || from > to + 0.5) return [];
  const centred = Math.min(Math.max(0, from), to);
  const box = (s: number): Box => (side ? { l: l0, t: t0 + s, r: l0 + w, b: t0 + s + h } : { l: l0 + s, t: t0, r: l0 + s + w, b: t0 + h });
  // Every label in the band it can slide through: just past its near or far edge, which finds the gaps between them.
  const band = side ? { l: l0, t: t0 + from, r: l0 + w, b: t0 + to + h } : { l: l0 + from, t: t0, r: l0 + to + w, b: t0 + h };
  const slides = [centred];
  for (const label of labels) {
    if (area(band, label) === 0) continue;
    if (side) slides.push(label.b + 1 - t0, label.t - 1 - (t0 + h));
    else slides.push(label.r + 1 - l0, label.l - 1 - (l0 + w));
  }
  return slides
    .filter((s) => s >= from - 0.5 && s <= to + 0.5)
    .map((s) => {
      const b = box(s);
      return { place, dx: side ? 0 : s, dy: side ? s : 0, box: b, covers: labels.reduce((sum, label) => sum + area(b, label), 0), moved: Math.abs(s - centred) };
    });
}

/**
 * Where a creature's speech bubble goes (AM-22): the place around its speaker that covers no label's text and slides
 * least to do it, above first, then below, right and left on a tie; so above, as before, wherever above is free. Every
 * place slides along its side to stay inside the frame, and may slide on to clear a label, never so far its tail
 * leaves it. While its place stays free it stays. If no option is free, the one covering least; if none stays inside
 * the frame, above, or below where above crosses the top.
 */
export function placeBubble(ask: Ask): Fit & { box: Box; covers: number } {
  const tight = PLACES.flatMap((place) => options(place, ask));
  // Near a narrow frame's edge no place may keep its tail on the bubble: then staying inside the frame comes first.
  const all = tight.length > 0 ? tight : PLACES.flatMap((place) => options(place, ask, true));
  const free = all.filter((o) => o.covers === 0).sort((a, b) => a.moved - b.moved);
  const pick = free.find((o) => o.place === ask.current) ?? free[0] ?? leastCovering(all, ask.current);
  if (pick) return { place: pick.place, dx: pick.dx, dy: pick.dy, box: pick.box, covers: pick.covers };
  // A frame narrower than the bubble: above (or below at the top), slid as far inside as it goes.
  const { at, w, h, gap, edge, within } = ask;
  const above = at.t - gap - h >= within.t + edge;
  const l0 = (at.l + at.r) / 2 - w / 2;
  const dx = Math.max(Math.min(0, within.r - edge - (l0 + w)), within.l + edge - l0);
  const t = above ? at.t - gap - h : at.b + gap;
  const box = { l: l0 + dx, t, r: l0 + dx + w, b: t + h };
  return { place: above ? 'above' : 'below', dx, dy: 0, box, covers: ask.labels.reduce((sum, label) => sum + area(box, label), 0) };
}

/** Crowded: the option covering least, but the current place while it covers within about 5 % of that, so it doesn't flicker. */
function leastCovering(all: readonly Option[], current: Place | undefined): Option | undefined {
  const least = all.reduce<Option | undefined>((a, b) => (a === undefined || b.covers < a.covers ? b : a), undefined);
  if (!least) return undefined;
  const near = all.filter((o) => o.place === current && o.covers <= least.covers * 1.05 + 1).sort((a, b) => a.covers - b.covers)[0];
  return near ?? least;
}
