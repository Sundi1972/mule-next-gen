/**
 * TV-FIT, measured 8 Nov with the real TvBody / FitHeight (its data-fit) on /src/tv/solo.html?beat=, at 1280 × 720:
 * the guided path's own worlds (steps.ts at 83385f8d: the fixture's market of six goods, 5 MULEs at 148 cr, Ossa · AI's
 * break this month from beat 1.3 on), at 2, 4 and 6 seats (world.ts `seats`; 2 = Ossa · AI and Brix). The floor is 0.7
 * (rulebook #tv-fit). The TV as ruled: the budget on the promise row, a break or a call an 8 s moment over the map box,
 * the break folded into the news, the call on the promise row, the waiting box without chips.
 */
export const TV_FLOOR = 0.7;

type BySeats = { 2: number; 4: number; 6: number };

/** Steady states, by the beat measured. */
export const TV_FIT: Record<string, { beat: string; fit: BySeats }> = {
  /** 1.1–1.2, before the break; Brix's budget is set this month, so the row carries "(was N%)". */
  planningBeforeBreak: { beat: '1-head', fit: { 2: 0.796, 4: 0.678, 6: 0.631 } },
  /** Every planning beat from 2.1 on: the break folded into the news. */
  breakFolded: { beat: '2-look', fit: { 2: 0.796, 4: 0.678, 6: 0.631 } },
  /** 4.1–4.3: the tax and budget unset, so no "(was N%)" until Brix sets them. */
  budgetUnset: { beat: '4-budget-a', fit: { 2: 0.835, 4: 0.711, 6: 0.662 } },
  /** 4.4: the budget set this month. */
  budgetSet: { beat: '4-commission', fit: { 2: 0.796, 4: 0.678, 6: 0.631 } },
  guarding: { beat: '6-guard', fit: { 2: 0.796, 4: 0.678, 6: 0.631 } },
  waiting: { beat: '8-waiting', fit: { 2: 0.796, 4: 0.631, 6: 0.59 } },
  /** 5.2 after the Call tap (solo &call=1): the call folded to "Overrule called: tax frozen", where the budget was. */
  callFolded: { beat: '5-call', fit: { 2: 0.835, 4: 0.711, 6: 0.662 } },
  overruleBallot: { beat: '5-ballot', fit: { 2: 0.908, 4: 0.894, 6: 0.88 } },
  overruleReveal: { beat: '5-reveal', fit: { 2: 0.953, 4: 0.953, 6: 0.953 } },
  monthEnd: { beat: '9-month-end', fit: { 2: 0.78, 4: 0.708, 6: 0.768 } },
};

/**
 * Moment vs steady, one page read at 1.5 s (the moment) and at 9.5 s (folded): equal at every size, the moment out of
 * flow. Break: beat 1.3 ('deal-broken'). Call: beat 5.2 with the call made (&call=1). [moment, steady].
 */
export const TV_MOMENT_VS_STEADY: Record<'break' | 'call', Record<keyof BySeats, [number, number]>> = {
  break: { 2: [0.796, 0.796], 4: [0.678, 0.678], 6: [0.631, 0.631] },
  call: { 2: [0.835, 0.835], 4: [0.711, 0.711], 6: [0.662, 0.662] },
};

/**
 * What binds where a steady state falls under the floor (scratch experiments with the same market, each restored):
 *   - the side column, not the header: waiting box + two market rows + the kept news line + the ready list run past
 *     the map column. Trunk's planning alone (no slice change) measures 0.733 at 4 seats and 0.686 at 6;
 *   - the ready list's reputation chips (h-8, taller than the name's line): 0.733 → 0.711 at 4, 0.686 → 0.662 at 6;
 *   - a budget share moved this month: its "(was N%)" parts wrap the promise row's right side to two lines,
 *     0.711 → 0.678 at 4 seats; it is on every planning beat but 4.1–4.3, as Brix set the budget this month;
 *   - waiting: trunk's "<host>, the host, can continue without them." under the waiting box: 0.678 → 0.631.
 * The options (drop "(was N%)" on the TV; no waiting box from 5 seats; chips at the month end only) are with the PM.
 */

/** The superseded placement A (banner and budget line stacked under the header), kept as WS4's and the PM's evidence. */
export const TV_FIT_A: Record<string, { fixture: number; market: number }> = {
  planning: { fixture: 0.768, market: 0.643 },
  'deal-broken': { fixture: 0.544, market: 0.456 },
  'budget-set': { fixture: 0.544, market: 0.456 },
  'overrule-called': { fixture: 0.544, market: 0.381 },
  waiting: { fixture: 0.516, market: 0.359 },
};
