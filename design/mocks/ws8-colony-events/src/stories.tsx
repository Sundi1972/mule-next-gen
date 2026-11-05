import { cx, GoodIcon, MuleIcon, useEventShow, type EventSegment, type ShowEventView, type ShowSize } from '@mule/ui';
import { createContext, useContext, type ReactNode } from 'react';
// The event show's own building blocks, from its source: these modules are the real parts, not exported from @mule/ui's index.
import { clamp } from '../../../../packages/ui/src/events/fx';
import { At, px, type P } from '../../../../packages/ui/src/events/place';
import { Colonist, Crate, ease, lerp, mix, Smoke, storeAt, TOWN, useStoryClock, type Scene } from '../../../../packages/ui/src/events/scene';
import { STORE_STOCK, type C26Key } from './fixture';

/**
 * The three new stories, mock-local Scenes in the event show's own pattern (packages/ui/src/events/stories-colony.tsx):
 * drawn in the map's space through <At>, so the camera's zoom carries them, sized in tiles, a pure function of the
 * show clock. In the build they join stories-colony.tsx COLONY_SCENES. Reduced motion: nothing travels; each shows
 * its outcome.
 */

/** Whether this month's strike is paid, from ColonyView.strike.paid: paid, the strikers are gone. */
export const StrikePaid = createContext(false);

// --- General strike -------------------------------------------------------------------------------------------------

/** DS-GAP: a striker's placard, a sign on a pole, in the alert's hazard stripes so it reads without colour. */
function Placard() {
  return (
    <svg viewBox="0 0 20 24" className="h-auto w-full overflow-visible" aria-hidden>
      <path d="M10 10v14" stroke="var(--color-ink-2)" strokeWidth={1.6} />
      <rect x={1} y={1} width={18} height={10} rx={1.5} fill="var(--color-alert)" stroke="var(--color-void)" strokeWidth={1} />
      <path d="M4 4h12M4 8h8" stroke="white" strokeWidth={1.4} strokeLinecap="round" />
    </svg>
  );
}

const STRIKERS = ['bramblet', 'gearling', 'mollox', 'zipwing', 'quibbit', 'glimmer'] as const;

/**
 * The general strike. Planning: strikers with placards walk out of the store, one to each plot of the struck good, and
 * stand there; each plot gets "STRIKE · 20%". Production (unpaid, animated like a walkout): the strikers stand on the
 * plots and as the strike lands on each, its chip reads "STRIKE −80%" while the bars drop. Paid: nobody stands anywhere.
 */
const GeneralStrike: Scene = ({ ev, seg, size }) => {
  const frame = useEventShow();
  const paid = useContext(StrikePaid);
  const { u, reduced } = useStoryClock(seg);
  if (u < 0 || paid) return null;
  const store = storeAt(frame, ev);
  const planning = ev.phase === 'planning';
  return (
    <>
      {ev.hits.map((h, i) => {
        const plot: P = { x: h.x + 0.24, y: h.y + 0.12 };
        const k = !planning || reduced ? 1 : ease(clamp((u - 0.8 - i * 0.35) / 1.8));
        const at = mix(store, plot, k);
        const walking = !reduced && k > 0 && k < 1;
        const landed = reduced || u >= 2.6 + i * 0.35;
        return (
          <div key={`${h.x},${h.y}`}>
            {k > 0 && (
              <At p={at} w={0.5} style={{ zIndex: 3 }} testId={`striker-${h.x}-${h.y}`}>
                <Colonist sp={STRIKERS[i % STRIKERS.length]!} color={TOWN[i % TOWN.length]!} prop={<Placard />} bob={walking ? Math.abs(Math.sin(u * 10 + i)) * 0.07 : 0} sway={walking ? Math.sin(u * 6 + i) * 8 : landed && !reduced ? Math.sin(u * 3 + i) * 6 : 0} />
              </At>
            )}
            {landed && (
              <At p={{ x: h.x - 0.2, y: h.y - 0.3 }} w={1}>
                <span className="flex justify-center">
                  <span className={cx('whitespace-nowrap rounded-chip bg-alert px-1 py-px font-mono font-bold text-white shadow-chip', !reduced && 'animate-[ev-pop_0.3s_ease-out]')} style={{ fontSize: px(size, size === 'tv' ? 13 : 16) }} data-testid={`strike-chip-${h.x}-${h.y}`}>
                    {/* Two lines, so neighbouring plots' chips never overlap. */}
                    <span className="flex flex-col items-center leading-none">
                      <span>STRIKE</span>
                      <span>{planning ? '· 20%' : '−80%'}</span>
                    </span>
                  </span>
                </span>
              </At>
            )}
          </div>
        );
      })}
    </>
  );
};

// --- Festival -------------------------------------------------------------------------------------------------------

const FLAGS = ['var(--color-holo)', 'var(--color-ok)', 'var(--color-warn)', 'var(--color-g-medicine)', 'var(--color-g-energy)'];

/** The festival: bunting strung over the colony from the store, lanterns glowing, and a crowd dancing at the store. */
const Festival: Scene = ({ ev, seg }) => {
  const frame = useEventShow();
  const { u, reduced } = useStoryClock(seg);
  if (u < 0) return null;
  const store = storeAt(frame, ev);
  const up = reduced ? 1 : ease(clamp((u - 0.2) / 1.2));
  // Two strings, each from the store out to a corner of the map, sagging between.
  const strings: [P, P][] = [
    [{ x: store.x, y: store.y - 0.45 }, { x: 0.2, y: 0.2 }],
    [{ x: store.x, y: store.y - 0.45 }, { x: frame.grid.width - 1.2, y: 0.2 }],
    [{ x: store.x, y: store.y - 0.45 }, { x: 0.4, y: frame.grid.height - 1 }],
    [{ x: store.x, y: store.y - 0.45 }, { x: frame.grid.width - 1.4, y: frame.grid.height - 1 }],
  ];
  return (
    <>
      {strings.map(([a, b], s) =>
        Array.from({ length: 9 }, (_, i) => {
          const k = (i + 1) / 10;
          if (k > up) return null;
          const p = { ...mix(a, b, k), y: lerp(a.y, b.y, k) + Math.sin(k * Math.PI) * 0.35 };
          return (
            <At key={`${s}-${i}`} p={p} w={0.22} testId={s === 0 && i === 0 ? 'festival-bunting' : undefined}>
              <span className="block aspect-square" style={{ background: FLAGS[(i + s) % FLAGS.length], clipPath: 'polygon(0 0, 100% 0, 50% 100%)', transform: reduced ? undefined : `rotate(${Math.sin(u * 4 + i) * 10}deg)` }} />
            </At>
          );
        }),
      )}
      {/* Lanterns round the store, glowing. */}
      {[-0.9, 0.9].map((dx, i) => (
        <At key={dx} p={{ x: store.x + dx, y: store.y - 0.55 }} w={0.7} style={{ opacity: up }}>
          <div className="aspect-square rounded-full" style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--color-warn) 75%, transparent) 0 18%, color-mix(in srgb, var(--color-warn) 25%, transparent) 40%, transparent 70%)', transform: reduced ? undefined : `scale(${0.9 + Math.sin(u * 5 + i) * 0.1})` }} />
        </At>
      ))}
      {/* The crowd: eight colonists round the store, jumping. */}
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2 + 0.3;
        const k = reduced ? 1 : clamp((u - 0.6 - i * 0.12) / 0.6);
        if (k <= 0) return null;
        const home: P = { x: store.x + Math.cos(a) * 0.95, y: store.y + 0.15 + Math.sin(a) * 0.6 };
        return (
          <At key={i} p={home} w={0.36} style={{ opacity: k }} testId="festival-crowd">
            <Colonist sp={STRIKERS[i % STRIKERS.length]!} color={TOWN[i % TOWN.length]!} bob={reduced ? 0 : Math.abs(Math.sin(u * 7 + i * 1.3)) * 0.18} />
          </At>
        );
      })}
    </>
  );
};

// --- Riot -----------------------------------------------------------------------------------------------------------

/**
 * The riot: an angry crowd at the store, and the store fire's shelf box, calmly: no fire, a third of each shelf goes
 * (one crate of three empties) and its count runs down. The damaged object's plot gets a puff of dust as it is hit;
 * the HIT mark is the map's own (PlotObjectMark, from the object's stage).
 */
const Riot: Scene = ({ ev, seg, size }) => {
  const frame = useEventShow();
  const { u, reduced } = useStoryClock(seg);
  if (u < 0) return null;
  const store = storeAt(frame, ev);
  const shelves = (ev.effects ?? []).filter((f) => f.on === 'store');
  const gone = (r: number) => (reduced ? 1 : clamp((u - 1.8 - r * 0.45) / 0.35));
  const hit = ev.hits[0];
  return (
    <>
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        const k = reduced ? 1 : ease(clamp((u - 0.2 - i * 0.08) / 0.9));
        if (k <= 0 || (u > 5.8 && !reduced)) return null;
        const from: P = { x: store.x + Math.cos(a) * 2.6, y: store.y + Math.sin(a) * 1.8 };
        const to: P = { x: store.x + Math.cos(a) * 0.85, y: store.y + 0.1 + Math.sin(a) * 0.55 };
        return (
          <At key={i} p={mix(from, to, k)} w={0.36} testId="riot-crowd">
            <span className="block" style={{ filter: 'saturate(0.6)' }}>
              <Colonist sp={STRIKERS[i % STRIKERS.length]!} color={TOWN[i % TOWN.length]!} bob={reduced ? 0 : Math.abs(Math.sin(u * 12 + i)) * 0.06} prop={i % 3 === 0 ? <Placard /> : undefined} sway={reduced ? 0 : Math.sin(u * 9 + i) * 14} />
            </span>
          </At>
        );
      })}
      {hit && !reduced && u > 4.5 && <Smoke from={{ x: hit.x, y: hit.y - 0.2 }} u={u - 4.5} every={0.3} until={1} size={size} />}
      {u < 4.4 && (
        <At p={{ x: store.x + 1.75, y: store.y + 0.15 }} w={1.9}>
          <div className="flex flex-col gap-[3px] rounded-control border border-warn bg-panel/95 p-[4px] shadow-chip" style={{ fontSize: px(size, 12) }} data-testid="riot-storage">
            <span className="font-mono font-bold uppercase leading-none text-warn">Store storage</span>
            {shelves.map((f, r) => {
              const g = gone(r);
              const stock = STORE_STOCK[f.what] ?? 0;
              const left = Math.round(stock + f.delta * g);
              return (
                <span key={f.what} className="flex items-center gap-1 leading-none">
                  <span className="flex w-[14%]">{f.what === 'mules' ? <MuleIcon size={11} className="h-auto w-full text-mule-metal" /> : <GoodIcon good={f.what as 'food'} size={11} className="h-auto w-full" />}</span>
                  <span className="grid flex-1 grid-cols-3 gap-[2px]">
                    {[0, 1, 2].map((j) => (
                      <span key={j} style={{ opacity: j === 2 ? 1 - g * 0.85 : 1 }}>
                        <Crate good={f.what as 'food'} burnt={j === 2 ? g * 0.6 : 0} />
                      </span>
                    ))}
                  </span>
                  <span className={cx('w-[22%] text-right font-mono font-bold', g >= 1 ? 'text-warn' : 'text-ink')}>{left}</span>
                </span>
              );
            })}
          </div>
        </At>
      )}
    </>
  );
};

const SCENES: Partial<Record<C26Key, Scene>> = { generalStrike: GeneralStrike, festival: Festival, riot: Riot };

/** The mock's stories layer, for EventLivingMap's `over` (or over ProductionMap's box): each new key's scene from its play. */
export function NewStories({ size }: { size: ShowSize }) {
  const { s, t } = useEventShow();
  return (
    <>
      {s.segments.map((g: EventSegment) =>
        t >= g.playAt - 0.05
          ? g.events.map((ev: ShowEventView, i) => {
              const Scene = SCENES[ev.key as C26Key];
              return Scene ? <Scene key={`${g.n}-${i}`} ev={ev} seg={g} size={size} /> : null;
            })
          : null,
      )}
    </>
  );
}

/** A box over a map that is not EventLivingMap's own (ProductionMap's): the same container, so the stories size alike. */
export function OverMap({ children }: { children: ReactNode }) {
  return <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-panel [container-type:inline-size]">{children}</div>;
}

