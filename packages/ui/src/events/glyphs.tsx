import type { ReactNode } from 'react';
import { GoodIcon } from '../components/GoodIcon';
import { cx, type Good } from '../components/tokens';
import { signLook } from './frame';
import type { ShowEventKey, ShowEventView } from './types';

/** An n-pointed star's outline: the solar flare's spiky sun. */
const star = (n: number, outer: number, inner: number, cy = 12, cx = 12) =>
  `M${Array.from({ length: n * 2 }, (_, i) => {
    const r = i % 2 ? inner : outer;
    const a = (Math.PI * i) / n - Math.PI / 2;
    return `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join('L')}Z`;

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const F = { fill: 'currentColor' };

/** One glyph per event, each with its own silhouette so it reads without colour: wind lines, a beetle, a flame. */
const GLYPH: Record<ShowEventKey, ReactNode> = {
  dustStorm: (
    <>
      <path {...S} d="M3 8h10.5a3 3 0 1 0-3-3" />
      <path {...S} d="M3 12.5h15a3 3 0 1 1-3 3" />
      <path {...S} d="M3 17h7" />
      <circle cx="20" cy="7.5" r="1.1" {...F} />
      <circle cx="7" cy="20.5" r="1.1" {...F} />
    </>
  ),
  drought: (
    <>
      <circle cx="12" cy="7" r="3.6" {...F} />
      <path {...S} strokeWidth={1.8} d="M12 .8v1.4M5.6 3.2l1 1M18.4 3.2l-1 1M4.2 9.2h1.4M18.4 9.2h1.4" />
      <path {...S} d="M2 15h20" />
      <path {...S} strokeWidth={1.8} d="M8 15l-1.6 3 2.2 2.2-.8 2M15.5 15l1.2 2.6-2 2.4" />
    </>
  ),
  acidRain: (
    <>
      <path {...F} d="M6.5 12.5a4.4 4.4 0 0 1-.4-8.8 6 6 0 0 1 11.3 1.9 3.5 3.5 0 0 1 .1 6.9Z" />
      <path {...S} d="M7.5 15.5l-1.2 3M12.5 15.5l-1.2 3M17.5 15.5l-1.2 3M10 20l-.8 2.2M15 20l-.8 2.2" />
    </>
  ),
  solarFlare: (
    <>
      <path {...F} d={star(8, 11.3, 6.6)} />
      <circle cx="12" cy="12" r="3.6" fill="var(--color-void)" />
      <circle cx="12" cy="12" r="2" {...F} />
    </>
  ),
  cometPass: (
    <>
      <path {...F} opacity={0.75} d="M14.7 3.7 3 18.6 5.4 21 20.3 9.3Z" />
      <circle cx="17.5" cy="6.5" r="4" {...F} />
      <circle cx="5" cy="6" r="1.1" {...F} />
      <circle cx="20" cy="17" r="1.1" {...F} />
    </>
  ),
  flood: (
    <>
      <path {...S} d="M2 6.5c2.5-2 5-2 7.5 0s5 2 7.5 0 3.5-1.5 5 0" />
      <path {...S} d="M2 12c2.5-2 5-2 7.5 0s5 2 7.5 0 3.5-1.5 5 0" />
      <path {...S} d="M2 17.5c2.5-2 5-2 7.5 0s5 2 7.5 0 3.5-1.5 5 0" />
    </>
  ),
  volcanicAsh: (
    <>
      <path {...F} d="M1.5 22 8.5 11h2l1.5 2 1.5-2h2l7 11Z" />
      <circle cx="9.5" cy="6.5" r="2.4" {...F} />
      <circle cx="13.5" cy="4.5" r="2.9" {...F} />
      <circle cx="17.5" cy="7" r="2.1" {...F} />
    </>
  ),
  pestSwarm: (
    <>
      <ellipse cx="12" cy="14" rx="5" ry="6.5" {...F} />
      <circle cx="12" cy="6.2" r="2.6" {...F} />
      <path {...S} strokeWidth={1.7} d="M7.5 11 3.5 9M7 14.5H3M7.5 18l-3.5 2.5M16.5 11l4-2M17 14.5h4M16.5 18l3.5 2.5M10.6 4.4 9 2M13.4 4.4 15 2" />
      <path d="M12 8.5v12" stroke="var(--color-void)" strokeWidth="1.2" />
    </>
  ),
  wildfire: (
    <>
      <path {...F} d="M12 1.5c.6 3.6 5.8 6 5.8 11.8a5.8 5.8 0 0 1-11.6 0c0-2.6 1.5-4.2 2.6-5.8.3 1.9 1 2.9 2 3.1 0-3.1-.6-6.6 1.2-9.1Z" />
      <path fill="var(--color-void)" d="M12 21a2.5 2.5 0 0 1-2.5-2.5c0-1.5 1.5-2.6 2.5-4.6 1 2 2.5 3.1 2.5 4.6A2.5 2.5 0 0 1 12 21Z" />
    </>
  ),
  bumperHarvest: (
    <>
      <path {...S} d="M12 22.5V7" />
      {[8.5, 12.5, 16.5].map((y) => (
        <g key={y}>
          <ellipse cx="9" cy={y} rx="2" ry="3.3" transform={`rotate(-38 9 ${y})`} {...F} />
          <ellipse cx="15" cy={y} rx="2" ry="3.3" transform={`rotate(38 15 ${y})`} {...F} />
        </g>
      ))}
      <ellipse cx="12" cy="3.8" rx="1.9" ry="3" {...F} />
    </>
  ),
};

export function EventGlyph({ k, size = 24, className }: { k: ShowEventKey; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={cx('shrink-0', className)} aria-hidden data-glyph={k}>
      {GLYPH[k]}
    </svg>
  );
}

/** Each event's own colour, from the palette the game already speaks: dust is amber, pests eat Food. */
export const EVENT_ACCENT: Record<ShowEventKey, string> = {
  dustStorm: 'var(--color-warn)',
  drought: 'var(--color-g-smithore)',
  acidRain: 'var(--color-g-food)',
  solarFlare: 'var(--color-g-energy)',
  cometPass: 'var(--color-g-electronics)',
  flood: 'var(--color-g-water)',
  volcanicAsh: 'var(--color-g-alloy)',
  pestSwarm: 'var(--color-g-food)',
  wildfire: 'var(--color-g-smithore)',
  bumperHarvest: 'var(--color-g-food)',
};
export const accent = (k: ShowEventKey) => EVENT_ACCENT[k];

/**
 * The event's badge: its glyph inside a frame whose SHAPE says the sign, so it reads without colour: a diamond
 * warns, a circle welcomes, a square is news (a mixed event).
 */
export function EventSignBadge({ ev, size, className }: { ev: Pick<ShowEventView, 'key' | 'sign'>; size: number; className?: string }) {
  const sign = signLook(ev.sign);
  const shape = sign === 'good' ? 'rounded-full' : sign === 'neutral' ? 'rounded-[22%]' : 'rotate-45 rounded-[18%]';
  const ring = sign === 'good' ? 'var(--color-ok)' : sign === 'neutral' ? 'var(--color-holo)' : 'var(--color-alert)';
  return (
    <span className={cx('relative inline-flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size }} data-sign={sign}>
      <span
        aria-hidden
        className={cx('absolute shadow-chip', shape)}
        style={{
          inset: sign === 'bad' ? '14%' : sign === 'neutral' ? '7%' : 0,
          background: 'var(--color-map-chip)',
          boxShadow: `0 0 0 ${Math.max(2, size / 22)}px ${ring}, var(--shadow-chip)`,
        }}
      />
      <span className="relative flex" style={{ color: accent(ev.key) }}>
        <EventGlyph k={ev.key} size={size * 0.5} />
      </span>
    </span>
  );
}

const CHIP = {
  hero: { text: 'text-3xl', icon: 26, pad: 'px-2.5 py-1', gap: 'gap-1.5', arrow: 'text-xl' },
  tv: { text: 'text-base', icon: 13, pad: 'px-1 py-0.5', gap: 'gap-px', arrow: 'text-[10px]' },
  phone: { text: 'text-[10px]', icon: 9, pad: 'px-0.5 py-px', gap: 'gap-px', arrow: 'text-[7px]' },
} as const;
const HAZARD = 'repeating-linear-gradient(135deg, var(--color-alert) 0 6px, color-mix(in srgb, var(--color-alert) 78%, var(--color-void)) 6px 10px)';

/**
 * How much a plot lost or gained. A loss is a downward notch and hazard stripes, a gain an upward notch on a plain
 * chip, so the sign reads without colour; the good's icon says what was lost. `text` replaces the number; with no
 * change it is a note, a square notch on the holo chip.
 */
export function EventDeltaChip({ delta, good, size = 'tv', className, lost, text }: { delta: number; good?: Good | undefined; size?: 'tv' | 'phone' | 'hero'; className?: string; lost?: boolean | undefined; text?: string | undefined }) {
  const tone = delta < 0 || lost ? 'loss' : delta > 0 ? 'gain' : 'note';
  // A TV chip fits inside one plot, so neighbours' chips never overlap.
  const px = CHIP[size];
  return (
    <span
      className={cx('inline-flex items-center whitespace-nowrap rounded-chip font-mono font-bold leading-none shadow-chip', px.text, px.pad, px.gap, tone === 'loss' ? 'text-white' : 'text-on-holo', className)}
      style={{ background: tone === 'loss' ? HAZARD : tone === 'gain' ? 'var(--color-ok)' : 'var(--color-holo)' }}
      data-delta={delta}
    >
      <span aria-hidden className={px.arrow}>
        {tone === 'loss' ? '▼' : tone === 'gain' ? '▲' : '■'}
      </span>
      {text ?? (lost ? 'LOST' : `${delta < 0 ? '−' : '+'}${Math.abs(delta)}`)}
      {good && <GoodIcon good={good} size={px.icon} color={tone === 'loss' ? 'white' : 'var(--color-on-holo)'} />}
    </span>
  );
}

/** The phone buzzes: drawn as a small vibrating handset beside the card. */
export function EventBuzz({ size = 14, on }: { size?: number; on: boolean }) {
  return (
    <span className={cx('inline-flex text-ink-2', on && 'animate-[ev-buzz_0.35s_ease-in-out_3]')} aria-label="Your phone vibrates" title="Your phone vibrates">
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="7" y="3" width="10" height="18" rx="2" />
        <path d="M3 8v8M21 8v8" />
      </svg>
    </span>
  );
}
