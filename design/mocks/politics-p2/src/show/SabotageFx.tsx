import { Creature, cx, eventStageAt, GoodIcon, SLOT_COLOR, useEnclosingEventShow, type Slot } from '@mule/ui';
import type { Good } from '@mule/engine';
import type { SabotageEvent } from './events';

/**
 * PROPOSED (P10, WS8): sabotage's look on the event show, drawn in the living map's `over` slot. The build moves it
 * into packages/ui/src/events as stories for the two keys (EVENT_ENTRY powerCut 'plot', marketRumour 'store').
 *  - A worked power cut: a spark runs into the plot, it flickers, then goes dark and stays dark this production.
 *  - Caught: the guard's shield (guarded) or a searchlight (seen) flashes on the plot or the store, then the
 *    "Caught!" stamp with the saboteur's creature and name.
 *  - A rumour: a whisper bubble at the store, the good's price tag tipping up or down.
 * Every glyph here is DS-GAP: the show has a spark/flicker in fx.tsx for weather, no shield, stamp or bubble.
 */
export function SabotageFx({ players }: { players: { id: string; name: string; slot: Slot; species: string }[] }) {
  const frame = useEnclosingEventShow();
  if (!frame) return null;
  const { s, t } = frame;
  const { seg } = eventStageAt(s, t);
  // Every sabotage event already played or playing: a dark plot stays dark after its event.
  return (
    <>
      {s.segments.flatMap((g) =>
        g.events.map((raw) => {
          const ev = raw as unknown as SabotageEvent;
          if (!ev.sabotage) return null;
          const live = seg === g;
          const p = Math.max(0, Math.min(1, (t - g.playAt) / Math.max(0.01, g.settleAt - g.playAt)));
          if (t < g.playAt) return null;
          const cell = frame.cell(ev.origin.x, ev.origin.y);
          const culprit = ev.sabotage.culprit ? players.find((q) => q.id === ev.sabotage.culprit) : undefined;
          return (
            <div key={ev.sabotage.order} className="pointer-events-none absolute inset-0" data-testid={`sabotage-fx-${ev.key}`}>
              {ev.key === 'powerCut' && ev.sabotage.worked && <Dark cell={cell} p={p} live={live} />}
              {ev.key === 'powerCut' && live && p < 0.45 && !ev.sabotage.guarded && <Spark cell={cell} />}
              {ev.key === 'marketRumour' && live && <Whisper cell={cell} good={(ev.good ?? 'food') as Good} dir={ev.dir ?? 'up'} p={p} worked={ev.sabotage.worked} />}
              {culprit && live && p >= 0.15 && <Catch cell={cell} guarded={ev.sabotage.guarded} />}
              {culprit && live && p >= 0.4 && <Stamp cell={cell} name={culprit.name} slot={culprit.slot} species={culprit.species} />}
            </div>
          );
        }),
      )}
    </>
  );
}

type Cell = React.CSSProperties;

/** The plot goes dark: a flicker while the cut lands, then a steady dark wash with an unlit bulb. */
function Dark({ cell, p, live }: { cell: Cell; p: number; live: boolean }) {
  const flicker = live && p < 0.5;
  return (
    <span className={cx('absolute grid place-items-center bg-void/75', flicker && 'animate-pulse')} style={cell} data-testid="fx-dark">
      <svg aria-hidden viewBox="0 0 24 24" width="40%" height="40%" fill="none" stroke="currentColor" strokeWidth={2} className="text-ink-3">
        <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z" />
        <path d="M3 3l18 18" />
      </svg>
    </span>
  );
}

/** The spark that runs into the plot along its power line. */
function Spark({ cell }: { cell: Cell }) {
  return (
    <span className="absolute grid place-items-center" style={cell} data-testid="fx-spark">
      <svg aria-hidden viewBox="0 0 24 24" width="70%" height="70%" className="animate-ping text-warn" fill="currentColor">
        <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
      </svg>
    </span>
  );
}

/** Who caught them: a guard's shield on a guarded plot, a searchlight when the order was seen. */
function Catch({ cell, guarded }: { cell: Cell; guarded: boolean }) {
  return (
    <span className="absolute grid place-items-center" style={cell} data-testid={guarded ? 'fx-guard' : 'fx-seen'}>
      <span className={cx('grid size-[160%] place-items-center rounded-full border-2', guarded ? 'border-holo bg-holo-soft' : 'border-warn bg-warn/20')}>
        <svg aria-hidden viewBox="0 0 24 24" width="55%" height="55%" fill="none" stroke="currentColor" strokeWidth={2.2} className={guarded ? 'text-holo' : 'text-warn'}>
          {guarded ? <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" /> : <><circle cx="12" cy="12" r="3" /><path d="M2 12h4M18 12h4M12 2v4M12 18v4" /></>}
        </svg>
      </span>
    </span>
  );
}

/** "Caught!", with the saboteur's creature and name: the one moment the show names a person for sabotage. */
function Stamp({ cell, name, slot, species }: { cell: Cell; name: string; slot: Slot; species: string }) {
  return (
    <span className="absolute z-10 flex -translate-x-1/4 -translate-y-[120%] items-center gap-2 whitespace-nowrap rounded-control border-2 border-alert bg-alert-bg px-3 py-1.5 shadow-glow-alert" style={{ left: cell.left, top: cell.top }} data-testid="fx-caught">
      <span className="font-display text-2xl font-bold uppercase text-alert">Caught!</span>
      <Creature species={species as never} color={SLOT_COLOR[slot]} size={28} />
      <span className="text-xl font-semibold text-ink">{name}</span>
    </span>
  );
}

/** A rumour: a whisper bubble at the store, the good's price tag tipping 25% up or down once it takes. */
function Whisper({ cell, good, dir, p, worked }: { cell: Cell; good: Good; dir: 'up' | 'down'; p: number; worked: boolean }) {
  return (
    <span className="absolute z-10 flex -translate-y-[110%] items-center gap-1.5 whitespace-nowrap rounded-panel border border-holo-line bg-panel px-2 py-1 text-ink" style={{ left: cell.left, top: cell.top }} data-testid="fx-whisper">
      <span className="text-lg text-ink-2">“…psst…”</span>
      <GoodIcon good={good} size={22} />
      {worked && p > 0.35 && (
        <span className={cx('font-mono text-lg font-bold', dir === 'up' ? 'text-ok' : 'text-alert')} data-testid="fx-price-tip">
          {dir === 'up' ? '▲ +25%' : '▼ −25%'}
        </span>
      )}
    </span>
  );
}
