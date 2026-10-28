import type { MuleView } from '@mule/protocol';
import { cx } from '@mule/ui';
import { createContext, useContext, useState } from 'react';
import { PHASE_NAME, secondsUntil } from '../../game/derive';
import { useServerNow } from '../../net/react';
import { usePhoneGame } from '../game';
import { PhoneShell, useWide, type Now } from '../Shell';
import { needRows, planNow } from './needs';
import { connectedIn, readyNowIn, stillPlanning } from './ready';
import { ReadyBar, ReadyCount } from './ReadyBar';
import { drawnSlots, type AgendaSlot, type DeskSlot, type HubSeat, type HubSlots, type MapToolSlot } from './slots';

/** The hub's open desk and map tool, for any slot's components to read and change. */
export interface HubNav {
  desk: string;
  tool: string;
  /** Opens a desk, and the map tool it names. */
  openDesk(id: string): void;
  /** Switches the map's tool, and opens the desk it names. */
  pickTool(id: string): void;
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
  const [deskId, setDesk] = useState(drawn.desks[0]?.id ?? '');
  const [toolId, setTool] = useState(drawn.tools[0]?.id ?? '');
  // A slot that stops showing (an office handed on) gives way to the first one drawn.
  const desk = drawn.desks.find((d) => d.id === deskId) ?? drawn.desks[0];
  const tool = drawn.tools.find((t) => t.id === toolId) ?? drawn.tools[0];
  const nav: HubNav = {
    desk: desk?.id ?? '',
    tool: tool?.id ?? '',
    openDesk: (id) => {
      setDesk(id);
      const opens = drawn.desks.find((d) => d.id === id)?.tool;
      if (opens) setTool(opens);
    },
    pickTool: (id) => {
      setTool(id);
      const opens = drawn.tools.find((t) => t.id === id)?.desk;
      if (opens) setDesk(opens);
    },
  };
  const others = stillPlanning(view.players, connectedIn(table.seats)).filter((s) => s.id !== self.id);
  const now: Now =
    readyNowIn(view, self.ready, others, table.hostId === self.id) ??
    drawn.nows.reduce<Now | null>((n, give) => n ?? give(seat), null) ??
    planNow(needRows(me.monthNeeds, me.stock, view.tiles.filter((t) => t.owner === me.id)));
  const Panel = tool?.Panel;
  const Action = tool?.Action;
  const Body = desk?.Body;

  return (
    <Nav.Provider value={nav}>
      <PhoneShell
        phase={PHASE_NAME.planning}
        seconds={secondsUntil(view.phaseEndsAt, serverNow)}
        status={<ReadyCount players={view.players} />}
        now={now}
        fill
        rail={
          <>
            {Panel && <Panel />}
            <DeskTabs desks={drawn.desks} active={nav.desk} onPick={nav.openDesk} />
            {Body && (
              <div className="flex flex-col gap-2.5 @min-[1100px]/shell:gap-4" data-testid={`desk-body-${nav.desk}`}>
                <Body />
              </div>
            )}
          </>
        }
        footer={
          <>
            {Action && <Action />}
            <ReadyBar />
          </>
        }
      >
        <HubStage drawn={drawn} seat={seat} tool={tool} nav={nav} />
      </PhoneShell>
    </Nav.Provider>
  );
}

/** The stage: banners, This month, the map's tools, the map, and from 1100 px what sits under it. */
function HubStage({ drawn, seat, tool, nav }: { drawn: HubSlots; seat: HubSeat; tool: MapToolSlot | undefined; nav: HubNav }) {
  const wide = useWide();
  const ToolMap = tool?.Map;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 @min-[1100px]/shell:gap-4">
      {drawn.banners.map(({ id, Body }) => (
        <Body key={id} />
      ))}
      <AgendaRow items={drawn.agenda} seat={seat} note={shipNote(seat.view)} onOpen={(opens) => ('desk' in opens ? nav.openDesk(opens.desk) : nav.pickTool(opens.tool))} />
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

function Glyph({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
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

/** The desks' tabs, at most four to a row. */
export function DeskTabs({ desks, active, onPick }: { desks: DeskSlot[]; active: string; onPick(id: string): void }) {
  return (
    <div role="tablist" aria-label="Desks" className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, desks.length))}, minmax(0, 1fr))` }} data-testid="desks">
      {desks.map(({ id, label, icon, locked, Badge }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          onClick={() => onPick(id)}
          className={cx(
            'relative flex flex-col items-center gap-0.5 rounded-control border px-0.5 py-1 text-[10px] font-semibold @min-[1100px]/shell:py-2 @min-[1100px]/shell:text-xs',
            active === id ? 'border-holo bg-holo-soft text-holo' : 'border-holo-line text-ink-2',
          )}
          data-testid={`desk-${id}`}
        >
          <Glyph d={icon} size={16} />
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
