import { cx, GoodIcon, type Good } from '@mule/ui';
import type { EventKey, ShowEvent } from './events';

/**
 * DS-GAP (WS8): @mule/ui has no event icons. One glyph per event, each with its own silhouette so it reads without
 * colour: wind lines, a beetle, a falling rock, a cross. The sickness cross is WS6's approved sick tag (variant B).
 */
export function EventGlyph({ k, size = 24, className }: { k: EventKey; size?: number; className?: string }) {
  const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={cx('shrink-0', className)} aria-hidden data-glyph={k}>
      {k === 'dustStorm' && (
        <>
          <path {...stroke} d="M3 8h10.5a3 3 0 1 0-3-3" />
          <path {...stroke} d="M3 12.5h15a3 3 0 1 1-3 3" />
          <path {...stroke} d="M3 17h7" />
          <circle cx="20" cy="7.5" r="1.1" fill="currentColor" />
          <circle cx="7" cy="20.5" r="1.1" fill="currentColor" />
        </>
      )}
      {k === 'pestSwarm' && (
        <>
          <ellipse cx="12" cy="14" rx="5" ry="6.5" fill="currentColor" />
          <circle cx="12" cy="6.2" r="2.6" fill="currentColor" />
          <path {...stroke} strokeWidth={1.7} d="M7.5 11 3.5 9M7 14.5H3M7.5 18l-3.5 2.5M16.5 11l4-2M17 14.5h4M16.5 18l3.5 2.5M10.6 4.4 9 2M13.4 4.4 15 2" />
          <path d="M12 8.5v12" stroke="var(--color-void)" strokeWidth="1.2" />
        </>
      )}
      {k === 'meteorStrike' && (
        <>
          <path {...stroke} d="M3 3l8 8M7 2.5l6.5 6.5M2.5 7l6.5 6.5" />
          <circle cx="16" cy="16" r="5.5" fill="currentColor" />
          <circle cx="14.3" cy="14.8" r="1.3" fill="var(--color-void)" opacity="0.55" />
          <circle cx="17.8" cy="17.6" r="0.9" fill="var(--color-void)" opacity="0.55" />
        </>
      )}
      {k === 'sickness' && <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z" fill="currentColor" />}
    </svg>
  );
}

/** Each event's own colour, from the palette the game already speaks: dust is amber, pests eat Food, sickness is Medicine's pink. */
export const ACCENT: Partial<Record<EventKey, string>> = {
  dustStorm: 'var(--color-warn)',
  pestSwarm: 'var(--color-g-food)',
  meteorStrike: 'var(--color-alert)',
  sickness: 'var(--color-g-medicine)',
};
export const accent = (k: EventKey) => ACCENT[k] ?? 'var(--color-holo)';

/**
 * The event's badge: its glyph inside a frame whose SHAPE says good or bad (a diamond warns, a circle welcomes),
 * so the sign reads without colour.
 */
export function SignBadge({ ev, size, className }: { ev: Pick<ShowEvent, 'key' | 'sign'>; size: number; className?: string }) {
  const bad = ev.sign !== 'good';
  return (
    <span className={cx('relative inline-flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size }} data-sign={ev.sign}>
      <span
        aria-hidden
        className={cx('absolute shadow-chip', bad ? 'rotate-45 rounded-[18%]' : 'rounded-full')}
        style={{
          inset: bad ? '14%' : 0,
          background: 'var(--color-map-chip)',
          boxShadow: `0 0 0 ${Math.max(2, size / 22)}px ${bad ? 'var(--color-alert)' : 'var(--color-ok)'}, var(--shadow-chip)`,
        }}
      />
      <span className="relative flex" style={{ color: accent(ev.key) }}>
        <EventGlyph k={ev.key} size={size * 0.5} />
      </span>
    </span>
  );
}

/**
 * How much a plot lost or gained. A loss is a downward notch and hazard stripes, a gain an upward notch on a plain
 * chip, so the sign reads without colour; the good's icon says what was lost.
 */
export function DeltaChip({ delta, good, size = 'tv', className, lost }: { delta: number; good?: Good | undefined; size?: 'tv' | 'phone' | 'hero'; className?: string; lost?: boolean }) {
  const down = delta < 0;
  // A TV chip fits inside one plot (about 55 px), so neighbours' chips never overlap.
  const px = size === 'hero' ? { text: 'text-3xl', icon: 26, pad: 'px-2.5 py-1', gap: 'gap-1.5', arrow: 'text-xl' } : size === 'tv' ? { text: 'text-base', icon: 13, pad: 'px-1 py-0.5', gap: 'gap-px', arrow: 'text-[10px]' } : { text: 'text-[10px]', icon: 9, pad: 'px-0.5 py-px', gap: 'gap-px', arrow: 'text-[7px]' };
  return (
    <span
      className={cx('inline-flex items-center rounded-chip font-mono font-bold leading-none shadow-chip', px.text, px.pad, px.gap, down ? 'text-white' : 'text-on-holo', className)}
      style={{
        background: down
          ? 'repeating-linear-gradient(135deg, var(--color-alert) 0 6px, color-mix(in srgb, var(--color-alert) 78%, var(--color-void)) 6px 10px)'
          : 'var(--color-ok)',
      }}
      data-delta={delta}
    >
      <span aria-hidden className={px.arrow}>{down ? '▼' : '▲'}</span>
      {lost ? 'LOST' : `${down ? '−' : '+'}${Math.abs(delta)}`}
      {good && <GoodIcon good={good} size={px.icon} color={down ? 'white' : 'var(--color-on-holo)'} />}
    </span>
  );
}

/** The phone buzzes: drawn as a small vibrating handset, since a mock can't vibrate. */
export function Buzz({ size = 14, on }: { size?: number; on: boolean }) {
  return (
    <span className={cx('inline-flex text-ink-2', on && 'animate-[ev-buzz_0.35s_ease-in-out_3]')} aria-label="Your phone vibrates" title="Your phone vibrates">
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="7" y="3" width="10" height="18" rx="2" />
        <path d="M3 8v8M21 8v8" />
      </svg>
    </span>
  );
}
