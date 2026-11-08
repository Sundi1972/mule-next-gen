import { Button } from '@mule/ui';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { PHASE_NAME } from '../../../../../apps/web/src/game/derive';
import { usePhoneGame } from '../../../../../apps/web/src/phone/game';
import { useHub as useRealHub, type HubNav as RealHubNav } from '../../../../../apps/web/src/phone/hub/Hub';
import { needRows, planNow } from '../../../../../apps/web/src/phone/hub/needs';
import { NeedsStrip } from '../../../../../apps/web/src/phone/hub/NeedsStrip';
import { connectedIn, readyNowIn, stillPlanning } from '../../../../../apps/web/src/phone/hub/ready';
import { ReadyBar, ReadyCount } from '../../../../../apps/web/src/phone/hub/ReadyBar';
import { Roadmap } from '../../../../../apps/web/src/phone/hub/Roadmap';
import { firstGiven, type HubSeat } from '../../../../../apps/web/src/phone/hub/slots';
import { useStanding } from '../../../../../apps/web/src/phone/hub/Standings';
import { useEscape } from '../../../../../apps/web/src/phone/dialog';
import type { Now } from '../../../../../apps/web/src/phone/Shell';
import { StandingsSheet } from '../copied/deals/Standings';
import { NowLine, PhaseLine, TabShell, type ShellVariant } from './Shell';
import type { Door, PlotPickSlot, SubTabSlot, TabHubSlots, TabId, TabSlot } from './slots';

/*
 * GRAFT TARGET: apps/web/src/phone/hub/Hub.tsx. The hub as tabs: Overview · Governor (Council) · Colony · Talk, the
 * open tab's stage on the left, the slim rail on the right. What changes in Hub.tsx:
 *   - HubNav gains `tab`, `sub`, `pick`, open(door), startPick(id), endPick(); openDesk/pickTool stay, translated by
 *     DESK_DOORS below, so every desk and tool that calls them today keeps working unchanged;
 *   - HubPlace becomes { tab, sub, tool, focus, pick, first } (settle/goTo in slots.ts follow);
 *   - HubStage, DeskTabs, DeskGroup, AgendaRow and MapTools leave Hub.tsx for the tabs (./tabs/*.tsx);
 *   - SituationStage stays, for a ceremony only.
 */

/** The hub's place, for any tab's components to read and change. Today's fields first, unchanged in meaning. */
export interface HubNav extends RealHubNav {
  tab: TabId;
  /** The open sub-tab of the Governor / Council tab. */
  sub: string;
  /** The plot-picking mode another tab handed to Overview's map, or null. */
  pick: string | null;
  open(door: Door): void;
  startPick(id: string): void;
  endPick(): void;
}

const Nav = createContext<HubNav | null>(null);

/**
 * The hub's navigation. MOCK PLUMBING: the real desks import `useHub` from Hub.tsx; this mock's vite config hands
 * them this one, which answers from the tabbed hub and falls back to the real hub's inside today's frame.
 */
export function useHub(): HubNav {
  const mine = useContext(Nav);
  let real: RealHubNav | null = null;
  try {
    // Always called, so the hook order never changes; it throws outside today's hub.
    real = useRealHub();
  } catch {
    real = null;
  }
  const nav = mine ?? (real as HubNav | null);
  if (!nav) throw new Error('Not inside the hub');
  return nav;
}

/** Today's desk ids, as the doors into the tabs. Every openDesk() a real desk makes lands through this table. */
export const DESK_DOORS: Record<string, (focus?: string) => Door> = {
  colony: () => ({ tab: 'colony' }),
  talk: (focus) => ({ tab: 'talk', ...(focus ? { focus } : {}) }),
  council: (focus) => ({ tab: 'politics', sub: focus === 'run' ? 'elections' : 'laws', ...(focus ? { focus } : {}) }),
  governor: () => ({ tab: 'politics', sub: 'laws' }),
  market: () => ({ tab: 'overview', tool: 'list' }),
  sheriff: () => ({ tab: 'politics', sub: 'sheriff' }),
};

const isGovernor = ({ view, self }: HubSeat) => view.politics?.governor === self.id;

/** The desk id today's components expect for the open tab, such as the Talk badge's "desk === 'talk'". */
function deskOf(tab: TabId, seat: HubSeat): string {
  if (tab === 'politics') return isGovernor(seat) ? 'governor' : 'council';
  return tab === 'overview' ? 'map' : tab;
}

interface Place {
  tab: TabId;
  sub: string;
  tool: string;
  focus: string | null;
  pick: string | null;
  sheet: 'help' | 'standings' | null;
}

/** What the open tab and its parts draw from: the drawn slots and the seat. */
export interface Drawn {
  slots: TabHubSlots;
  seat: HubSeat;
  tabs: TabSlot[];
  subs: SubTabSlot[];
  pick: PlotPickSlot | null;
}
const DrawnCtx = createContext<Drawn | null>(null);
export function useDrawn(): Drawn {
  const d = useContext(DrawnCtx);
  if (!d) throw new Error('Not inside the tabbed hub');
  return d;
}

function shown<T extends { show?: (seat: HubSeat) => boolean }>(xs: readonly T[], seat: HubSeat): T[] {
  return xs.filter((x) => x.show?.(seat) ?? true);
}

/** MOCK PLUMBING: where a state's link opens the phone. The build starts on Overview, or where a door leads. */
export interface Start extends Partial<Door> {
  pick?: string;
  /** Look's plot as the phone opens, as a tap on the map would set it (the Sheriff path's order). */
  look?: { x: number; y: number };
  sheet?: 'help' | 'standings';
}

/** Planning: the month's hub as four tabs, from the slots it is given. */
export function TabHub({ slots, variant, start }: { slots: TabHubSlots; variant: ShellVariant; start?: Start | undefined }) {
  const { table, view, me, self } = usePhoneGame();
  const seat: HubSeat = { view, me, self };
  const tabs = shown(slots.tabs, seat);
  const subs = shown(slots.politicsTabs, seat);
  const tools = shown(slots.tools, seat);
  const [place, setPlace] = useState<Place>(() => ({
    tab: start?.tab ?? 'overview',
    sub: start?.sub ?? subs[0]?.id ?? 'laws',
    tool: start?.tool ?? tools[0]?.id ?? 'look',
    focus: start?.focus ?? null,
    pick: start?.pick ?? null,
    sheet: start?.sheet ?? null,
  }));
  const go = (door: Door) =>
    setPlace((p) => ({
      ...p,
      tab: door.tab,
      sub: door.sub ?? p.sub,
      tool: door.tool ?? p.tool,
      focus: door.focus ?? null,
      // A door away from Overview ends a pick; one to it keeps it.
      pick: door.tab === 'overview' ? p.pick : null,
    }));
  const pick = place.pick ? (shown(slots.picks, seat).find((x) => x.id === place.pick) ?? null) : null;
  const nav: HubNav = {
    desk: deskOf(place.tab, seat),
    tool: place.tool,
    focus: place.focus,
    openDesk: (id, focus) => go(DESK_DOORS[id]?.(focus) ?? { tab: 'overview' }),
    pickTool: (id) => go({ tab: 'overview', tool: id }),
    takeFocus: () => setPlace((p) => ({ ...p, focus: null })),
    tab: place.tab,
    sub: subs.some((s) => s.id === place.sub) ? place.sub : (subs[0]?.id ?? 'laws'),
    pick: pick?.id ?? null,
    open: go,
    startPick: (id) => setPlace((p) => ({ ...p, tab: 'overview', pick: id, focus: null })),
    endPick: () => setPlace((p) => ({ ...p, pick: null })),
  };

  // The rail's Now, as today's hub computes it: ready words, then the slots' (a ballot's step), then RULE-8's.
  const others = stillPlanning(view.players, connectedIn(table.seats)).filter((s) => s.id !== self.id);
  const now: Now =
    readyNowIn(view, self.ready, others, table.hostId === self.id) ?? firstGiven(slots.nows, seat) ?? planNow(needRows(me.monthNeeds, me.stock, view.tiles.filter((t) => t.owner === me.id)));
  // A sub-tab that asks first (an open ballot): the Now line is its door, while another tab is open.
  const asking = subs.find((s) => s.first?.(seat));
  const goAsk = asking && !(place.tab === 'politics' && nav.sub === asking.id) ? () => go({ tab: 'politics', sub: asking.id }) : undefined;
  const bar = firstGiven(slots.readyWords, seat);
  const ceremony = shown(slots.stage, seat)[0];
  const standing = useStanding(() => setPlace((p) => ({ ...p, sheet: 'standings' })));

  const tab = tabs.find((t) => t.id === place.tab) ?? tabs[0]!;
  const Body = ceremony?.Body ?? tab.Body;
  // On Overview the rail and footer carry the pick's or the open tool's panel and action.
  const tool = tools.find((t) => t.id === place.tool);
  const RailPart = ceremony ? ceremony.Rail : place.tab === 'overview' ? (pick ? pick.Panel : tool?.Panel) : tab.Rail;
  const Action = ceremony ? undefined : place.tab === 'overview' ? (pick ? pick.Action : tool?.Action) : tab.Action;
  const closeSheet = () => setPlace((p) => ({ ...p, sheet: null }));

  return (
    <Nav.Provider value={nav}>
      <DrawnCtx.Provider value={{ slots: { ...slots, tools, agenda: shown(slots.agenda, seat) }, seat, tabs, subs, pick }}>
        <TabShell
          variant={variant}
          phase={ceremony?.phase?.(seat) ?? PHASE_NAME.planning}
          status={<ReadyCount players={view.players} label={bar?.label} />}
          standing={standing}
          tabs={
            ceremony
              ? []
              : tabs.map((t) => ({
                  id: t.id,
                  label: t.label(seat),
                  icon: t.icon,
                  on: t.id === place.tab,
                  Badge: t.Badge,
                  onPick: () => go({ tab: t.id }),
                }))
          }
          head={
            <>
              <PhaseLine />
              <NowLine now={now} onHelp={() => setPlace((p) => ({ ...p, sheet: 'help' }))} onGo={goAsk} />
              {shown(slots.underNow, seat).map(({ id, Body: Line }) => (
                <Line key={id} />
              ))}
            </>
          }
          rail={
            <>
              {/* On Overview the rail says what a tap on the map does (a pick's bar says it itself), then the tool's or the pick's panel. */}
              {!ceremony && place.tab === 'overview' && !pick && tool?.hint(seat) ? (
                <p className="text-[11px] leading-snug text-ink-2" data-testid="tool-hint">
                  {tool.hint(seat)}
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
          stage={
            <div className="flex min-h-0 flex-1 flex-col" data-testid={ceremony ? 'hub-situation' : `tab-body-${tab.id}`}>
              <Body />
            </div>
          }
          layer={
            <>
              {place.sheet === 'help' && <HelpSheet now={now} slots={slots} onClose={closeSheet} onOpenColony={() => { closeSheet(); go({ tab: 'colony' }); }} />}
              {place.sheet === 'standings' && <StandingsSheet onClose={closeSheet} />}
            </>
          }
        />
      </DrawnCtx.Provider>
    </Nav.Provider>
  );
}

/**
 * The "?" sheet: the old stage-top card in full (the month's steps, Now and Next, the offices line), the Now's own
 * detail, and what you need this month. Over the whole phone; Close and Escape shut it.
 * DS-GAP: no Sheet or Dialog component; this copies StandingsSheet's overlay, its 600 px width included.
 */
function HelpSheet({ now, slots, onClose, onOpenColony }: { now: Now; slots: TabHubSlots; onClose(): void; onOpenColony(): void }) {
  const { view } = usePhoneGame();
  useEscape(onClose);
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => {
    sheet.current?.querySelector<HTMLElement>('[data-testid="help-close"]')?.focus();
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
        <Roadmap lines={slots.lines} />
        <section className="flex flex-col gap-0.5 rounded-panel border border-holo-line bg-holo-soft px-2 py-1.5" data-testid="help-now">
          <span className="label-caps text-[10px]!">Now{now.step !== undefined && now.of !== undefined ? ` · step ${now.step} of ${now.of}` : ''}</span>
          <strong className="font-display text-sm font-semibold">{now.title}</strong>
          {now.detail && <p className="text-xs leading-snug text-ink-2">{now.detail}</p>}
        </section>
        <NeedsStrip onOpen={onOpenColony} />
        <p className="text-[11px] text-ink-2" data-testid="help-ship">
          Export ship {view.ship.inPort ? 'in port' : `in month ${view.ship.arrives}`}: it buys the colony’s leftovers.
        </p>
      </div>
    </div>
  );
}

/** A labelled region of the stage that scrolls on its own, under a fixed head. */
export function Scroller({ children, testid }: { children: ReactNode; testid: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5" data-testid={testid}>
      {children}
    </div>
  );
}
