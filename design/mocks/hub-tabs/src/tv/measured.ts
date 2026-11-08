import type { TvFocus } from './world';

/**
 * TV-FIT, measured 8 Nov with the real TvBody / FitHeight (its data-fit), on /src/tv/solo.html at 1280 × 720, four seats.
 * The floor is 0.7 (rulebook #tv-fit). `fixture`: the phone side's world as it is, whose view has no market (aMuleView's
 * empty one). `market`: the same with a full six-row market, as the game draws it (solo's &market=1): the honest number
 * for the build. A and B: the planning placements (variant.tsx). The overrule reveal and the month end have no B.
 */
export const TV_FLOOR = 0.7;

type Fit = { a: number; b: number };
export const TV_FIT: Record<TvFocus, { fixture: Fit; market: Fit }> = {
  planning: { fixture: { a: 0.768, b: 0.85 }, market: { a: 0.643, b: 0.711 } },
  'deal-offered': { fixture: { a: 0.768, b: 0.85 }, market: { a: 0.643, b: 0.711 } },
  'deal-broken': { fixture: { a: 0.544, b: 0.81 }, market: { a: 0.456, b: 0.594 } },
  'budget-set': { fixture: { a: 0.544, b: 0.772 }, market: { a: 0.456, b: 0.567 } },
  'overrule-called': { fixture: { a: 0.544, b: 0.674 }, market: { a: 0.381, b: 0.487 } },
  'overrule-reveal': { fixture: { a: 0.953, b: 0.953 }, market: { a: 0.953, b: 0.953 } },
  guarding: { fixture: { a: 0.544, b: 0.674 }, market: { a: 0.381, b: 0.487 } },
  waiting: { fixture: { a: 0.516, b: 0.628 }, market: { a: 0.359, b: 0.462 } },
  'month-end': { fixture: { a: 0.708, b: 0.708 }, market: { a: 0.708, b: 0.708 } },
};
