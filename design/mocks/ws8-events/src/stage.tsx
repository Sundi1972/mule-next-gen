import { Creature, cx, GoodIcon, PlayerMark, SeatSpeciesProvider, SLOT_COLOR, type Good, type MapTile, type Slot } from '@mule/ui';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { PlotMap } from './borrowed/PlotMap';
import { landed, playerChange, unitsAt, type Script } from './events';
import { H, ME, OUTPUT, SEATS, seat, SPECIES_BY_SLOT, STAND, TILES, W } from './fixture';
import { DeltaChip } from './glyphs';

// --- The clock every screen reads -----------------------------------------------------------------------------------

export interface Show {
  s: Script;
  t: number;
  reduced: boolean;
}
const ShowContext = createContext<Show | null>(null);
export const ShowProvider = ShowContext.Provider;
export const useShow = () => useContext(ShowContext)!;

/** A clock in show seconds that plays, pauses, scrubs and restarts; it stops at `end`. */
export function useShowClock(end: number) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    last.current = null;
    const tick = (now: number) => {
      const dt = last.current === null ? 0 : (now - last.current) / 1000;
      last.current = now;
      setT((v) => {
        const next = Math.min(end, v + dt * speed);
        if (next >= end) setPlaying(false);
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, end]);
  return {
    t,
    playing,
    speed,
    setSpeed,
    toggle: () => {
      if (t >= end) setT(0);
      setPlaying((p) => !p);
    },
    restart: () => {
      setT(0);
      setPlaying(true);
    },
    seek: (v: number) => {
      setT(v);
      setPlaying(false);
    },
  };
}

/** The reviewer's controls: play, scrub, speed, and the reduced-motion switch. */
export function Controls({ clock, end, reduced, setReduced, marks }: { clock: ReturnType<typeof useShowClock>; end: number; reduced: boolean; setReduced: (v: boolean) => void; marks: { at: number; label: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-panel border border-holo-line bg-panel px-3 py-2" data-testid="controls">
      <button type="button" onClick={clock.toggle} className="w-20 rounded-control bg-holo px-3 py-1 font-display text-sm font-semibold text-on-holo" data-testid="play">
        {clock.playing ? 'Pause' : clock.t >= end ? 'Replay' : 'Play'}
      </button>
      <button type="button" onClick={clock.restart} className="rounded-control border border-holo-line px-3 py-1 text-sm" data-testid="restart">
        Restart
      </button>
      <div className="relative flex min-w-[320px] flex-1 flex-col">
        <input type="range" min={0} max={end} step={0.05} value={clock.t} onChange={(e) => clock.seek(Number(e.target.value))} className="w-full accent-[var(--color-holo)]" aria-label="Scrub the show" data-testid="scrub" />
        <div className="relative h-4 text-[10px] text-ink-3">
          {marks.map((m) => (
            <button type="button" key={m.label + m.at} onClick={() => clock.seek(m.at + 0.01)} className="absolute -translate-x-1/2 whitespace-nowrap hover:text-holo" style={{ left: `${(m.at / end) * 100}%` }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <span data-num className="w-20 font-mono text-sm text-ink-2">
        {clock.t.toFixed(1)} / {end.toFixed(0)} s
      </span>
      <label className="flex items-center gap-1 text-sm text-ink-2">
        Speed
        <select value={clock.speed} onChange={(e) => clock.setSpeed(Number(e.target.value))} className="rounded-chip border border-holo-line bg-raised px-1 py-0.5 text-ink" data-testid="speed">
          {[0.25, 0.5, 1, 2].map((v) => (
            <option key={v} value={v}>
              {v}×
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-sm text-ink-2" data-testid="reduced-toggle">
        <input type="checkbox" checked={reduced} onChange={(e) => setReduced(e.target.checked)} />
        Reduced motion
      </label>
    </div>
  );
}

// --- Frames ---------------------------------------------------------------------------------------------------------

/** The big screen at its design size (1280 × 720), scaled down to fit the page: WS6's TvFrame. */
export function TvFrame({ children, scale = 0.75 }: { children: ReactNode; scale?: number }) {
  return (
    <div className="max-w-full overflow-x-auto">
      <div className="overflow-hidden rounded-panel border border-holo-line" style={{ width: 1280 * scale, height: 720 * scale }} data-testid="tv-frame">
        <div className="origin-top-left" style={{ width: 1280, height: 720, transform: `scale(${scale})` }}>
          <SeatSpeciesProvider value={SPECIES_BY_SLOT}>{children}</SeatSpeciesProvider>
        </div>
      </div>
    </div>
  );
}

/** A phone held sideways at the e2e harness's size (844 × 390): WS6's PhoneFrame. */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-full overflow-x-auto">
      <div className="relative h-[390px] w-[844px] overflow-hidden rounded-sheet border border-holo-line bg-table shadow-map" data-testid="phone-frame">
        <SeatSpeciesProvider value={SPECIES_BY_SLOT}>{children}</SeatSpeciesProvider>
      </div>
    </div>
  );
}

// --- The map, with the show over it ---------------------------------------------------------------------------------

export const cell = (x: number, y: number): CSSProperties => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%`, width: `${100 / W}%`, height: `${100 / H}%` });
export const centre = (x: number, y: number) => ({ left: `${((x + 0.5) / W) * 100}%`, top: `${((y + 0.5) / H) * 100}%` });

/**
 * Heiko's approved plot look (A, bold plots) with the event layers over it. The painted map renders once; only the
 * layers redraw as the clock runs. `under` sits between the land and the bars, `over` above everything.
 */
export function MapBox({ tv, focusSlot, under, over, shake, className, tiles = TILES }: { tv: boolean; focusSlot?: Slot; under?: ReactNode; over?: ReactNode; shake?: string | undefined; className?: string; tiles?: MapTile[] }) {
  const land = useMemo(
    () => <PlotMap look="A" width={W} height={H} tiles={tiles} density={tv ? 'tv' : 'phone'} {...(focusSlot !== undefined ? { focusSlot } : {})} className="w-full" />,
    [tv, focusSlot, tiles],
  );
  return (
    <div className={cx('relative', className)} style={{ transform: shake }} data-testid="event-map">
      {land}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-panel">{under}</div>
      <OutputBars tv={tv} {...(focusSlot !== undefined ? { only: SEATS.find((s) => s.slot === focusSlot)!.id } : {})} />
      <div className="pointer-events-none absolute inset-0 rounded-panel">{over}</div>
    </div>
  );
}

/** What each working plot made, as WS6's production bars (R3): one bar per unit in the owner's colour; lost units fall away grey. */
function OutputBars({ tv, only }: { tv: boolean; only?: string }) {
  const { s, t, reduced } = useShow();
  if (s.phase !== 'production') return null;
  return (
    <>
      {OUTPUT.filter((o) => only === undefined || o.owner === only).map((o) => {
        const { now, before, lostAt } = unitsAt(s, t, reduced, o.x, o.y);
        const ago = lostAt === null ? Infinity : t - lostAt;
        const bar = tv ? 'h-3 w-1.5' : 'h-2 w-1 ring-1 ring-void/70';
        return (
          <div key={`${o.x},${o.y}`} className="pointer-events-none absolute" style={cell(o.x, o.y)} data-testid={`bars-${o.x}-${o.y}`}>
            <span className={cx('absolute bottom-[6%] left-[8%] z-[3] flex items-end', tv ? 'gap-[2px]' : 'gap-px')}>
              {Array.from({ length: now }, (_, k) => (
                <span key={k} className={cx('rounded-[2px] shadow-chip', bar)} style={{ background: SLOT_COLOR[seat(o.owner).slot] }} />
              ))}
              {!reduced &&
                ago < 1 &&
                Array.from({ length: before - now }, (_, k) => (
                  <span key={`l${k}`} className={cx('rounded-[2px] bg-ink-3', bar)} style={{ transform: `translateY(${ago * (tv ? 36 : 18)}px)`, opacity: 1 - ago }} />
                ))}
            </span>
          </div>
        );
      })}
    </>
  );
}

/** Where a hit has landed, for the layers that mark it: every hit by `t`. */
export function useLanded() {
  const { s, t, reduced } = useShow();
  return landed(s, t, reduced);
}

// --- The TV ---------------------------------------------------------------------------------------------------------

const PHASE_NAME = { development: 'Development', production: 'Production' } as const;

/** The big screen during a phase: the header, the map on the left, a rail on the right, the colony bar under both. */
export function TvLayout({ map, rail, banner, bar, headerExtra }: { map: ReactNode; rail: ReactNode; banner?: ReactNode; bar?: ReactNode; headerExtra?: ReactNode }) {
  const { s } = useShow();
  return (
    <div className="relative flex h-[720px] w-[1280px] flex-col gap-4 overflow-hidden bg-table px-10 py-6 text-ink" data-phase={s.phase}>
      <header className="flex h-10 items-center gap-4">
        <span className="font-display text-3xl font-bold">{PHASE_NAME[s.phase]}</span>
        <span className="label-caps text-base!">Month 5 of 12</span>
        <span className="ml-auto flex items-center gap-3">{headerExtra}</span>
      </header>
      <div className="flex min-h-0 flex-1 gap-6">
        <div className="relative w-[820px] shrink-0 self-start">
          {map}
          {banner}
        </div>
        <div className="relative flex min-w-0 flex-1 flex-col gap-3">{rail}</div>
      </div>
      {bar ?? <ColonyBar />}
    </div>
  );
}

/** The colony bar: each player's slot, with what this phase's events have done to them so far. */
export function ColonyBar({ glowFor, extra }: { glowFor?: string | undefined; extra?: (id: string) => ReactNode }) {
  const { s, t, reduced } = useShow();
  return (
    <div className="grid grid-cols-4 gap-3" data-testid="colony-bar">
      {SEATS.map((p) => {
        const change = playerChange(s, t, reduced, p.id);
        return (
          <div
            key={p.id}
            className={cx('relative flex h-[64px] items-center gap-3 rounded-panel border-2 bg-panel px-3 transition-shadow', glowFor === p.id && 'shadow-glow')}
            style={{ borderColor: SLOT_COLOR[p.slot] }}
            data-testid={`slot-${p.id}`}
          >
            <Creature species={p.species} color={SLOT_COLOR[p.slot]} size={40} />
            <span className="flex shrink-0 flex-col">
              <span className="font-display text-lg font-semibold leading-tight">{p.name}</span>
              <span data-num className="font-mono text-base text-ink-2">
                {p.money} cr
              </span>
            </span>
            <span className="ml-auto flex flex-wrap justify-end gap-1">
              {(Object.entries(change) as [Good, number][]).map(([g, n]) => (
                <DeltaChip key={g} delta={n} good={g} size="tv" />
              ))}
              {extra?.(p.id)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Development on the TV: everyone's colonist at the store, about to set off. */
export function Colonists({ tv, tag, only }: { tv: boolean; tag?: (id: string) => ReactNode; only?: string }) {
  return (
    <>
      {SEATS.filter((p) => only === undefined || p.id === only).map((p) => {
        const at = STAND[p.id]!;
        return (
          <div key={p.id} className="absolute z-[7] flex -translate-x-1/2 -translate-y-1/2 items-center justify-center" style={centre(at.x, at.y)} data-testid={`colonist-${p.id}`}>
            <span className="relative">
              <PlayerMark slot={p.slot} species={p.species} size={tv ? 42 : 22} />
              {tag?.(p.id)}
            </span>
          </div>
        );
      })}
    </>
  );
}

/** WS6's approved sick tag (variant B): a pink cross on the condition chip. Hunger shares the chip; not shown here. */
export function SickTag({ size = 'tv', className }: { size?: 'tv' | 'phone'; className?: string }) {
  const g = size === 'tv' ? 18 : 10;
  return (
    <span className={cx('flex items-center justify-center rounded-[5px] border border-void/60 text-void shadow-chip', className)} style={{ width: g + 4, height: g + 4, background: 'var(--color-g-medicine)' }} data-testid="sick-tag">
      <svg viewBox="0 0 16 16" width={g - 2} height={g - 2} aria-hidden>
        <path d="M6 2h4v4h4v4h-4v4H6v-4H2V6h4Z" fill="currentColor" />
      </svg>
    </span>
  );
}

// --- The phone ------------------------------------------------------------------------------------------------------

/** Lena's phone, sideways: her map on the left (only her plots in full), the rail on the right. */
export function PhoneLayout({ map, rail, overlay }: { map: ReactNode; rail: ReactNode; overlay?: ReactNode }) {
  const { s } = useShow();
  return (
    <div className="relative flex h-full w-full gap-2 p-2 text-ink">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2 px-1">
          <span className="font-display text-sm font-bold">{PHASE_NAME[s.phase]}</span>
          <span className="label-caps text-[10px]!">Month 5</span>
          <span className="ml-auto flex items-center gap-1 text-xs text-ink-2">
            <PlayerMark slot={seat(ME).slot} size={14} />
            Lena
          </span>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="w-[540px]">{map}</div>
        </div>
      </div>
      <aside className="relative flex w-[268px] shrink-0 flex-col gap-2 rounded-panel border border-holo-line bg-panel p-2.5">{rail}</aside>
      {overlay}
    </div>
  );
}

/** What this phase did to one player, in words: "−2 Energy, −4 Food", or nothing. */
export function changeWords(change: Partial<Record<Good, number>>): string | null {
  const parts = (Object.entries(change) as [Good, number][]).filter(([, n]) => n !== 0);
  if (parts.length === 0) return null;
  return parts.map(([g, n]) => `${n > 0 ? '+' : '−'}${Math.abs(n)} ${g === 'rareEarth' ? 'Rare earth' : g[0]!.toUpperCase() + g.slice(1)}`).join(', ');
}

export function GoodLine({ good, n }: { good: Good; n: number }) {
  return (
    <span className="flex items-center gap-1">
      <GoodIcon good={good} size={14} />
      <span data-num className="font-mono text-sm font-bold">
        {n > 0 ? '+' : '−'}
        {Math.abs(n)}
      </span>
    </span>
  );
}
