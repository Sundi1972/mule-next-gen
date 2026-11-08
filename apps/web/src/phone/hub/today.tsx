import { DEVELOPMENT } from '@mule/engine';
import { SeatWords } from '../../components/SeatWords';
import { STRIKE_ALERT, STRIKE_PAY_LINE, strikeNow } from '../../components/Strike';
import { MarketDesk, MarketStrip, TalkBadge, TalkDesk } from './desks';
import { ColonyWithFacts } from './politics/Colony';
import { incomingOf } from './politics/Deals';
import { LookSabotage, MarketSabotage } from './politics/Sabotage';
import { GuardMap, SHERIFF_DESK, useGuarding } from './politics/Sheriff';
import { COUNCIL_DESK, COUNCIL_STAGE, councilNow, councilReadyWords, ELECTION_AGENDA, ELECTION_DAY_STAGE, electionNow, electionReadyWords, GOVERNOR_AGENDA, GOVERNOR_DESK, LAW_AGENDA, OFFICES_BANNER } from './politics/slots';
import type { AgendaSlot, HubSlots } from './slots';
import { DroneMap, DronePanel, DroneSend, ListAction, LookMap, LookPanel, MyPlotsMap, MyPlotsPanel, SellPlotMap } from './tools';

/** "1 deal offer · from Lena": first among the month's doors while a card waits for this player's answer. */
const DEALS_AGENDA: AgendaSlot = {
  key: 'deals',
  show: ({ me }) => incomingOf(me).length > 0,
  title: ({ me }) => {
    const n = incomingOf(me).length;
    return `${n} deal ${n === 1 ? 'offer' : 'offers'}`;
  },
  sub: ({ view, me }) => {
    const from = [...new Set(incomingOf(me).map((c) => c.from))];
    const names = from.map((id) => view.players.find((p) => p.id === id)?.name ?? '');
    return <SeatWords text={`From ${names.join(', ')} · answer before Ready`} who={from} players={view.players} />;
  },
  locked: true,
  lead: () => true,
  opens: { desk: 'talk', focus: 'deals' },
};

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

/** The hub's parts that exist today (C17). WS7 adds its politics to these lists; see ./slots.ts. */
export const HUB_SLOTS: HubSlots = {
  banners: [],
  lines: [OFFICES_BANNER],
  beneath: [{ id: 'market-strip', Body: MarketStrip }],
  agenda: [
    DEALS_AGENDA,
    LAW_AGENDA,
    ELECTION_AGENDA,
    {
      key: 'drone',
      title: () => 'Geo drone',
      sub: ({ me }) => (me.droneOrder.length > 0 ? 'Used this month' : `${DEVELOPMENT.dronePlots} plots · ${DEVELOPMENT.droneFee} cr`),
      locked: true,
      opens: { tool: 'drone' },
    },
    { key: 'list', title: () => 'Sell a plot or MULE', sub: () => 'At the auction after planning', opens: { desk: 'market' } },
    GOVERNOR_AGENDA,
  ],
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
    { id: 'list', label: 'Sell a plot', hint: () => 'Tap a plot of yours (or one with your MULE) to put it up for the auction.', Map: SellPlotMap, Action: ListAction, desk: 'market' },
  ],
  desks: [
    { id: 'colony', label: 'Colony', icon: 'M3 11l9-7 9 7v9H3z M9 20v-6h6v6', Body: ColonyWithFacts },
    { id: 'talk', label: 'Talk', icon: 'M4 5h16v10H9l-5 4z', Body: TalkDesk, Badge: TalkBadge },
    COUNCIL_DESK,
    { id: 'market', label: 'Market', icon: 'M3 12l9-9h8v8l-9 9z M16 7h.01', Body: MarketWithSabotage, tool: 'list' },
    GOVERNOR_DESK,
    SHERIFF_DESK,
  ],
  nows: [councilNow, strikeNow, electionNow],
  underNow: [STRIKE_ALERT, STRIKE_PAY_LINE],
  stage: [ELECTION_DAY_STAGE, COUNCIL_STAGE],
  readyWords: [electionReadyWords, councilReadyWords],
};
