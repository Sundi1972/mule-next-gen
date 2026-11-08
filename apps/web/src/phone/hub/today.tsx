import { GOOD_NAME } from '@mule/ui';
import { STRIKE_ALERT, STRIKE_PAY_LINE, strikeNow } from '../../components/Strike';
import { MarketDesk } from './desks';
import { needRows } from './needs';
import { LookSabotage, MarketSabotage } from './politics/Sabotage';
import { GuardMap, SHERIFF_DESK, useGuarding } from './politics/Sheriff';
import { COUNCIL_DESK, COUNCIL_STAGE, councilNow, councilReadyWords, ELECTION_AGENDA, ELECTION_DAY_STAGE, electionNow, electionReadyWords, GOVERNOR_AGENDA, GOVERNOR_DESK, LAW_AGENDA, OFFICES_BANNER } from './politics/slots';
import type { AgendaSlot, HubSeat, TabHubSlots } from './slots';
import { ColonyTab } from './tabs/Colony';
import { OverviewTab, TAB_WORD } from './tabs/Overview';
import { asDeskSub, PoliticsBadge, PoliticsTab } from './tabs/Politics';
import { TalkBadge, TalkTab } from './tabs/Talk';
import { DroneMap, DronePanel, DroneSend, ListAction, LookMap, LookPanel, MyPlotsMap, MyPlotsPanel, SellPlotMap } from './tools';

/** Look's map, or while the Sheriff picks guards the same map in Guard mode (S4-C15, P8: one map, the hub's). */
function LookOrGuardMap() {
  return useGuarding() ? <GuardMap /> : <LookMap />;
}

/** The plot looked at, and on a rival's plot the secret power cut (S4-C14); nothing while the map is in Guard mode. */
function LookOrGuardPanel() {
  if (useGuarding()) return null;
  return (
    <>
      <LookPanel />
      <LookSabotage />
    </>
  );
}

/** The Market desk, and under it the secret rumour and this player's orders (S4-C14). */
function MarketWithSabotage() {
  return (
    <>
      <MarketDesk />
      <MarketSabotage />
    </>
  );
}

/** What this month needs that the stock does not hold, as a door into Colony: "Short 3 Food". */
const NEEDS_AGENDA: AgendaSlot = {
  key: 'needs',
  show: ({ view, me }) => shortOf({ view, me }).length > 0,
  title: ({ view, me }) => `Short ${shortOf({ view, me }).map((n) => `${n.short} ${GOOD_NAME[n.good]}`).join(', ')}`,
  sub: () => 'What you need this month',
  opens: { desk: 'colony' },
};
const shortOf = ({ view, me }: Pick<HubSeat, 'view' | 'me'>) => needRows(me.monthNeeds, me.stock, view.tiles.filter((t) => t.owner === me.id)).filter((n) => n.short > 0);

const ICON = {
  overview: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14',
  politics: 'M4 10h16 M6 10v8 M10 10v8 M14 10v8 M18 10v8 M3 20h18 M12 3l9 5H3z',
  colony: 'M3 11l9-7 9 7v9H3z M9 20v-6h6v6',
  talk: 'M4 5h16v10H9l-5 4z',
};

/** The planning hub's tabs and their parts (the approved hub-tabs mock); the politics sub-tabs and the plot picks register here too, see ./slots.ts. */
export const TAB_SLOTS: TabHubSlots = {
  tabs: [
    { id: 'overview', label: TAB_WORD.overview, icon: ICON.overview, Body: OverviewTab },
    { id: 'politics', label: TAB_WORD.politics, icon: ICON.politics, Body: PoliticsTab, Badge: PoliticsBadge, show: ({ view }) => view.politics !== null },
    { id: 'colony', label: TAB_WORD.colony, icon: ICON.colony, Body: ColonyTab },
    { id: 'talk', label: TAB_WORD.talk, icon: ICON.talk, Body: TalkTab, Badge: TalkBadge },
  ],
  // Today's politics desks, as they are; the Sheriff's for its holder alone.
  politicsTabs: [COUNCIL_DESK, GOVERNOR_DESK, SHERIFF_DESK].map(asDeskSub),
  tools: [
    { id: 'look', label: 'Look', hint: () => 'Tap a plot to see what it can make and who owns it.', Map: LookOrGuardMap, Panel: LookOrGuardPanel },
    { id: 'plots', label: 'My plots', locked: true, hint: () => 'Every plot you own and what it can make. Tap one to find it on the map.', Map: MyPlotsMap, Panel: MyPlotsPanel },
    {
      id: 'drone',
      label: 'Geo drone',
      locked: true,
      // Its hint is its panel's, in the rail, on every screen.
      hint: () => '',
      Map: DroneMap,
      Panel: DronePanel,
      Action: DroneSend,
    },
    // The Market desk is this tool's rail panel: the form, the line-up and the prices beside the plot picked to sell.
    { id: 'list', label: 'Sell', hint: () => 'Tap a plot of yours (or one with your MULE) to put it up for the auction.', Map: SellPlotMap, Panel: MarketWithSabotage, Action: ListAction },
  ],
  // The tools' own doors (the drone, selling a plot or MULE) are the tool row's, right above This month.
  agenda: [LAW_AGENDA, ELECTION_AGENDA, { ...GOVERNOR_AGENDA, show: ({ view, self }) => view.politics?.governor === self.id }, NEEDS_AGENDA],
  banners: [],
  lines: [OFFICES_BANNER],
  picks: [],
  nows: [councilNow, strikeNow, electionNow],
  underNow: [STRIKE_ALERT, STRIKE_PAY_LINE],
  stage: [ELECTION_DAY_STAGE, COUNCIL_STAGE],
  readyWords: [electionReadyWords, councilReadyWords],
};
