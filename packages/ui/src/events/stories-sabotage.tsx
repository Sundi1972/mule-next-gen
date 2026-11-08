import { POLITICS } from '@mule/engine';
import type { CSSProperties } from 'react';
import { Creature } from '../components/Creature';
import { GoodIcon } from '../components/GoodIcon';
import { useSeatSpecies } from '../components/species';
import { cx, SLOT_COLOR, type Slot } from '../components/tokens';
import { percent } from './catalogue';
import { useShow } from './frame';
import { clamp } from './fx';
import { px } from './place';
import type { Scene } from './scene';
import { eventStageAt, type EventSegment } from './timing';
import type { ShowEventKey, ShowEventView, ShowSize } from './types';

/**
 * Sabotage on the production show (slice 4, S4-C17), the approved mock's look: design/mocks/politics-p2 @ d6977e1a,
 * src/show/SabotageFx.tsx, approved by Heiko on 8 Nov.
 *  - A worked power cut: a spark runs into the plot, it flickers, then goes dark and stays dark this production.
 *  - Caught: the guard's shield (guarded) or a searchlight (seen) flashes on the plot or the store, then the
 *    "Caught!" stamp with the saboteur's creature and name: the one moment the show names anyone for sabotage, and
 *    only when the event's culprit is set.
 *  - A rumour: a whisper bubble at the store, the good's price tag tipping up or down once it takes.
 * Reduced motion: no flicker and no ping; each part shows as it ends, from the start of the play.
 */

type Cell = CSSProperties;

/** How far through its play a segment is, 0 at the play, 1 at the settle: the mock's thresholds read this share. */
function playShare(t: number, seg: EventSegment): number {
  return clamp((t - seg.playAt) / Math.max(0.01, seg.settleAt - seg.playAt));
}

/**
 * Where a tag over a plot sits so it stays inside the map (the mock anchored it at the plot's left edge, and it
 * overflowed for the right edge's plots): `left` is a point on the map, as a share of its width, and `shift` the share
 * of the tag's own width that lies left of it. The point moves across its plot from the left edge (leftmost column) to
 * the right edge (rightmost), so any tag up to the map's width fits and still crosses its plot. The top row's tag goes
 * under the plot, every other row's over it.
 */
export function stampAnchor(x: number, y: number, width: number, _height: number): { left: number; shift: number; below: boolean } {
  const across = width > 1 ? x / (width - 1) : 0.5;
  return { left: (x + across) / width, shift: across, below: y === 0 };
}

/** A sabotage event's story; one Scene for both keys, as the mock drew them. */
const Sabotage: Scene = ({ ev, seg, size }) => {
  const frame = useShow();
  const { s, t, reduced, cast } = frame;
  const sab = ev.sabotage;
  if (!sab || t < seg.playAt) return null;
  const live = eventStageAt(s, t).seg === seg;
  // Reduced motion lands every part at once: the mock's end states.
  const p = reduced ? 1 : playShare(t, seg);
  const cell = frame.cell(ev.origin.x, ev.origin.y);
  const slot = sab.culprit === null ? undefined : cast.slotOf(sab.culprit);
  const named = sab.culprit !== null && slot !== undefined;
  return (
    <div className="pointer-events-none absolute inset-0" data-testid={`sabotage-fx-${ev.key}`}>
      {ev.key === 'powerCut' && sab.worked && <Dark cell={cell} flicker={live && p < 0.5 && !reduced} />}
      {ev.key === 'powerCut' && live && p < 0.45 && !sab.guarded && !reduced && <Spark cell={cell} />}
      {ev.key === 'marketRumour' && live && <Whisper cell={cell} ev={ev} tip={sab.worked && p > 0.35} size={size} />}
      {named && live && p >= 0.15 && <Catch cell={cell} guarded={sab.guarded} />}
      {named && live && p >= 0.4 && <Stamp ev={ev} name={cast.name(sab.culprit!)} slot={slot} size={size} />}
    </div>
  );
};

/** The plot goes dark: a flicker while the cut lands, then a steady dark wash with an unlit bulb. */
function Dark({ cell, flicker }: { cell: Cell; flicker: boolean }) {
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
          {guarded ? (
            <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" />
          ) : (
            <>
              <circle cx="12" cy="12" r="3" />
              <path d="M2 12h4M18 12h4M12 2v4M12 18v4" />
            </>
          )}
        </svg>
      </span>
    </span>
  );
}

/**
 * "Caught!", with the saboteur's creature and name. Sized in the map's width (the mock's TV map was 820 px wide), so it
 * reads the same on the TV and, smaller, on a phone alone; placed by stampAnchor, so it never leaves the map.
 */
function Stamp({ ev, name, slot, size }: { ev: ShowEventView; name: string; slot: Slot; size: ShowSize }) {
  const { grid } = useShow();
  const species = useSeatSpecies(slot);
  const a = stampAnchor(ev.origin.x, ev.origin.y, grid.width, grid.height);
  const top = a.below ? (ev.origin.y + 1) / grid.height : ev.origin.y / grid.height;
  return (
    <span
      className="absolute z-10 flex items-center gap-[0.5em] whitespace-nowrap rounded-control border-2 border-alert bg-alert-bg px-[0.75em] py-[0.375em] shadow-glow-alert"
      style={{ left: `${a.left * 100}%`, top: `${top * 100}%`, transform: `translate(${-a.shift * 100}%, ${a.below ? '20%' : '-120%'})`, fontSize: px(size, 16) }}
      data-testid="fx-caught"
    >
      <span className="font-display text-[1.5em] font-bold uppercase text-alert">Caught!</span>
      <span className="flex w-[1.75em]">
        <Creature species={species} color={SLOT_COLOR[slot]} size={28} className="h-auto w-full" />
      </span>
      <span className="text-[1.25em] font-semibold text-ink">{name}</span>
    </span>
  );
}

/** A rumour: a whisper bubble at the store, the good's price tag tipping up or down by the rumour's shift once it takes. */
function Whisper({ cell, ev, tip, size }: { cell: Cell; ev: ShowEventView; tip: boolean; size: ShowSize }) {
  return (
    <span
      className="absolute z-10 flex -translate-y-[110%] items-center gap-[0.375em] whitespace-nowrap rounded-panel border border-holo-line bg-panel px-[0.5em] py-[0.25em] text-ink"
      style={{ left: cell.left, top: cell.top, fontSize: px(size, 16) }}
      data-testid="fx-whisper"
    >
      <span className="text-[1.125em] text-ink-2">“…psst…”</span>
      {ev.good && (
        <span className="flex w-[1.375em]">
          <GoodIcon good={ev.good} size={22} className="h-auto w-full" />
        </span>
      )}
      {tip && ev.dir && (
        <span className={cx('font-mono text-[1.125em] font-bold', ev.dir === 'up' ? 'text-ok' : 'text-alert')} data-testid="fx-price-tip">
          {ev.dir === 'up' ? `▲ +${percent(POLITICS.sabotage.orders.rumour.shift)}` : `▼ −${percent(POLITICS.sabotage.orders.rumour.shift)}`}
        </span>
      )}
    </span>
  );
}

export const SABOTAGE_SCENES: Partial<Record<ShowEventKey, Scene>> = {
  powerCut: Sabotage,
  marketRumour: Sabotage,
};
