import { cx, SLOT_COLOR } from '@mule/ui';
import type { CSSProperties, ReactNode } from 'react';
import { frontAt, hitAt, METEOR_FALL, type Segment, type ShowEvent } from './events';
import { H, ownerAt, seat, W } from './fixture';
import { cell, centre, useShow } from './stage';

/**
 * The map effects the three directions draw from. Each is a pure function of the show clock, like the production
 * show's layers in @mule/ui ProductionMap.tsx (which B grows out of). Only transform, opacity and small overlays
 * change frame to frame; nothing here runs on a phone.
 */

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const ramp = (t: number, from: number, len: number) => clamp((t - from) / len);

/** The whole map darkened, e.g. under a title card. */
export function Dim({ amount }: { amount: number }) {
  if (amount <= 0) return null;
  return <div className="absolute inset-0 bg-void" style={{ opacity: amount * 0.72 }} />;
}

/** Every plot that isn't the player's darkens, so their land stands out; theirs gets a ring in their colour. */
export function Spotlight({ id, amount }: { id: string; amount: number }) {
  if (amount <= 0) return null;
  const colour = SLOT_COLOR[seat(id).slot];
  return (
    <>
      {Array.from({ length: W * H }, (_, i) => {
        const x = i % W;
        const y = Math.floor(i / W);
        const mine = ownerAt(x, y) === id;
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
const EDGE = {
  w: { side: 'left', span: 'width', angle: 90 },
  e: { side: 'right', span: 'width', angle: 270 },
  n: { side: 'top', span: 'height', angle: 180 },
  s: { side: 'bottom', span: 'height', angle: 0 },
} as const;
const band = (dir: keyof typeof EDGE, offset: number, span: string): CSSProperties => {
  const e = EDGE[dir];
  return e.span === 'width' ? { top: 0, bottom: 0, [e.side]: `${offset}%`, width: span } : { left: 0, right: 0, [e.side]: `${offset}%`, height: span };
};

/** B · a wall of dust rolls in from its edge: the production show's StormLayer, grown to cover the hit plots in turn. */
export function DustWall({ ev, seg }: { ev: ShowEvent; seg: Segment }) {
  const { t } = useShow();
  const p = frontAt(seg, t);
  if (p < -0.2 || p > 1.3) return null;
  const front = -45 + p * 100;
  const dir = ev.direction ?? 'w';
  return (
    <>
      <div className="absolute inset-0 bg-warn/15" style={{ opacity: p > 1.1 ? 0 : clamp((p + 0.2) * 3) }} />
      <div className="absolute" style={{ ...band(dir, front, '50%'), background: `linear-gradient(${EDGE[dir].angle}deg, transparent, color-mix(in srgb, var(--color-warn) 80%, transparent) 40%, color-mix(in srgb, var(--color-warn) 65%, transparent) 70%, transparent)`, filter: 'blur(5px)' }} data-testid="dust-wall" />
      <div
        className="absolute animate-[show-dust-drift_0.5s_linear_infinite]"
        style={{
          ...band(dir, front - 4, '58%'),
          background: `repeating-linear-gradient(${EDGE[dir].angle + 10}deg, transparent 0 14px, color-mix(in srgb, var(--color-warn) 55%, white) 14px 16px, transparent 16px 30px)`,
          maskImage: `linear-gradient(${EDGE[dir].angle}deg, transparent, black 30%, black 70%, transparent)`,
          opacity: 0.7,
        }}
      />
    </>
  );
}

/** A · a scan line crosses the map from the storm's edge, a faint trail behind it. */
export function ScanLine({ ev, seg, colour }: { ev: ShowEvent; seg: Segment; colour: string }) {
  const { t } = useShow();
  const p = frontAt(seg, t);
  if (p < 0 || p > 1.05) return null;
  const dir = ev.direction ?? 'w';
  const horizontal = dir === 'w' || dir === 'e';
  const at = p * 100;
  const pos: CSSProperties = horizontal ? { top: 0, bottom: 0, [EDGE[dir].side]: `${at}%`, width: 4 } : { left: 0, right: 0, [EDGE[dir].side]: `${at}%`, height: 4 };
  const trail: CSSProperties = horizontal
    ? { top: 0, bottom: 0, [EDGE[dir].side]: `${Math.max(0, at - 18)}%`, width: `${Math.min(18, at)}%` }
    : { left: 0, right: 0, [EDGE[dir].side]: `${Math.max(0, at - 18)}%`, height: `${Math.min(18, at)}%` };
  return (
    <>
      <div className="absolute" style={{ ...trail, background: `linear-gradient(${EDGE[dir].angle}deg, transparent, color-mix(in srgb, ${colour} 30%, transparent))` }} />
      <div className="absolute" style={{ ...pos, background: 'var(--color-holo-strong)', boxShadow: `0 0 18px 4px ${colour}` }} data-testid="scan-line" />
    </>
  );
}

/** The pests' path from farm to farm, drawn as far as they have got. */
export function Trail({ ev, seg, colour, width = 0.07 }: { ev: ShowEvent; seg: Segment; colour: string; width?: number }) {
  const { t, reduced } = useShow();
  const hits = [...ev.plots].sort((a, b) => a.order - b.order);
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      {hits.slice(1).map((h, i) => {
        const prev = hits[i]!;
        const k = clamp((t - (hitAt(seg, ev, h, reduced) - 0.5)) / 0.5);
        if (k <= 0) return null;
        return (
          <line key={i} x1={prev.x + 0.5} y1={prev.y + 0.5} x2={prev.x + 0.5 + (h.x - prev.x) * k} y2={prev.y + 0.5 + (h.y - prev.y) * k} stroke={colour} strokeWidth={width} strokeDasharray="0.14 0.12" strokeLinecap="round" />
        );
      })}
    </svg>
  );
}

/** B · the swarm on each farm it reaches: brown spots growing, dark specks crawling while it eats. */
export function Swarm({ ev, seg }: { ev: ShowEvent; seg: Segment }) {
  const { t, reduced } = useShow();
  return (
    <>
      {ev.plots.map((h) => {
        const s = t - (hitAt(seg, ev, h, reduced) - 0.4);
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

/** Hazard stripes over a hit plot, so a hit reads without colour (A and C). */
export function HitHatch({ x, y, colour = 'var(--color-alert)' }: { x: number; y: number; colour?: string }) {
  return <div className="absolute rounded-[10%]" style={{ ...cell(x, y), background: `repeating-linear-gradient(135deg, color-mix(in srgb, ${colour} 32%, transparent) 0 5px, transparent 5px 11px)` }} />;
}

/** The meteor's fall and impact: a glint, a streak to the plot, a flash and rings. `style` is B's fireball or A's target lock. */
export function MeteorFall({ ev, seg, tv, look }: { ev: ShowEvent; seg: Segment; tv: boolean; look: 'fireball' | 'lock' | 'drop' }) {
  const { t, reduced } = useShow();
  const o = ev.origin;
  const since = t - seg.playAt;
  const impact = METEOR_FALL;
  const after = since - impact;
  const c = centre(o.x, o.y);
  const fall = clamp(since / impact);
  // It falls from high above, from the side of the map with more room, so the whole streak crosses the map.
  const dx = o.x >= W / 2 ? -42 : 42;
  const dy = -75;
  const from = { dx, dy, tail: (Math.atan2(dy * (H / W), dx) * 180) / Math.PI - 180 };
  if (since < 0) return null;
  return (
    <>
      {/* Before impact. */}
      {!reduced && after < 0 && look === 'fireball' && (
        <div
          className="absolute"
          style={{
            left: `calc(${c.left} + ${(1 - fall) * from.dx}%)`,
            top: `calc(${c.top} + ${(1 - fall) * from.dy}%)`,
            width: tv ? 240 : 80,
            height: tv ? 18 : 7,
            // The head sits on the falling point; the tail streams back the way it came.
            transform: `translate(-100%, -50%) rotate(${from.tail}deg)`,
            transformOrigin: '100% 50%',
            background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-alert) 55%, transparent) 40%, var(--color-warn) 78%, white)',
            borderRadius: 999,
            boxShadow: '0 0 26px 8px color-mix(in srgb, var(--color-warn) 50%, transparent)',
          }}
          data-testid="meteor-streak"
        />
      )}
      {/* Its shadow on the plot grows as it comes, so the table sees where it will land. */}
      {!reduced && after < 0 && look === 'fireball' && (
        <div className="absolute rounded-full" style={{ ...c, width: `${(100 / W) * (0.4 + fall * 1.2)}%`, aspectRatio: '1', transform: 'translate(-50%, -50%)', background: 'radial-gradient(circle, color-mix(in srgb, var(--color-alert) 55%, transparent), transparent 70%)', opacity: 0.4 + fall * 0.6 }} />
      )}
      {after < 0 && look === 'lock' && (
        <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ ...c, width: `${(reduced ? 1 : 1 + (1 - fall) * 5) * (100 / W) * 1.6}%`, aspectRatio: '1' }} data-testid="meteor-lock">
          <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden>
            <circle cx="20" cy="20" r="17" fill="none" stroke="var(--color-alert)" strokeWidth={1.6} strokeDasharray="6 3" />
            <path d="M20 0v10M20 30v10M0 20h10M30 20h10" stroke="var(--color-alert)" strokeWidth={1.8} />
          </svg>
          <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-chip bg-alert px-1.5 py-0.5 font-mono text-sm font-bold text-white">IMPACT {Math.max(1, Math.ceil((impact - since) * 2))}</span>
        </div>
      )}
      {!reduced && after < 0 && look === 'drop' && (
        <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ ...c, width: `${(100 / W) * 0.9}%`, aspectRatio: '1', transform: `translate(-50%, -50%) scale(${1 + (1 - fall) * 3.5})`, opacity: fall }}>
          <div className="h-full w-full rounded-full shadow-chip" style={{ background: 'radial-gradient(circle at 35% 35%, color-mix(in srgb, var(--color-warn) 70%, white), var(--color-alert) 60%, color-mix(in srgb, var(--color-alert) 50%, var(--color-void)))' }} />
        </div>
      )}
      {/* Impact: a white flash over the map, rings running out from the plot. */}
      {!reduced && after >= 0 && after < 0.35 && <div className="absolute inset-0 bg-white" style={{ opacity: 0.75 * (1 - after / 0.35) }} />}
      {!reduced &&
        [0, 0.18, 0.36].map((d) => after - d).filter((s) => s > 0 && s < 1.2).map((s, i) => (
          <span key={i} className="absolute rounded-full border-warn" style={{ ...c, width: `${s * 46}%`, aspectRatio: '1', transform: 'translate(-50%, -50%)', borderWidth: tv ? 4 : 2, opacity: 1 - s / 1.2 }} />
        ))}
      {after >= 0 && <Crater x={o.x} y={o.y} since={reduced ? 9 : after} tv={tv} />}
    </>
  );
}

/**
 * The wreck and the crater the meteor leaves. PLACEHOLDER for WS5's crater badge (WS5 is designing it): a dark
 * scorched bowl over the destroyed installation, Crystite glinting in it.
 */
export function Crater({ x, y, since, tv }: { x: number; y: number; since: number; tv: boolean }) {
  const k = clamp(since / 0.6);
  return (
    <div className="absolute z-[2]" style={cell(x, y)} data-testid={`crater-${x}-${y}`}>
      <div className="absolute inset-[6%] rounded-full" style={{ background: 'radial-gradient(circle, var(--color-void) 0 38%, color-mix(in srgb, var(--color-t-crater) 100%, var(--color-void)) 55%, transparent 72%)', transform: `scale(${0.6 + k * 0.4})`, opacity: k }} />
      {[
        [38, 40],
        [58, 52],
        [46, 62],
      ].map(([l, tp], i) => (
        <span key={i} className="absolute size-[10%] rotate-45 rounded-[1px]" style={{ left: `${l}%`, top: `${tp}%`, background: 'var(--color-g-crystite)', opacity: k, boxShadow: '0 0 6px var(--color-g-crystite)' }} />
      ))}
      {tv && since > 0.8 && (
        <span className="absolute left-1/2 top-[88%] -translate-x-1/2 whitespace-nowrap rounded-chip border border-dashed border-g-crystite bg-map-chip px-1 font-mono text-[9px] font-bold text-g-crystite">
          WS5 CRATER BADGE
        </span>
      )}
    </div>
  );
}

/** A · corner brackets locked onto a plot, like a targeting reticle. */
export function Brackets({ x, y, colour, since }: { x: number; y: number; colour: string; since: number }) {
  const k = clamp(since / 0.25);
  const inset = 2 + (1 - k) * 18;
  return (
    <div className="absolute" style={cell(x, y)}>
      <svg viewBox="0 0 40 40" className="absolute h-full w-full" style={{ padding: `${inset}%`, opacity: k }} aria-hidden>
        <path d="M2 12V2h10M28 2h10v10M38 28v10H28M12 38H2V28" fill="none" stroke={colour} strokeWidth={3.2} />
      </svg>
    </div>
  );
}

/** Something that floats above a plot: rises from it, then sits on the plot's top edge, centred. */
export function OnPlot({ x, y, children, rise = 0, className }: { x: number; y: number; children: ReactNode; rise?: number; className?: string }) {
  return (
    <div className="absolute" style={cell(x, y)}>
      <span className={cx('absolute -top-[16%] left-1/2 z-[8] flex -translate-x-1/2 justify-center', className)} style={{ transform: `translateY(${-rise}px)` }}>
        {children}
      </span>
    </div>
  );
}

export { clamp };
