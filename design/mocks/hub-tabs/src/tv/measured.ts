import type { TvFocus } from './world';

/**
 * TV-FIT, measured 8 Nov with the real TvBody / FitHeight (its data-fit) on /src/tv/solo.html at 1280 × 720. The floor is
 * 0.7 (rulebook #tv-fit). `market`: a full six-row market and MULEs in the corral (solo's &market=1; the phone side's
 * view had none), at 2, 4 and 6 seats (world.ts `seats`); `fixture`: the world as it is, four seats, no market.
 * Solo's stand-in worlds hold, from 'deal-broken' on, a card Ossa · AI broke this month, its line first in the news.
 *
 * The TV as ruled (layout B as the base, a break or call an 8 s moment over the map box, the waiting box without chips).
 * 'deal-broken' and 'overrule-called' were measured twice on one page, at 1.5 s (the moment) and at 9.5 s (folded): the
 * same scale both times, every row; the moment is out of flow. Their number below is both.
 */
export const TV_FLOOR = 0.7;

type Row = { market: { 2: number; 4: number; 6: number }; fixture: number };
export const TV_FIT: Record<TvFocus, Row> = {
  planning: { market: { 2: 0.896, 4: 0.711, 6: 0.662 }, fixture: 0.85 },
  'deal-offered': { market: { 2: 0.896, 4: 0.711, 6: 0.662 }, fixture: 0.85 },
  'deal-broken': { market: { 2: 0.896, 4: 0.711, 6: 0.662 }, fixture: 0.85 },
  'budget-set': { market: { 2: 0.857, 4: 0.678, 6: 0.631 }, fixture: 0.81 },
  'overrule-called': { market: { 2: 0.896, 4: 0.711, 6: 0.662 }, fixture: 0.85 },
  'overrule-reveal': { market: { 2: 1, 4: 0.953, 6: 0.953 }, fixture: 0.953 },
  guarding: { market: { 2: 0.857, 4: 0.678, 6: 0.631 }, fixture: 0.81 },
  waiting: { market: { 2: 0.857, 4: 0.631, 6: 0.59 }, fixture: 0.81 },
  'month-end': { market: { 2: 0.826, 4: 0.708, 6: 0.768 }, fixture: 0.708 },
};

/**
 * What binds where a steady state falls under the floor with a market (scratch experiments, each restored):
 *   - the side column, not the header: waiting box + two market rows + the kept news line + the ready list run past
 *     the map column. Trunk's planning alone (no slice change) measures 0.733 at 4 seats and 0.686 at 6.
 *   - the ready list's reputation chips (h-8, taller than the name's line): 0.733 → 0.711 at 4 seats, 0.686 → 0.662 at 6.
 *   - a moved budget share: the "(was N%)" parts wrap the promise row's right side to two lines: 0.711 → 0.678 at 4
 *     seats (without them, budget-set measures 0.711).
 *   - waiting: trunk's "Lena, the host, can continue without them." under the waiting box: 0.678 → 0.631.
 */

/** The superseded placement A (banner and budget line stacked under the header), kept as WS4's and the PM's evidence. */
export const TV_FIT_A: Partial<Record<TvFocus, { fixture: number; market: number }>> = {
  planning: { fixture: 0.768, market: 0.643 },
  'deal-broken': { fixture: 0.544, market: 0.456 },
  'budget-set': { fixture: 0.544, market: 0.456 },
  'overrule-called': { fixture: 0.544, market: 0.381 },
  waiting: { fixture: 0.516, market: 0.359 },
};
