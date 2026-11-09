import type { CSSProperties, ReactNode } from 'react';
import { Creature } from '../components/Creature';
import { GoodIcon } from '../components/GoodIcon';
import type { Species } from '../components/species';
import { cx, type Good } from '../components/tokens';
import { useShow, type ShowFrame } from './frame';
import { clamp } from './fx';
import { At, type P } from './place';
import type { EventSegment } from './timing';
import type { ShowEventView, ShowSize } from './types';

/** One event's story over the map. */
export type Scene = (p: { ev: ShowEventView; seg: EventSegment; size: ShowSize }) => ReactNode;

/** Seconds into a segment's story, at the TV's pace. */
export function useStoryClock(seg: EventSegment) {
  const { t, reduced } = useShow();
  return { u: (t - seg.playAt) / seg.pace, reduced, t };
}

/**
 * The pieces the wave-2 stories are built from, the gallery's scene.tsx: a flame, smoke, a crate, a colonist. Drawn in
 * the map's own space through <At>, so the camera's zoom carries them, and sized in tiles, so a scene plays on the TV
 * and, smaller, on a phone alone.
 */

export const ease = (v: number) => v * v * (3 - 2 * v);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const mix = (a: P, b: P, k: number): P => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });

/** The store's plot: where every off-map event starts (the engine puts their origin there), else the event's origin. */
export function storeAt({ tiles }: Pick<ShowFrame, 'tiles'>, ev: ShowEventView): P {
  const store = tiles.find((t) => t.terrain === 'store');
  return store ? { x: store.x, y: store.y } : ev.origin;
}

/** The middle of a player's land: what a coin flies from or a pod lands on. A player with no land: the store. */
export function landOf({ tiles, cast }: Pick<ShowFrame, 'tiles' | 'cast'>, id: string, store: P): P {
  const slot = cast.slotOf(id);
  const mine = tiles.filter((t) => t.owner !== null && t.owner === slot);
  if (mine.length === 0) return store;
  return { x: mine.reduce((n, t) => n + t.x, 0) / mine.length, y: mine.reduce((n, t) => n + t.y, 0) / mine.length };
}

/** A flame in three tones, so a fire reads as fire at any size. */
export function Flame({ flicker, className, style }: { flicker: boolean; className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 32" className={cx('h-auto w-full', flicker && 'animate-[show-flicker_0.22s_ease-in-out_infinite_alternate]', className)} style={{ transformOrigin: 'bottom', ...style }} aria-hidden>
      <path d="M12 1c1 6 9 9 9 19a9 9 0 0 1-18 0c0-5 3-8 4-11 .6 3 1.6 4.6 3 5C10 9 10 5 12 1Z" fill="var(--color-alert)" />
      <path d="M12 11c.5 3.5 5 5.5 5 11a5 5 0 0 1-10 0c0-3 1.6-4.6 2.4-6.4.4 1.6 1 2.4 1.8 2.6 0-2.6 0-5 .8-7.2Z" fill="var(--color-g-smithore)" />
      <path d="M12 20c.3 2 2.4 3 2.4 5.6a2.4 2.4 0 0 1-4.8 0c0-1.6.9-2.4 1.4-3.6.2.8.6 1 1 1.2Z" fill="var(--color-warn)" />
    </svg>
  );
}

/** A puff of smoke rising from a point and spreading as it goes. */
export function Smoke({ from, u, every = 0.35, until, size, dark = false }: { from: P; u: number; every?: number; until: number; size: ShowSize; dark?: boolean }) {
  const puffs = Math.floor(Math.min(u, until) / every) + 1;
  return (
    <>
      {Array.from({ length: Math.min(puffs, 10) }, (_, i) => {
        const born = (puffs - 1 - i) * every;
        const v = u - born;
        if (v < 0 || v > 2.2) return null;
        return (
          <At key={born} p={{ x: from.x + (i % 2 ? 0.2 : -0.2) * v, y: from.y - v * 0.9 }} w={0.6 + v * 0.7}>
            <div className="aspect-square rounded-full" style={{ background: `radial-gradient(circle, color-mix(in srgb, ${dark ? 'var(--color-void)' : 'var(--color-ink-3)'} 85%, transparent), transparent 70%)`, opacity: clamp(1 - v / 2.2) * (size === 'tv' ? 1 : 0.9) }} />
          </At>
        );
      })}
    </>
  );
}

/** A crate of goods, its owner's colour round the edge when it has one. */
export function Crate({ good, ring, burnt = 0 }: { good: Good; ring?: string | undefined; burnt?: number }) {
  return (
    <div className="relative flex aspect-square items-center justify-center rounded-[18%] shadow-chip" style={{ background: `color-mix(in srgb, var(--color-g-smithore) ${45 - burnt * 40}%, var(--color-void))`, boxShadow: ring ? `0 0 0 2px ${ring}, var(--shadow-chip)` : undefined }}>
      <span className="absolute inset-[12%] rounded-[10%] border border-void/50" />
      <span className="relative flex w-[60%]" style={{ opacity: 1 - burnt }}>
        <GoodIcon good={good} size={24} className="h-auto w-full" />
      </span>
    </div>
  );
}

/** The colony's plain colours: the town's colonists, not the players. */
export const TOWN = ['var(--color-g-alloy)', 'var(--color-mule-metal)', 'var(--color-ink-2)'];

/** One of the colony's own colonists, walking (a bob), with something over their head when it has one. */
export function Colonist({ sp, color, prop, bob = 0, sway = 0 }: { sp: Species; color: string; prop?: ReactNode; bob?: number; sway?: number }) {
  return (
    <span className="relative flex flex-col items-center" style={{ transform: `translateY(${-bob * 100}%)` }}>
      {prop && (
        <span className="absolute -top-[62%] left-[52%] w-[48%]" style={{ transform: `rotate(${sway}deg)`, transformOrigin: 'bottom' }}>
          {prop}
        </span>
      )}
      <Creature species={sp} color={color} size={30} className="h-auto w-full" />
    </span>
  );
}
