import { GoodIcon } from '@mule/ui';
import type { CSSProperties, ReactNode } from 'react';
import type { EventKey } from './catalogue';
import { hitAt, type Segment, type ShowEvent } from './events';
import { clamp } from './fx';
import { useShow } from './stage';

/**
 * Bulletins never take over the TV (Heiko's three weights hold), but each still tells its story: a small animation on
 * the player's mark in the roll call. A sneeze, rats running off with the Food, a letter opening into coins, the
 * colony's fingers pointing, a coin sneaking away, a parcel floating down. `k` runs 0 to 1 over the vignette.
 */

/** Places a piece of the vignette over the mark, in percent of the mark's box. */
const at = (x: number, y: number, w: number, extra?: CSSProperties): CSSProperties => ({ position: 'absolute', left: `${x}%`, top: `${y}%`, width: `${w}%`, transform: 'translate(-50%, -50%)', ...extra });

function Puffs({ k }: { k: number }) {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="aspect-square rounded-full bg-g-medicine" style={at(100 + k * (40 + i * 12), 30 + (i - 1.5) * k * 18, 16, { opacity: 1 - k })} />
      ))}
    </>
  );
}

function Rat({ style }: { style: CSSProperties }) {
  return (
    <svg viewBox="0 0 20 10" style={style} aria-hidden>
      <ellipse cx="9" cy="6" rx="6" ry="3.4" fill="var(--color-ink-2)" />
      <path d="M14 4.5 19 6l-5 1.6Z" fill="var(--color-ink-2)" />
      <circle cx="13.6" cy="3.4" r="1.3" fill="var(--color-ink-2)" />
      <path d="M3 6.5C0 6.5 0 9.5 2.5 9.5" fill="none" stroke="var(--color-ink-2)" strokeWidth={0.9} />
    </svg>
  );
}

function Envelope({ open }: { open: number }) {
  return (
    <svg viewBox="0 0 20 14" className="h-auto w-full" aria-hidden>
      <rect x="1" y="3" width="18" height="10" rx="1.2" fill="var(--color-mule-metal)" stroke="var(--color-warn)" strokeWidth={0.8} />
      <path d={`M1 3.4 10 ${3 + 6 * (1 - open) - 5 * open} 19 3.4`} fill="color-mix(in srgb, var(--color-mule-metal) 80%, var(--color-void))" stroke="var(--color-warn)" strokeWidth={0.8} />
      <circle cx="10" cy="8.5" r="1.8" fill="var(--color-alert)" opacity={1 - open} />
    </svg>
  );
}

function Coin({ style }: { style: CSSProperties }) {
  return <span className="aspect-square rounded-full border border-void/40 bg-warn" style={style} />;
}

/** Each bulletin's own little story. */
const DRAW: Partial<Record<EventKey, (k: number) => ReactNode>> = {
  sickness: (k) => (
    <>
      {k > 0.3 && <Puffs k={clamp((k - 0.3) / 0.7)} />}
      {k > 0.3 && k < 0.8 && (
        <span className="absolute -top-[55%] left-[85%] whitespace-nowrap font-display font-bold italic text-g-medicine" style={{ fontSize: '55%' }}>
          achoo!
        </span>
      )}
    </>
  ),
  ratsInSilo: (k) => (
    <>
      <span style={at(50, 108, 46, { opacity: 1 - clamp((k - 0.5) / 0.4) })}>
        <GoodIcon good="food" size={14} className="h-auto w-full" />
      </span>
      <Rat style={at(-30 + k * 160, 112, 52)} />
      <Rat style={at(-60 + k * 160, 118, 44)} />
    </>
  ),
  inheritance: (k) => (
    <>
      <span style={at(50, -40 + clamp(k / 0.4) * 50, 80, { opacity: 1 - clamp((k - 0.8) / 0.2) })}>
        <Envelope open={clamp((k - 0.4) / 0.25)} />
      </span>
      {k > 0.6 && [0, 1, 2].map((i) => <Coin key={i} style={at(50 + (i - 1) * 40 * clamp((k - 0.6) / 0.4), 10 - clamp((k - 0.6) / 0.4) * 40, 28, { opacity: 1 - clamp((k - 0.85) / 0.15) })} />)}
    </>
  ),
  blamedForUnrest: (k) => (
    <>
      {[
        [-20, 0],
        [120, -5],
        [50, -55],
      ].map(([x, y], i) =>
        k > 0.15 + i * 0.2 ? (
          <span key={i} className="flex items-center justify-center rounded-[30%] bg-alert font-display font-bold text-white animate-[ev-pop_0.25s_ease-out]" style={at(x!, y!, 46, { aspectRatio: '1', fontSize: '60%' })}>
            !
          </span>
        ) : null,
      )}
    </>
  ),
  crookedAccountant: (k) => (
    <>
      <Coin style={at(60 + k * 120, 40 + Math.sin(k * Math.PI) * -30, 34, { opacity: 1 - clamp((k - 0.7) / 0.3) })} />
      {k > 0.2 && (
        <span className="absolute font-mono font-bold text-alert" style={{ ...at(140 + k * 40, -10, 60), fontSize: '50%', opacity: 1 - clamp((k - 0.8) / 0.2) }}>
          −10%
        </span>
      )}
    </>
  ),
  packageFromHome: (k) => (
    <>
      <span style={at(50, -70 + clamp(k / 0.55) * 75, 90, { opacity: 1 - clamp((k - 0.85) / 0.15) })}>
        <svg viewBox="0 0 20 26" className="h-auto w-full" aria-hidden>
          {k < 0.55 && <path d="M2 8a8 7 0 0 1 16 0Z" fill="var(--color-ok)" />}
          {k < 0.55 && <path d="M2 8l6 9M18 8l-6 9" stroke="var(--color-ink-2)" strokeWidth={0.6} />}
          <rect x="6" y="16" width="8" height="8" rx="1" fill="var(--color-g-smithore)" />
          <path d="M10 16v8" stroke="var(--color-void)" strokeWidth={0.8} />
        </svg>
      </span>
      {k > 0.6 && (
        <span style={at(50, -30 - clamp((k - 0.6) / 0.4) * 30, 50, { opacity: 1 - clamp((k - 0.9) / 0.1) })}>
          <GoodIcon good="food" size={14} className="h-auto w-full" />
        </span>
      )}
    </>
  ),
};

/** A bulletin's vignette over its player's mark in the roll call, from just before its change lands. */
export function Vignette({ ev, seg }: { ev: ShowEvent; seg: Segment }) {
  const { t, reduced } = useShow();
  const draw = DRAW[ev.key];
  if (!draw || reduced) return null;
  const k = (t - (hitAt(seg, ev, null, false) - 0.6)) / 1.6;
  if (k < 0 || k > 1) return null;
  return (
    <span className="pointer-events-none absolute inset-0 overflow-visible" data-testid={`vignette-${ev.key}`}>
      {draw(k)}
    </span>
  );
}
