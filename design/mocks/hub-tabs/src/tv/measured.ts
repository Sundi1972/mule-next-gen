/**
 * TV-FIT, measured 8 Nov with the real TvBody / FitHeight (its data-fit) on /src/tv/solo.html?beat=, at 1280 × 720:
 * the guided path's own worlds (steps.ts at 83385f8d: the fixture's market of six goods, 5 MULEs at 148 cr, Ossa · AI's
 * break this month from beat 1.3 on), at 2, 4 and 6 seats (world.ts `seats`; 2 = Ossa · AI and Brix). The floor is 0.7
 * (rulebook #tv-fit). The TV as ruled: the budget on the promise row with no "(was N%)" and a moved share marked ▲/▼
 * (slice 5 AM-9), a break or a call an 8 s moment over the map box, the break folded into the news, the call on the
 * promise row, the waiting box without chips and none above TV_WAITING_BOX_MAX_SEATS (the host's line then the ready
 * list's foot).
 */
export const TV_FLOOR = 0.7;

type BySeats = { 2: number; 4: number; 6: number };

/** Steady states, by the beat measured. Under the floor: waiting at 4 seats (box + host line), 0.662. */
export const TV_FIT: Record<string, { beat: string; fit: BySeats }> = {
  planningBeforeBreak: { beat: '1-head', fit: { 2: 0.835, 4: 0.711, 6: 0.793 } },
  /** Every planning beat from 2.1 on: the break folded into the news. */
  breakFolded: { beat: '2-look', fit: { 2: 0.835, 4: 0.711, 6: 0.793 } },
  budgetUnset: { beat: '4-budget-a', fit: { 2: 0.835, 4: 0.711, 6: 0.793 } },
  /** 4.4: Brix's budget set this month, the moved shares marked ▲/▼. */
  budgetSet: { beat: '4-commission', fit: { 2: 0.835, 4: 0.711, 6: 0.793 } },
  guarding: { beat: '6-guard', fit: { 2: 0.835, 4: 0.711, 6: 0.793 } },
  /** 2 and 4 seats: the box with the host's line; 6: no box, the host's line at the ready list's foot. */
  waiting: { beat: '8-waiting', fit: { 2: 0.835, 4: 0.662, 6: 0.727 } },
  /** 5.2 after the Call tap (solo &call=1): "Overrule called: tax frozen", where the budget was. */
  callFolded: { beat: '5-call', fit: { 2: 0.835, 4: 0.711, 6: 0.793 } },
  overruleBallot: { beat: '5-ballot', fit: { 2: 0.908, 4: 0.894, 6: 0.88 } },
  overruleReveal: { beat: '5-reveal', fit: { 2: 0.953, 4: 0.953, 6: 0.953 } },
  monthEnd: { beat: '9-month-end', fit: { 2: 0.78, 4: 0.708, 6: 0.768 } },
};

/** The moved-share mark, AM-9: ▲/▼ with the accent colour vs the colour alone, same beats. Equal: the arrow is built. */
export const TV_FIT_SHARE_MARK: Record<'arrow' | 'styleOnly', { budgetSet: BySeats; guarding: BySeats }> = {
  arrow: { budgetSet: { 2: 0.835, 4: 0.711, 6: 0.793 }, guarding: { 2: 0.835, 4: 0.711, 6: 0.793 } },
  styleOnly: { budgetSet: { 2: 0.835, 4: 0.711, 6: 0.793 }, guarding: { 2: 0.835, 4: 0.711, 6: 0.793 } },
};

/**
 * Moment vs steady, one page read at 1.5 s (the moment) and at 9.5 s (folded): equal at every size, the moment out of
 * flow. Break: beat 1.3 ('deal-broken'). Call: beat 5.2 with the call made (&call=1). [moment, steady].
 */
export const TV_MOMENT_VS_STEADY: Record<'break' | 'call', Record<keyof BySeats, [number, number]>> = {
  break: { 2: [0.835, 0.835], 4: [0.711, 0.711], 6: [0.793, 0.793] },
  call: { 2: [0.835, 0.835], 4: [0.711, 0.711], 6: [0.793, 0.793] },
};

/**
 * What binds where it is still under the floor: waiting at 4 seats keeps its box (TV_WAITING_BOX_MAX_SEATS) and the
 * host's line inside it, over a side column the market already fills; the same line as the list's foot at 6 seats
 * costs 0.793 → 0.727 and holds.
 *
 * Before the PM's 8 Nov rulings (options 1 and 2; the chips in planning stay), the same beats measured, 2 / 4 / 6:
 * planning and the folded break 0.796 / 0.678 / 0.631, budget unset and the folded call 0.835 / 0.711 / 0.662, waiting
 * 0.796 / 0.631 / 0.590. Trunk's planning alone with a market: 0.733 at 4 seats, 0.686 at 6.
 */

/** The superseded placement A (banner and budget line stacked under the header), kept as WS4's and the PM's evidence. */
export const TV_FIT_A: Record<string, { fixture: number; market: number }> = {
  planning: { fixture: 0.768, market: 0.643 },
  'deal-broken': { fixture: 0.544, market: 0.456 },
  'budget-set': { fixture: 0.544, market: 0.456 },
  'overrule-called': { fixture: 0.544, market: 0.381 },
  waiting: { fixture: 0.516, market: 0.359 },
};
