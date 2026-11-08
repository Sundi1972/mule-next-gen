import type { MuleView } from '@mule/protocol';
import { Button } from '@mule/ui';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { PHASE_NAME, secondsUntil } from '../../game/derive';
import { useServerNow } from '../../net/react';
import { useEscape } from '../dialog';
import { usePhoneGame } from '../game';
import { PhoneShell, type Now } from '../Shell';
import { needRows, planNow } from './needs';
import { NeedsStrip } from './NeedsStrip';
import { PickNavProvider } from './politics/Sheriff';
import { connectedIn, readyNowIn, stillPlanning } from './ready';
import { ReadyBar, ReadyCount } from './ReadyBar';
import { Roadmap } from './Roadmap';
import { firstGiven, goTo, shown, type Door, type HubNav, type HubPlace, type HubSeat, type PlotPickSlot, type SubTabSlot, type TabHubSlots, type TabSlot } from './slots';
import { StandingsSheet, useStanding } from './Standings';
import { NowLine, PhaseLine, TabColumn } from './tabs/head';

export type { HubNav } from './slots';

const Nav = createContext<HubNav | null>(null);

/** Where the hub is and the moves between its places, for any tab's components; throws outside the hub. */
export function useHub(): HubNav {
  const nav = useContext(Nav);
  if (!nav) throw new Error('Not inside the hub');
  return nav;
}

/** The hub's navigation, or null outside the hub, for a part drawn both inside and outside it (a player's card). */
export function useHubIfAny(): HubNav | null {
  return useContext(Nav);
}

/**
 * Every desk id as a door into the tabs: openDesk() and an agenda row reach a tab only through an id this table knows
 * (any other id has no door, and its row is not drawn).
 */
export const DESK_DOORS: Record<string, (focus?: string) => Door> = {
  colony: () => ({ tab: 'colony' }),
  talk: (focus) => ({ tab: 'talk', ...withFocus(focus) }),
  market: () => ({ tab: 'overview', tool: 'list' }),
  laws: (focus) => ({ tab: 'politics', sub: 'laws', ...withFocus(focus) }),
  elections: (focus) => ({ tab: 'politics', sub: 'elections', ...withFocus(focus) }),
  budget: (focus) => ({ tab: 'politics', sub: 'budget', ...withFocus(focus) }),
  // These three serve today's desk ids.
  council: (focus) => ({ tab: 'politics', sub: 'council', ...withFocus(focus) }),
  governor: (focus) => ({ tab: 'politics', sub: 'governor', ...withFocus(focus) }),
  // The Sheriff desk's guard door turns Overview's Look map to Guard (useGuarding).
  sheriff: (focus) => (focus === GUARD_FOCUS ? { tab: 'overview', tool: 'look', focus } : { tab: 'politics', sub: 'sheriff', ...withFocus(focus) }),
};
function withFocus(focus: string | undefined): { focus?: string } {
  return focus ? { focus } : {};
}
const GUARD_FOCUS = 'guard';

/** The desk today's components know a place by: a tab's id, Governor / Council's open sub-tab, or the Sheriff's while it guards on the map. */
function deskOf(place: Pick<HubPlace, 'tab' | 'sub' | 'focus'>): string {
  if (place.tab === 'politics') return place.sub;
  if (place.tab === 'overview') return place.focus === GUARD_FOCUS ? 'sheriff' : 'map';
  return place.tab;
}

/** What the open tab and its parts draw from: the slots this seat sees, the seat, and the pick on Overview's map. */
export interface Drawn {
  slots: TabHubSlots;
  seat: HubSeat;
  tabs: TabSlot[];
  subs: SubTabSlot[];
  pick: PlotPickSlot | null;
}
const DrawnCtx = createContext<Drawn | null>(null);

export function useDrawn(): Drawn {
  const drawn = useContext(DrawnCtx);
  if (!drawn) throw new Error('Not inside the hub');
  return drawn;
}

/**
 * The rail head every tab keeps: the phase line, then the Now line, its "?" and, while a sub-tab asks first, its door.
 * A Now that is its own card (a decision with its buttons, such as the strike's) is drawn whole under the Now line.
 */
const Head = createContext<{ now: Now; onHelp(): void; onGo: (() => void) | undefined } | null>(null);
function HubHead() {
  const head = useContext(Head)!;
  const Card = head.now.Card;
  return (
    <div className="flex flex-col gap-1.5" data-testid="rail-head">
      <PhaseLine />
      <NowLine now={head.now} onHelp={head.onHelp} onGo={head.onGo} />
      {Card && <Card />}
    </div>
  );
}

/** Planning: the month's hub as tabs, from the slots it is given (the approved hub-tabs mock). */
export function Hub({ slots }: { slots: TabHubSlots }) {
  const { table, view, me, self } = usePhoneGame();
  const serverNow = useServerNow();
  const seat: HubSeat = { view, me, self };
  const tabs = shown(slots.tabs, seat);
  const subs = shown(slots.politicsTabs, seat);
  const tools = shown(slots.tools, seat);
  const [place, setPlace] = useState<HubPlace>(() => ({ tab: 'overview', sub: subs[0]?.id ?? '', tool: tools[0]?.id ?? '', focus: null, pick: null }));
  const [sheet, setSheet] = useState<'help' | 'standings' | null>(null);
  const go = (door: Door) => setPlace((p) => goTo(p, door));
  // A slot that stops showing (an office handed on), or a door to a sub-tab nobody draws, gives way to the first one drawn.
  const tab = tabs.find((t) => t.id === place.tab) ?? tabs[0]!;
  const sub = subs.find((s) => s.id === place.sub) ?? subs[0];
  const tool = tools.find((t) => t.id === place.tool) ?? tools[0];
  const pick = place.pick ? (shown(slots.picks, seat).find((x) => x.id === place.pick) ?? null) : null;
  const nav: HubNav = {
    desk: deskOf({ tab: tab.id, sub: sub?.id ?? '', focus: place.focus }),
    tool: tool?.id ?? '',
    focus: place.focus,
    openDesk: (id, focus) => go(DESK_DOORS[id]?.(focus) ?? { tab: 'overview' }),
    pickTool: (id) => go({ tab: 'overview', tool: id }),
    // Guard on Overview's map (the Sheriff desk's guard door) is the Sheriff's, so its Done (the focus taken) goes back to the Sheriff's sub-tab.
    takeFocus: () => setPlace((p) => (p.tab === 'overview' && p.focus === GUARD_FOCUS ? goTo(p, DESK_DOORS.sheriff!()) : { ...p, focus: null })),
    tab: tab.id,
    sub: sub?.id ?? '',
    pick: pick?.id ?? null,
    open: go,
    startPick: (id) => setPlace((p) => ({ ...p, tab: 'overview', pick: id, focus: null })),
    endPick: () => setPlace((p) => ({ ...p, pick: null })),
  };

  // The rail's Now: the ready words, then the slots' (a ballot's step), then RULE-8's.
  const others = stillPlanning(view.players, connectedIn(table.seats)).filter((s) => s.id !== self.id);
  const now: Now =
    readyNowIn(view, self.ready, others, table.hostId === self.id) ??
    firstGiven(slots.nows, seat) ??
    planNow(needRows(me.monthNeeds, me.stock, view.tiles.filter((t) => t.owner === me.id)));
  const asking = subs.find((s) => s.first?.(seat));
  const goAsk = asking && !(tab.id === 'politics' && nav.sub === asking.id) ? () => go({ tab: 'politics', sub: asking.id }) : undefined;
  const bar = firstGiven(slots.readyWords, seat);
  const ceremony = shown(slots.stage, seat)[0];
  const standing = useStanding(() => setSheet('standings'));
  const Body = ceremony?.Body ?? tab.Body;
  // On Overview the rail and the footer carry the pick's or the open tool's panel and action.
  const overview = !ceremony && tab.id === 'overview';
  const RailPart = ceremony ? ceremony.Rail : overview ? (pick ? pick.Panel : tool?.Panel) : tab.Rail;
  const Action = ceremony ? undefined : overview ? (pick ? pick.Action : tool?.Action) : tab.Action;
  const hint = overview && !pick ? tool?.hint(seat) : '';
  const closeSheet = () => setSheet(null);

  return (
    <Nav.Provider value={nav}>
      {/* The Sheriff's sub-tab and Guard pick read the hub's navigation through their own provider. */}
      <PickNavProvider value={nav}>
      <DrawnCtx.Provider value={{ slots: { ...slots, tools, agenda: shown(slots.agenda, seat), banners: shown(slots.banners, seat) }, seat, tabs, subs, pick }}>
        <Head.Provider value={{ now, onHelp: () => setSheet('help'), onGo: goAsk }}>
          <PhoneShell
            phase={ceremony?.phase?.(seat) ?? PHASE_NAME.planning}
            seconds={secondsUntil(view.phaseEndsAt, serverNow)}
            status={<ReadyCount players={view.players} label={bar?.label} />}
            now={{ ...now, Card: HubHead }}
            standing={standing}
            fill
            rail={
              <>
                {!ceremony && shown(slots.underNow, seat).map(({ id, Body: Line }) => <Line key={id} />)}
                {hint ? (
                  <p className="text-[11px] leading-snug text-ink-2 @min-[1100px]/shell:text-sm" data-testid="tool-hint">
                    {hint}
                  </p>
                ) : null}
                {RailPart && <RailPart />}
              </>
            }
            footer={
              <>
                {Action && <Action />}
                <ReadyBar words={bar ?? undefined} canReady={bar?.canReady} />
              </>
            }
          >
            <div className="flex min-h-0 flex-1 gap-2.5">
              {!ceremony && <TabColumn tabs={tabs.map((t) => ({ id: t.id, label: t.label(seat), icon: t.icon, on: t.id === tab.id, Badge: t.Badge, onPick: () => go({ tab: t.id }) }))} />}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid={ceremony ? 'hub-situation' : `tab-body-${tab.id}`}>
                <Body />
              </div>
            </div>
            {sheet === 'help' && <HelpSheet now={now} slots={slots} seat={seat} onClose={closeSheet} onOpenColony={() => (closeSheet(), go({ tab: 'colony' }))} />}
            {sheet === 'standings' && <StandingsSheet onClose={closeSheet} />}
          </PhoneShell>
        </Head.Provider>
      </DrawnCtx.Provider>
      </PickNavProvider>
    </Nav.Provider>
  );
}

/** The export ship and what it is for, in plain words. */
function shipLine(view: Pick<MuleView, 'ship'>): string {
  return `Export ship ${view.ship.inPort ? 'in port' : `in month ${view.ship.arrives}`}: it buys the colony’s leftovers.`;
}

/**
 * The "?" sheet: the old stage-top card in full (the month's steps, Now and Next, the offices line), Now's own detail,
 * what you need this month and the ship. Over the whole phone; Close and Escape shut it.
 */
export function HelpSheet({ now, slots, seat, onClose, onOpenColony }: { now: Now; slots: TabHubSlots; seat: HubSeat; onClose(): void; onOpenColony(): void }) {
  const { view } = usePhoneGame();
  useEscape(onClose);
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => {
    sheet.current?.querySelector?.<HTMLElement>('[data-testid="help-close"]')?.focus?.();
  }, []);
  return (
    <div ref={sheet} className="absolute inset-0 z-40 grid place-items-center bg-void/70 p-3" role="dialog" aria-modal aria-labelledby="help-title" data-testid="help-sheet">
      <div className="flex max-h-full w-full max-w-[600px] flex-col gap-2 overflow-y-auto rounded-sheet border-2 border-holo bg-panel p-3 shadow-glow">
        <header className="flex items-center justify-between gap-2">
          <h2 id="help-title" className="font-display text-lg font-semibold">
            Month {view.month} · {PHASE_NAME.planning}
          </h2>
          <Button size="md" variant="ghost" onClick={onClose} data-testid="help-close">
            Close
          </Button>
        </header>
        <Roadmap lines={shown(slots.lines, seat)} />
        <section className="flex flex-col gap-0.5 rounded-panel border border-holo-line bg-holo-soft px-2 py-1.5" data-testid="help-now">
          <span className="label-caps text-[10px]!">Now{now.step !== undefined && now.of !== undefined ? ` · step ${now.step} of ${now.of}` : ''}</span>
          <strong className="font-display text-sm font-semibold">{now.title}</strong>
          {now.detail && <p className="text-xs leading-snug text-ink-2">{now.detail}</p>}
        </section>
        <NeedsStrip onOpen={onOpenColony} />
        <p className="text-[11px] text-ink-2" data-testid="help-ship">
          {shipLine(view)}
        </p>
      </div>
    </div>
  );
}
