import type { CSSProperties, ReactNode } from 'react';
import { GoodIcon } from '../components/GoodIcon';
import { cx } from '../components/tokens';
import { useShow } from './frame';
import { clamp } from './fx';
import type { EventSegment } from './timing';
import type { ShowEventKey, ShowEventView, ShowSize } from './types';

/**
 * The stories: the camera goes to the place and the event happens on it. Drawn in the map's own space, so the
 * camera's zoom carries them, and sized against the map's width, so a scene plays on the TV and, smaller, on a phone.
 * The bumper harvest and the cavern collapse.
 */

export type P = { x: number; y: number };

/** Something centred on a point in tiles (fractions between tiles), `w` tiles wide. */
export function At({ p, w, children, style, className, testId }: { p: P; w: number; children: ReactNode; style?: CSSProperties; className?: string; testId?: string }) {
  const { grid } = useShow();
  return (
    <div className={cx('absolute', className)} data-testid={testId} style={{ left: `${((p.x + 0.5) / grid.width) * 100}%`, top: `${((p.y + 0.5) / grid.height) * 100}%`, width: `${(w / grid.width) * 100}%`, transform: 'translate(-50%, -50%)', ...style }}>
      {children}
    </div>
  );
}

/**
 * Small words on the map, sized in the map's own width so the camera's zoom makes them readable: the gallery's TV
 * map was 820 px wide (its phone map 540 px, at two thirds the size), so n px there is n / 8.2 cqw at both sizes.
 */
export const px = (_size: ShowSize, n: number) => `${n / 8.2}cqw`;

/** Seconds into a segment's story, at the TV's pace. */
export function useStoryClock(seg: EventSegment) {
  const { t, reduced } = useShow();
  return { u: (t - seg.playAt) / seg.pace, reduced, t };
}

type Scene = (p: { ev: ShowEventView; seg: EventSegment; size: ShowSize }) => ReactNode;

/** A bumper harvest: the plot glows, its produce bursts up, and a ×2 stamp lands. */
const BumperHarvest: Scene = ({ ev, seg, size }) => {
  const { u, reduced } = useStoryClock(seg);
  const { cast } = useShow();
  if (u < 0 || u > 3.2) return null;
  const h = ev.hits[0];
  if (!h) return null;
  const plot: P = { x: h.x, y: h.y };
  const good = cast.goodAt(h.x, h.y) ?? 'food';
  const glow = reduced ? 1 : clamp(u / 0.4) * (1 - clamp((u - 2.6) / 0.6));
  return (
    <>
      <At p={plot} w={1.6}>
        <div className={cx('aspect-square rounded-full', !reduced && 'animate-[pulse-glow_0.8s_ease-in-out_infinite]')} style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--color-g-energy) 55%, transparent), transparent 65%)', opacity: glow }} />
      </At>
      {!reduced &&
        Array.from({ length: 8 }, (_, k) => {
          const v = u - 0.6 - k * 0.06;
          if (v < 0 || v > 1) return null;
          const a = -Math.PI / 2 + (k - 3.5) * 0.28;
          return (
            <At key={k} p={{ x: plot.x + Math.cos(a) * v * 1.2, y: plot.y + Math.sin(a) * v * 1.4 + v * v * 0.9 }} w={0.24} style={{ opacity: 1 - v }}>
              <GoodIcon good={good} size={12} className="h-auto w-full" />
            </At>
          );
        })}
      {(u > 1.4 || reduced) && (
        <At p={{ x: plot.x + 0.45, y: plot.y - 0.5 }} w={0.7}>
          <span className="flex justify-center">
            <span data-testid="bumper-stamp" className="rotate-[-12deg] rounded-[4px] border-2 border-ok bg-panel px-1 font-display font-bold text-ok shadow-chip animate-[ev-stamp_0.35s_ease-out]" style={{ fontSize: px(size, 16) }}>
              ×2
            </span>
          </span>
        </At>
      )}
    </>
  );
};

/** A cavern collapse: the ground rumbles, the crystals crack, rocks fall in, and dust rises from a plain plot. */
const CavernCollapse: Scene = ({ ev, seg }) => {
  const { u, reduced } = useStoryClock(seg);
  if (u < 0 || u > 3.6) return null;
  const h = ev.hits[0];
  if (!h) return null;
  const plot: P = { x: h.x, y: h.y };
  const rumble = !reduced && u > 0.3 && u < 1.9 ? Math.sin(u * 60) * 0.04 : 0;
  const crack = reduced ? 1 : clamp((u - 0.9) / 0.8);
  return (
    <>
      {/* The cavern's crystals, glowing, then cracking and gone. */}
      {u < 2.1 && !reduced && (
        <At p={{ x: plot.x + rumble, y: plot.y }} w={0.9} testId={`cave-in-${h.x}-${h.y}`}>
          <svg viewBox="0 0 30 24" className="h-auto w-full" aria-hidden>
            {[
              [6, 20, 5],
              [14, 20, 8],
              [22, 20, 6],
            ].map(([x, y, s], k) => (
              <path key={k} d={`M${x} ${y! - s! * 2}L${x! + s! * 0.6} ${y! - s!}L${x} ${y}L${x! - s! * 0.6} ${y! - s!}Z`} fill="var(--color-g-crystite)" opacity={1 - crack * 0.7} style={{ filter: 'drop-shadow(0 0 3px var(--color-g-crystite))' }} transform={`translate(0 ${crack * crack * 6})`} />
            ))}
            <path d="M15 1 13 8l4 3-3 6 2 6" fill="none" stroke="var(--color-void)" strokeWidth={1.4} pathLength={1} strokeDasharray="1" strokeDashoffset={1 - crack} />
          </svg>
        </At>
      )}
      {/* Rocks fall in. */}
      {!reduced &&
        [0, 1, 2, 3].map((k) => {
          const v = clamp((u - 1.3 - k * 0.12) / 0.5);
          if (v <= 0 || v >= 1) return null;
          return (
            <At key={k} p={{ x: plot.x - 0.3 + k * 0.2, y: plot.y - 1.2 + v * 1.2 }} w={0.18} testId="cave-in-rock">
              <div className="aspect-square rotate-12 rounded-[30%] bg-g-alloy" />
            </At>
          );
        })}
      {/* Dust billows from the plain plot. */}
      {(u > 1.9 || reduced) &&
        [0, 1, 2].map((k) => {
          const v = reduced ? 0.6 : u - 1.9 - k * 0.15;
          if (v < 0 || v > 1.4) return null;
          return (
            <At key={k} p={{ x: plot.x + (k - 1) * 0.35, y: plot.y - v * 0.4 }} w={0.7 + v * 0.8} testId="cave-in-dust">
              <div className="aspect-square rounded-full" style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--color-g-alloy) 70%, transparent), transparent 70%)', opacity: 1 - v / 1.4 }} />
            </At>
          );
        })}
    </>
  );
};

const SCENE: Partial<Record<ShowEventKey, Scene>> = {
  bumperHarvest: BumperHarvest,
  cavernCollapse: CavernCollapse,
};

/** Each segment's story over the map, from when it starts to play. */
export function Stories({ size }: { size: ShowSize }) {
  const { s, t } = useShow();
  return (
    <>
      {s.segments.map((g) =>
        t >= g.playAt - 0.05
          ? g.events.map((ev, i) => {
              const Scene = SCENE[ev.key];
              return Scene ? <Scene key={`${g.n}-${i}`} ev={ev} seg={g} size={size} /> : null;
            })
          : null,
      )}
    </>
  );
}
