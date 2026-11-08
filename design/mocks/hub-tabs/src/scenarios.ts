import { baseWorld, BROKEN_BY_KAI, OFFER_FROM_BRIX, OFFER_FROM_OSSA, PROMISED_BRIX, TAX_START, type Seat, type World } from './fixture';
import type { Start } from './proposed/Hub';
import { monthEnd } from './steps';
import type { ShellVariant } from './proposed/Shell';

/** One reachable state: whose phone, the table's world, where the phone opens, and in which shell. */
export interface State {
  id: string;
  label: string;
  seat: Seat;
  world: () => World;
  start?: Start;
  /** The shell variant; omitted, A (the tabs are built in A, as the measurement says). */
  shell?: ShellVariant;
  /** The P3 budget variant the Budget sub-tab opens on. */
  budget?: 'a' | 'b';
  /** Draws today's hub (the real Hub with HUB_SLOTS), for comparison. */
  today?: boolean;
  note: string;
}

export interface Screen {
  id: string;
  title: string;
  graft: string;
  states: State[];
}

/** The planning month most states start from: Brix raised the tax 5 → 10% and proposes a land tax; Lena is short of Energy. */
const month = (over: Partial<World> = {}) => () => baseWorld(over);
/** Two offers wait for Lena: Brix's vote card, and Ossa · AI's pact. */
const offers = () => baseWorld({ cards: [OFFER_FROM_OSSA, OFFER_FROM_BRIX] });

/**
 * The Overview height check (PM, 8 Nov): Lena’s needs at one-, two- and three-digit figures, met and short, on a busy
 * table (two offers), a quiet one (no offers), a bare one (no law, no election: the Short row alone) and a crowded one (offers
 * and a called overrule: five rows with the Short row). Measured by
 * scripts/measure-needs.mjs: the map must not move.
 */
const NEEDS_FIGURES: [string, string, World['needs']][] = [
  ['met-1', 'Water 3 of 3', { need: { food: 3, energy: 3, water: 3 }, have: { food: 3, energy: 3, water: 3 } }],
  ['met-2', 'Water 20 of 20', { need: { food: 20, energy: 20, water: 20 }, have: { food: 20, energy: 20, water: 20 } }],
  ['met-3', 'Water 120 of 120', { need: { food: 120, energy: 120, water: 120 }, have: { food: 120, energy: 120, water: 120 } }],
  ['short-1', 'Short 1 Energy', { need: { food: 3, energy: 4, water: 3 }, have: { food: 3, energy: 3, water: 3 } }],
  ['short-2', 'Short 20 Water', { need: { food: 20, energy: 20, water: 20 }, have: { food: 20, energy: 20, water: 0 } }],
  ['short-3', 'Short 120 of all three', { need: { food: 120, energy: 120, water: 120 }, have: { food: 0, energy: 0, water: 0 } }],
];
const NEEDS_TABLES = {
  busy: { words: 'two offers wait', over: { cards: [OFFER_FROM_OSSA, OFFER_FROM_BRIX] } },
  quiet: { words: 'no offers', over: {} },
  bare: { words: 'no offers, no law pending, no election to come', over: { bare: true } },
  crowded: { words: 'two offers and a called overrule', over: { cards: [OFFER_FROM_OSSA, OFFER_FROM_BRIX], call: 'kai' } },
} satisfies Record<string, { words: string; over: Partial<World> }>;
const NEEDS_STATES: State[] = (Object.keys(NEEDS_TABLES) as (keyof typeof NEEDS_TABLES)[]).flatMap((table) =>
  NEEDS_FIGURES.map(([id, label, needs]): State => ({
    id: `${table}-${id}`,
    label: `${label} · ${NEEDS_TABLES[table].words}`,
    seat: 'lena',
    world: () => baseWorld({ ...NEEDS_TABLES[table].over, needs }),
    note: `Lena’s needs: ${label}; ${NEEDS_TABLES[table].words}.`,
  })),
);

export const SCREENS: Screen[] = [
  {
    id: 'shell',
    title: 'The shell: tabs and the slim rail, on Overview',
    graft: 'Shell.tsx (TabShell), Hub.tsx (TabHub), tabs/Overview.tsx',
    states: [
      { id: 'a', label: 'A · tab column (left)', seat: 'lena', world: offers, shell: 'a', note: 'A: the tabs as a 56 px column at the stage’s left edge, under the left thumb.' },
      { id: 'b', label: 'B · tab bar (bottom)', seat: 'lena', world: offers, shell: 'b', note: 'B: the tabs as a 44 px bar across the stage’s foot.' },
      { id: 'today', label: 'Today’s hub (as built)', seat: 'lena', world: offers, today: true, note: 'The real Hub with HUB_SLOTS, for the measurement.' },
    ],
  },
  {
    id: 'tabs',
    title: 'Each tab in its main state',
    graft: 'tabs/Overview.tsx, tabs/Politics.tsx, tabs/Colony.tsx, tabs/Talk.tsx',
    states: [
      { id: 'overview', label: 'Overview', seat: 'lena', world: offers, note: 'The one map, its tools, This month.' },
      { id: 'governor', label: 'Governor (Brix)', seat: 'brix', world: month(), start: { tab: 'politics', sub: 'laws' }, note: 'Brix’s Governor tab, Laws: the tax and the law to propose.' },
      { id: 'council', label: 'Council (Lena)', seat: 'lena', world: month(), start: { tab: 'politics', sub: 'laws' }, note: 'Lena’s Council tab, Laws: the tax with the overrule call, the laws in force, next month’s vote.' },
      { id: 'colony', label: 'Colony', seat: 'lena', world: month(), start: { tab: 'colony' }, note: 'Standings with reputation, the fund, the colony card, needs, news.' },
      { id: 'talk', label: 'Talk', seat: 'lena', world: month({ cards: [PROMISED_BRIX] }), start: { tab: 'talk', focus: 'whisper:brix' }, note: 'The whisper with Brix, the promised card at its foot.' },
    ],
  },
  {
    id: 'politics',
    title: 'Governor › Budget, Laws and Elections',
    graft: 'tabs/Politics.tsx (+ the budget mock’s GovernorBudget, CouncilBudget, OverruleCall, OverruleBallot; the deals mock’s ballots)',
    states: [
      { id: 'budget-a', label: 'Budget · A steppers', seat: 'brix', world: month(), start: { tab: 'politics', sub: 'budget' }, budget: 'a', note: 'P3 variant A in the Budget sub-tab.' },
      { id: 'budget-b', label: 'Budget · B split bar', seat: 'brix', world: month(), start: { tab: 'politics', sub: 'budget' }, budget: 'b', note: 'P3 variant B in the Budget sub-tab.' },
      { id: 'council-budget', label: 'Council › Budget', seat: 'lena', world: month(), start: { tab: 'politics', sub: 'budget' }, note: 'The budget as set, moved lines in holo.' },
      { id: 'call', label: 'Council › Laws: Call an overrule', seat: 'lena', world: month(), start: { tab: 'politics', sub: 'laws' }, note: 'The call at the tax line.' },
      { id: 'called', label: 'Governor › Laws: Kai called it', seat: 'brix', world: month({ call: 'kai' }), start: { tab: 'politics', sub: 'laws' }, note: 'The tax frozen on the Governor’s phone, the line under Now.' },
      { id: 'overrule-ballot', label: 'Council › Laws: overrule ballot open', seat: 'lena', world: month({ call: 'kai', stage: 'overrule', overruleBallots: { kai: true, brix: false, ossa: true }, overruleDone: ['ossa'] }), start: { tab: 'politics', sub: 'laws' }, note: 'The ballot first in Laws; the tab badged VOTE.' },
      { id: 'election', label: 'Elections: ballot, “You promised Brix your vote”', seat: 'lena', world: month({ month: 8, stage: 'election', cards: [PROMISED_BRIX] }), start: { tab: 'politics', sub: 'elections' }, note: 'Month 8’s ballot in its sub-tab.' },
      { id: 'run', label: 'Elections: run for office', seat: 'lena', world: month(), start: { tab: 'politics', sub: 'elections' }, note: 'No ballot open: running, and who holds which office.' },
    ],
  },
  {
    id: 'talk',
    title: 'Talk: the composer and an incoming offer, as one sheet within Talk',
    graft: 'tabs/Talk.tsx (+ the deals mock’s Deals.tsx: DealComposerSheet, IncomingDealSheet)',
    states: [
      { id: 'composer', label: 'Composer A open (+ Deal to Brix)', seat: 'lena', world: month(), start: { tab: 'talk', focus: 'compose:brix' }, note: 'The composer over the Talk stage; the map’s tab is a tap away.' },
      { id: 'incoming-ai', label: 'Incoming: Card from Ossa · AI', seat: 'lena', world: offers, start: { tab: 'talk', focus: 'answer:deal-b3x8re' }, note: 'The AI seat’s pact, in the same sheet.' },
      { id: 'incoming', label: 'Incoming: Brix’s pact', seat: 'lena', world: offers, start: { tab: 'talk', focus: 'answer:deal-q7k2m9' }, note: 'A person’s card, in the same sheet.' },
      { id: 'cards', label: 'My cards', seat: 'lena', world: () => baseWorld({ cards: [OFFER_FROM_OSSA, OFFER_FROM_BRIX, PROMISED_BRIX, BROKEN_BY_KAI] }), start: { tab: 'talk', focus: 'cards' }, note: 'Offered, active, broken.' },
    ],
  },
  {
    id: 'badges',
    title: 'Badges: when something wants the player',
    graft: 'tabs/Talk.tsx::TalkBadge, tabs/Politics.tsx::PoliticsBadge, parts.tsx::TabBadge',
    states: [
      { id: 'offer', label: 'An offer waiting → Talk', seat: 'lena', world: offers, note: 'Talk carries “2”, holo: two cards wait for an answer.' },
      { id: 'ballot', label: 'A ballot open → Council', seat: 'lena', world: month({ month: 8, stage: 'election', cards: [PROMISED_BRIX] }), note: 'Council carries VOTE, warn; Now is a door to the ballot.' },
      { id: 'broken', label: 'A promise broken → Talk', seat: 'lena', world: month({ cards: [BROKEN_BY_KAI] }), note: 'Talk carries “!”, alert: Kai broke the pact made with Lena.' },
    ],
  },
  {
    id: 'handoff',
    title: 'The map-mode hand-off: Sheriff › Guard a plot → Overview',
    graft: 'slots.ts (PlotPickSlot), Hub.tsx (startPick / endPick), tabs/Overview.tsx (PickBar)',
    states: [
      { id: 'sheriff', label: 'Kai’s Council › Sheriff: WS8’s case file (B)', seat: 'kai', world: month({ tax: TAX_START }), start: { tab: 'politics', sub: 'sheriff' }, note: 'WS8’s design B, folded (d0a52c1a): the guard line, then one 44 px row per case with its next step; tap a row to open it. “Post a guard on the map” opens Overview’s map.' },
      { id: 'guarding', label: 'Overview: “Guarding · back to Sheriff”', seat: 'kai', world: month({ tax: TAX_START }), start: { tab: 'overview', pick: 'guard' }, note: 'WS8’s GuardMap on Overview’s one map; a guarded plot wears the proposed GUARD flag. Done returns to the Sheriff sub-tab.' },
    ],
  },
  {
    id: 'monthend',
    title: 'The month end (outside the tabs, as every other phase)',
    graft: 'phone/Results.tsx, components/MonthEnd.tsx (the deals mock’s BrokenCards at “phone”, the budget mock’s FundLines)',
    states: [{ id: 'phone', label: 'The phone: the league, the broken list, what the fund paid out', seat: 'lena', world: monthEnd, note: 'Kai broke a pact with Lena; Ossa · AI broke a promise to Kai. Under them, the full paid-out line.' }],
  },
  {
    id: 'needs',
    title: 'The Overview height check: the map whatever the needs say',
    graft: 'tabs/Overview.tsx (AgendaRows), today.tsx (NEEDS_AGENDA)',
    states: NEEDS_STATES,
  },
  {
    id: 'help',
    title: 'The “?” sheet: the old explanation card, in full',
    graft: 'Hub.tsx (HelpSheet), Shell.tsx (NowLine’s “?”)',
    states: [{ id: 'open', label: '“?” open', seat: 'lena', world: offers, start: { sheet: 'help' }, note: 'The month’s steps, Now and Next, the offices line, Now’s detail, what you need.' }],
  },
];

export const stateOf = (screen: string | null, state: string | null): [Screen, State] | null => {
  const s = SCREENS.find((x) => x.id === screen);
  const st = s?.states.find((x) => x.id === state) ?? s?.states[0];
  return s && st ? [s, st] : null;
};
