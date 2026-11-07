/** RULE-6: the month-end grounds opener's length (spec C5, AM-6). */

export interface Opener {
  kind: 'full' | 'still';
  ms: number;
}

export function openerOf(_at: { changed: boolean; reduced: boolean; politics: boolean }): Opener | null {
  throw new Error('NotImplemented: openerOf');
}
