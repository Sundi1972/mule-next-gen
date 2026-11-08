/**
 * TV-FIT, measured 8 Nov with the real TvBody / FitHeight (its data-fit) on /src/tv/solo.html?beat=, at 1280 × 720:
 * the guided path's own worlds (steps.ts at 83385f8d: the fixture's market of six goods, 5 MULEs at 148 cr, Ossa · AI's
 * break this month from beat 1.3 on), at 2, 4 and 6 seats (world.ts `seats`; 2 = Ossa · AI and Brix). The floor is 0.7
 * (rulebook #tv-fit). The TV as ruled: the budget on the promise row with no "(was N%)" and a moved share marked ▲/▼
 * (slice 5 AM-9), a break or a call an 8 s moment over the map box, the break folded into the news, the call on the
 * promise row, the waiting box without chips and none above TV_WAITING_BOX_MAX_SEATS, the host's "can continue" line
 * at the ready list's foot at every size.
 */
export const TV_FLOOR = 0.7;

type BySeats = { 2: number; 4: number; 6: number };

/** Steady states, by the beat measured: every one holds the floor at 2, 4 and 6 seats (TV_WAITING_BOX_MAX_SEATS = 3). */
export const TV_FIT: Record<string, { beat: string; fit: BySeats }> = {
  planningBeforeBreak: { beat: '1-head', fit: { 2: 0.835, 4: 0.85, 6: 0.793 } },
  /** Every planning beat from 2.1 on: the break folded into the news. */
  breakFolded: { beat: '2-look', fit: { 2: 0.835, 4: 0.85, 6: 0.793 } },
  budgetUnset: { beat: '4-budget-a', fit: { 2: 0.835, 4: 0.85, 6: 0.793 } },
  /** 4.4: Brix's budget set this month, the moved shares marked ▲/▼. */
  budgetSet: { beat: '4-commission', fit: { 2: 0.835, 4: 0.85, 6: 0.793 } },
  guarding: { beat: '6-guard', fit: { 2: 0.835, 4: 0.85, 6: 0.793 } },
  /** The box at 2 seats only; the host's line at the ready list's foot at every size. */
  waiting: { beat: '8-waiting', fit: { 2: 0.835, 4: 0.787, 6: 0.727 } },
  /** 5.2 after the Call tap (solo &call=1): "Overrule called: tax frozen", where the budget was. */
  callFolded: { beat: '5-call', fit: { 2: 0.835, 4: 0.85, 6: 0.793 } },
  overruleBallot: { beat: '5-ballot', fit: { 2: 0.908, 4: 0.894, 6: 0.88 } },
  overruleReveal: { beat: '5-reveal', fit: { 2: 0.953, 4: 0.953, 6: 0.953 } },
  monthEnd: { beat: '9-month-end', fit: { 2: 0.78, 4: 0.708, 6: 0.768 } },
};

/** The moved-share mark, AM-9: ▲/▼ with the accent colour vs the colour alone, same beats, measured with the box at 4 seats (TV_WAITING_BOX_MAX_SEATS was 4 then). Equal: the arrow is built. */
export const TV_FIT_SHARE_MARK: Record<'arrow' | 'styleOnly', { budgetSet: BySeats; guarding: BySeats }> = {
  arrow: { budgetSet: { 2: 0.835, 4: 0.711, 6: 0.793 }, guarding: { 2: 0.835, 4: 0.711, 6: 0.793 } },
  styleOnly: { budgetSet: { 2: 0.835, 4: 0.711, 6: 0.793 }, guarding: { 2: 0.835, 4: 0.711, 6: 0.793 } },
};

/**
 * Moment vs steady, one page read at 1.5 s (the moment) and at 9.5 s (folded): equal at every size, the moment out of
 * flow. Break: beat 1.3 ('deal-broken'). Call: beat 5.2 with the call made (&call=1). [moment, steady].
 */
export const TV_MOMENT_VS_STEADY: Record<'break' | 'call', Record<keyof BySeats, [number, number]>> = {
  break: { 2: [0.835, 0.835], 4: [0.85, 0.85], 6: [0.793, 0.793] },
  call: { 2: [0.835, 0.835], 4: [0.85, 0.85], 6: [0.793, 0.793] },
};

/**
 * The waiting box's cut-off (PM ruling 8 Nov for the prototype; WS4 rules the real placement by 9 Nov 12:00Z): with the
 * box at 4 seats (TV_WAITING_BOX_MAX_SEATS = 4) waiting measured 0.658 at 4 seats (its host's line in the box: 0.662) and
 * planning 0.711; at 3, 0.787 and 0.850. The box and the host's line together ran past the map column there.
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

/**
 * Considered, not taken (lead's ruling, 9 Nov): the fine month's news line on the TV month end, which has no news.
 * 9.1's world, the real market, 2 / 4 / 6 seats; the month end stays trunk's (0.780 / 0.708 / 0.768).
 */
export const TV_MONTH_END_NEWS_CONSIDERED = {
  /** A: a one-line news strip under the header. */
  stripUnderHeader: { 2: 0.753, 4: 0.646, 6: 0.677 },
  /** B: the news line in the Worth footnote's row (free, but it changes WS4's TvMonthEnd). */
  inFootnoteRow: { 2: 0.78, 4: 0.708, 6: 0.768 },
} as const;

/**
 * The Sheriff month (?path=sheriff, mock-hub-tabs' b25a4abf: its news lines, and month 6's ledger with the fine in and the
 * victim's half out), each beat on solo.html?beat=, at 2 / 4 / 6 seats (2 = Lena and Brix here). `fit` is the lowest
 * scale the beat holds. Production's rail changes through the show, so its two beats were read every frame over the
 * whole show (45 s): each step holds about 1.5 s at `fit`, and as the rail re-fits it passes, for about 0.1 s (7 frames),
 * through the lower scales in `dip` (the lowest of two runs; a dip moves by up to 0.008 between runs). Every dip is above the floor too. A 0.5 s sample catches a dip only sometimes
 * (693dad07 recorded two of them as the 4-seat values).
 * WS8's layer sits out of flow over the map: the guard's shield and the dark plot measured 0.0 px off Brix's Food plot's
 * centre, every size. The investigation's moment showed for its 8 s at the same scale as after it.
 */
export const TV_FIT_SHERIFF: Record<string, { beat: string; fit: BySeats; dip?: BySeats }> = {
  productionCaught: { beat: 's2-caught', fit: { 2: 0.973, 4: 0.923, 6: 0.788 }, dip: { 2: 0.932, 4: 0.882, 6: 0.76 } },
  fineSet: { beat: 's3-fined', fit: { 2: 0.896, 4: 0.85, 6: 0.793 } },
  /** Wealth note “fund 311 cr · paid out 574”: the fine in, the victim’s 75 in the paid-out total. */
  monthEndFine: { beat: 's3-month-end', fit: { 2: 0.826, 4: 0.708, 6: 0.768 } },
  productionDark: { beat: 's4-dark', fit: { 2: 0.93, 4: 0.882, 6: 0.758 }, dip: { 2: 0.897, 4: 0.856, 6: 0.741 } },
  /** Solved and cold alike; the moment's scale equals its folded state's. */
  investigation: { beat: 's4-solved', fit: { 2: 0.896, 4: 0.85, 6: 0.793 } },
  guarding: { beat: 's1-guarded', fit: { 2: 0.896, 4: 0.85, 6: 0.793 } },
  monthEnd5: { beat: 's2-month-end', fit: { 2: 0.826, 4: 0.708, 6: 0.768 } },
};

/**
 * The month end's breaker row (P15, D19), by the number of players who broke a promise this month (solo.html
 * &breakers=0..3, world.ts' withBreakers: Ossa · AI's vote card to Kai, then Brix's law promise to Lena, then Kai's pact
 * with Lena, −20). Read every frame for 3 s: the month end holds one scale, with no dips. 9-month-end and s3-month-end
 * measured the same. A table of two has at most two breakers, so 2 seats has no 3.
 * `mark`, TAKEN: "✗ −N" on the breaker's own league row, after the chip. It adds no height: at 4 and 6 seats every count
 * reads as none does. At 2 seats 0.826 → 0.780 comes from the seats, not the mark: from one breaker the two seats are
 * Brix and Ossa (who has broken), and Ossa's public chat line fills the header's chat strip, empty for Lena and Brix.
 * `strip`, CONSIDERED, NOT TAKEN: a row per breaker under the league ("✗ (mark) Ossa · AI −10"). Under the floor
 * from one breaker at 4 and 6 seats.
 */
export const TV_FIT_BREAKERS = {
  mark: {
    0: { 2: 0.826, 4: 0.708, 6: 0.768 },
    1: { 2: 0.78, 4: 0.708, 6: 0.768 },
    2: { 2: 0.78, 4: 0.708, 6: 0.768 },
    3: { 4: 0.708, 6: 0.768 },
  },
  strip: {
    0: { 2: 0.826, 4: 0.708, 6: 0.768 },
    1: { 2: 0.763, 4: 0.665, 6: 0.694 },
    2: { 2: 0.719, 4: 0.631, 6: 0.657 },
    3: { 4: 0.601, 6: 0.625 },
  },
} as const satisfies Record<'mark' | 'strip', Record<0 | 1 | 2 | 3, Partial<BySeats>>>;

/** The TV's own key decisions, for the notes page's list (mock-hub-tabs' DECISIONS spreads it). */
export const TV_DECISIONS: [string, string][] = [
  [
    'D19',
    'The TV month end’s breaker row (P15: the TV shows the total only; the phone carries the full broken list). Each player who broke a promise this month gets “✗ −10” on their own league row, after the reputation chip. The drop is the card’s, from POLITICS’ reputation moves (a pact −20), and several cards sum. The full words are in its accessible label, there is no reason text, and it shows nothing in a month without a break. The league’s names carry “ · AI”. It adds no height: 0.780 / 0.708 / 0.768 at 2 / 4 / 6 seats with one, two or three breakers, as with none at 4 and 6 (measured, 8 Nov). A strip, a row per breaker under the league, fell under 0.7 from one breaker (0.665 at 4 seats) and was not taken. A change to WS4’s TvMonthEnd, which builds it from this scaffold.',
  ],
];
