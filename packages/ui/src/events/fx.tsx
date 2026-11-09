import type { CSSProperties, ReactNode } from 'react';
import { cx, SLOT_COLOR } from '../components/tokens';
import { useShow } from './frame';
import { eventHitAt, type EventSegment } from './timing';
import type { ShowEventView } from './types';

/**
 * The map effects the show draws from. Each is a pure function of the show clock, like the production show's layers
 * in ProductionMap.tsx. Only transform, opacity and small overlays change frame to frame.
 */

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const ramp = (t: number, from: number, len: number) => clamp((t - from) / len);

/** The whole map darkened, e.g. under a title card. */
export function Dim({ amount }: { amount: number }) {
  if (amount <= 0) return null;
  return <div className="absolute inset-0 bg-void" style={{ opacity: amount * 0.72 }} />;
}

/** Every plot that isn't the player's darkens, so their land stands out; theirs gets a ring in their colour. */
export function Spotlight({ id, amount }: { id: string; amount: number }) {
  const { grid, cast, cell } = useShow();
  const slot = cast.slotOf(id);
  if (amount <= 0 || slot === undefined) return null;
  const colour = SLOT_COLOR[slot];
  return (
    <>
      {Array.from({ length: grid.width * grid.height }, (_, i) => {
        const x = i % grid.width;
        const y = Math.floor(i / grid.width);
        const mine = cast.ownerAt(x, y) === id;
        return mine ? (
          <div key={i} className="absolute rounded-[10%]" style={{ ...cell(x, y), boxShadow: `inset 0 0 0 3px ${colour}, 0 0 18px 2px color-mix(in srgb, ${colour} 70%, transparent)`, opacity: amount }} />
        ) : (
          <div key={i} className="absolute bg-void" style={{ ...cell(x, y), opacity: amount * 0.62 }} />
        );
      })}
    </>
  );
}

/** Where a storm's front stands, as CSS for a band crossing from its edge. */
export const EDGE = {
  w: { side: 'left', span: 'width', angle: 90 },
  e: { side: 'right', span: 'width', angle: 270 },
  n: { side: 'top', span: 'height', angle: 180 },
  s: { side: 'bottom', span: 'height', angle: 0 },
} as const;
export const band = (dir: keyof typeof EDGE, offset: number, span: string): CSSProperties => {
  const e = EDGE[dir];
  return e.span === 'width' ? { top: 0, bottom: 0, [e.side]: `${offset}%`, width: span } : { left: 0, right: 0, [e.side]: `${offset}%`, height: span };
};

/** The pests' path from farm to farm, drawn as far as they have got. */
export function Trail({ ev, seg, colour, width = 0.07 }: { ev: ShowEventView; seg: EventSegment; colour: string; width?: number }) {
  const { t, reduced, grid } = useShow();
  const hits = [...ev.hits].sort((a, b) => a.order - b.order);
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${grid.width} ${grid.height}`} preserveAspectRatio="none" aria-hidden>
      {hits.slice(1).map((h, i) => {
        const prev = hits[i]!;
        const k = clamp((t - (eventHitAt(seg, ev, h, reduced, grid) - 0.5)) / 0.5);
        if (k <= 0) return null;
        return (
          <line key={i} x1={prev.x + 0.5} y1={prev.y + 0.5} x2={prev.x + 0.5 + (h.x - prev.x) * k} y2={prev.y + 0.5 + (h.y - prev.y) * k} stroke={colour} strokeWidth={width} strokeDasharray="0.14 0.12" strokeLinecap="round" />
        );
      })}
    </svg>
  );
}

/** The swarm on each farm it reaches: brown spots growing, dark specks crawling while it eats. */
export function Swarm({ ev, seg }: { ev: ShowEventView; seg: EventSegment }) {
  const { t, reduced, grid, cell } = useShow();
  return (
    <>
      {ev.hits.map((h) => {
        const s = t - (eventHitAt(seg, ev, h, reduced, grid) - 0.4);
        if (s < 0) return null;
        const g = reduced ? 1 : clamp(s / 0.7);
        return (
          <div
            key={`${h.x},${h.y}`}
            className="absolute"
            style={{
              ...cell(h.x, h.y),
              background: `radial-gradient(circle at 36% 40%, color-mix(in srgb, var(--color-warn) 65%, var(--color-void)) 0 ${g * 30}%, transparent ${g * 58}%), radial-gradient(circle at 70% 66%, color-mix(in srgb, var(--color-warn) 55%, var(--color-void)) 0 ${g * 22}%, transparent ${g * 44}%)`,
            }}
            data-testid={`swarm-${h.x}-${h.y}`}
          >
            {!reduced &&
              s < 2.6 &&
              [16, 30, 46, 60, 74, 84].map((left, k) => (
                <span key={k} aria-hidden className="absolute size-[8%] rounded-full bg-void animate-[show-crawl_0.45s_ease-in-out_infinite_alternate]" style={{ left: `${left}%`, top: `${26 + ((k * 23) % 50)}%`, animationDelay: `${k * 0.08}s` }} />
              ))}
          </div>
        );
      })}
    </>
  );
}

/** Something that floats above a plot: rises from it, then sits on the plot's top edge, centred. `rise` is a CSS length. */
export function OnPlot({ x, y, children, rise = '0px', className, testId }: { x: number; y: number; children: ReactNode; rise?: string; className?: string; testId?: string }) {
  const { cell } = useShow();
  return (
    <div className="absolute" style={cell(x, y)} {...(testId ? { 'data-testid': testId } : {})}>
      <span className={cx('absolute -top-[16%] left-1/2 z-[8] flex -translate-x-1/2 justify-center', className)} style={{ transform: `translateY(calc(-1 * ${rise}))` }}>
        {children}
      </span>
    </div>
  );
}
