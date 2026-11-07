/** RULE-6: the month-end grounds opener's length, and the lean-in's path through it (spec C5, AM-6). */

export interface Opener {
  kind: 'full' | 'still';
  ms: number;
}

export const OPENER_MS = { full: 6_000, still: 3_000 } as const;

/** RULE-6: the full opener when RULE-5 found a change, else a still; none with politics off. */
export function openerOf({ changed, reduced, politics }: { changed: boolean; reduced: boolean; politics: boolean }): Opener | null {
  if (!politics) return null;
  return changed && !reduced ? { kind: 'full', ms: OPENER_MS.full } : { kind: 'still', ms: OPENER_MS.still };
}

/** Seconds into the full opener of the lean-in's moves, after the scaffold's month-end move (look/Living.tsx). */
const LEAN = { in: [0.6, 2.8], out: [4.0, 5.8] } as const;

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** How far the view leans in, 0..1, `seconds` into the full opener: in, a hold on the changed places, back out. */
export function leanAt(seconds: number): number {
  if (seconds < LEAN.out[0]) return ease((seconds - LEAN.in[0]) / (LEAN.in[1] - LEAN.in[0]));
  return 1 - ease((seconds - LEAN.out[0]) / (LEAN.out[1] - LEAN.out[0]));
}
