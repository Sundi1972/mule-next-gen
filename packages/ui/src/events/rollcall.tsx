import type { CSSProperties, ReactNode } from 'react';
import { PlayerMark } from '../components/PlayerMark';
import { cx, type Slot } from '../components/tokens';
import { eventSegWho, segTitle } from './copy';
import { useShow, type ShowFrame } from './frame';
import { clamp, ramp } from './fx';
import { EventSignBadge } from './glyphs';
import { At, px } from './stories';
import { eventHitAt, isRollCall, type EventSegment } from './timing';
import type { ShowEventKey, ShowEventView, ShowSize } from './types';

/**
 * Bulletins (C11): they never take the TV. Every bulletin of a phase gathers into one roll call in a lower third that
 * never covers the map's middle; each still tells its little story on the player's mark (the sneeze), and in
 * development the sick tag pops onto the sick colonist at the store. The gallery's living.tsx RollCall, vignettes.tsx
 * and stage.tsx Colonists / SickTag.
 */

/** Where each seat's colonist stands round the store as the walk starts, by slot: the gallery's STAND. */
const STAND_AT: Record<Slot, { x: number; y: number }> = { 0: { x: -1, y: 0 }, 1: { x: 1, y: 0 }, 2: { x: 0, y: -1 }, 3: { x: 0, y: 1 }, 4: { x: -1, y: -1 }, 5: { x: 1, y: 1 } };

/** The plot a player's colonist stands on: next to the store, or next to the map's middle on a map without one. */
export function colonistAt({ tiles, grid, cast }: Pick<ShowFrame, 'tiles' | 'grid' | 'cast'>, id: string): { x: number; y: number } | undefined {
  const slot = cast.slotOf(id);
  if (slot === undefined) return undefined;
  const store = tiles.find((t) => t.terrain === 'store') ?? { x: Math.floor(grid.width / 2), y: Math.floor(grid.height / 2) };
  const d = STAND_AT[slot];
  return { x: store.x + d.x, y: store.y + d.y };
}

/** The players whose sickness has landed by `t`. */
export function sickAt({ s, t, reduced, grid, cast }: ShowFrame): Set<string> {
  return new Set(s.segments.flatMap((g) => g.events.filter((e) => e.key === 'sickness' && t >= eventHitAt(g, e, null, reduced, grid)).map((e) => cast.playerOf(e) ?? '')));
}

/** WS6's approved sick tag (variant B): a pink cross on the condition chip. */
export function EventSickTag({ size = 'tv', className }: { size?: 'tv' | 'phone'; className?: string }) {
  const g = size === 'tv' ? 18 : 10;
  return (
    <span className={cx('flex items-center justify-center rounded-[5px] border border-void/60 text-void shadow-chip', className)} style={{ width: g + 4, height: g + 4, background: 'var(--color-g-medicine)' }} data-testid="sick-tag">
      <svg viewBox="0 0 16 16" width={g - 2} height={g - 2} aria-hidden>
        <path d="M6 2h4v4h4v4h-4v4H6v-4H2V6h4Z" fill="currentColor" />
      </svg>
    </span>
  );
}

/** Development on the map: each colonist at the store, about to set off, with the sick tag once their sickness lands. `slot`: a phone with a TV marks its own. */
export function EventColonists({ size, slot }: { size: ShowSize; slot?: Slot | undefined }) {
  const frame = useShow();
  if (frame.s.phase !== 'development') return null;
  const sick = sickAt(frame);
  const tv = size === 'tv';
  return (
    <>
      {frame.cast.players
        .filter((p) => slot === undefined || p.slot === slot)
        .map((p) => {
          const at = colonistAt(frame, p.id);
          if (!at) return null;
          return (
            <div key={p.id} className="absolute z-[7] flex -translate-x-1/2 -translate-y-1/2 items-center justify-center" style={frame.centre(at.x, at.y)} data-testid={`colonist-${p.id}`}>
              <span className="relative">
                <PlayerMark slot={p.slot} size={tv ? 42 : 22} />
                {sick.has(p.id) && <EventSickTag size={size} className={cx('absolute', tv ? '-right-2 -top-2' : '-right-1.5 -top-1.5', !frame.reduced && 'animate-[ev-pop_0.4s_ease-out]')} />}
              </span>
            </div>
          );
        })}
    </>
  );
}

/** A bulletin never takes the TV, but on the development map the sick colonist still sneezes as it lands. */
export function Sneeze({ ev, seg, size }: { ev: ShowEventView; seg: EventSegment; size: ShowSize }) {
  const frame = useShow();
  const { t, reduced, grid } = frame;
  const since = t - eventHitAt(seg, ev, null, reduced, grid);
  const player = frame.cast.playerOf(ev);
  const at = player ? colonistAt(frame, player) : undefined;
  if (!at || reduced || since < 0 || since > 1) return null;
  return (
    <>
      {[0, 1, 2, 3].map((k) => (
        <At key={k} p={{ x: at.x + 0.25 + since * (0.45 + k * 0.08), y: at.y - 0.15 + (k - 1.5) * since * 0.2 }} w={0.12} style={{ opacity: 1 - since }}>
          <div className="aspect-square rounded-full bg-g-medicine" />
        </At>
      ))}
      {since < 0.5 && (
        <At p={{ x: at.x + 0.45, y: at.y - 0.55 }} w={0.9}>
          <span className="flex justify-center font-display font-bold italic text-g-medicine" style={{ fontSize: px(size, 11) }}>
            achoo!
          </span>
        </At>
      )}
    </>
  );
}

/** Places a piece of the vignette over the mark, in percent of the mark's box. */
const at = (x: number, y: number, w: number, extra?: CSSProperties): CSSProperties => ({ position: 'absolute', left: `${x}%`, top: `${y}%`, width: `${w}%`, transform: 'translate(-50%, -50%)', ...extra });

/** Each bulletin's own little story on its player's mark; `k` runs 0 to 1 over it. */
const DRAW: Partial<Record<ShowEventKey, (k: number) => ReactNode>> = {
  sickness: (k) => (
    <>
      {k > 0.3 &&
        [0, 1, 2, 3].map((i) => {
          const v = clamp((k - 0.3) / 0.7);
          return <span key={i} className="aspect-square rounded-full bg-g-medicine" style={at(100 + v * (40 + i * 12), 30 + (i - 1.5) * v * 18, 16, { opacity: 1 - v })} />;
        })}
      {k > 0.3 && k < 0.8 && (
        <span className="absolute -top-[55%] left-[85%] whitespace-nowrap font-display font-bold italic text-g-medicine" style={{ fontSize: '55%' }}>
          achoo!
        </span>
      )}
    </>
  ),
};

/** A bulletin's vignette over its player's mark in the roll call, from just before its change lands. */
function Vignette({ ev, seg }: { ev: ShowEventView; seg: EventSegment }) {
  const { t, reduced, grid } = useShow();
  const draw = DRAW[ev.key];
  if (!draw || reduced) return null;
  const k = (t - (eventHitAt(seg, ev, null, false, grid) - 0.6)) / 1.6;
  if (k < 0 || k > 1) return null;
  return (
    <span className="pointer-events-none absolute inset-0 overflow-visible" data-testid={`vignette-${ev.key}`}>
      {draw(k)}
    </span>
  );
}

/** The roll call: every bulletin of the phase in one lower third that never covers the map's middle. */
export function RollCall({ size }: { size: ShowSize }) {
  const { s, t, reduced, cast } = useShow();
  const seg = s.segments.find(isRollCall);
  if (!seg) return null;
  const from = seg.announceAt - (s.segments.length === 1 ? s.intro - s.start : 0);
  if (t < from || t > seg.endAt) return null;
  const out = ramp(t, seg.endAt - 0.4, 0.4);
  const sick = seg.events.every((e) => e.key === 'sickness');
  const tv = size === 'tv';
  return (
    <div className={cx('absolute z-20', !reduced && 'animate-[ev-rise_0.4s_ease-out]', tv ? 'inset-x-6 bottom-5' : 'inset-x-2 bottom-2')} style={{ opacity: 1 - out }} data-testid="roll-call" aria-label={`${segTitle(seg)}: ${eventSegWho(seg, cast)}`}>
      <div className={cx('flex items-center rounded-panel border-2 bg-panel/95 shadow-chip', tv ? 'gap-5 px-5 py-3' : 'gap-2 px-2 py-1.5')} style={{ borderColor: sick ? 'var(--color-g-medicine)' : 'var(--color-holo)' }}>
        {tv && <EventSignBadge ev={seg.events[0]!} size={52} />}
        <span className="flex shrink-0 flex-col">
          <span className={cx('font-display font-bold leading-tight', tv ? 'text-3xl' : 'text-sm')}>{sick ? 'Sick this turn' : segTitle(seg)}</span>
          {tv && <span className="text-lg text-ink-2">{sick ? 'Sickness halves your walking pace.' : 'News for some of you.'}</span>}
        </span>
        <span className={cx('ml-auto flex flex-wrap justify-end', tv ? 'gap-4' : 'gap-2')}>
          {seg.events.map((e, i) => {
            const id = cast.playerOf(e) ?? '';
            const slot = cast.slotOf(id);
            return (
              <span key={i} className={cx('flex items-center', tv ? 'gap-2' : 'gap-1')} data-roll={id}>
                <span className="relative">
                  {slot !== undefined && <PlayerMark slot={slot} size={tv ? 40 : 18} />}
                  <EventSignBadge ev={e} size={tv ? 24 : 13} className="absolute -bottom-1.5 -right-2" />
                  <Vignette ev={e} seg={seg} />
                </span>
                <span className="flex flex-col leading-tight">
                  <span className={cx('font-display font-semibold', tv ? 'text-xl' : 'text-[11px]')}>{cast.name(id)}</span>
                  <span className={cx('font-mono text-ink-2', tv ? 'text-base' : 'text-[9px]')}>{e.key === 'sickness' ? '50% pace' : e.title}</span>
                </span>
              </span>
            );
          })}
        </span>
      </div>
    </div>
  );
}
