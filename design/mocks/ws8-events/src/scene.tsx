import { Creature, cx, GoodIcon, type Species } from '@mule/ui';
import type { CSSProperties, ReactNode } from 'react';
import type { Segment } from './events';
import { H, W } from './fixture';
import { clamp } from './fx';
import { EventGlyph } from './glyphs';
import type { Size } from './living';
import { useShow } from './stage';

/**
 * The pieces every story is built from: placing things on the map in tiles, a flame, smoke, a crate, a colonist. Drawn
 * in the map's own space, so the camera's zoom carries them, and sized in tiles, so a scene plays on the TV and,
 * smaller, on a phone alone.
 */

// --- Placing things on the map, in tiles ---------------------------------------------------------------------------

export const ease = (v: number) => v * v * (3 - 2 * v);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export type P = { x: number; y: number };
export const mix = (a: P, b: P, k: number): P => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });

/** Something centred on a point in tiles (fractions between tiles), `w` tiles wide. */
export function At({ p, w, children, style, className }: { p: P; w: number; children: ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <div className={cx('absolute', className)} style={{ left: `${((p.x + 0.5) / W) * 100}%`, top: `${((p.y + 0.5) / H) * 100}%`, width: `${(w / W) * 100}%`, transform: 'translate(-50%, -50%)', ...style }}>
      {children}
    </div>
  );
}

/** Small words on the map, sized in the map's own pixels so the camera's zoom makes them readable. */
export const px = (size: Size, n: number) => (size === 'tv' ? n : n * 0.66);

/** Seconds into a segment's story, at the TV's pace. */
export function useStoryClock(seg: Segment) {
  const { t, reduced } = useShow();
  return { u: (t - seg.playAt) / seg.pace, reduced, t };
}

// --- Shared props ----------------------------------------------------------------------------------------------------

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
export function Smoke({ from, u, every = 0.35, until, size, dark = false }: { from: P; u: number; every?: number; until: number; size: Size; dark?: boolean }) {
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
export function Crate({ good, ring, burnt = 0 }: { good: 'crystite' | 'food' | 'energy'; ring?: string; burnt?: number }) {
  return (
    <div className="relative flex aspect-square items-center justify-center rounded-[18%] shadow-chip" style={{ background: `color-mix(in srgb, var(--color-g-smithore) ${45 - burnt * 40}%, var(--color-void))`, boxShadow: ring ? `0 0 0 2px ${ring}, var(--shadow-chip)` : undefined }}>
      <span className="absolute inset-[12%] rounded-[10%] border border-void/50" />
      <span className="relative flex w-[60%]" style={{ opacity: 1 - burnt }}>
        <GoodIcon good={good} size={24} className="h-auto w-full" />
      </span>
    </div>
  );
}

export const TOWN = ['var(--color-g-alloy)', 'var(--color-mule-metal)', 'var(--color-ink-2)'];

/** What a rioter holds over their head. */
export type PropKind = 'fist' | 'torch' | 'sign' | 'broom' | 'hammer';
export function Prop({ kind, flicker }: { kind: PropKind; flicker: boolean }) {
  if (kind === 'broom')
    return (
      <svg viewBox="0 0 12 22" className="h-auto w-[60%]" aria-hidden>
        <path d="M6 0v13" stroke="var(--color-g-smithore)" strokeWidth={1.4} />
        <path d="M2.5 13h7l1.5 9H1Z" fill="var(--color-warn)" />
        <path d="M4 14.5l-.8 6M6 14.5v6.5M8 14.5l.8 6" stroke="var(--color-void)" strokeWidth={0.6} />
      </svg>
    );
  if (kind === 'hammer')
    return (
      <svg viewBox="0 0 14 18" className="h-auto w-[70%]" aria-hidden>
        <path d="M7 4v14" stroke="var(--color-g-smithore)" strokeWidth={1.6} />
        <rect x="1" y="0.5" width="12" height="5" rx="1" fill="var(--color-mule-metal)" />
      </svg>
    );
  if (kind === 'torch')
    return (
      <span className="flex flex-col items-center">
        <span className="w-[70%]">
          <Flame flicker={flicker} />
        </span>
        <span className="h-[50%] w-[12%] rounded-full bg-g-smithore" />
      </span>
    );
  if (kind === 'sign')
    return (
      <span className="flex flex-col items-center">
        <span className="flex aspect-[1.5/1] w-full items-center justify-center rounded-[2px] bg-ink text-void">
          <EventGlyph k="riot" size={10} className="h-auto w-[55%]" />
        </span>
        <span className="h-[40%] w-[10%] bg-ink-2" />
      </span>
    );
  return (
    <svg viewBox="0 0 12 14" className="h-auto w-[70%]" aria-hidden>
      <rect x="1.5" y="1" width="9" height="7" rx="2" fill="var(--color-alert-ink)" />
      <path d="M4 1v3M6 1v3M8 1v3" stroke="var(--color-void)" strokeWidth={0.8} />
      <rect x="3.5" y="8" width="5" height="6" fill="var(--color-alert-ink)" />
    </svg>
  );
}

/** One of the colony's own colonists, walking (a bob) and holding something over their head. */
export function Colonist({ sp, color, prop, hat = false, bob = 0, sway = 0, flicker = false, size }: { sp: Species; color: string; prop?: PropKind | undefined; hat?: boolean; bob?: number; sway?: number; flicker?: boolean; size: Size }) {
  return (
    <span className="relative flex flex-col items-center" style={{ transform: `translateY(${-bob * 100}%)` }}>
      {hat && (
        <svg viewBox="0 0 20 9" className="absolute -top-[14%] left-[18%] z-[1] h-auto w-[64%]" aria-hidden>
          <path d="M3 8a7 7 0 0 1 14 0Z" fill="var(--color-g-energy)" />
          <path d="M1 8.2h18" stroke="var(--color-g-energy)" strokeWidth={1.6} />
        </svg>
      )}
      {prop && (
        <span className="absolute -top-[62%] left-[52%] w-[48%]" style={{ transform: `rotate(${sway}deg)`, transformOrigin: 'bottom' }}>
          <Prop kind={prop} flicker={flicker} />
        </span>
      )}
      <Creature species={sp} color={color} size={px(size, 30)} className="h-auto w-full" />
    </span>
  );
}
