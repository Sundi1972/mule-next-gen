import type { MuleView } from '@mule/protocol';
import { cx } from '@mule/ui';
import { createContext, useContext, useState } from 'react';
import { PHASE_NAME, secondsUntil } from '../../game/derive';
import { useServerNow } from '../../net/react';
import { usePhoneGame } from '../game';
import { NowCard, PhoneShell, useWide, type Now } from '../Shell';
import { needRows, planNow } from './needs';
import { connectedIn, readyNowIn, stillPlanning } from './ready';
import { ReadyBar, ReadyCount } from './ReadyBar';
import { drawnSlots, firstGiven, goTo, settle, type AgendaSlot, type DeskSlot, type HubPlace, type HubSeat, type HubSlots, type MapToolSlot, type StageSlot } from './slots';

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

/** The export ship, in a few words, for the head of "This month". */
function shipNote(view: Pick<MuleView, 'month' | 'ship'>): string {
  if (view.ship.inPort) return 'EXPORT SHIP IN PORT';
  return view.ship.arrives === view.month + 1 ? 'EXPORT SHIP NEXT MONTH' : `EXPORT SHIP IN MONTH ${view.ship.arrives}`;
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
  const fold = !stage && place.first !== null;
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
        now={fold ? undefined : now}
        fill
        rail={
          stage ? (
            StageRail && <StageRail />
          ) : (
            <>
              {fold && <FoldingNowCard key={now.title} now={now} />}
              {Panel && <Panel />}
              <DeskTabs desks={drawn.desks} active={nav.desk} first={place.first} onPick={nav.openDesk} />
              {Body && (
                <div className="flex flex-col gap-2.5 @min-[1100px]/shell:gap-4" data-testid={`desk-body-${nav.desk}`}>
                  <Body />
                </div>
              )}
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
      </PhoneShell>
    </Nav.Provider>
  );
}

/** The stage: banners, This month, the map's tools, the map, and from 1100 px what sits under it. */
function HubStage({ drawn, seat, tool, nav, go }: { drawn: HubSlots; seat: HubSeat; tool: MapToolSlot | undefined; nav: HubNav; go(to: AgendaSlot['opens']): void }) {
  const wide = useWide();
  const ToolMap = tool?.Map;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 @min-[1100px]/shell:gap-4">
      {drawn.banners.map(({ id, Body }) => (
        <Body key={id} />
      ))}
      <AgendaRow items={drawn.agenda} seat={seat} note={shipNote(seat.view)} onOpen={go} />
      <MapTools tools={drawn.tools} active={nav.tool} onPick={nav.pickTool} hint={wide && tool ? tool.hint(seat) : null} />
      <div className="flex min-h-0 flex-1 flex-col" data-testid="hub-map">
        {ToolMap && <ToolMap />}
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

/** Now folded to its title, one tap from the whole card. A new title remounts it folded, showing the new title. */
function FoldingNowCard({ now }: { now: Now }) {
  const [open, setOpen] = useState(false);
  if (open)
    return (
      <div className="relative">
        <NowCard now={now} />
        <button type="button" onClick={() => setOpen(false)} aria-expanded aria-label="Fold the Now card" className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-chip text-holo hover:bg-holo-soft" data-testid="now-fold">
          <Glyph d="M6 15l6-6 6 6" size={14} />
        </button>
      </div>
    );
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-expanded={false}
      className={cx('flex w-full items-center gap-2 rounded-panel border-2 px-2.5 py-1.5 text-left @min-[1100px]/shell:px-4 @min-[1100px]/shell:py-2.5', now.warn ? 'border-warn bg-warn/10' : 'border-holo bg-holo-soft')}
      data-testid="now"
    >
      <span className="label-caps shrink-0 text-[10px]! @min-[1100px]/shell:text-xs!">Now</span>
      <span className="min-w-0 flex-1 font-display text-sm font-semibold leading-tight @min-[1100px]/shell:text-lg" data-testid="now-title">
        {now.title}
      </span>
      <Glyph d="M6 9l6 6 6-6" size={14} />
      <span className="sr-only">Tap to read it again</span>
    </button>
  );
}

function Glyph({ d, size = 18, className }: { d: string; size?: number; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/** Only you see what this leads to. */
export function Lock({ size = 10 }: { size?: number }) {
  return (
    <span role="img" className="inline-flex items-center rounded-chip bg-holo-soft px-1 leading-4 text-holo" aria-label="Only you see this">
      <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2.4}>
        <rect x={5} y={11} width={14} height={10} rx={2} />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
    </span>
  );
}

/** The desks' tabs, on one row. `first` is the desk that asked to come first: amber-edged while another is open. */
export function DeskTabs({ desks, active, first = null, onPick }: { desks: DeskSlot[]; active: string; first?: string | null; onPick(id: string): void }) {
  return (
    <div role="tablist" aria-label="Desks" className="flex gap-1" data-testid="desks">
      {desks.map(({ id, label, icon, locked, Badge }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          onClick={() => onPick(id)}
          className={cx(
            'relative flex min-w-0 flex-auto flex-col items-center whitespace-nowrap rounded-control border px-0.5 py-0.5 text-[10px] font-semibold leading-tight @min-[1100px]/shell:gap-0.5 @min-[1100px]/shell:py-2 @min-[1100px]/shell:text-xs',
            active === id ? 'border-holo bg-holo-soft text-holo' : 'border-holo-line text-ink-2',
            first === id && active !== id && 'border-warn/60',
          )}
          data-testid={`desk-${id}`}
        >
          <Glyph d={icon} size={14} className="@min-[1100px]/shell:size-4" />
          {label}
          {locked && (
            <span className="absolute left-1 top-1">
              <Lock size={9} />
            </span>
          )}
          {Badge && <Badge />}
        </button>
      ))}
    </div>
  );
}

/** "This month": everything the month allows, each a door into its desk or tool. */
export function AgendaRow({ items, seat, note, onOpen }: { items: AgendaSlot[]; seat: HubSeat; note: string; onOpen(opens: AgendaSlot['opens']): void }) {
  return (
    <section className="flex shrink-0 flex-col gap-1.5" data-testid="agenda">
      <span className="label-caps flex items-center justify-between gap-2 @min-[1100px]/shell:text-sm!">
        This month · month {seat.view.month} <span className="font-mono text-[10px] text-ink-3 @min-[1100px]/shell:text-xs">{note}</span>
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
            <span className="flex w-full items-center gap-1">
              <span className="truncate text-xs font-semibold @min-[1100px]/shell:text-base">{it.title(seat)}</span>
              {it.locked && <Lock />}
            </span>
            <span className="truncate text-[10px] text-ink-2 @min-[1100px]/shell:text-sm">{it.sub(seat)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** The map's tools; on a laptop, the open one's hint beside them. */
export function MapTools({ tools, active, onPick, hint }: { tools: MapToolSlot[]; active: string; onPick(id: string): void; hint: string | null }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1" role="toolbar" aria-label="Map tools" data-testid="map-tools">
      {tools.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-pressed={active === t.id}
          onClick={() => onPick(t.id)}
          className={cx(
            'flex h-7 items-center gap-1 rounded-control border px-2 text-[11px] font-semibold @min-[1100px]/shell:h-9 @min-[1100px]/shell:px-3 @min-[1100px]/shell:text-sm',
            active === t.id ? 'border-holo bg-holo-soft text-holo' : 'border-holo-line text-ink-2',
          )}
          data-testid={`tool-${t.id}`}
        >
          {t.label}
          {t.locked && <Lock />}
        </button>
      ))}
      {hint && <span className="ml-2 text-sm text-ink-2">{hint}</span>}
    </div>
  );
}
