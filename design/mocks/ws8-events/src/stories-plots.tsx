import { cx, GoodIcon, MuleIcon, type Species } from '@mule/ui';
import type { ReactNode } from 'react';
import type { EventKey } from './catalogue';
import type { Segment, ShowEvent } from './events';
import { W } from './fixture';
import { clamp } from './fx';
import { EventGlyph } from './glyphs';
import type { Size } from './living';
import { At, Colonist, ease, mix, px, TOWN, useStoryClock, type P } from './scene';

/**
 * The spotlights' stories: the camera goes to the plot and the event happens on it. A drone plants the auction flag, a
 * thief leads a MULE away, a harvest bursts, a cavern caves in, a crew walks off, a loyal crew works on.
 */

type Scene = (p: { ev: ShowEvent; seg: Segment; size: Size }) => ReactNode;

/** A chip of words over a point, popping in. */
function Tag({ p, children, tone, size }: { p: P; children: ReactNode; tone: 'good' | 'bad' | 'news'; size: Size }) {
  return (
    <At p={p} w={1.6}>
      <span className="flex justify-center">
        <span className={cx('whitespace-nowrap rounded-chip px-1 font-mono font-bold shadow-chip animate-[ev-pop_0.3s_ease-out]', tone === 'good' ? 'bg-ok text-on-holo' : tone === 'bad' ? 'bg-alert text-white' : 'bg-holo text-on-holo')} style={{ fontSize: px(size, 11) }}>
          {children}
        </span>
      </span>
    </At>
  );
}

/** The colony offers a free plot: a survey drone flies in, plants a flag on it, and the auction's gavel comes down. */
const ColonyPlot: Scene = ({ ev, seg, size }) => {
  const { u, reduced } = useStoryClock(seg);
  if (u < 0) return null;
  const h = ev.plots[0]!;
  const plot: P = { x: h.x, y: h.y };
  const fly = reduced ? 1 : ease(clamp(u / 0.9));
  const drone = mix({ x: plot.x - 4, y: plot.y - 2.5 }, { x: plot.x, y: plot.y - 1.1 }, fly);
  const drop = reduced ? 1 : ease(clamp((u - 0.9) / 0.4));
  const bounce = reduced ? 0 : Math.max(0, Math.sin(clamp((u - 1.3) / 0.4) * Math.PI)) * 0.12;
  const gavel = reduced ? 0 : Math.max(0, Math.sin((u - 2) * 9)) * (u > 2 && u < 2.7 ? 1 : 0);
  return (
    <>
      {u < 3.2 && !reduced && (
        <At p={{ x: drone.x + (u > 1.1 ? (u - 1.1) * 3 : 0), y: drone.y - (u > 1.1 ? (u - 1.1) * 1.5 : 0) }} w={0.8}>
          <svg viewBox="0 0 24 12" className="h-auto w-full" aria-hidden>
            <rect x="7" y="4" width="10" height="5" rx="2" fill="var(--color-mule-metal)" stroke="var(--color-holo)" strokeWidth={0.8} />
            <path d="M2 3h7M15 3h7" stroke="var(--color-ink-2)" strokeWidth={1.2} />
            <circle cx="12" cy="6.5" r="1.2" fill="var(--color-holo)" />
          </svg>
        </At>
      )}
      {/* The flag falls from the drone and plants in the plot. */}
      {(u > 0.9 || reduced) && (
        <At p={{ x: plot.x + 0.15, y: plot.y - 0.25 - (1 - drop) * 0.85 - bounce }} w={0.55}>
          <EventGlyph k="colonyPlot" size={24} className="h-auto w-full text-holo drop-shadow-[0_0_6px_var(--color-holo)]" />
        </At>
      )}
      {(u > 1.3 || reduced) && !reduced && u < 1.9 && (
        <At p={{ x: plot.x, y: plot.y + 0.3 }} w={0.6 + (u - 1.3) * 2}>
          <div className="aspect-[3/1] rounded-full border-2 border-g-alloy" style={{ opacity: 1 - (u - 1.3) / 0.6 }} />
        </At>
      )}
      {(u > 1.7 || reduced) && u < 3.6 && <Tag p={{ x: plot.x, y: plot.y + 0.75 }} tone="news" size={size}>Auction after the grant</Tag>}
      {(u > 1.9 || reduced) && u < 3.4 && (
        <At p={{ x: plot.x + 0.85, y: plot.y - 0.35 }} w={0.55} style={{ transform: `translate(-50%, -50%) rotate(${-35 + gavel * 45}deg)`, transformOrigin: '20% 80%' }}>
          <svg viewBox="0 0 20 20" className="h-auto w-full" aria-hidden>
            <rect x="9" y="2" width="9" height="5" rx="1" fill="var(--color-g-smithore)" transform="rotate(45 13.5 4.5)" />
            <path d="M8 9 2 18" stroke="var(--color-g-smithore)" strokeWidth={2.2} strokeLinecap="round" />
          </svg>
        </At>
      )}
    </>
  );
};

/** MULE theft: night falls on the plot, a hooded thief sneaks in, unhooks the MULE and leads it off the map. */
const MuleTheft: Scene = ({ ev, seg, size }) => {
  const { u, reduced } = useStoryClock(seg);
  if (u < 0 || u > 4.2) return null;
  const h = ev.plots[0]!;
  const plot: P = { x: h.x, y: h.y };
  const edge: P = { x: W + 0.5, y: plot.y + 0.3 };
  const night = reduced ? 0 : clamp(u / 0.5) * (1 - clamp((u - 3.4) / 0.6));
  const sneak = reduced ? 1 : ease(clamp((u - 0.3) / 1.1));
  const off = reduced ? 0 : ease(clamp((u - 2) / 1.4));
  const thief = u < 2 ? mix({ x: plot.x - 2.4, y: plot.y + 0.4 }, { x: plot.x - 0.35, y: plot.y + 0.15 }, sneak) : mix({ x: plot.x - 0.35, y: plot.y + 0.15 }, edge, off);
  const mule = u < 2 ? { x: plot.x + 0.1, y: plot.y + 0.05 } : mix({ x: plot.x + 0.1, y: plot.y + 0.05 }, { x: edge.x + 0.5, y: edge.y }, off);
  return (
    <>
      <At p={plot} w={4}>
        <div className="aspect-square rounded-full" style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--color-void) 35%, transparent), color-mix(in srgb, var(--color-void) 75%, transparent) 70%)', opacity: night }} />
      </At>
      {!reduced && (
        <At p={mule} w={0.55} style={{ zIndex: 2 }}>
          <span className={cx('flex text-mule-metal', u > 2 && 'animate-[mule-step_0.3s_ease-in-out_infinite]')}>
            <MuleIcon size={px(size, 26)} className="h-auto w-full" />
          </span>
        </At>
      )}
      {!reduced && (
        <At p={thief} w={0.5} style={{ zIndex: 3 }}>
          <span className="relative block" style={{ filter: 'brightness(0.35)' }}>
            <Colonist sp="quibbit" color="var(--color-ink-3)" bob={u > 0.3 && u < 1.4 ? Math.abs(Math.sin(u * 10)) * 0.06 : u > 2 ? Math.abs(Math.sin(u * 10)) * 0.06 : 0} size={size} />
          </span>
          <span className="absolute left-[18%] top-[30%] h-[12%] w-[64%] rounded-full bg-void" />
        </At>
      )}
      {u > 1.4 && u < 2.2 && !reduced && <Tag p={{ x: plot.x, y: plot.y - 0.9 }} tone="bad" size={size}>psst…</Tag>}
    </>
  );
};

/** A bumper harvest: the plot glows, its produce bursts up, and a ×2 stamp lands. */
const BumperHarvest: Scene = ({ ev, seg, size }) => {
  const { u, reduced } = useStoryClock(seg);
  if (u < 0 || u > 3.2) return null;
  const h = ev.plots[0]!;
  const plot: P = { x: h.x, y: h.y };
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
              <GoodIcon good={h.good ?? 'food'} size={px(size, 12)} className="h-auto w-full" />
            </At>
          );
        })}
      {(u > 1.4 || reduced) && (
        <At p={{ x: plot.x + 0.45, y: plot.y - 0.5 }} w={0.7}>
          <span className="flex justify-center">
            <span className="rotate-[-12deg] rounded-[4px] border-2 border-ok bg-panel px-1 font-display font-bold text-ok shadow-chip animate-[ev-stamp_0.35s_ease-out]" style={{ fontSize: px(size, 16) }}>
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
  const h = ev.plots[0]!;
  const plot: P = { x: h.x, y: h.y };
  const rumble = !reduced && u > 0.3 && u < 1.9 ? Math.sin(u * 60) * 0.04 : 0;
  const crack = reduced ? 1 : clamp((u - 0.9) / 0.8);
  return (
    <>
      {/* The cavern's crystals, glowing, then cracking and gone. */}
      {u < 2.1 && !reduced && (
        <At p={{ x: plot.x + rumble, y: plot.y }} w={0.9}>
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
            <At key={k} p={{ x: plot.x - 0.3 + k * 0.2, y: plot.y - 1.2 + v * 1.2 }} w={0.18}>
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
            <At key={k} p={{ x: plot.x + (k - 1) * 0.35, y: plot.y - v * 0.4 }} w={0.7 + v * 0.8}>
              <div className="aspect-square rounded-full" style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--color-g-alloy) 70%, transparent), transparent 70%)', opacity: 1 - v / 1.4 }} />
            </At>
          );
        })}
    </>
  );
};

const CREW: Species[] = ['gearling', 'mollox', 'bramblet', 'zipwing'];

/** A walkout: the crews put up placards and walk off the player's plots of one good, off the map. */
const Walkout: Scene = ({ ev, seg, size }) => {
  const { u, reduced } = useStoryClock(seg);
  if (u < 0 || u > 4.2) return null;
  return (
    <>
      {ev.plots.map((h, i) => (
        <div key={`${h.x},${h.y}`}>
          <div className="absolute rounded-[10%]" style={{ left: `${(h.x / W) * 100}%`, top: `${(h.y / 9) * 100}%`, width: `${100 / W}%`, height: `${100 / 9}%`, background: 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-alert) 34%, transparent) 0 5px, transparent 5px 11px)', opacity: reduced ? 1 : clamp((u - 0.3) / 0.3) }} />
          {[0, 1].map((k) => {
            const walk = reduced ? 0 : ease(clamp((u - 0.6 - i * 0.2 - k * 0.25) / 2.2));
            const p = mix({ x: h.x + (k ? 0.2 : -0.2), y: h.y + 0.15 }, { x: h.x + (k ? 1 : -1) * 0.8, y: -1.2 }, walk);
            return (
              <At key={k} p={p} w={0.46} style={{ opacity: 1 - clamp((walk - 0.85) / 0.15) }}>
                <Colonist sp={CREW[(i * 2 + k) % CREW.length]!} color={TOWN[(i + k) % TOWN.length]!} prop="sign" bob={walk > 0 && walk < 1 ? Math.abs(Math.sin(u * 9 + k)) * 0.08 : 0} size={size} />
              </At>
            );
          })}
        </div>
      ))}
    </>
  );
};

/** A loyal crew: a colonist in a hard hat works on through the month, hammer going, sparks flying; the plot makes 1 more. */
const LoyalCrew: Scene = ({ ev, seg, size }) => {
  const { u, reduced } = useStoryClock(seg);
  if (u < 0 || u > 3.2) return null;
  const h = ev.plots[0]!;
  const swing = reduced ? 0 : Math.sin(u * 12);
  return (
    <>
      <At p={{ x: h.x - 0.1, y: h.y + 0.05 }} w={0.55} style={{ opacity: reduced ? 1 : clamp((u - 0.1) / 0.3) * (1 - clamp((u - 2.8) / 0.4)) }}>
        <Colonist sp="gearling" color="var(--color-mule-metal)" prop="hammer" hat sway={swing * 40} size={size} />
      </At>
      {!reduced &&
        swing > 0.8 &&
        [0, 1, 2].map((k) => (
          <At key={k} p={{ x: h.x + 0.2 + k * 0.1, y: h.y - 0.25 - k * 0.08 }} w={0.08}>
            <div className="aspect-square rounded-full bg-warn" />
          </At>
        ))}
    </>
  );
};

export const PLOT_SCENES: Partial<Record<EventKey, Scene>> = {
  colonyPlot: ColonyPlot,
  muleTheft: MuleTheft,
  bumperHarvest: BumperHarvest,
  cavernCollapse: CavernCollapse,
  walkout: Walkout,
  loyalCrew: LoyalCrew,
};
