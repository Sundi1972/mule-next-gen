import type { Good } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { Creature, cx, GOOD_NAME, GoodIcon, HoloMap, SLOT_COLOR, useSeatSpecies, type Slot } from '@mule/ui';
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { fmt, mapTiles, slotOf } from '../../../../../apps/web/src/game/derive';
import { PhoneShell } from '../../../../../apps/web/src/phone/Shell';
import { TvHeader } from '../../../../../apps/web/src/table/TableApp';
import { ME, VIEW } from '../fixture';
import { EVENTS, fillAt, finalUnits, flyAt, H, half, hitAt, KIND_NAME, LINES, SHOW, totals, W, type EventKind, type PlotLine, type ShowEvent } from '../production';

/**
 * The production show (R3, ~15 s): the plots fill with bars in their
 * owner's colour, in reading order, with a badge for each reason; the month's
 * event plays over the map in its own way (a storm sweeps across, a quake
 * shakes out from its centre, pests spread farm to farm); then every plot's
 * goods fly home: on the TV into each player's slot on the colony bar, on the
 * phone into your own stock strip.
 *
 * DS-GAP: the bars, badges, event layers and colony bar are new; they belong
 * in packages/ui beside HoloMap (WS4) once approved. Keyframes live in mock.css.
 */

// --- The clock ---------------------------------------------------------------

/** The show's clock: plays in real time, can be paused and scrubbed. */
export function useShow(autoplay = true) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(autoplay);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      setT((x) => {
        const next = Math.min(SHOW.end, x + (now - last) / 1000);
        if (next >= SHOW.end) setPlaying(false);
        return next;
      });
      last = now;
    }, 40);
    return () => clearInterval(id);
  }, [playing]);
  return {
    t,
    playing,
    play: () => {
      if (t >= SHOW.end) setT(0);
      setPlaying(true);
    },
    pause: () => setPlaying(false),
    seek: (s: number) => {
      setPlaying(false);
      setT(s);
    },
    restart: () => {
      setT(0);
      setPlaying(true);
    },
  };
}

export type Show = ReturnType<typeof useShow>;

export function ShowControls({ show, kind, onKind }: { show: Show; kind: EventKind | 'none'; onKind: (k: EventKind | 'none') => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 font-mono text-xs" data-testid="show-controls">
      <button type="button" className="rounded-control border border-holo px-2 py-1 text-holo" onClick={show.playing ? show.pause : show.play} data-testid="play">
        {show.playing ? 'pause' : 'play'}
      </button>
      <button type="button" className="rounded-control border border-holo-line px-2 py-1" onClick={show.restart} data-testid="restart">
        play again
      </button>
      <input
        type="range"
        min={0}
        max={SHOW.end}
        step={0.05}
        value={show.t}
        onChange={(e) => show.seek(Number(e.target.value))}
        className="w-56"
        aria-label="Scrub the show"
        data-testid="scrub"
      />
      <span data-num className="w-12 text-ink-3">
        {show.t.toFixed(1)} s
      </span>
      <span className="text-ink-3">event:</span>
      {(['storm', 'drought', 'flare', 'comet', 'flood', 'quake', 'blight', 'fire', 'bounty', 'none'] as const).map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => {
            onKind(k);
            show.restart();
          }}
          className={cx('rounded-chip border px-2 py-0.5', kind === k ? 'border-holo bg-holo-soft text-ink' : 'border-holo-faint text-ink-2')}
          data-testid={`kind-${k}`}
        >
          {k === 'none' ? 'no event' : KIND_NAME[k]}
        </button>
      ))}
    </div>
  );
}

// --- Where the goods fly to ----------------------------------------------------

/** The element the show measures fly targets against: everything marked data-fly-target inside it. */
const RootContext = createContext<RefObject<HTMLDivElement> | null>(null);

export function ShowRoot({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <RootContext.Provider value={ref}>
      <div ref={ref} className={cx('relative', className)} style={style}>
        {children}
      </div>
    </RootContext.Provider>
  );
}

/** Each player's fly target, as an offset in the map's own (unscaled) pixels from the map's top-left corner. */
function useTargets(map: RefObject<HTMLDivElement>, t: number): { size: { w: number; h: number }; to: Record<string, { x: number; y: number }> } | null {
  const root = useContext(RootContext);
  const [geom, setGeom] = useState<ReturnType<typeof useTargets>>(null);
  const near = t >= SHOW.flyStart - 1;
  useLayoutEffect(() => {
    if (!near || !map.current || !root?.current) return;
    const m = map.current.getBoundingClientRect();
    // The TV frame is scaled down: measure in screen pixels, move in the map's own.
    const scale = m.width / map.current.offsetWidth || 1;
    const to: Record<string, { x: number; y: number }> = {};
    root.current.querySelectorAll<HTMLElement>('[data-fly-target]').forEach((el) => {
      const r = el.getBoundingClientRect();
      to[el.dataset.flyTarget!] = { x: (r.left + r.width / 2 - m.left) / scale, y: (r.top + r.height / 2 - m.top) / scale };
    });
    setGeom({ size: { w: map.current.offsetWidth, h: map.current.offsetHeight }, to });
  }, [near]);
  return geom;
}

// --- The map with the show over it -------------------------------------------

const PART_BADGE: Record<PlotLine['parts'][number]['why'], { text: (d: number | 'half') => string; tone: string; icon?: Good }> = {
  cluster: { text: (d) => `+${d}`, tone: 'bg-ok text-on-holo' },
  species: { text: (d) => `+${d}`, tone: 'bg-ok text-on-holo' },
  pollution: { text: (d) => `${d}`, tone: 'bg-warn text-void' },
  noWater: { text: () => '½', tone: 'bg-alert text-white', icon: 'water' },
  noEnergy: { text: () => '½', tone: 'bg-alert text-white', icon: 'energy' },
};

export function MapShow({
  t,
  ev,
  only,
  tv = false,
  className,
}: {
  t: number;
  ev: ShowEvent | null;
  /** On a phone: only your own plots fill, the others stay faded. */
  only?: string;
  tv?: boolean;
  className?: string;
}) {
  const map = useRef<HTMLDivElement>(null);
  const geom = useTargets(map, t);
  const view: MuleView = VIEW;
  const focus = only ? (slotOf(view, only) as Slot) : undefined;
  const lines = LINES.map((l, i) => ({ l, i })).filter(({ l }) => !only || l.owner === only);
  const since = t - SHOW.eventAt;
  const quaking = ev?.kind === 'quake' && since > 0.6 && since < 2.4;
  const shake = quaking ? `translate(${Math.sin(t * 70) * (tv ? 4 : 2)}px, ${Math.cos(t * 55) * (tv ? 2 : 1)}px)` : undefined;

  return (
    <div ref={map} className={cx('relative', className)} style={{ transform: shake }} data-testid="map-show">
      <HoloMap width={W} height={H} tiles={mapTiles(view)} density={tv ? 'tv' : 'phone'} hideGround {...(focus !== undefined ? { focusSlot: focus } : {})} className="w-full" />
      {/* Event layers sit over the land, under the bars. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-panel">{ev && <EventLayer ev={ev} t={t} tv={tv} />}</div>
      {lines.map(({ l, i }) => (
        <PlotBars key={`${l.x},${l.y}`} line={l} index={i} t={t} ev={ev} tv={tv} target={geom?.to[l.owner]} size={geom?.size} />
      ))}
    </div>
  );
}

function PlotBars({ line, index, t, ev, tv, target, size }: { line: PlotLine; index: number; t: number; ev: ShowEvent | null; tv: boolean; target: { x: number; y: number } | undefined; size: { w: number; h: number } | undefined }) {
  const slot = (slotOf(VIEW, line.owner) ?? 0) as Slot;
  const filled = t >= fillAt(index);
  const hit = ev?.hits.find((h) => h.x === line.x && h.y === line.y);
  const struck = !!hit && t >= hitAt(ev!, hit);
  const units = struck ? finalUnits(line, ev) : line.made;
  const lost = struck ? line.made - units : 0;
  const flying = t >= flyAt(index);
  const gone = t >= flyAt(index) + SHOW.flight;
  // The plot's centre in map pixels, to fly from.
  const from = size ? { x: ((line.x + 0.5) / W) * size.w, y: ((line.y + 0.5) / H) * size.h } : null;
  const fly = flying && target && from ? `translate(${target.x - from.x}px, ${target.y - from.y}px) scale(0.35)` : 'none';
  // On the phone a bar is outlined so a one-unit plot doesn't blend into its border.
  const bar = tv ? 'h-3.5 w-1.5' : 'h-3 w-1.5 ring-1 ring-void/70';
  const shown = Math.min(units, 8);
  const struckAgo = struck ? t - hitAt(ev!, hit!) : 0;

  return (
    <div
      className={cx('pointer-events-none absolute flex flex-col justify-end', tv ? 'p-1' : 'p-0.5')}
      style={{ left: `${(line.x / W) * 100}%`, top: `${(line.y / H) * 100}%`, width: `${100 / W}%`, height: `${100 / H}%` }}
      data-testid={`plot-${line.x}-${line.y}`}
    >
      {/* Badges, top right: why this plot made what it made, and what the event did. */}
      {filled && !flying && (
        <span className={cx('absolute flex flex-col items-end', tv ? 'right-1 top-1 gap-0.5' : 'right-0.5 top-0.5 gap-px')}>
          {line.parts.slice(0, tv ? 2 : 1).map((p) => {
            const b = PART_BADGE[p.why];
            return (
              <span key={p.why} className={cx('flex items-center rounded-chip font-mono font-bold leading-none shadow-chip animate-[badge-in_0.3s_ease-out]', b.tone, tv ? 'gap-0.5 px-1 py-0.5 text-[11px]' : 'px-0.5 text-[9px]')}>
                {b.icon && <GoodIcon good={b.icon} size={tv ? 10 : 6} />}
                {b.text(p.delta)}
              </span>
            );
          })}
          {struck && (
            <span
              className={cx(
                'rounded-chip font-mono font-bold leading-none shadow-chip animate-[badge-in_0.3s_ease-out]',
                typeof hit!.delta === 'number' && hit!.delta > 0 ? 'bg-ok text-on-holo' : 'bg-alert text-white',
                tv ? 'px-1 py-0.5 text-[11px]' : 'px-0.5 text-[9px]',
              )}
              data-testid={`hit-${line.x}-${line.y}`}
            >
              {hit!.muleLost ? (tv ? 'MULE LOST' : '✕') : hit!.delta === 'half' ? '½' : hit!.delta > 0 ? `+${hit!.delta}` : `−${-hit!.delta}`}
            </span>
          )}
        </span>
      )}
      {/* The bars, bottom left, one per unit; they fly home together. */}
      <span
        className={cx('flex w-fit flex-wrap-reverse items-end', tv ? 'max-w-[44px] gap-[3px]' : 'max-w-[30px] gap-px', gone && 'opacity-0')}
        style={{ transform: fly, transition: flying ? `transform ${SHOW.flight}s cubic-bezier(0.55, 0, 0.75, 0.2), opacity 0.15s ${SHOW.flight - 0.1}s` : 'none', transformOrigin: 'center' }}
      >
        {filled &&
          Array.from({ length: shown }, (_, k) => (
            <span
              key={k}
              className={cx('rounded-[2px] shadow-chip animate-[bar-in_0.25s_ease-out_both]', bar)}
              style={{ background: SLOT_COLOR[slot], animationDelay: `${k * 0.04}s` }}
            />
          ))}
        {/* What the event took, falling away in grey. */}
        {filled &&
          lost > 0 &&
          struckAgo < 0.9 &&
          Array.from({ length: Math.min(lost, 8) }, (_, k) => (
            <span key={`lost-${k}`} className={cx('rounded-[2px] bg-ink-3', bar)} style={{ transform: `translateY(${struckAgo * (tv ? 40 : 20)}px)`, opacity: 1 - struckAgo / 0.9 }} />
          ))}
      </span>
    </div>
  );
}

/** Each event kind plays its own way over the map. */
function EventLayer({ ev, t, tv }: { ev: ShowEvent; t: number; tv: boolean }) {
  const since = t - SHOW.eventAt;
  if (since < 0 || t >= SHOW.flyStart) return null;
  const cell = (x: number, y: number): CSSProperties => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%`, width: `${100 / W}%`, height: `${100 / H}%` });

  if (ev.kind === 'storm') {
    // A wall of dust blows in from the west edge and out the east, over about 3.6 s.
    const p = Math.min(1, since / 3.6);
    const front = -45 + p * 145;
    return (
      <>
        {/* The sky darkens while the storm crosses. */}
        <div className="absolute inset-0 bg-warn/15" style={{ opacity: p >= 1 ? 0 : Math.min(1, since * 2) }} />
        <div
          className="absolute inset-y-0"
          style={{
            width: '45%',
            left: `${front}%`,
            background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-warn) 75%, transparent) 35%, color-mix(in srgb, var(--color-warn) 60%, transparent) 70%, transparent)',
            filter: 'blur(6px)',
            opacity: p >= 1 ? 0 : 1,
          }}
          data-testid="storm-front"
        />
        {/* Streaks of blown sand, racing ahead of the front. */}
        <div
          className="absolute inset-y-0 animate-[dust-drift_0.5s_linear_infinite]"
          style={{
            width: '55%',
            left: `${front - 5}%`,
            background: 'repeating-linear-gradient(100deg, transparent 0 14px, color-mix(in srgb, var(--color-warn) 55%, white) 14px 16px, transparent 16px 30px)',
            maskImage: 'linear-gradient(90deg, transparent, black 30%, black 70%, transparent)',
            opacity: p >= 1 ? 0 : 0.7,
          }}
        />
        {/* Energy plots it has passed stay dimmed. */}
        {ev.hits.map((h) => t >= hitAt(ev, h) && <div key={`${h.x},${h.y}`} className="absolute bg-void/35" style={cell(h.x, h.y)} />)}
      </>
    );
  }

  if (ev.kind === 'quake') {
    // Rings run out from the centre; the hit plot flashes and cracks.
    const o = ev.origin;
    const rings = [0, 0.35, 0.7].map((d) => since - d).filter((s) => s > 0 && s < 1.8);
    return (
      <>
        {rings.map((s, i) => (
          <span
            key={i}
            className="absolute rounded-full border-alert"
            style={{
              left: `${((o.x + 0.5) / W) * 100}%`,
              top: `${((o.y + 0.5) / H) * 100}%`,
              width: `${s * 70}%`,
              aspectRatio: '1',
              transform: 'translate(-50%, -50%)',
              borderWidth: tv ? 4 : 2,
              opacity: 1 - s / 1.8,
            }}
          />
        ))}
        {since > 0.9 && (
          <div className="absolute animate-[crack-flash_0.5s_ease-out_3] bg-alert/45" style={cell(o.x, o.y)} data-testid="quake-hit">
            <svg viewBox="0 0 10 10" className="h-full w-full" aria-hidden>
              <path d="M1 2 L4 4 L3 6 L6 7 L5 9 M4 4 L7 3 L9 1" fill="none" stroke="var(--color-void)" strokeWidth="0.6" />
            </svg>
          </div>
        )}
      </>
    );
  }

  if (ev.kind === 'drought') {
    // Heat: the land bleaches and shimmers from the centre out; each farm and well it reaches cracks.
    return (
      <>
        <div className="absolute inset-0 animate-[shimmer_0.8s_ease-in-out_infinite_alternate]" style={{ background: 'radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--color-warn) 55%, transparent), color-mix(in srgb, var(--color-warn) 30%, transparent) 75%)', opacity: Math.min(1, since * 1.5) }} />
        {ev.hits.map((h) => t >= hitAt(ev, h) && <Cracks key={`${h.x},${h.y}`} style={cell(h.x, h.y)} />)}
      </>
    );
  }

  if (ev.kind === 'flare') {
    // A white flash from the sky, then every Energy plant glows hot as it surges.
    return (
      <>
        <div className="absolute inset-0 bg-white" style={{ opacity: Math.max(0, 0.7 - since * 1.2) }} />
        {ev.hits.map(
          (h) =>
            t >= hitAt(ev, h) && (
              <div key={`${h.x},${h.y}`} className="absolute animate-[pulse-glow_1s_ease-in-out_infinite] rounded-[14%]" style={{ ...cell(h.x, h.y), background: 'radial-gradient(circle, color-mix(in srgb, var(--color-g-energy) 70%, white) 0 25%, transparent 70%)' }} />
            ),
        )}
      </>
    );
  }

  if (ev.kind === 'comet') {
    // A comet crosses the sky corner to corner; ice from its tail sparkles down on the Water plots.
    const p = Math.min(1, since / 1.6);
    return (
      <>
        {p < 1 && (
          <div
            className="absolute h-[3%] w-[45%] rounded-full"
            style={{ left: `${-40 + p * 140}%`, top: `${-10 + p * 70}%`, transform: 'rotate(25deg)', background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-holo) 60%, white) 80%, white)', filter: 'blur(1px)' }}
            data-testid="comet"
          />
        )}
        {ev.hits.map((h) => t >= hitAt(ev, h) - 0.3 && <Sparkles key={`${h.x},${h.y}`} style={cell(h.x, h.y)} colour="var(--color-g-water)" />)}
      </>
    );
  }

  if (ev.kind === 'flood') {
    // Water rises out of the river over each farm on its banks, top of the river first.
    return (
      <>
        {ev.hits.map((h) => {
          const s = t - hitAt(ev, h) + 0.5;
          if (s < 0) return null;
          return (
            <div key={`${h.x},${h.y}`} className="absolute overflow-hidden" style={cell(h.x, h.y)} data-testid={`flood-${h.x}-${h.y}`}>
              <div
                className="absolute inset-x-0 bottom-0 animate-[dust-drift_1.2s_linear_infinite]"
                style={{
                  height: `${Math.min(85, s * 90)}%`,
                  background: 'repeating-linear-gradient(170deg, color-mix(in srgb, var(--color-g-water) 70%, transparent) 0 6px, color-mix(in srgb, var(--color-g-water) 50%, transparent) 6px 10px)',
                }}
              />
            </div>
          );
        })}
      </>
    );
  }

  if (ev.kind === 'fire') {
    // Flames take one farm, then jump to the next in the cluster; burnt plots stay dark.
    return (
      <>
        {ev.hits.map((h) => {
          const s = t - hitAt(ev, h) + 0.4;
          if (s < 0) return null;
          const burning = s < 1.6;
          return (
            <div key={`${h.x},${h.y}`} className="absolute" style={cell(h.x, h.y)} data-testid={`fire-${h.x}-${h.y}`}>
              <div className="absolute inset-0 rounded-[14%] bg-void" style={{ opacity: Math.min(0.55, s * 0.4) }} />
              {burning && (
                <div
                  className="absolute inset-[8%] animate-[flicker_0.18s_ease-in-out_infinite_alternate] rounded-[40%_40%_20%_20%]"
                  style={{ background: 'radial-gradient(circle at 50% 80%, color-mix(in srgb, var(--color-warn) 90%, white) 0 20%, var(--color-alert) 45%, transparent 75%)' }}
                />
              )}
            </div>
          );
        })}
      </>
    );
  }

  if (ev.kind === 'bounty') {
    // A golden glow wells up on each lucky plot, with a few sparkles.
    return (
      <>
        {ev.hits.map(
          (h) =>
            t >= hitAt(ev, h) - 0.3 && (
              <div key={`${h.x},${h.y}`} className="absolute" style={cell(h.x, h.y)}>
                <div className="absolute inset-0 animate-[pulse-glow_1.2s_ease-in-out_infinite] rounded-[14%]" style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--color-warn) 55%, transparent), transparent 70%)' }} />
                <Sparkles style={{ inset: 0 }} colour="var(--color-warn)" />
              </div>
            ),
        )}
      </>
    );
  }

  // Blight: brown spots grow on each farm in the order the pests reach it, with a trail between them.
  const hits = [...ev.hits].sort((a, b) => a.order - b.order);
  return (
    <>
      {hits.map((h, i) => {
        const at = hitAt(ev, h) - 0.4;
        const s = t - at;
        if (s < 0) return null;
        const prev = hits[i - 1];
        return (
          <div key={`${h.x},${h.y}`}>
            {prev && (
              <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
                <line
                  x1={prev.x + 0.5}
                  y1={prev.y + 0.5}
                  x2={prev.x + 0.5 + (h.x - prev.x) * Math.min(1, s / 0.4)}
                  y2={prev.y + 0.5 + (h.y - prev.y) * Math.min(1, s / 0.4)}
                  stroke="color-mix(in srgb, var(--color-g-food) 45%, var(--color-warn))"
                  strokeWidth={tv ? 0.08 : 0.06}
                  strokeDasharray="0.12 0.12"
                />
              </svg>
            )}
            <div
              className="absolute"
              style={{
                ...cell(h.x, h.y),
                background: `radial-gradient(circle at 38% 42%, color-mix(in srgb, var(--color-warn) 65%, var(--color-void)) 0 ${Math.min(34, s * 50)}%, transparent ${Math.min(62, s * 80)}%), radial-gradient(circle at 72% 68%, color-mix(in srgb, var(--color-warn) 55%, var(--color-void)) 0 ${Math.min(24, s * 35)}%, transparent ${Math.min(46, s * 60)}%)`,
              }}
              data-testid={`blight-${h.x}-${h.y}`}
            >
              {/* The swarm itself: a few dark specks crawling over the farm while it eats. */}
              {s < 2.2 &&
                [18, 34, 52, 66, 80].map((left, k) => (
                  <span
                    key={k}
                    aria-hidden
                    className="absolute size-[7%] rounded-full bg-void animate-[crawl_0.5s_ease-in-out_infinite_alternate]"
                    style={{ left: `${left}%`, top: `${30 + ((k * 23) % 45)}%`, animationDelay: `${k * 0.1}s` }}
                  />
                ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

/** Hairline cracks in dry ground. */
function Cracks({ style }: { style: CSSProperties }) {
  return (
    <svg className="absolute animate-[badge-in_0.4s_ease-out]" style={style} viewBox="0 0 10 10" aria-hidden>
      <path d="M1 3 L3 4 L4 2 L6 4 L9 3 M3 4 L3 7 L5 8 L7 6 L9 8 M6 4 L7 6" fill="none" stroke="color-mix(in srgb, var(--color-warn) 60%, var(--color-void))" strokeWidth="0.45" />
    </svg>
  );
}

/** A few twinkling points over a plot. */
function Sparkles({ style, colour }: { style: CSSProperties; colour: string }) {
  return (
    <div className="absolute" style={style} aria-hidden>
      {[
        [22, 28],
        [64, 20],
        [44, 56],
        [76, 62],
        [30, 74],
      ].map(([l, tp], k) => (
        <span key={k} className="absolute size-[9%] rotate-45 animate-[twinkle_0.7s_ease-in-out_infinite_alternate]" style={{ left: `${l}%`, top: `${tp}%`, background: colour, animationDelay: `${k * 0.13}s` }} />
      ))}
    </div>
  );
}

// --- Event card ---------------------------------------------------------------

export function EventCard({ ev, t, tv = false }: { ev: ShowEvent | null; t: number; tv?: boolean }) {
  if (!ev || t < SHOW.cardAt) return null;
  return (
    <div
      className={cx(
        'flex flex-col gap-1 rounded-panel border-2 animate-[card-in_0.4s_ease-out]',
        ev.sign === 'good' ? 'border-ok bg-holo-soft shadow-glow' : 'border-alert bg-alert-bg shadow-glow-alert',
        tv ? 'p-5' : 'px-2.5 py-2',
      )}
      data-testid="event-card"
    >
      <span className={cx('label-caps', ev.sign === 'good' ? 'text-ok!' : 'text-alert-ink!', tv ? 'text-base!' : '')}>{ev.sign === 'good' ? 'Good news' : 'Event'}</span>
      <span className={cx('font-display font-bold leading-none', ev.sign === 'good' ? 'text-ok' : 'text-alert-ink', tv ? 'text-5xl' : 'text-xl')}>{ev.title}!</span>
      <span className={cx('leading-snug', tv ? 'text-2xl' : 'text-xs')}>{ev.line}</span>
    </div>
  );
}

/** What the badges mean, in words, for the TV's side column. */
function WhyLegend() {
  const rows: [string, string, Good | undefined, string][] = [
    ['+1', 'bg-ok text-on-holo', undefined, 'Next to your own plot of the same good'],
    ['½', 'bg-alert text-white', 'water', 'A farm with no Water makes half'],
    ['½', 'bg-alert text-white', 'energy', 'No Energy for the plot: half'],
    ['−1', 'bg-warn text-void', undefined, 'Polluted ground'],
  ];
  return (
    <ul className="flex flex-col gap-2" data-testid="why-legend">
      {rows.map(([badge, tone, icon, text]) => (
        <li key={text} className="flex items-center gap-3 text-lg leading-snug text-ink-2">
          <span className={cx('flex w-12 shrink-0 items-center justify-center gap-0.5 rounded-chip px-1 py-0.5 font-mono text-base font-bold', tone)}>
            {icon && <GoodIcon good={icon} size={14} />}
            {badge}
          </span>
          {text}
        </li>
      ))}
    </ul>
  );
}

// --- Arrivals: what has landed so far ------------------------------------------

function arrived(t: number, ev: ShowEvent | null, owner: string): Partial<Record<Good, number>> {
  const out: Partial<Record<Good, number>> = {};
  LINES.forEach((l, i) => {
    if (l.owner !== owner || t < flyAt(i) + SHOW.flight) return;
    const n = finalUnits(l, ev);
    if (n > 0) out[l.good] = (out[l.good] ?? 0) + n;
  });
  return out;
}

/** WS6: the TV's colony bar: every player's slot, their money, and what has flown home to them. Public. */
function ColonyBar({ t, ev }: { t: number; ev: ShowEvent | null }) {
  return (
    <div className="grid grid-cols-4 gap-3" data-testid="colony-bar">
      {VIEW.players.map((p) => (
        <PlayerSlot key={p.id} id={p.id} t={t} ev={ev} />
      ))}
    </div>
  );
}

function PlayerSlot({ id, t, ev }: { id: string; t: number; ev: ShowEvent | null }) {
  const p = VIEW.players.find((x) => x.id === id)!;
  const slot = (slotOf(VIEW, id) ?? 0) as Slot;
  const species = useSeatSpecies(slot);
  const got = Object.entries(arrived(t, ev, id)) as [Good, number][];
  const landing = LINES.some((l, i) => l.owner === id && t >= flyAt(i) + SHOW.flight && t < flyAt(i) + SHOW.flight + 0.25);
  return (
    <div
      data-fly-target={id}
      className={cx('flex h-[64px] items-center gap-3 rounded-panel border-2 bg-panel px-3 transition-shadow', landing ? 'shadow-glow' : '')}
      style={{ borderColor: SLOT_COLOR[slot] }}
      data-testid={`slot-${id}`}
    >
      <Creature species={species} color={SLOT_COLOR[slot]} size={40} />
      <span className="flex shrink-0 flex-col">
        <span className="font-display text-lg font-semibold leading-tight">{p.name}</span>
        <span data-num className="font-mono text-base text-ink-2">
          {fmt(p.money)} cr
        </span>
      </span>
      <span className="ml-auto flex min-w-0 flex-wrap justify-end gap-x-1.5 gap-y-0.5">
        {got.map(([g, n]) => (
          <span key={g} data-num className="flex items-center gap-0.5 font-mono text-sm font-bold text-ok">
            +{n}
            <GoodIcon good={g} size={16} />
          </span>
        ))}
      </span>
    </div>
  );
}

// --- The two screens --------------------------------------------------------------

export function TvProduction({ t, ev }: { t: number; ev: ShowEvent | null }) {
  return (
    <ShowRoot className="flex h-[720px] w-[1280px] flex-col gap-4 bg-table px-10 py-6 text-ink">
      <TvHeader game={{ ...VIEW, phase: 'production' }} title="Production" />
      <div className="flex min-h-0 flex-1 gap-6">
        <MapShow t={t} ev={ev} tv className="w-[820px] shrink-0 self-start" />
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <EventCard ev={ev} t={t} tv />
          {(!ev || t < SHOW.cardAt) && (
            <>
              <span className="label-caps text-base!">Why each plot made what it made</span>
              <WhyLegend />
            </>
          )}
          <p className="mt-auto font-display text-xl leading-snug text-ink-2">
            {t < SHOW.cardAt ? 'Every plot shows what it made.' : t < SHOW.flyStart ? (ev ? `${ev.title}: watch the map.` : 'A quiet month: no event.') : 'The goods fly home.'}
          </p>
        </div>
      </div>
      <ColonyBar t={t} ev={ev} />
    </ShowRoot>
  );
}

/** WS6: the phone's private strip of your nine goods, where your harvest lands. */
function StockStrip({ t, ev }: { t: number; ev: ShowEvent | null }) {
  const got = arrived(t, ev, 'lena');
  const goods: Good[] = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth', 'alloy', 'electronics', 'medicine'];
  const landing = LINES.some((l, i) => l.owner === 'lena' && t >= flyAt(i) + SHOW.flight && t < flyAt(i) + SHOW.flight + 0.25);
  return (
    <div
      data-fly-target="lena"
      className={cx('mt-1.5 flex h-8 shrink-0 items-center justify-between rounded-control border border-holo-line bg-panel px-2 transition-shadow', landing && 'shadow-glow')}
      data-testid="stock-strip"
    >
      {goods.map((g) => {
        const plus = got[g] ?? 0;
        return (
          <span key={g} className="flex items-center gap-0.5" aria-label={`${GOOD_NAME[g]} ${ME.stock[g] + plus}`}>
            <GoodIcon good={g} size={13} />
            <span data-num className={cx('font-mono text-xs font-bold', plus > 0 ? 'text-ok' : 'text-ink')}>
              {ME.stock[g] + plus}
            </span>
          </span>
        );
      })}
    </div>
  );
}

export function PhoneProduction({ t, ev }: { t: number; ev: ShowEvent | null }) {
  const mine = totals(ev).lena ?? {};
  const before = totals(null).lena ?? {};
  const hitMe = ev ? LINES.some((l) => l.owner === 'lena' && ev.hits.some((h) => h.x === l.x && h.y === l.y)) : false;
  const lostFood = (before.food ?? 0) - (mine.food ?? 0);
  return (
    <PhoneShell
      phase="Production"
      fill
      rail={
        <>
          {ev && t >= SHOW.cardAt ? (
            <EventCard ev={ev} t={t} />
          ) : (
            <span className="label-caps">Your plots are working</span>
          )}
          {ev && t >= SHOW.cardAt && (
            <p className="text-xs leading-snug text-ink-2" data-testid="hit-me">
              {hitMe ? `It hit your farms: ${lostFood} Food lost.` : 'Your plots are clear of it.'}
            </p>
          )}
          <ul className="flex flex-col gap-1" data-testid="harvest">
            {(Object.entries(mine) as [Good, number][]).map(([g, n]) => {
              const landed = arrived(t, ev, 'lena')[g] ?? 0;
              return (
                <li key={g} className="flex items-center justify-between rounded-control bg-raised px-2 py-1">
                  <span className="flex items-center gap-1.5 text-sm">
                    <GoodIcon good={g} size={14} />
                    {GOOD_NAME[g]}
                  </span>
                  <span data-num className="font-mono text-sm font-bold">
                    +{n}
                    {t >= SHOW.flyStart && landed < n && <span className="font-normal text-ink-3"> · flying home</span>}
                  </span>
                </li>
              );
            })}
          </ul>
          <span className="text-[11px] text-ink-3">Tap a plot afterwards to see why it made what it made.</span>
        </>
      }
    >
      <ShowRoot className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 items-center justify-center [container-type:size]">
          <div style={{ width: `min(100cqw, calc(100cqh * ${W} / ${H}))` }}>
            <MapShow t={t} ev={ev} only="lena" />
          </div>
        </div>
        <StockStrip t={t} ev={ev} />
      </ShowRoot>
    </PhoneShell>
  );
}

export { EVENTS, half };
