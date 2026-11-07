import type { ReactNode } from 'react';
import { GoodIcon } from '../components/GoodIcon';
import { cx, GOOD_NAME, type Good } from '../components/tokens';
import { effectWords } from './copy';
import { signLook } from './frame';
import type { ShowEffect, ShowEventKey, ShowEventView } from './types';

/** An n-pointed star's outline: the solar flare's spiky sun. */
const star = (n: number, outer: number, inner: number, cy = 12, cx = 12) =>
  `M${Array.from({ length: n * 2 }, (_, i) => {
    const r = i % 2 ? inner : outer;
    const a = (Math.PI * i) / n - Math.PI / 2;
    return `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join('L')}Z`;

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
/** A cut-out in the glyph, in the badge's own background. */
const V = { fill: 'none', stroke: 'var(--color-void)', strokeWidth: 1.6, strokeLinecap: 'round' as const };
const F = { fill: 'currentColor' };

/** One glyph per event, each with its own silhouette so it reads without colour: wind lines, a beetle, a flame. */
/** Each is a function, so no JSX is evaluated until a glyph renders: importing @mule/ui from Node (e2e scripts) must not need React in scope. */
const GLYPH: Partial<Record<ShowEventKey, () => ReactNode>> = {
  dustStorm: () => (
    <>
      <path {...S} d="M3 8h10.5a3 3 0 1 0-3-3" />
      <path {...S} d="M3 12.5h15a3 3 0 1 1-3 3" />
      <path {...S} d="M3 17h7" />
      <circle cx="20" cy="7.5" r="1.1" {...F} />
      <circle cx="7" cy="20.5" r="1.1" {...F} />
    </>
  ),
  drought: () => (
    <>
      <circle cx="12" cy="7" r="3.6" {...F} />
      <path {...S} strokeWidth={1.8} d="M12 .8v1.4M5.6 3.2l1 1M18.4 3.2l-1 1M4.2 9.2h1.4M18.4 9.2h1.4" />
      <path {...S} d="M2 15h20" />
      <path {...S} strokeWidth={1.8} d="M8 15l-1.6 3 2.2 2.2-.8 2M15.5 15l1.2 2.6-2 2.4" />
    </>
  ),
  acidRain: () => (
    <>
      <path {...F} d="M6.5 12.5a4.4 4.4 0 0 1-.4-8.8 6 6 0 0 1 11.3 1.9 3.5 3.5 0 0 1 .1 6.9Z" />
      <path {...S} d="M7.5 15.5l-1.2 3M12.5 15.5l-1.2 3M17.5 15.5l-1.2 3M10 20l-.8 2.2M15 20l-.8 2.2" />
    </>
  ),
  solarFlare: () => (
    <>
      <path {...F} d={star(8, 11.3, 6.6)} />
      <circle cx="12" cy="12" r="3.6" fill="var(--color-void)" />
      <circle cx="12" cy="12" r="2" {...F} />
    </>
  ),
  cometPass: () => (
    <>
      <path {...F} opacity={0.75} d="M14.7 3.7 3 18.6 5.4 21 20.3 9.3Z" />
      <circle cx="17.5" cy="6.5" r="4" {...F} />
      <circle cx="5" cy="6" r="1.1" {...F} />
      <circle cx="20" cy="17" r="1.1" {...F} />
    </>
  ),
  flood: () => (
    <>
      <path {...S} d="M2 6.5c2.5-2 5-2 7.5 0s5 2 7.5 0 3.5-1.5 5 0" />
      <path {...S} d="M2 12c2.5-2 5-2 7.5 0s5 2 7.5 0 3.5-1.5 5 0" />
      <path {...S} d="M2 17.5c2.5-2 5-2 7.5 0s5 2 7.5 0 3.5-1.5 5 0" />
    </>
  ),
  volcanicAsh: () => (
    <>
      <path {...F} d="M1.5 22 8.5 11h2l1.5 2 1.5-2h2l7 11Z" />
      <circle cx="9.5" cy="6.5" r="2.4" {...F} />
      <circle cx="13.5" cy="4.5" r="2.9" {...F} />
      <circle cx="17.5" cy="7" r="2.1" {...F} />
    </>
  ),
  pestSwarm: () => (
    <>
      <ellipse cx="12" cy="14" rx="5" ry="6.5" {...F} />
      <circle cx="12" cy="6.2" r="2.6" {...F} />
      <path {...S} strokeWidth={1.7} d="M7.5 11 3.5 9M7 14.5H3M7.5 18l-3.5 2.5M16.5 11l4-2M17 14.5h4M16.5 18l3.5 2.5M10.6 4.4 9 2M13.4 4.4 15 2" />
      <path d="M12 8.5v12" stroke="var(--color-void)" strokeWidth="1.2" />
    </>
  ),
  wildfire: () => (
    <>
      <path {...F} d="M12 1.5c.6 3.6 5.8 6 5.8 11.8a5.8 5.8 0 0 1-11.6 0c0-2.6 1.5-4.2 2.6-5.8.3 1.9 1 2.9 2 3.1 0-3.1-.6-6.6 1.2-9.1Z" />
      <path fill="var(--color-void)" d="M12 21a2.5 2.5 0 0 1-2.5-2.5c0-1.5 1.5-2.6 2.5-4.6 1 2 2.5 3.1 2.5 4.6A2.5 2.5 0 0 1 12 21Z" />
    </>
  ),
  bumperHarvest: () => (
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
  cavernCollapse: () => (
    <>
      <path {...S} strokeWidth={2.6} d="M3 21.5V13a9 9 0 0 1 18 0v8.5" />
      <path {...S} strokeWidth={1.7} d="M12.5 4.2 11 8l2.4 2-1.4 3" />
      <path {...F} d="M6.5 21.5 8 18l2.8.6.6 2.9ZM13 21.5l1.2-2.9 2.8 1.1.6 1.8ZM10.4 16.2l1.3-1.6 1.6 1-.7 1.7Z" />
    </>
  ),
  // WS6's approved sick cross.
  sickness: () => <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z" {...F} />,
  // Wave 2, the gallery's glyphs.
  federationTax: () => (
    <>
      <ellipse cx="9" cy="19" rx="6" ry="2.3" {...F} />
      <ellipse cx="9" cy="14.8" rx="6" ry="2.3" {...F} />
      <ellipse cx="9" cy="10.6" rx="6" ry="2.3" {...F} />
      <path {...S} d="M15 8.5 21 2.5M16 2.5h5v5" />
    </>
  ),
  federationGrant: () => (
    <>
      <path {...F} d={star(5, 6.5, 2.8, 7.5)} />
      <circle cx="6.5" cy="18" r="3.2" {...F} />
      <circle cx="17.5" cy="18" r="3.2" {...F} />
      <path {...S} strokeWidth={1.6} d="M6.5 11.5v2M17.5 11.5v2" />
    </>
  ),
  immigrationWave: () => (
    <>
      <circle cx="8" cy="8" r="3" {...F} />
      <circle cx="16" cy="8" r="3" {...F} />
      <path {...F} d="M2.5 19a5.5 5.5 0 0 1 11 0ZM10.5 19a5.5 5.5 0 0 1 11 0Z" />
      <path {...S} strokeWidth={1.8} d="M12 1.5v2.5" />
      <path {...S} d="M3 22h18" />
    </>
  ),
  inheritance: () => (
    <>
      <rect x="2" y="5.5" width="20" height="14" rx="1.6" {...S} />
      <path {...S} d="M2.5 6.5 12 13.5l9.5-7" />
      <circle cx="12" cy="15" r="3.3" {...F} />
    </>
  ),
  muleTheft: () => (
    <>
      <rect x="2.5" y="10" width="12" height="6.5" rx="1.8" {...F} />
      <path {...F} d="M14.5 11.5 18 7h3.5v3.6L19 12Z" />
      <path {...S} d="M4.5 16.5v4.5M8.5 16.5v4.5M12.5 16.5v4.5" />
      <path {...S} strokeWidth={1.7} strokeDasharray="1.5 2.4" d="M2 6.5c3-3.5 7-4.5 11-3" />
    </>
  ),
  epidemic: () => (
    <>
      <path {...F} d="M10 7h4.5v4.5H19V16h-4.5v4.5H10V16H5.5v-4.5H10Z" />
      <path {...F} d="M3 2h2.4v2.4h2.4v2.4H5.4v2.4H3V6.8H.6V4.4H3Z" />
      <path {...F} d="M18.6 1h2.4v2.4h2.4v2.4H21v2.4h-2.4V5.8h-2.4V3.4h2.4Z" />
    </>
  ),
  coldSnap: () => (
    <>
      <path {...S} d="M12 2v20M3.3 7l17.4 10M3.3 17l17.4-10" />
      <path {...S} strokeWidth={1.8} d="M9.5 3.2 12 5.7l2.5-2.5M9.5 20.8 12 18.3l2.5 2.5M3.4 10.6l3.4-.9-.9-3.4M20.6 13.4l-3.4.9.9 3.4M5.9 17.7l.9-3.4-3.4-.9M18.1 6.3l-.9 3.4 3.4.9" />
    </>
  ),
  meteorStrike: () => (
    <>
      <path {...S} d="M3 3l8 8M7 2.5l6.5 6.5M2.5 7l6.5 6.5" />
      <circle cx="16" cy="16" r="5.5" {...F} />
      <circle cx="14.3" cy="14.8" r="1.3" fill="var(--color-void)" opacity="0.55" />
      <circle cx="17.8" cy="17.6" r="0.9" fill="var(--color-void)" opacity="0.55" />
    </>
  ),
  pirateRaid: () => (
    <>
      <path {...F} d="M12 2.5a7 7 0 0 0-7 7c0 2.4 1.2 4.1 3 5V17h8v-2.5c1.8-.9 3-2.6 3-5a7 7 0 0 0-7-7Z" />
      <circle cx="9.3" cy="9.6" r="1.8" fill="var(--color-void)" />
      <circle cx="14.7" cy="9.6" r="1.8" fill="var(--color-void)" />
      <path {...S} d="M3 19 21 22.5M3 22.5 21 19" />
    </>
  ),
  storeFire: () => (
    <>
      <path {...F} d="M4 13h16v9H4Z" />
      <path {...F} d="M2.5 13l2-4h15l2 4Z" />
      <path fill="var(--color-void)" d="M10 22v-4.5h4V22Z" />
      <path {...F} d="M12 .8c.3 2 3 3.3 3 5.9a3 3 0 0 1-6 0c0-1.3.8-2.1 1.3-2.9.2 1 .6 1.5 1 1.6 0-1.6-.2-3.1.7-4.6Z" />
    </>
  ),
  ratsInSilo: () => (
    <>
      <ellipse cx="11" cy="15" rx="6.2" ry="4.2" {...F} />
      <path {...F} d="M15.5 12.3 22 15.4l-6.5 3Z" />
      <circle cx="15.2" cy="11.3" r="1.9" {...F} />
      <circle cx="18" cy="14.4" r="0.8" fill="var(--color-void)" />
      <path {...S} strokeWidth={1.8} d="M5.2 16.5C1.5 16.5 1.5 21 4.5 21H9" />
    </>
  ),
  crookedAccountant: () => (
    <>
      <rect x="3" y="2.5" width="13" height="19" rx="1.6" {...F} />
      <path {...V} strokeWidth={1.8} d="M6.5 7.5h6M6.5 11.5h6M6.5 15.5h3.5" />
      <path {...S} d="M20 3v10M17.4 10.5 20 13.2l2.6-2.7" />
    </>
  ),
  packageFromHome: () => (
    <>
      <path {...F} d="M4 10h16v11.5H4Z" />
      <path {...F} d="M2.5 6.5h19V10h-19Z" />
      <path {...V} strokeWidth={2.2} d="M12 6.5v15" />
      <path {...S} strokeWidth={1.8} d="M12 6.2C10 2 6 3.5 8.5 6.2M12 6.2C14 2 18 3.5 15.5 6.2" />
    </>
  ),
  // The colony's mood events (C26).
  festival: () => (
    <>
      <path {...S} strokeWidth={1.8} d="M2 4c6 4 14 4 20 0" />
      <path {...F} d="M4.5 5.6 8 6.8 5.6 11.5ZM10.5 7.2h3L12 12.5ZM16 6.8l3.5-1.2-1.1 5.9Z" />
      <path {...F} d="M12 14.5l1.4 2.9 3.1.4-2.3 2.2.6 3.1-2.8-1.5-2.8 1.5.6-3.1-2.3-2.2 3.1-.4Z" />
    </>
  ),
  generalStrike: () => (
    <>
      <rect x="3" y="2.5" width="18" height="11" rx="1.6" {...F} />
      <path {...V} strokeWidth={2} d="M6.5 6.5h11M6.5 10h7" />
      <path {...S} d="M12 13.5V22" />
    </>
  ),
  riot: () => (
    <>
      <path {...F} d="M12 2 20.5 5v6.5c0 5-3.6 8.8-8.5 10.5C7.1 20.3 3.5 16.5 3.5 11.5V5Z" />
      <path {...V} strokeWidth={1.8} d="M12 4.5 10 9.5l3.5 2-2.5 4.5 1 3.5" />
    </>
  ),
  emigrationWave: () => (
    <>
      <path {...S} d="M3 21V4h9v17" />
      <circle cx="15.5" cy="7" r="2.2" {...F} />
      <path {...F} d="M13.5 10.5h4l1.5 5h-2l-.5 5.5h-3.5Z" />
      <path {...S} d="M19 12h3.5M20.8 10l1.9 2-1.9 2" />
    </>
  ),
  volunteerCleanup: () => (
    <>
      <path {...S} d="M19.5 2.5 11 13" />
      <path {...F} d="M9.5 11.5 14 15.5 11 22H3.5Z" />
      <path {...V} strokeWidth={1.4} d="M7 21l2.5-4.5M10 21.5l2-4" />
    </>
  ),
  storeStrike: () => (
    <>
      <path {...F} d="M4 11h16v10H4Z" />
      <path {...F} d="M2.5 11l2-4h15l2 4Z" />
      <circle cx="12" cy="16" r="3.6" fill="none" stroke="var(--color-void)" strokeWidth={1.6} />
      <path {...V} d="M9.5 18.5l5-5" />
    </>
  ),
  walkout: () => (
    <>
      <path {...F} d="M4 13a8 8 0 0 1 16 0v1.5H4Z" />
      <path {...F} d="M2 14.5h20V17H2Z" />
      <path {...V} strokeWidth={1.8} d="M12 6.5v6" />
      <path {...S} d="M7 21h10M14.5 18.8 17 21l-2.5 2.2" />
    </>
  ),
  loyalCrew: () => <path {...F} d="M12 21.5C5.5 17 2.5 13.3 2.5 9.2A4.7 4.7 0 0 1 12 6.6a4.7 4.7 0 0 1 9.5 2.6c0 4.1-3 7.8-9.5 12.3Z" />,
  blamedForUnrest: () => (
    <>
      <path {...F} d="M4 3h16a1.6 1.6 0 0 1 1.6 1.6v10.8A1.6 1.6 0 0 1 20 17h-9l-5 4.5V17H4a1.6 1.6 0 0 1-1.6-1.6V4.6A1.6 1.6 0 0 1 4 3Z" />
      <path {...V} strokeWidth={2.4} d="M12 6.5v4.5" />
      <circle cx="12" cy="14" r="1.3" fill="var(--color-void)" />
    </>
  ),
};

export function EventGlyph({ k, size = 24, className }: { k: ShowEventKey; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={cx('shrink-0', className)} aria-hidden data-glyph={k}>
      {/* A key this client doesn't know yet (a newer server's): a plain disc, never a crash. */}
      {GLYPH[k]?.() ?? <circle cx={12} cy={12} r={7} {...F} />}
    </svg>
  );
}

/** Each event's own colour, from the palette the game already speaks: dust is amber, pests eat Food. */
export const EVENT_ACCENT: Partial<Record<ShowEventKey, string>> = {
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
  cavernCollapse: 'var(--color-g-crystite)',
  sickness: 'var(--color-g-medicine)',
  federationTax: 'var(--color-warn)',
  federationGrant: 'var(--color-warn)',
  immigrationWave: 'var(--color-holo)',
  inheritance: 'var(--color-warn)',
  muleTheft: 'var(--color-mule-metal)',
  epidemic: 'var(--color-g-medicine)',
  coldSnap: 'var(--color-ink)',
  meteorStrike: 'var(--color-alert)',
  pirateRaid: 'var(--color-g-crystite)',
  storeFire: 'var(--color-alert)',
  ratsInSilo: 'var(--color-ink-2)',
  crookedAccountant: 'var(--color-warn)',
  packageFromHome: 'var(--color-g-food)',
  festival: 'var(--color-ok)',
  generalStrike: 'var(--color-alert)',
  riot: 'var(--color-alert)',
  emigrationWave: 'var(--color-ink-2)',
  volunteerCleanup: 'var(--color-ok)',
  storeStrike: 'var(--color-mule-metal)',
  walkout: 'var(--color-warn)',
  loyalCrew: 'var(--color-ok)',
  blamedForUnrest: 'var(--color-warn)',
};
/** A key this client doesn't know yet takes the text colour. */
export const accent = (k: ShowEventKey) => EVENT_ACCENT[k] ?? 'currentColor';

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

const isGood = (what: ShowEffect['what']): what is Good => what in GOOD_NAME;

/** Whether a change off the map is good for the colony: a higher energy need or more air pollution is not, and losing MULEs never is. */
export const effectIsGood = (f: ShowEffect) => (f.what === 'energyNeed' || f.what === 'air' ? f.delta < 0 : f.what === 'mules' ? false : f.delta > 0);

/** A change off the map, as a chip: credits, held goods, a gauge. Same notch-and-stripes language as the plot's chip. */
export function EventEffectChip({ f, size = 'tv', className }: { f: ShowEffect; size?: 'tv' | 'phone' | 'hero'; className?: string }) {
  const good = isGood(f.what) ? f.what : undefined;
  // A held good shows its icon and number only; everything else says what moved.
  const text = good ? `${f.on === 'store' ? 'Store ' : ''}${f.delta < 0 ? '−' : '+'}${Math.abs(f.delta)}` : effectWords(f);
  return <EventDeltaChip delta={effectIsGood(f) ? 1 : -1} good={good} size={size} text={text} {...(className ? { className } : {})} />;
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
