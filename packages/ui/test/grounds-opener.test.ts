import { describe, expect, it } from 'vitest';
import { openerOf, type Opener } from '../src/grounds/opener';

describe('T-AC-8: RULE-6, the month-end opener’s length', () => {
  it.each<[string, { changed: boolean; reduced: boolean; politics: boolean }, Opener | null]>([
    ['a changed month plays the full opener, 6 s', { changed: true, reduced: false, politics: true }, { kind: 'full', ms: 6_000 }],
    ['a quiet month shows a 3 s still', { changed: false, reduced: false, politics: true }, { kind: 'still', ms: 3_000 }],
    ['reduced motion shows a 3 s still, in a changed month too', { changed: true, reduced: true, politics: true }, { kind: 'still', ms: 3_000 }],
    ['reduced motion in a quiet month is the same still', { changed: false, reduced: true, politics: true }, { kind: 'still', ms: 3_000 }],
    ['politics off: no opener, whatever changed', { changed: true, reduced: false, politics: false }, null],
  ])('T-AC-8: %s', (_, at, opener) => {
    expect(openerOf(at)).toEqual(opener);
  });
});
