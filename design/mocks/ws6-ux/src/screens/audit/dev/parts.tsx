import type { Ground, RawGood } from '@mule/engine';
import { cx, GOOD_NAME, GoodIcon, MuleIcon, TimeBar } from '@mule/ui';
import type { ReactNode } from 'react';
import { EyeOff } from '../../PlanningHub';
import { bestHere, pips, RAW } from './fixture';

/**
 * The pieces the development audit's screen composes (src/screens/audit/DevAudit.tsx). Tokens only; every one is a
 * candidate for packages/ui or apps/web/src/phone once approved (DS-GAP noted where @mule/ui has nothing that fits).
 */

// --- V-1 · the dotted path ------------------------------------------------------------------

/** Evenly spaced points from a to b, both ends included: for a straight walk across the store floor. */
export function lineDots(a: { x: number; y: number }, b: { x: number; y: number }, n = 10) {
  return Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));
}

/**
 * A dotted path, in % of its box (DS-GAP: @mule/ui draws no path). HTML dots, not an SVG dash, so they stay round on a
 * stage of any shape. `points` are the path's corners: two dots per straight stretch unless `at` gives every dot.
 */
export function Dots({ points, at, size = 'size-1.5', testid = 'path-dots' }: { points?: { x: number; y: number }[]; at?: { x: number; y: number }[]; /** The dot, from the spacing scale. */ size?: string; testid?: string }) {
  const dots = at ?? (points ? points.slice(1).flatMap((p, i) => lineDots(points[i]!, p).slice(i === 0 ? 0 : 1)) : []);
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0" data-testid={testid}>
      {dots.map((d, i) => (
        <span
          key={i}
          className={cx('absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-holo shadow-glow', size)}
          style={{ left: `${d.x}%`, top: `${d.y}%`, opacity: 0.35 + (0.65 * (i + 1)) / dots.length }}
        />
      ))}
    </span>
  );
}

// --- Buttons with a time on them ----------------------------------------------------------------

/** A button's two lines: what it does, and what it costs in time (V-1, V-3: every time includes the walk). */
export function Two({ top, sub }: { top: ReactNode; sub: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-col items-center gap-0.5 leading-none">
      <span className="whitespace-nowrap">{top}</span>
      <span data-num className="whitespace-nowrap font-mono text-[10px] font-bold opacity-80 @min-[1100px]/shell:text-sm">
        {sub}
      </span>
    </span>
  );
}

// --- V-3 · the readout, in words -----------------------------------------------------------------

/** What a geo analysis found, every good by its name with 0 to 4 dots, and what is best here. */
export function Readout({ ground, wide, mule }: { ground: Ground; wide: boolean; mule?: RawGood | null }) {
  const best = bestHere(ground);
  return (
    <div className="flex flex-col gap-1 rounded-control bg-raised px-2 py-1.5 @min-[1100px]/shell:gap-2 @min-[1100px]/shell:px-3 @min-[1100px]/shell:py-2.5" data-testid="readout">
      <span className="flex items-center justify-between gap-2 pr-2 @min-[1100px]/shell:pr-4">
        <span className="label-caps flex items-center gap-1 text-[9px]! @min-[1100px]/shell:text-xs!">
          Underground
          <span className="text-holo" role="img" aria-label="Only you see this">
            <EyeOff size={10} strokeWidth={2.4} />
          </span>
        </span>
        <span className="whitespace-nowrap rounded-chip bg-holo-soft px-1.5 text-[11px] font-semibold text-holo @min-[1100px]/shell:text-sm" data-testid="readout-best">
          best here: {GOOD_NAME[best]}
        </span>
      </span>
      <span className="grid grid-cols-2 gap-x-2 gap-y-0.5 @min-[1100px]/shell:gap-x-4 @min-[1100px]/shell:gap-y-1">
        {RAW.map((g) => {
          const n = pips(g, ground[g]);
          return (
            <span key={g} className={cx('flex items-center gap-1', n === 0 && 'opacity-55')} data-testid={`readout-${g}`}>
              <GoodIcon good={g} size={wide ? 16 : 11} />
              <span className={cx('flex-1 truncate text-[10px] @min-[1100px]/shell:text-sm', g === best ? 'font-semibold text-ink' : 'text-ink-2', g === mule && 'underline decoration-dotted underline-offset-2')}>{GOOD_NAME[g]}</span>
              <span className="flex gap-px" role="img" aria-label={`${GOOD_NAME[g]}: ${n} of 4`}>
                {[1, 2, 3, 4].map((i) => (
                  <span key={i} className="size-1.5 rounded-full @min-[1100px]/shell:size-2" style={{ background: i <= n ? `var(--color-g-${g})` : 'var(--color-holo-line)' }} />
                ))}
              </span>
            </span>
          );
        })}
      </span>
    </div>
  );
}

// --- V-6 · everyone's clock, and your pace -------------------------------------------------------

/**
 * Everyone's clock across the top of the stage, where the TV has it: one row, a label and the auction's TimeBar. While
 * it waits (V-8, the first month) the bar stands full and the label says what starts it.
 */
export function ClockRow({ seconds, total, waits, labelMark, mark }: { seconds: number; total: number; waits?: ReactNode; labelMark?: ReactNode; mark?: ReactNode }) {
  return (
    <div className="relative flex shrink-0 items-center gap-2 @min-[1100px]/shell:gap-4" data-testid="shared-clock">
      <span className={cx('relative shrink-0 whitespace-nowrap', !!labelMark && 'pr-3 @min-[1100px]/shell:pr-5', waits ? 'text-[11px] font-semibold text-holo @min-[1100px]/shell:text-base' : 'label-caps text-[10px]! @min-[1100px]/shell:text-sm!')} data-testid="clock-label">
        {waits ?? "Everyone's clock"}
        {labelMark}
      </span>
      <TimeBar seconds={seconds} total={total} className="min-w-0 flex-1" />
      {mark}
    </div>
  );
}

/** Your pace in the rail, with its reason, on the phone too (no tooltip); and what to do about it next month. */
export function PaceBlock({ pace, ate, need, next, open, onToggle, mark }: { pace: number; ate: number; need: number; next: string | null; open: boolean; onToggle: () => void; mark?: ReactNode }) {
  const pct = Math.round(pace * 100);
  const short = ate < need;
  return (
    <div className="relative flex flex-col gap-1" data-testid="your-pace" data-tone={short ? 'warn' : 'ok'}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={next ? open : undefined}
        disabled={!next}
        className="flex items-start gap-1 text-left text-xs leading-snug disabled:cursor-default @min-[1100px]/shell:text-base"
        data-testid="pace-line"
      >
        <span className="min-w-0 flex-1">
          <strong className={cx('font-display font-semibold', short ? 'text-warn' : 'text-ok')}>Your pace {pct}%</strong>
          <span className="text-ink-2">: {short ? `you ate ${ate} of the ${need} Food you need` : `you ate the ${need} Food you need`}</span>
        </span>
        {next && (
          <svg aria-hidden viewBox="0 0 24 24" width={12} height={12} className={cx('mt-0.5 shrink-0 text-holo transition-transform @min-[1100px]/shell:hidden', open && 'rotate-180')} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </button>
      {next && (
        <span className={cx('text-[11px] leading-snug text-ink @min-[1100px]/shell:block @min-[1100px]/shell:text-sm', open ? 'block' : 'hidden')} data-testid="pace-next">
          {next}
        </span>
      )}
      {mark}
    </div>
  );
}

// --- V-2 · your plots, while you choose ---------------------------------------------------------

export type PlotRow = { id: string; name: string; suits: string; mule: RawGood | 'other' | null };

/** Above the shops while your MULE is empty: each plot of yours, what it suits, and whether a MULE is on it. */
export function PlotsStrip({ rows, mark }: { rows: PlotRow[]; mark?: ReactNode }) {
  return (
    <section className="relative flex shrink-0 items-stretch gap-1.5 @min-[1100px]/shell:gap-3" aria-label="Your plots and what each suits" data-testid="plots-strip">
      <span className="flex shrink-0 flex-col justify-center">
        <span className="label-caps text-[9px]! leading-tight @min-[1100px]/shell:text-xs!">Your</span>
        <span className="label-caps text-[9px]! leading-tight @min-[1100px]/shell:text-xs!">plots</span>
      </span>
      {rows.map((r) => (
        <span key={r.id} className="flex min-w-0 flex-1 flex-col justify-center rounded-control border border-holo-line bg-panel px-1.5 py-0.5 @min-[1100px]/shell:px-3 @min-[1100px]/shell:py-1.5" data-testid={`plot-row-${r.id}`}>
          <span className="flex items-center justify-between gap-1">
            <span className="whitespace-nowrap font-display text-[11px] font-semibold leading-tight @min-[1100px]/shell:text-base">{r.name}</span>
            <span className={cx('flex shrink-0 items-center gap-0.5 whitespace-nowrap text-[9px] leading-tight @min-[1100px]/shell:text-sm', r.mule ? 'text-ink' : 'text-ink-3')} data-testid={`plot-mule-${r.id}`}>
              {r.mule ? (
                <>
                  <MuleIcon size={11} />
                  {r.mule !== 'other' && <GoodIcon good={r.mule} size={9} />}
                  {r.mule !== 'other' ? `${GOOD_NAME[r.mule]} MULE` : 'MULE'}
                </>
              ) : (
                'no MULE'
              )}
            </span>
          </span>
          <span className="truncate text-[9px] leading-tight text-ink-2 @min-[1100px]/shell:text-sm" data-testid={`plot-suits-${r.id}`}>
            {r.suits}
          </span>
        </span>
      ))}
      {mark}
    </section>
  );
}

// --- Review furniture ----------------------------------------------------------------------------

/**
 * A decision the mock cannot take, drawn where it would land: a rule change or a balance number that is Heiko's to
 * decide. Review furniture like the numbered markers: the graft drops it.
 */
export function DecisionFlag({ children, testid }: { children: ReactNode; testid: string }) {
  return (
    <span className="inline-flex w-fit items-center gap-1 rounded-chip border border-dashed border-warn px-1.5 py-px text-[10px] font-semibold leading-tight text-warn @min-[1100px]/shell:text-sm" data-testid={testid}>
      <svg aria-hidden viewBox="0 0 24 24" width={10} height={10} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l9 16H3z" />
        <path d="M12 10v4M12 17v.5" />
      </svg>
      {children}
    </span>
  );
}

// --- V-1 · arrow keys on a laptop ---------------------------------------------------------------

export type Arrow = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';
const KEY_GLYPH: Record<Arrow, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };

/** The rail says the arrow keys walk, and lights the key as it walks you a cell (laptop only; a phone has no keys). */
export function KeysPanel({ lit, step, mark }: { lit: Arrow | null; step: string; mark?: ReactNode }) {
  const cap = (k: Arrow) => (
    <kbd
      className={cx('grid size-9 place-items-center rounded-control border-2 font-mono text-lg font-bold transition-colors', lit === k ? 'border-holo bg-holo text-on-holo shadow-glow' : 'border-holo-line bg-raised text-ink-2')}
      data-testid={`key-${k}`}
      {...(lit === k ? { 'data-lit': true } : {})}
    >
      {KEY_GLYPH[k]}
    </kbd>
  );
  return (
    <section className="relative hidden items-center gap-4 rounded-panel border border-holo-line bg-panel p-3 @min-[1100px]/shell:flex" data-testid="keys-panel">
      <span className="grid grid-cols-3 gap-1">
        <span />
        {cap('ArrowUp')}
        <span />
        {cap('ArrowLeft')}
        {cap('ArrowDown')}
        {cap('ArrowRight')}
      </span>
      <span className="flex flex-col gap-0.5">
        <strong className="font-display text-lg font-semibold">Arrow keys walk</strong>
        <span className="text-sm text-ink-2">One plot a press, {step} at your pace. Or click a plot: you walk there first.</span>
      </span>
      {mark}
    </section>
  );
}
