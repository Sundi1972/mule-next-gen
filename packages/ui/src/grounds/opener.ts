/** RULE-6: the month-end grounds opener's length (spec C5, AM-6). */

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
