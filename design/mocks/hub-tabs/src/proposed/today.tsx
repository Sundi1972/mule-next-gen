import { usePhoneGame } from '../../../../../apps/web/src/phone/game';
import { MarketDesk } from '../../../../../apps/web/src/phone/hub/desks';
import { needRows } from '../../../../../apps/web/src/phone/hub/needs';
import { COUNCIL_STAGE, ELECTION_AGENDA, ELECTION_DAY_STAGE, GOVERNOR_AGENDA, LAW_AGENDA, OFFICES_BANNER } from '../../../../../apps/web/src/phone/hub/politics/slots';
import type { AgendaSlot } from '../../../../../apps/web/src/phone/hub/slots';
import { HUB_SLOTS } from '../../../../../apps/web/src/phone/hub/today';
import { DEALS_AGENDA } from '../copied/deals/today';
import { OVERRULE_CALL_LINE } from '../copied/budget/OverruleCall';
import { OVERRULE_STAGE, overruleNow, overruleReadyWords } from '../copied/budget/OverruleBallot';
import { POLITICS_TABS, PoliticsBadge, PoliticsTab } from './tabs/Politics';
import { ColonyTab } from './tabs/Colony';
import { TalkBadge, TalkTab } from './tabs/Talk';
import { OverviewTab, TAB_WORD } from './tabs/Overview';
import type { PlotPickSlot, TabHubSlots } from './slots';
import { useClient } from '../../../../../apps/web/src/net/react';
import { GuardMap } from '../copied/sheriff/GuardMap';
import { useHub } from './Hub';

/*
 * GRAFT TARGET: apps/web/src/phone/hub/today.tsx — HUB_SLOTS becomes TAB_SLOTS. Today's tools, agenda, nows,
 * underNow and readyWords are taken as they are; the desks become tabs and sub-tabs; the Market desk folds into the
 * "Sell a plot" tool's rail panel; the election day and law ballot stage slots leave the stage for their sub-tabs.
 */

/** "Short 1 Energy": what this month needs that the stock does not hold, as a door into Colony (it was the stage's strip). */
const NEEDS_AGENDA: AgendaSlot = {
  key: 'needs',
  show: ({ view, me }) => needRows(me.monthNeeds, me.stock, view.tiles.filter((t) => t.owner === me.id)).some((n) => n.short > 0),
  title: ({ view, me }) => {
    const short = needRows(me.monthNeeds, me.stock, view.tiles.filter((t) => t.owner === me.id)).filter((n) => n.short > 0);
    return `Short ${short.map((n) => `${n.short} ${n.good[0]!.toUpperCase()}${n.good.slice(1)}`).join(', ')}`;
  },
  sub: () => 'What you need this month',
  opens: { desk: 'colony' },
};

const ICON = {
  overview: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14',
  politics: 'M4 10h16 M6 10v8 M10 10v8 M14 10v8 M18 10v8 M3 20h18 M12 3l9 5H3z',
  colony: 'M3 11l9-7 9 7v9H3z M9 20v-6h6v6',
  talk: 'M4 5h16v10H9l-5 4z',
};

/** Sell a plot or MULE: the tool's map as today, and in the rail what the Market desk held (the form, the line-up, the prices). */
const tools = HUB_SLOTS.tools.map((t) => (t.id === 'list' ? { ...t, label: 'Sell', Panel: MarketDesk } : t));

/**
 * The Sheriff's Guard (WS8's P8, PM ruling 8 Nov): a pick the Sheriff sub-tab hands to Overview's one map. WS8's GuardMap
 * (variant B's, copied) is the map with its own bar, "Guarding · 1 of 2 · Done · back to Sheriff"; Done sends the
 * whole list (the guard intent) and goes back to the Sheriff sub-tab.
 */
function GuardPickMap() {
  const { view, me } = usePhoneGame();
  const client = useClient();
  const { endPick, open } = useHub();
  const start = me.politics?.sheriff;
  if (!start) return null;
  return (
    <GuardMap
      view={view}
      start={start}
      onBack={(tiles) => {
        client.intent({ type: 'guard', tiles });
        endPick();
        open({ tab: 'politics', sub: 'sheriff' });
      }}
    />
  );
}

const GUARD_PICK: PlotPickSlot = {
  id: 'guard',
  label: 'Guarding',
  hint: () => 'tap a plot to post a guard there this month',
  back: { tab: 'politics', sub: 'sheriff', label: 'Sheriff' },
  ownBar: true,
  Map: GuardPickMap,
  show: ({ view, self }) => view.politics?.sheriff === self.id,
};

/** The overrule call as a row, while one waits: it opens Council › Laws, where its ballot will be. */
const OVERRULE_AGENDA: AgendaSlot = {
  key: 'overrule',
  show: ({ view }) => view.politics?.overrule?.stage === 'called',
  title: () => 'Overrule vote',
  sub: ({ view }) => `${view.players.find((p) => p.id === view.politics?.overrule?.caller)?.name ?? ''} called it · held as planning ends`,
  lead: () => true,
  opens: { desk: 'council' },
};

export const TAB_SLOTS: TabHubSlots = {
  tabs: [
    { id: 'overview', label: TAB_WORD.overview, icon: ICON.overview, Body: OverviewTab },
    { id: 'politics', label: TAB_WORD.politics, icon: ICON.politics, Body: PoliticsTab, Badge: PoliticsBadge, show: ({ view }) => view.politics !== null },
    { id: 'colony', label: TAB_WORD.colony, icon: ICON.colony, Body: ColonyTab },
    { id: 'talk', label: TAB_WORD.talk, icon: ICON.talk, Body: TalkTab, Badge: TalkBadge },
  ],
  politicsTabs: POLITICS_TABS,
  tools,
  // The tools' own doors (Geo drone, Sell a plot or MULE) are not rows: the tool row is right above them.
  agenda: [DEALS_AGENDA, OVERRULE_AGENDA, LAW_AGENDA, ELECTION_AGENDA, { ...GOVERNOR_AGENDA, show: ({ view, self }) => view.politics?.governor === self.id }, NEEDS_AGENDA],
  banners: [],
  lines: [OFFICES_BANNER],
  picks: [GUARD_PICK],
  nows: [overruleNow, ...HUB_SLOTS.nows],
  underNow: [...(HUB_SLOTS.underNow ?? []), OVERRULE_CALL_LINE],
  // Ceremonies only: the reveals, which the table watches together, still take the whole stage, tabs and all. Election
  // day's announce and ballot, the law ballot and the overrule ballot are sub-tabs now (Laws, Elections).
  stage: [
    { ...ELECTION_DAY_STAGE, show: ({ view }) => view.politics?.election?.stage === 'ceremony' },
    { ...COUNCIL_STAGE, show: ({ view }) => view.politics?.council?.stage === 'reveal' },
    { ...OVERRULE_STAGE, show: ({ view }) => view.politics?.overrule?.stage === 'reveal' },
  ],
  readyWords: [...(HUB_SLOTS.readyWords ?? []), overruleReadyWords],
};

