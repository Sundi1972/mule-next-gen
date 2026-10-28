import { DEVELOPMENT } from '@mule/engine';
import { ChatBadge, MarketDesk, MarketStrip, TalkDesk } from './desks';
import { ColonyWithFacts } from './politics/Colony';
import { COUNCIL_DESK, ELECTION_AGENDA, electionNow, GOVERNOR_AGENDA, GOVERNOR_DESK, OFFICES_BANNER } from './politics/slots';
import type { HubSlots } from './slots';
import { DroneAction, DroneMap, DroneRail, ListAction, LookMap, LookPanel, SellPlotMap } from './tools';

/** The hub's parts that exist today (C17). WS7 adds its politics to these lists; see ./slots.ts. */
export const HUB_SLOTS: HubSlots = {
  banners: [OFFICES_BANNER],
  beneath: [{ id: 'market-strip', Body: MarketStrip }],
  agenda: [
    ELECTION_AGENDA,
    {
      key: 'drone',
      title: () => 'Geo drone',
      sub: ({ me }) => (me.droneOrder.length > 0 ? 'On its way · read at the land grant' : `${DEVELOPMENT.dronePlots} plots · ${DEVELOPMENT.droneFee} cr`),
      locked: true,
      opens: { tool: 'drone' },
    },
    { key: 'list', title: () => 'Sell a plot or MULE', sub: () => 'At the auction after planning', opens: { desk: 'market' } },
    GOVERNOR_AGENDA,
  ],
  tools: [
    { id: 'look', label: 'Look', hint: () => 'Tap a plot to see what it can make and who owns it.', Map: LookMap, Panel: LookPanel },
    {
      id: 'drone',
      label: 'Geo drone',
      locked: true,
      hint: () => `Tap up to ${DEVELOPMENT.dronePlots} free plots: the drone reads their ground for ${DEVELOPMENT.droneFee} cr. Only you see the result.`,
      Map: DroneMap,
      Panel: DroneRail,
      Action: DroneAction,
    },
    { id: 'list', label: 'Sell a plot', hint: () => 'Tap a plot of yours (or one with your MULE) to put it up for the auction.', Map: SellPlotMap, Action: ListAction, desk: 'market' },
  ],
  desks: [
    { id: 'colony', label: 'Colony', icon: 'M3 11l9-7 9 7v9H3z M9 20v-6h6v6', Body: ColonyWithFacts },
    { id: 'talk', label: 'Talk', icon: 'M4 5h16v10H9l-5 4z', Body: TalkDesk, Badge: ChatBadge },
    COUNCIL_DESK,
    { id: 'market', label: 'Market', icon: 'M3 12l9-9h8v8l-9 9z M16 7h.01', Body: MarketDesk, tool: 'list' },
    GOVERNOR_DESK,
  ],
  nows: [electionNow],
};
