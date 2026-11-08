import { baseWorld, BROKEN_BY_KAI, OFFER_FROM_BRIX, OFFER_FROM_OSSA, PROMISED_BRIX, TAX_START, DEFAULT_SHARES, type MockWorld, type Seat } from './fixture';
import type { Start } from './proposed/Hub';
import type { TvFocus } from './tv/TvFor';

/**
 * The guided path through one planning month (Heiko via the PM, 8 Nov 03:25Z): nine steps, each a few beats. A beat
 * sets the table's world, whose phone it is, where that phone opens (tab, sub-tab, tool, sheet) and what the TV
 * focuses on, and says in one line what is on screen. Within a beat the prototype is live: a tap does what the real
 * screen would, and "Next" moves on to the next beat's world.
 */
export interface Beat {
  id: string;
  /** The step it belongs to, 1–9. */
  step: number;
  label: string;
  /** One line: what Heiko is looking at, and what to try. */
  line: string;
  seat: Seat;
  world: () => MockWorld;
  start?: Start;
  tv: TvFocus;
  /** The P3 budget variant the Budget sub-tab opens on. */
  budget?: 'a' | 'b';
  /** The phone draws the month end (outside the tabs, as every other phase), not the hub. */
  monthEnd?: boolean;
}

export const STEPS: { n: number; title: string }[] = [
  { n: 1, title: 'The month opens' },
  { n: 2, title: 'Overview: the map' },
  { n: 3, title: 'Talk: deal cards' },
  { n: 4, title: 'Governor: tax and budget' },
  { n: 5, title: 'Council: the overrule' },
  { n: 6, title: 'Sheriff: the case file' },
  { n: 7, title: 'Colony' },
  { n: 8, title: 'Ready' },
  { n: 9, title: 'The month end' },
];

/** Month 5's planning as it opens: Brix has raised the tax 5 → 10% and set the budget; two cards wait for Lena; Kai broke a pact. */
const opening = () => baseWorld({ cards: [OFFER_FROM_OSSA, OFFER_FROM_BRIX, BROKEN_BY_KAI] });
/** The tax as the month began, and the budget as the game began: for the Governor to set. */
const unset = () => baseWorld({ tax: TAX_START, budget: { shares: DEFAULT_SHARES, setBy: null } });

export const BEATS: Beat[] = [
  { id: '1-head', step: 1, label: 'The rail: Now, the month, money', seat: 'lena', world: opening, tv: 'planning', line: 'Right rail, on every tab: the phase and who is ready, your money and place, the month as one line, and the one “Now” line. Ready is bottom right.' },
  { id: '1-help', step: 1, label: 'The “?”', seat: 'lena', world: opening, start: { sheet: 'help' }, tv: 'planning', line: 'The old explanation card, now behind “?”: the month’s steps, Now and Next, who governs, what you need. Close it to go on.' },
  { id: '1-badges', step: 1, label: 'Tabs with badges', seat: 'lena', world: opening, tv: 'planning', line: 'The tabs at the left: Talk carries “2” (two cards wait for you) and “!” (a promise to you was broken). Tap one.' },

  { id: '2-look', step: 2, label: 'The big map: Look', seat: 'lena', world: opening, start: { tab: 'overview', tool: 'look' }, tv: 'planning', line: 'Overview is the one map, about 3.7× today’s at this size. Tap a plot: what it can make and whose it is, in the rail.' },
  { id: '2-drone', step: 2, label: 'Geo drone', seat: 'lena', world: opening, start: { tab: 'overview', tool: 'drone' }, tv: 'planning', line: 'Geo drone: pick free plots on the map to scan; the cost and Send are in the rail. Only you see it.' },
  { id: '2-sell', step: 2, label: 'Sell a plot or MULE', seat: 'lena', world: opening, start: { tab: 'overview', tool: 'list' }, tv: 'planning', line: 'Sell: tap one of your plots, set the minimum in the rail, and list it for the auction after planning. This was the Market desk.' },

  { id: '3-arrives', step: 3, label: 'An offer arrives', seat: 'lena', world: () => baseWorld({ cards: [OFFER_FROM_OSSA] }), tv: 'deal-offered', line: 'A card arrived: Talk shows “1”, and “This month” leads with “1 deal offer”. Tap either.' },
  { id: '3-sheet', step: 3, label: 'The offer, in its sheet', seat: 'lena', world: () => baseWorld({ cards: [OFFER_FROM_OSSA] }), start: { tab: 'talk', focus: 'answer:deal-b3x8re' }, tv: 'deal-offered', line: 'Card from Ossa · AI: a three-month pact. Accept or Decline here; “Answer later” leaves it in the whisper.' },
  { id: '3-accepted', step: 3, label: 'Accepted', seat: 'lena', world: () => baseWorld({ cards: [{ ...OFFER_FROM_OSSA, status: 'active' }] }), start: { tab: 'talk', focus: 'cards' }, tv: 'planning', line: 'Accepted: the pact is active in My cards, until month 7. Keep it and your reputation rises; break it and the table sees.' },
  { id: '3-compose', step: 3, label: 'Make an offer', seat: 'lena', world: () => baseWorld(), start: { tab: 'talk', focus: 'compose:brix' }, tv: 'planning', line: 'Your own card to Brix, in the same sheet: a pact for 1, 3 or 6 months, or your vote. Offer it; Brix answers before planning ends.' },

  { id: '4-tax', step: 4, label: 'The tax', seat: 'brix', world: unset, start: { tab: 'politics', sub: 'laws' }, tv: 'planning', line: 'Brix’s phone, the Governor: the sales tax, 5% as the month began. You promised “no higher than 10%”. Step it and Set.' },
  { id: '4-budget-a', step: 4, label: 'Budget · A steppers', seat: 'brix', world: unset, start: { tab: 'politics', sub: 'budget' }, budget: 'a', tv: 'budget-set', line: 'The budget splits the fund: Projects, Welfare, kept. Variant A, a stepper per line. Set it; switch to B at the top of the tab.' },
  { id: '4-budget-b', step: 4, label: 'Budget · B split bar', seat: 'brix', world: unset, start: { tab: 'politics', sub: 'budget' }, budget: 'b', tv: 'budget-set', line: 'Variant B, one split bar: drag a handle (or use the arrow keys). Pick the one you prefer.' },
  { id: '4-commission', step: 4, label: 'Commission a building', seat: 'brix', world: () => baseWorld(), start: { tab: 'politics', sub: 'budget' }, tv: 'budget-set', line: 'Under Projects: “Commission a project”. Pick a building; Projects pays toward it at the month end.' },

  { id: '5-see', step: 5, label: 'See the change', seat: 'lena', world: () => baseWorld(), start: { tab: 'politics', sub: 'laws' }, tv: 'planning', line: 'Lena’s phone: the Council tab. The tax is 10%, up from 5%; Budget shows what Brix changed.' },
  { id: '5-call', step: 5, label: 'Call an overrule', seat: 'lena', world: () => baseWorld(), start: { tab: 'politics', sub: 'laws' }, tv: 'planning', line: 'Tap “Call an overrule vote”: everyone votes as planning ends; it needs 5 of 9 votes to put the tax back to 5%.' },
  { id: '5-ballot', step: 5, label: 'The ballot', seat: 'lena', world: () => baseWorld({ call: 'lena', stage: 'overrule', overruleBallots: { lena: true, brix: false, ossa: true }, overruleDone: ['ossa'] }), start: { tab: 'politics', sub: 'laws' }, tv: 'overrule-called', line: 'Planning ends: the ballot opens in Laws, the tab says VOTE. Yes or No, then Cast my vote.' },
  { id: '5-reveal', step: 5, label: 'The reveal', seat: 'lena', world: () => baseWorld({ call: 'lena', stage: 'overruleReveal', overruleBallots: { lena: true, brix: false, ossa: true, kai: true }, overruleDone: ['ossa', 'lena', 'brix', 'kai'] }), tv: 'overrule-reveal', line: 'The reveal takes the whole stage on every screen at once: overruled, 7 of 9. Continue.' },

  { id: '6-file', step: 6, label: 'The case file', seat: 'kai', world: () => baseWorld({ tax: TAX_START }), start: { tab: 'politics', sub: 'sheriff' }, tv: 'planning', line: 'Kai’s phone, the Sheriff: the guard line, then every case newest first, each with its next step (WS8’s design B).' },
  { id: '6-guard', step: 6, label: 'Guarding', seat: 'kai', world: () => baseWorld({ tax: TAX_START }), start: { tab: 'overview', pick: 'guard' }, tv: 'guarding', line: 'Guard opens Overview’s map in guard mode: tap players’ plots to post a guard; “back to Sheriff” returns.' },

  { id: '7-colony', step: 7, label: 'Colony', seat: 'lena', world: () => baseWorld({ cards: [BROKEN_BY_KAI] }), start: { tab: 'colony' }, tv: 'planning', line: 'The colony: standings with reputation chips (tap one), the fund, the buildings, health and mood, what you need, the news.' },

  { id: '8-ready', step: 8, label: 'Ready', seat: 'lena', world: () => baseWorld({ cards: [PROMISED_BRIX] }), tv: 'planning', line: 'Done planning: “I’m ready”, bottom right.' },
  { id: '8-waiting', step: 8, label: 'Waiting for the others', seat: 'lena', world: () => baseWorld({ cards: [PROMISED_BRIX], ready: ['lena'] }), tv: 'waiting', line: 'You’re ready: the rail says whom the table waits for. The tabs stay open to look around.' },

  { id: '9-month-end', step: 9, label: 'The month end', seat: 'lena', world: () => baseWorld({ stage: 'monthEnd' }), monthEnd: true, tv: 'month-end', line: 'The month end, outside the tabs as every other phase: the league, every card broken this month, and what the fund paid out.' },
];

export const beatOf = (id: string | null): Beat => BEATS.find((b) => b.id === id) ?? BEATS[0]!;
