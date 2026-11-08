import { HoloMap, type MapTile } from '@mule/ui';
import { mapTiles, plotName, tileAt } from '../../../../../apps/web/src/game/derive';
import { usePhoneGame } from '../../../../../apps/web/src/phone/game';
import { MarketDesk } from '../../../../../apps/web/src/phone/hub/desks';
import { needRows } from '../../../../../apps/web/src/phone/hub/needs';
import { COUNCIL_STAGE, ELECTION_AGENDA, ELECTION_DAY_STAGE, GOVERNOR_AGENDA, LAW_AGENDA, OFFICES_BANNER } from '../../../../../apps/web/src/phone/hub/politics/slots';
import type { AgendaSlot } from '../../../../../apps/web/src/phone/hub/slots';
import { useToday } from '../../../../../apps/web/src/phone/hub/state';
import { HUB_SLOTS } from '../../../../../apps/web/src/phone/hub/today';
import { MapFit } from '../../../../../apps/web/src/phone/Shell';
import { DEALS_AGENDA } from '../copied/deals/today';
import { OVERRULE_CALL_LINE } from '../copied/budget/OverruleCall';
import { OVERRULE_STAGE, overruleNow, overruleReadyWords } from '../copied/budget/OverruleBallot';
import { POLITICS_TABS, PoliticsBadge, PoliticsTab } from './tabs/Politics';
import { ColonyTab } from './tabs/Colony';
import { TalkBadge, TalkTab } from './tabs/Talk';
import { OverviewTab, TAB_WORD } from './tabs/Overview';
import { Button } from '@mule/ui';
import type { PlotPickSlot, TabHubSlots } from './slots';

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
 * The Sheriff's Guard, a pick the Sheriff tab (WS8's stub) hands to Overview's map. MOCK: the plot picked is Look's
 * (useToday().looked); WS8 owns the guard's own state and intent.
 */
function GuardMap() {
  const { view, slot } = usePhoneGame();
  const { looked, setLooked } = useToday();
  const tap = (t: MapTile) => {
    if (t.terrain === 'store') return;
    setLooked(looked?.x === t.x && looked.y === t.y ? null : { x: t.x, y: t.y });
  };
  return (
    <MapFit width={view.width} height={view.height}>
      <HoloMap width={view.width} height={view.height} tiles={mapTiles(view)} onTile={tap} selected={looked} focusSlot={slot} density="phone" />
    </MapFit>
  );
}
function GuardPanel() {
  const { view } = usePhoneGame();
  const { looked } = useToday();
  const tile = looked ? tileAt(view, looked.x, looked.y) : undefined;
  return (
    <section className="flex flex-col gap-0.5 rounded-control border border-warn/60 bg-panel p-2 text-xs" data-testid="guard-panel">
      <span className="label-caps text-[10px]!">Guard · WS8</span>
      {tile ? <span>Plot {plotName(tile.x, tile.y)}: guarded this month. A saboteur here is caught.</span> : <span className="text-ink-2">Tap a plot on the map.</span>}
      <Button size="md" variant="outline" className="mt-1 w-full" disabled={!tile} data-testid="guard-confirm">
        Guard this plot
      </Button>
    </section>
  );
}

const GUARD_PICK: PlotPickSlot = {
  id: 'guard',
  label: 'Guarding',
  hint: () => 'tap the plot to guard this month',
  back: { tab: 'politics', sub: 'sheriff', label: 'Sheriff' },
  Map: GuardMap,
  Panel: GuardPanel,
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

