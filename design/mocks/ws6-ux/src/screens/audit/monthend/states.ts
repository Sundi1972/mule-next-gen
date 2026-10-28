import type { MuleView } from '@mule/protocol';
import { VIEW } from '../../../fixture';
import { worthOf, type MonthFacts } from '../../../proposed/worth';

/**
 * The month-end's four states, for Heiko's approval (2026-10-28). The shared fixture's month 5, after the goods
 * auction (the upkeep phase). Lena holds the phone. Every Worth is computed by worth.ts from the fixture; only what
 * the view does not carry yet (last month's numbers, the fund's month, who went hungry) is written here, and WS3 adds
 * each of those to the view.
 */

export interface MonthEndState {
  id: string;
  title: string;
  /** What the review page says this state shows. */
  intro: string;
  view: MuleView;
  facts: MonthFacts;
  /** False: no TV at this table; the phone carries the table and the colony panel. */
  tv: boolean;
}

/** The month just ended: the fixture's month 5, after the auction. */
const ENDED: MuleView = { ...VIEW, phase: 'upkeep', auction: null };

/** How each Worth moved over month 5, outside Collapse: Ossa and Brix gained, Lena and Kai lost a little. */
const MONTH_5: Record<string, number> = { ossa: 120, lena: -40, brix: 65, kai: -85 };
/**
 * Each player's Worth at month 4's end, as it showed then (the air was not in Collapse): this month's Worth less the
 * month's change, so the numbers stay true whatever config sets a plot, a MULE or a term at.
 */
const LAST_WORTH: Record<string, number> = Object.fromEntries(Object.entries(MONTH_5).map(([id, change]) => [id, worthOf(ENDED, id).total - change]));

/** The fund's month: the sales tax on this month's sales in, the Governor's pay (Lena, since month 4) out. */
const FUND: Pick<MonthFacts, 'fundIn' | 'paid'> = {
  fundIn: [{ what: `the ${Math.round(VIEW.treasury.salesTax * 100)}% sales tax`, cr: 64 }],
  paid: [{ office: 'governor', to: 'lena' }],
};

const NORMAL: MonthFacts = { lastWorth: LAST_WORTH, lastAir: 25, ...FUND, hungry: [], colonistsFed: true };

export const MONTHEND_STATES: MonthEndState[] = [
  {
    id: 'monthend',
    title: 'Month 5, clean air',
    intro:
      'Month 5 has just ended, after the goods auction. The TV shows the league table and how the colony is doing; Lena’s phone shows the same table and her own worth, line by line. On the TV and on the others’ rows, totals only.',
    view: ENDED,
    facts: NORMAL,
    tv: true,
  },
  {
    id: 'monthend-phone-only',
    title: 'No TV: the phone carries it all',
    intro: 'The same month at a table with no TV. Lena’s phone carries the whole league table and the colony panel on its stage, her worth in the rail, without scrolling at 844 × 390.',
    view: ENDED,
    facts: NORMAL,
    tv: false,
  },
  {
    id: 'monthend-collapse',
    title: 'The air in Collapse',
    intro:
      'The same month, but the air went from Toxic (77) into Collapse (84). Every Worth shows the Collapse cut, a fifth off everything, offices too, as the score if the game ended now; the uncut numbers stay in their own column, and Lena’s phone shows the cut as a line of its own. Last month was not in Collapse, so every change is mostly the cut.',
    view: { ...ENDED, air: { level: 84, band: 'collapse' } },
    facts: { ...NORMAL, lastAir: 77 },
    tv: true,
  },
  {
    id: 'monthend-hungry',
    title: 'Kai went hungry; the air got worse',
    intro: 'The same month, but Kai went hungry at upkeep (he ate 1 of the 3 Food his household needs), and the air got worse, from Clean (27) into Smoggy (34).',
    view: { ...ENDED, air: { level: 34, band: 'smoggy' } },
    facts: { ...NORMAL, lastAir: 27, hungry: [{ id: 'kai', ate: 1, need: 3 }] },
    tv: true,
  },
  {
    id: 'monthend-gameover',
    title: 'The end of the game',
    intro:
      'The last month has ended and the game is over. The TV calls the winner out over the final table by Worth, with the colony’s report and its verdict; Lena’s phone keeps today’s game-over layout (her card, the colony’s verdict, her own lines, the final standings in the rail), with Worth in credits where it said points. Same numbers as month 5, so they can be checked against the other states.',
    view: { ...ENDED, month: VIEW.maxMonths, phase: 'gameOver', finished: true },
    facts: NORMAL,
    tv: true,
  },
];
