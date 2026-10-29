import type { MuleView } from '@mule/protocol';
import { cx } from '@mule/ui';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { PHASE_NAME, secondsUntil } from '../../game/derive';
import { useServerNow } from '../../net/react';
import { usePhoneGame } from '../game';
import { PhoneShell, useWide, type Now } from '../Shell';
import { needRows, planNow } from './needs';
import { NeedsStrip } from './NeedsStrip';
import { EyeOff, OnlyYou } from './OnlyYou';
import { connectedIn, readyNowIn, stillPlanning } from './ready';
import { ReadyBar, ReadyCount } from './ReadyBar';
import { Roadmap } from './Roadmap';
import { drawnSlots, firstGiven, goTo, settle, type AgendaSlot, type DeskSlot, type HubPlace, type HubSeat, type HubSlots, type MapToolSlot, type StageSlot } from './slots';
import { StandingsSheet, useStanding } from './Standings';

/** The hub's open desk and map tool, for any slot's components to read and change. */
export interface HubNav {
  desk: string;
  tool: string;
  /** What the open desk was opened to show, from a door's `focus`; null once taken, or after a tab or tool. */
  focus: string | null;
  /** Opens a desk, with a focus for it, and the map tool it names. */
  openDesk(id: string, focus?: string): void;
  /** Switches the map's tool, and opens the desk it names. */
  pickTool(id: string): void;
  /** The desk has shown its focus: a later door with the same focus shows it again. */
  takeFocus(): void;
}

const Nav = createContext<HubNav | null>(null);

export function useHub(): HubNav {
  const nav = useContext(Nav);
  if (!nav) throw new Error('Not inside the hub');
  return nav;
}

/** The export ship and what it is for, in plain words, at the head of "This month". */
function shipLine(view: Pick<MuleView, 'ship'>): string {
  return `Export ship ${view.ship.inPort ? 'in port' : `in month ${view.ship.arrives}`}: it buys the colony’s leftovers`;
}

/** Planning: the month's hub, from the slots it is given. */
export function Hub({ slots }: { slots: HubSlots }) {
  const { table, view, me, self } = usePhoneGame();
  const serverNow = useServerNow();
  const seat: HubSeat = { view, me, self };
  const drawn = drawnSlots(slots, seat);
  const [held, setPlace] = useState<HubPlace>(() => settle({ desk: drawn.desks[0]?.id ?? '', tool: drawn.tools[0]?.id ?? '', focus: null, first: null }, drawn, seat));
  const place = settle(held, drawn, seat);
  if (place !== held) setPlace(place);
  // A slot that stops showing (an office handed on) gives way to the first one drawn.
  const desk = drawn.desks.find((d) => d.id === place.desk) ?? drawn.desks[0];
  const tool = drawn.tools.find((t) => t.id === place.tool) ?? drawn.tools[0];
  const go = (to: AgendaSlot['opens']) => setPlace((p) => goTo(p, to, drawn));
  const nav: HubNav = {
    desk: desk?.id ?? '',
    tool: tool?.id ?? '',
    focus: place.focus,
    openDesk: (id, focus) => go(focus === undefined ? { desk: id } : { desk: id, focus }),
    pickTool: (id) => go({ tool: id }),
    takeFocus: () => setPlace((p) => ({ ...p, focus: null })),
  };
  const others = stillPlanning(view.players, connectedIn(table.seats)).filter((s) => s.id !== self.id);
  const now: Now =
    readyNowIn(view, self.ready, others, table.hostId === self.id) ??
    firstGiven(drawn.nows, seat) ??
    planNow(needRows(me.monthNeeds, me.stock, view.tiles.filter((t) => t.owner === me.id)));
  const stage = drawn.stage?.[0];
  const bar = firstGiven(drawn.readyWords ?? [], seat);
  // While a desk asks first, it and its tabs sit closer, so the desk keeps its room (E-9, E-11).
  const asked = !stage && place.first !== null;
  const [sheet, setSheet] = useState(false);
  const standing = useStanding(() => setSheet(true));
  const Panel = tool?.Panel;
  // The tools are off the stage while a situation holds it, so their action leaves the footer.
  const Action = stage ? undefined : tool?.Action;
  const Body = desk?.Body;
  const StageRail = stage?.Rail;

  return (
    <Nav.Provider value={nav}>
      <PhoneShell
        phase={stage?.phase?.(seat) ?? PHASE_NAME.planning}
        seconds={secondsUntil(view.phaseEndsAt, serverNow)}
        status={<ReadyCount players={view.players} label={bar?.label} />}
        now={now}
        // Now is folded to its title from its first render, in any month, and a new title remounts it folded; a tap
        // opens it. A situation on the stage keeps it whole.
        foldNow={!stage}
        standing={standing}
        fill
        rail={
          stage ? (
            StageRail && <StageRail />
          ) : (
            <>
              {Panel && <Panel />}
              <DeskGroup tight={asked}>
                <DeskTabs desks={drawn.desks} active={nav.desk} first={place.first} onPick={nav.openDesk} />
                {Body && (
                  <div className="flex flex-col gap-2.5 @min-[1100px]/shell:gap-4" data-testid={`desk-body-${nav.desk}`}>
                    <Body />
                  </div>
                )}
              </DeskGroup>
            </>
          )
        }
        footer={
          <>
            {Action && <Action />}
            <ReadyBar words={bar ?? undefined} canReady={bar?.canReady} />
          </>
        }
      >
        {stage ? <SituationStage stage={stage} tool={tool} /> : <HubStage drawn={drawn} seat={seat} tool={tool} nav={nav} go={go} />}
        {sheet && <StandingsSheet onClose={() => setSheet(false)} />}
      </PhoneShell>
    </Nav.Provider>
  );
}

/**
 * The stage: the month's roadmap with its lines, what you need this month, banners, This month, the map with its tools,
 * and from 1100 px what sits under it.
 */
function HubStage({ drawn, seat, tool, nav, go }: { drawn: HubSlots; seat: HubSeat; tool: MapToolSlot | undefined; nav: HubNav; go(to: AgendaSlot['opens']): void }) {
  const wide = useWide();
  const ToolMap = tool?.Map;
  const openNeeds = (el: Element) => {
    nav.openDesk('colony');
    // The full list sits in the Colony desk: bring it into the rail's view once the desk is drawn.
    requestAnimationFrame(() => el.closest('[data-testid="game-shell"]')?.querySelector('[data-testid="this-month"]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 @min-[1100px]/shell:gap-4">
      <Roadmap lines={drawn.lines ?? []} />
      <NeedsStrip onOpen={openNeeds} />
      {drawn.banners.map(({ id, Body }) => (
        <Body key={id} />
      ))}
      <AgendaRow items={drawn.agenda} seat={seat} note={shipLine(seat.view)} onOpen={go} />
      <div className="flex min-h-0 flex-1 gap-2 @min-[1100px]/shell:flex-col @min-[1100px]/shell:gap-4" data-testid="tools-and-map">
        <MapTools tools={drawn.tools} active={nav.tool} onPick={nav.pickTool} hint={wide && tool ? tool.hint(seat) : null} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="hub-map">
          {ToolMap && <ToolMap />}
        </div>
      </div>
      {drawn.beneath.map(({ id, Body }) => (
        <div key={id} className="hidden @min-[1100px]/shell:block">
          <Body />
        </div>
      ))}
    </div>
  );
}

/** A situation on the stage, such as election day; from 1100 px the open tool's map stays under it. */
function SituationStage({ stage: { Body }, tool }: { stage: StageSlot; tool: MapToolSlot | undefined }) {
  const ToolMap = useWide() ? tool?.Map : undefined;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto @min-[1100px]/shell:gap-4 @min-[1100px]/shell:overflow-visible" data-testid="hub-situation">
      <Body />
      {ToolMap && (
        <div className="flex min-h-0 flex-1 flex-col" data-testid="hub-map">
          <ToolMap />
        </div>
      )}
    </div>
  );
}

/**
 * The desk tabs and the open desk, as one group. While a desk asks first (E-9, E-11) they sit closer than the rail's gap
 * on a phone, so the desk keeps its room; otherwise at the rail's own gap, as in any month.
 */
function DeskGroup({ tight, children }: { tight: boolean; children: ReactNode }) {
  return <div className={cx('flex flex-col @min-[1100px]/shell:gap-4', tight ? 'gap-1' : 'gap-2.5')}>{children}</div>;
}

function Glyph({ d, size = 18, className }: { d: string; size?: number; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/**
 * The desks' tabs, on one row. `first` is the desk that asked to come first: amber-edged while another is open. Six
 * keep at least 32 px each in a small phone's 232 px rail: 1 px apart, no side padding, and the words a size smaller
 * there, so "Governor" and "Council" keep every letter (E-11).
 */
export function DeskTabs({ desks, active, first = null, onPick }: { desks: DeskSlot[]; active: string; first?: string | null; onPick(id: string): void }) {
  return (
    <div role="tablist" aria-label="Desks" className="flex gap-0.5 @max-3xl/shell:gap-px @min-[1100px]/shell:gap-1" data-testid="desks">
      {desks.map(({ id, label, icon, locked, Badge }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          onClick={() => onPick(id)}
          className={cx(
            'relative flex min-h-8 min-w-8 flex-auto flex-col items-center justify-center whitespace-nowrap rounded-control border px-0 py-0.5 text-[10px] font-semibold leading-tight @max-3xl/shell:text-[9px] @max-3xl/shell:tracking-tight @min-[1100px]/shell:gap-0.5 @min-[1100px]/shell:px-0.5 @min-[1100px]/shell:py-2 @min-[1100px]/shell:text-xs',
            active === id ? 'border-holo bg-holo-soft text-holo' : 'border-holo-line text-ink-2',
            first === id && active !== id && 'border-warn/60',
          )}
          data-testid={`desk-${id}`}
        >
          <Glyph d={icon} size={14} className="@min-[1100px]/shell:size-4" />
          {label}
          {locked && (
            <span className="absolute left-1 top-1 text-holo" role="img" aria-label="Only you see this">
              <EyeOff size={9} strokeWidth={2.6} />
            </span>
          )}
          {Badge && <Badge />}
        </button>
      ))}
    </div>
  );
}

/** "This month": everything the month allows, each a door into its desk or tool; `note` is the export ship's line. */
export function AgendaRow({ items, seat, note, onOpen }: { items: AgendaSlot[]; seat: HubSeat; note: string; onOpen(opens: AgendaSlot['opens']): void }) {
  return (
    <section className="flex shrink-0 flex-col gap-1" data-testid="agenda">
      <span className="flex items-baseline justify-between gap-2">
        <span className="label-caps shrink-0 text-[10px]! @min-[1100px]/shell:text-sm!">This month</span>
        <span className="min-w-0 truncate text-[10px] text-ink-2 @min-[1100px]/shell:text-sm" data-testid="ship-line">
          {note}
        </span>
      </span>
      <div className="flex gap-1.5 overflow-x-auto pb-1 @min-[1100px]/shell:grid @min-[1100px]/shell:grid-flow-col @min-[1100px]/shell:grid-cols-[repeat(auto-fit,minmax(0,1fr))] @min-[1100px]/shell:gap-2 @min-[1100px]/shell:overflow-visible">
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            onClick={() => onOpen(it.opens)}
            className={cx(
              'flex min-w-[124px] shrink-0 flex-col items-start gap-0.5 rounded-control border bg-panel px-2 py-1 text-left hover:border-holo @min-[1100px]/shell:min-w-0 @min-[1100px]/shell:px-3 @min-[1100px]/shell:py-2',
              it.lead?.(seat) ? 'border-2 border-holo bg-holo-soft' : 'border-holo-line',
            )}
            data-testid={`agenda-${it.key}`}
          >
            <span className="flex w-full flex-wrap items-center gap-x-1">
              <span className="truncate text-xs font-semibold @min-[1100px]/shell:text-base">{it.title(seat)}</span>
              {it.locked && <OnlyYou />}
            </span>
            <span className="truncate text-[10px] text-ink-2 @min-[1100px]/shell:text-sm">{it.sub(seat)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * The map's tools. On a phone they stand beside the map, in the room its shape leaves: a column of four 32 px tools, a
 * fifth starting a second column, and on a small phone two to a column, in narrower columns. On a laptop they sit in a
 * row above it, with the open tool's hint.
 */
export function MapTools({ tools, active, onPick, hint }: { tools: MapToolSlot[]; active: string; onPick(id: string): void; hint: string | null }) {
  return (
    <div
      className="grid shrink-0 grid-flow-col grid-rows-[repeat(4,auto)] content-start justify-start gap-1 @max-3xl/shell:auto-cols-[--spacing(22)] @max-3xl/shell:grid-rows-[repeat(2,auto)] @min-[1100px]/shell:flex @min-[1100px]/shell:flex-row @min-[1100px]/shell:flex-wrap @min-[1100px]/shell:items-center"
      role="toolbar"
      aria-label="Map tools"
      data-testid="map-tools"
    >
      {tools.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-pressed={active === t.id}
          onClick={() => onPick(t.id)}
          className={cx(
            'relative flex min-h-8 shrink-0 items-center gap-1 rounded-control border px-2 text-[11px] font-semibold @max-3xl/shell:flex-wrap @max-3xl/shell:py-0.5 @max-3xl/shell:text-left @max-3xl/shell:leading-tight @min-[1100px]/shell:h-9 @min-[1100px]/shell:px-3 @min-[1100px]/shell:text-sm',
            active === t.id ? 'border-holo bg-holo-soft text-holo' : 'border-holo-line text-ink-2',
          )}
          data-testid={`tool-${t.id}`}
        >
          {t.label}
          {t.locked && <OnlyYou text={t.locked === 'icon' ? '' : 'Only you'} />}
        </button>
      ))}
      {hint && <span className="ml-2 text-sm text-ink-2">{hint}</span>}
    </div>
  );
}
