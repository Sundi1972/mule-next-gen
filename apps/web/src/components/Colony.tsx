import { GOODS, moodBand, type PrestigeId } from '@mule/engine';
import type { ColonyProjectView, ColonyView, MuleView, PlayerView } from '@mule/protocol';
import { airBandStyle, cx, GoodIcon, PlayerMark, useEventReducedMotion } from '@mule/ui';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { colonyVerdict, fmt, toSlot } from '../game/derive';
import { inCollapse, league, winnerWords } from '../game/month-end';
import { ChangeTag } from './MonthEnd';
import { MOOD, moodOf, type MoodBand, PERK, plaqueBoard, plaquesOf, scoreVerdict, scoreWords, STAGE, standingCount, type ColonyScore } from '../game/colony';

/** The colony's parts at the TV's size and the phone's: its four gauges, its build site, and its score at game over. */

export type Size = 'tv' | 'phone';

const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '±0');

// --- The objects' glyphs ------------------------------------------------------------------------------

// Until WS5's packages/ui ObjectGlyph (ws5-c33 64bedde4) merges; then import it from @mule/ui.
const GLYPH: Record<PrestigeId, string> = {
  park: 'M12 3l-5 7h3l-4 6h12l-4-6h3zM12 16v5M5 21h14',
  hospital: 'M4 21V7l8-4 8 4v14M10 21v-5h4v5M12 8v6M9 11h6',
  stadium: 'M3 9c0-2 4-4 9-4s9 2 9 4v6c0 2-4 4-9 4s-9-2-9-4zM3 9c0 2 4 4 9 4s9-2 9-4M7 12v5M17 12v5',
  observatory: 'M4 21h16M6 21v-6a6 6 0 0 1 12 0v6M12 9V3M15 5l4-2M9 17h6',
  spaceport: 'M12 3c3 3 4 7 3 11H9C8 10 9 6 12 3zM9 14l-3 4h12l-3-4M12 18v3M4 21h16',
};

export function ObjectGlyph({ kind, size = 24, className }: { kind: PrestigeId; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={GLYPH[kind]} />
    </svg>
  );
}

function Mark({ player, size }: { player: PlayerView; size: number }) {
  return <PlayerMark slot={toSlot(player.slot)} species={player.species} size={size} label={player.name} />;
}

// --- The four gauges ----------------------------------------------------------------------------------

function Gauge({ label, value, band, tone, bar, fill, note, size, testid, pulse = false, change }: { label: string; value: string; band?: string; tone?: string; bar?: string; fill?: number; note?: ReactNode; size: Size; testid: string; pulse?: boolean; change?: GaugeChange | undefined }) {
  const tv = size === 'tv';
  return (
    // DS-GAP (WS8): the band flip's pulse, cev-pulse in packages/ui's events.css, until the design system has one.
    <div className={cx('flex min-w-0 flex-col rounded-control border border-holo-line bg-panel', tv ? 'gap-1 px-3 py-1.5' : 'gap-0.5 px-2 py-1', pulse && 'animate-[cev-pulse_0.8s_ease-out]')} data-testid={testid} data-from={change?.from} data-to={change?.to}>
      <span className="flex items-baseline justify-between gap-2">
        <span className={cx('label-caps', !tv && 'text-[10px]!')}>{label}</span>
        <span data-num className={cx('whitespace-nowrap font-mono font-bold', tv ? 'text-lg' : 'text-xs')}>
          {value}
        </span>
      </span>
      <span className={cx('relative overflow-hidden rounded-full', tv ? 'h-2' : 'h-1.5', fill === undefined ? 'bg-transparent' : 'bg-raised')}>
        {fill !== undefined && <span className={cx('absolute inset-y-0 left-0 rounded-full', bar)} style={{ width: `${Math.max(0, Math.min(100, fill))}%` }} />}
      </span>
      <span className={cx('flex items-baseline justify-between gap-2 whitespace-nowrap', tv ? 'text-xs' : 'text-[10px]')}>
        {band && <span className={cx('font-display font-semibold uppercase', tone)}>{band}</span>}
        {note && <span className="truncate text-ink-3">{note}</span>}
      </span>
    </div>
  );
}

// --- The gauge landing (the colony events mock's landing.tsx) -------------------------------------------------------

export type GaugeId = 'wealth' | 'environment' | 'prestige' | 'happiness';
/** One gauge's change: it reads `from` until `landsAt` (seconds on the caller's clock), then counts to `to`. */
export interface GaugeChange {
  gauge: GaugeId;
  from: number;
  to: number;
  landsAt: number;
}
/** What ColonyGauges lands, on whose clock: an event's show clock, or the month end's own (useMonthEndDrift). */
export interface GaugeLanding {
  changes: GaugeChange[];
  t: number;
  reduced: boolean;
}

/** Seconds: how long a landed number counts, and how long the pulse round a gauge whose band just flipped lasts. */
export const LANDING = { count: 0.8, pulse: 0.8 } as const;
/** Seconds from the month end coming up to its mood drift landing on the Happiness gauge. */
export const DRIFT_AT = 1.2;

/** The banded gauges' band at a value, from the engine's thresholds (mood) and the air's. */
const BAND_AT: Partial<Record<GaugeId, (v: number) => string>> = { happiness: moodBand, environment: (v) => airBandStyle(v).label };

/** A change's value at `t`: `from` until it lands, then counting to `to`; reduced, it jumps to `to` as it lands. */
function countAt(c: GaugeChange, t: number, reduced: boolean): number {
  if (t < c.landsAt) return c.from;
  if (reduced) return c.to;
  const k = Math.min(1, (t - c.landsAt) / LANDING.count);
  return Math.round(c.from + (c.to - c.from) * k);
}

/** A gauge's number at `t` under a landing, and whether its band flipped within the pulse's length. */
function landed(id: GaugeId, value: number, landing: GaugeLanding | undefined): { value: number; pulse: boolean; change?: GaugeChange } {
  const c = landing?.changes.find((x) => x.gauge === id);
  if (!landing || !c) return { value, pulse: false };
  const now = countAt(c, landing.t, landing.reduced);
  const band = BAND_AT[id];
  const flipped = band !== undefined && !landing.reduced && band(now) !== band(countAt(c, landing.t - LANDING.pulse, false));
  return { value: now, pulse: flipped, change: c };
}

/** The month end's drift, when there is one: Happiness from last month's to now's (RULE-20). Nothing without a colony. */
function driftOf(colony: ColonyView | null | undefined): GaugeChange | null {
  const from = colony?.lastGauges?.happiness;
  const to = colony?.gauges.happiness;
  if (from == null || to == null || from === to) return null;
  return { gauge: 'happiness', from, to, landsAt: DRIFT_AT };
}

/** Seconds since `on` turned true, from the page's frames; it stops at `end`, and reads 0 while off. */
function useFrameClock(on: boolean, end: number): number {
  const [clock, setClock] = useState({ on, t: 0 });
  // Turning on (or off) starts at 0 in this very render, so a new run never shows the last run's time, even for a frame.
  if (clock.on !== on) setClock({ on, t: 0 });
  useEffect(() => {
    if (!on) return;
    let first: number | null = null;
    let raf = requestAnimationFrame(function tick(now) {
      first ??= now;
      const t = Math.min(end, (now - first) / 1000);
      setClock({ on: true, t });
      if (t < end) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [on, end]);
  return clock.on === on ? clock.t : 0;
}

/**
 * The month end's mood drift, for the TV's gauges: it plays when this screen sees the month end come, once, and never
 * for a screen that joins (or rejoins) at the month end, which shows the end state. Reduced motion lands it at once.
 * Call it where the TV stays mounted across phases.
 */
export function useMonthEndDrift(game: MuleView): GaugeLanding | undefined {
  const reduced = useEventReducedMotion();
  const seen = useRef<string | null>(null);
  const [drift, setDrift] = useState<GaugeChange | null>(null);
  const end = DRIFT_AT + LANDING.count + LANDING.pulse;
  // Reduced motion shows the end state, which needs no frames.
  const t = useFrameClock(drift !== null && !reduced, end);
  // Before paint, so the month end never shows the new number before it counts to it.
  useLayoutEffect(() => {
    const before = seen.current;
    seen.current = game.phase;
    if (game.phase !== 'upkeep') setDrift(null);
    else if (before !== null && before !== 'upkeep') setDrift(driftOf(game.colony));
    // Only the phase and month: a new view of the same month end (someone readies) never replays it.
  }, [game.phase, game.month]);
  // Held to the month end's last view once it has played, so the gauge keeps saying what it counted (data-from, data-to).
  if (drift === null || reduced) return undefined;
  return { changes: [drift], t, reduced };
}

/**
 * Wealth, Environment, Prestige and Happiness. Environment is the air, so it keeps the air's bands. A `landing` holds
 * each changed gauge at its old number until its change lands, then counts it, the band flipping with a pulse.
 */
export function ColonyGauges({ colony, size, className, landing }: { colony: ColonyView; size: Size; className?: string; landing?: GaugeLanding | undefined }) {
  const g = colony.gauges;
  const last = colony.lastGauges;
  const wealth = landed('wealth', g.wealth, landing);
  const environment = landed('environment', g.environment, landing);
  const prestige = landed('prestige', g.prestige, landing);
  const air = airBandStyle(environment.value);
  const tv = size === 'tv';
  const moodMove = last?.happiness == null || g.happiness === null ? null : g.happiness - last.happiness;
  return (
    <div className={cx('grid grid-cols-4', tv ? 'gap-2' : 'gap-1.5', className)} data-testid="colony-gauges">
      <Gauge size={size} testid="gauge-wealth" label="Wealth" value={`${fmt(wealth.value)} cr`} note={`fund ${fmt(colony.fund)} cr`} change={wealth.change} />
      <Gauge size={size} testid="gauge-environment" label="Environment" value={`${environment.value}`} band={air.label} tone={air.tone} bar={air.bar} fill={environment.value} pulse={environment.pulse} change={environment.change} />
      <Gauge size={size} testid="gauge-prestige" label="Prestige" change={prestige.change} value={`${prestige.value}`} note={`${standingCount(colony)} standing${last && g.prestige !== last.prestige ? ` · ${signed(g.prestige - last.prestige)}` : ''}`} />
      {g.happiness === null || g.band === null ? (
        <Gauge size={size} testid="gauge-happiness" label="Happiness" value="—" note="not yet" />
      ) : (
        <HappinessGauge size={size} happiness={g.happiness} band={g.band} moodMove={tv ? moodMove : null} landing={landing} />
      )}
    </div>
  );
}

/** Happiness at its landed number, in the band that number reads in, so the label flips as the count crosses. */
function HappinessGauge({ size, happiness, band, moodMove, landing }: { size: Size; happiness: number; band: MoodBand; moodMove: number | null; landing: GaugeLanding | undefined }) {
  const { value, pulse, change } = landed('happiness', happiness, landing);
  // The server's band, until a landing counts the number through another.
  const mood = MOOD[value === happiness ? band : moodBand(value)];
  return (
    <Gauge
      size={size}
      testid="gauge-happiness"
      label="Happiness"
      value={`${value}`}
      band={mood.label}
      tone={mood.tone}
      bar={mood.bar}
      fill={value}
      pulse={pulse}
      change={change}
      {...(moodMove !== null ? { note: moodMove === 0 ? '± 0' : `${moodMove > 0 ? '↑' : '↓'} ${Math.abs(moodMove)} this month` } : {})}
    />
  );
}

// --- The build site -----------------------------------------------------------------------------------

function GoodsNeed({ p, size }: { p: ColonyProjectView; size: Size }) {
  const tv = size === 'tv';
  return (
    <span className={cx('flex flex-wrap items-center', tv ? 'gap-3' : 'gap-2')}>
      {GOODS.filter((g) => p.cost.goods[g]).map((g) => {
        const need = p.cost.goods[g]!;
        const have = p.funded.goods[g] ?? 0;
        return (
          <span key={g} className={cx('flex items-center gap-1 font-mono font-bold', tv ? 'text-base' : 'text-[11px]', have >= need ? 'text-ok' : 'text-ink')} data-testid={`need-${p.id}-${g}`}>
            <GoodIcon good={g} size={tv ? 18 : 12} />
            {have}/{need}
          </span>
        );
      })}
    </span>
  );
}

/** Where the project is, in the one line that matters for its stage. */
function StageLine({ p, size }: { p: ColonyProjectView; size: Size }) {
  const tv = size === 'tv';
  const line = tv ? 'text-base' : 'text-[11px] leading-tight';
  switch (p.stage) {
    case 'commissioned': {
      const share = p.cost.credits === 0 ? 100 : Math.round((p.funded.credits / p.cost.credits) * 100);
      return (
        <span className="flex flex-col gap-1">
          <span className={cx('flex items-baseline justify-between gap-3', line)}>
            <span data-num className="font-mono font-bold">
              {fmt(p.funded.credits)} / {fmt(p.cost.credits)} cr
            </span>
            <GoodsNeed p={p} size={size} />
          </span>
          <span className={cx('relative overflow-hidden rounded-full bg-raised', tv ? 'h-2.5' : 'h-1.5')} data-testid={`funding-${p.id}`}>
            <span className="absolute inset-y-0 left-0 rounded-full bg-holo" style={{ width: `${share}%` }} />
          </span>
          <span className={cx('text-ink-2', line)}>
            Starts building the month it is paid in full: {p.buildMonths} month{p.buildMonths > 1 ? 's' : ''}.
          </span>
        </span>
      );
    }
    case 'building': {
      const done = p.buildMonths - (p.monthsLeft ?? 0);
      return (
        <span className={cx('flex items-center gap-3', line)}>
          <span className="flex gap-1" aria-label={`${done} of ${p.buildMonths} months built`} data-testid={`build-${p.id}`}>
            {Array.from({ length: p.buildMonths }, (_, i) => (
              <span key={i} className={cx('rounded-sm border', tv ? 'h-3 w-8' : 'h-2 w-5', i < done ? 'border-warn bg-warn' : 'border-holo-line bg-raised')} />
            ))}
          </span>
          <span className="text-ink-2">{p.monthsLeft === 1 ? 'Stands at this month’s end' : `Stands in ${p.monthsLeft} months`}</span>
        </span>
      );
    }
    case 'standing':
      return (
        <span className={cx('text-ink-2', line)}>
          {PERK[p.id]} · upkeep {p.upkeep} cr a month
        </span>
      );
    case 'closed':
      return <span className={cx('font-semibold text-alert', line)}>The fund missed its upkeep ({p.upkeep} cr): no perk, counts 0 until it is paid</span>;
    case 'damaged':
      return <span className={cx('font-semibold text-alert', line)}>Damaged in the riot: counts 0 until the Governor repairs it ({fmt(p.repairCost ?? 0)} cr)</span>;
  }
}

/** The donors on a project, biggest first: their mark and what they gave. */
export function Plaque({ p, players, size, limit }: { p: ColonyProjectView; players: PlayerView[]; size: Size; limit?: number }) {
  const tv = size === 'tv';
  const donors = p.plaque.flatMap((d) => {
    const player = players.find((x) => x.id === d.playerId);
    return player ? [{ player, value: d.value }] : [];
  });
  if (donors.length === 0) return null;
  const shown = limit === undefined ? donors : donors.slice(0, limit);
  return (
    <span className={cx('flex flex-wrap items-center', tv ? 'gap-x-4 gap-y-1' : 'gap-x-2.5 gap-y-0.5')} data-testid={`plaque-${p.id}`}>
      <span className={cx('label-caps', tv ? 'text-xs!' : 'text-[10px]!')}>Plaque</span>
      {shown.map(({ player, value }) => (
        <span key={player.id} className={cx('flex items-center gap-1', tv ? 'text-base' : 'text-[11px]')}>
          <Mark player={player} size={tv ? 18 : 12} />
          <span className="font-semibold">{player.name}</span>
          <span data-num className="font-mono text-ink-2">
            {fmt(value)} cr
          </span>
        </span>
      ))}
      {shown.length < donors.length && <span className={cx('text-ink-3', tv ? 'text-sm' : 'text-[10px]')}>+{donors.length - shown.length} more</span>}
    </span>
  );
}

export function ProjectRow({ p, players, size, plaque = true }: { p: ColonyProjectView; players: PlayerView[]; size: Size; plaque?: boolean }) {
  const tv = size === 'tv';
  const dead = p.stage === 'closed' || p.stage === 'damaged';
  const st = STAGE[p.stage];
  return (
    <li className={cx('flex items-start border-t border-holo-faint first:border-t-0', tv ? 'gap-4 py-3 first:pt-0' : 'gap-2 py-1.5 first:pt-0')} data-testid={`project-${p.id}`} data-stage={p.stage}>
      <span className={cx('grid shrink-0 place-items-center rounded-control border', tv ? 'size-12' : 'size-7', dead ? 'border-alert text-alert' : p.stage === 'standing' ? 'border-ok text-ok' : 'border-holo-line text-holo')}>
        <ObjectGlyph kind={p.id} size={tv ? 30 : 18} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className={cx('font-display font-semibold', tv ? 'text-2xl' : 'text-sm')}>{p.name}</span>
          <span className={cx('rounded-chip border px-1.5 font-mono font-bold uppercase', tv ? 'text-xs' : 'text-[10px]', st.chip)} data-testid={`stage-${p.id}`}>
            {st.label}
          </span>
          <span className={cx('ml-auto font-mono font-bold', tv ? 'text-lg' : 'text-[11px]', dead ? 'text-ink-3 line-through' : 'text-holo')} data-testid={`prestige-${p.id}`}>
            +{p.prestige} prestige
          </span>
        </span>
        <StageLine p={p} size={size} />
        {plaque && <Plaque p={p} players={players} size={size} {...(tv ? {} : { limit: 2 })} />}
      </span>
    </li>
  );
}

/** Every project the Governor has commissioned, at its stage; `action` draws a project's buttons under its row. */
export function BuildSite({ colony, players, size, action, className }: { colony: ColonyView; players: PlayerView[]; size: Size; action?: (p: ColonyProjectView) => ReactNode; className?: string }) {
  const tv = size === 'tv';
  return (
    <section className={cx('flex min-h-0 flex-col rounded-panel border border-holo-line bg-panel', tv ? 'gap-3 p-5' : 'gap-1.5 px-2.5 py-2', className)} aria-label="The colony's projects" data-testid="build-site">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className={cx('label-caps', tv ? 'text-base!' : 'text-[10px]!')}>Colony projects</h2>
        <span className={cx('font-mono text-ink-3', tv ? 'text-sm' : 'text-[10px]')}>
          {standingCount(colony)} standing · {colony.gauges.prestige} prestige
        </span>
      </header>
      {colony.projects.length === 0 ? (
        <p className={cx('text-ink-2', tv ? 'text-lg' : 'text-xs')} data-testid="no-projects">
          Nothing commissioned yet. The Governor picks the colony’s first project in planning; anyone can donate toward it.
        </p>
      ) : (
        <ul className="flex flex-col">
          {colony.projects.map((p) => (
            <div key={p.id} className="flex flex-col">
              <ProjectRow p={p} players={players} size={size} />
              {action?.(p)}
            </div>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The Colony desk's body on a phone: the four gauges, then the build site, with the desk's buttons under each project. */
export function ColonyDeskCard({ view, action, className }: { view: MuleView; action?: (p: ColonyProjectView) => ReactNode; className?: string }) {
  const colony = view.colony;
  if (!colony) return null;
  return (
    <div className={cx('flex min-h-0 flex-col gap-1.5', className)} data-testid="colony-desk-card">
      <ColonyGauges colony={colony} size="phone" className="grid-cols-2!" />
      <BuildSite colony={colony} players={view.players} size="phone" className="min-h-0 flex-1 overflow-hidden" {...(action ? { action } : {})} />
    </div>
  );
}

// --- The colony score ---------------------------------------------------------------------------------

type SumSize = Size | 'hero' | 'band';
const TERM_BIG: Record<SumSize, string> = { hero: 'text-5xl', tv: 'text-3xl', band: 'text-2xl', phone: 'text-base' };

function Term({ label, value, size, testid, sign, tone }: { label: string; value: string; size: SumSize; testid: string; sign?: string; tone?: string }) {
  const big = TERM_BIG[size];
  return (
    <span className="flex items-end gap-2" data-testid={testid}>
      {sign && <span className={cx('pb-1 font-mono text-ink-3', size === 'phone' ? 'text-sm' : 'text-2xl')}>{sign}</span>}
      <span className="flex flex-col items-center">
        <span data-num className={cx('font-mono font-bold leading-none', tone, big)}>
          {value}
        </span>
        <span className={cx('label-caps mt-1', size === 'phone' ? 'text-[10px]!' : 'text-xs!')}>{label}</span>
      </span>
    </span>
  );
}

/** The sum as one line everyone can read across the room: wealth + environment + prestige, × the happiness factor. */
export function ScoreSum({ score, colony, size }: { score: ColonyScore; colony: ColonyView; size: SumSize }) {
  const mood = moodOf(colony.gauges.band);
  if (size === 'phone') {
    // On a phone the sum is one line of numbers with the four names under it, so it never wraps mid-sum.
    const cells: [string, string, string, string | undefined][] = [
      ['', fmt(score.wealth), 'Wealth', undefined],
      ['+', fmt(score.environment), 'Env.', undefined],
      ['+', fmt(score.prestige), 'Prestige', undefined],
      ['×', score.factor.toFixed(2), mood.label, mood.tone],
    ];
    return (
      <span className="flex justify-between gap-x-1" data-testid="score-sum">
        {cells.map(([op, v, name, tone]) => (
          <span key={name} className="flex flex-col items-center">
            <span data-num className={cx('whitespace-nowrap font-mono text-sm font-bold leading-none', tone)}>
              {op && <span className="mr-0.5 text-ink-3">{op}</span>}
              {v}
            </span>
            <span className="mt-0.5 text-[10px] font-semibold uppercase leading-none text-ink-3">{name}</span>
          </span>
        ))}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-end gap-x-4 gap-y-2" data-testid="score-sum">
      <Term size={size} testid="term-wealth" label="Wealth" value={fmt(score.wealth)} />
      <Term size={size} testid="term-environment" label="Environment" value={fmt(score.environment)} sign="+" />
      <Term size={size} testid="term-prestige" label="Prestige" value={fmt(score.prestige)} sign="+" />
      <Term size={size} testid="term-factor" label={mood.label} value={score.factor.toFixed(2)} sign="×" tone={mood.tone} />
    </span>
  );
}

/**
 * The colony's score, big: the total, its verdict and the sum that made it. `failed`: the colony failed (the air's
 * verdict, shown above it), so the score keeps no verdict of its own.
 */
export function ScoreHero({ colony, score, size, failed = false }: { colony: ColonyView; score: ColonyScore; size: 'hero' | 'tv'; failed?: boolean }) {
  const v = scoreVerdict(score);
  const hero = size === 'hero';
  return (
    <div className={cx('flex flex-col', hero ? 'gap-4' : 'gap-2')} data-testid="colony-score">
      <span className={cx('flex gap-x-8 gap-y-4', hero ? 'flex-col' : 'flex-row flex-wrap items-end')}>
        <span className="flex items-baseline gap-4">
          <span data-num className={cx('font-mono font-bold leading-none', failed ? 'text-alert-ink' : 'text-holo', hero ? 'text-8xl' : 'text-6xl')} data-testid="colony-total">
            {fmt(score.total)}
          </span>
          <span className="flex flex-col">
            <span className="label-caps text-sm!">Colony score</span>
            {!failed && (
              <span className={cx('font-display font-semibold', v.tone, hero ? 'text-3xl' : 'text-2xl')} data-testid="colony-verdict">
                {v.title}
              </span>
            )}
          </span>
        </span>
        <ScoreSum score={score} colony={colony} size={size} />
      </span>
      <span className={cx('text-ink-2', hero ? 'text-base' : 'text-sm')}>{scoreWords(colony, score)}</span>
    </div>
  );
}

function ScorePending({ size }: { size: Size }) {
  return (
    <span className={cx('text-ink-2', size === 'tv' ? 'text-2xl' : 'text-[11px] leading-tight')} data-testid="colony-score-pending">
      The colony’s score is counted at game over
    </span>
  );
}

/** Who gave most to the colony, with their plaques: the colony half of each player's standing. */
export function PlaqueBoard({ colony, players, size, selfId }: { colony: ColonyView; players: PlayerView[]; size: Size; selfId?: string }) {
  const tv = size === 'tv';
  return (
    <ol className={cx('flex flex-col', tv ? 'gap-2' : 'gap-1')} data-testid="plaque-board">
      {plaqueBoard(colony, players).map(({ player, plaques, given }, i) => (
        <li key={player.id} className={cx('flex items-center', tv ? 'gap-3' : 'gap-1.5', player.id === selfId && 'rounded-control bg-holo-soft px-1')} data-testid={`plaques-${player.id}`}>
          <span className={cx('font-mono text-ink-3', tv ? 'w-5 text-base' : 'w-3 text-[10px]')}>{i + 1}</span>
          <Mark player={player} size={tv ? 20 : 12} />
          <span className={cx('min-w-0 truncate font-semibold', tv ? 'w-20 text-lg' : 'w-12 text-[11px]')}>{player.name}</span>
          <span className="flex min-w-0 flex-1 items-center gap-1 text-holo">
            {plaques.length === 0 ? (
              <span className={cx('text-ink-3', tv ? 'text-sm' : 'text-[10px]')}>no plaques</span>
            ) : (
              plaques.map((q) => (
                <span key={q.project.id} title={`${q.project.name}: ${fmt(q.value)} cr`} className="flex">
                  <ObjectGlyph kind={q.project.id} size={tv ? 22 : 14} />
                </span>
              ))
            )}
          </span>
          <span data-num className={cx('font-mono font-bold', tv ? 'text-lg' : 'text-[11px]')}>
            {fmt(given)} cr
          </span>
        </li>
      ))}
    </ol>
  );
}

// --- The month end ------------------------------------------------------------------------------------

/** "↑ +2,069 since month 6": score.total − lastScore. Month 1 has no last month end, so no line. */
function SinceLast({ score, last, month, size }: { score: ColonyScore; last: number | null; month: number; size: Size }) {
  if (last === null) return null;
  const tv = size === 'tv';
  return (
    <span className={cx('flex items-baseline whitespace-nowrap', tv ? 'gap-2' : 'gap-1')} data-testid="colony-score-change">
      <ChangeTag change={score.total - last} className={tv ? 'text-2xl' : 'text-xs'} testid="colony-score-delta" />
      <span className={cx('text-ink-3', tv ? 'text-lg' : 'text-[11px]')}>since month {month - 1}</span>
    </span>
  );
}

/** Collapse cuts every Worth, never the colony's score (RULE-25): said once, so a high score beside cut Worths reads right. */
function NotCut({ size }: { size: Size }) {
  return (
    <span className={cx('text-ink-2', size === 'tv' ? 'text-base' : 'text-[11px] leading-tight')} data-testid="colony-score-uncut">
      The Collapse cuts each Worth, not the colony’s score.
    </span>
  );
}

const monthScoreOf = (view: MuleView) => (view.colony?.score ? { colony: view.colony, score: view.colony.score, last: view.colony.lastScore ?? null } : null);

/** The colony score under the league at a month end: the total, the change, the sum and its words. No verdict: that is game over's. */
function MonthScoreBand({ view, colony, score, last }: { view: MuleView; colony: ColonyView; score: ColonyScore; last: number | null }) {
  return (
    <section className="relative flex shrink-0 flex-col gap-2 rounded-panel border border-holo-line bg-panel p-5" aria-label="The colony’s score" data-testid="colony-band" data-month={view.month}>
      <header className="flex items-baseline justify-between gap-4">
        <h2 className="label-caps text-sm!">Colony score · month {view.month}</h2>
        <span className="text-lg text-ink-3">counted again at game over</span>
      </header>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2" data-testid="colony-score">
        <span className="flex flex-col gap-1">
          <span data-num className="font-mono text-6xl font-bold leading-none text-holo" data-testid="colony-total">
            {fmt(score.total)}
          </span>
          <SinceLast score={score} last={last} month={view.month} size="tv" />
        </span>
        <ScoreSum score={score} colony={colony} size="band" />
      </div>
      <span className="text-base leading-snug text-ink-2" data-testid="colony-score-words">
        {scoreWords(colony, score)}
      </span>
      {inCollapse(view) && <NotCut size="tv" />}
    </section>
  );
}

/** The TV month end's left column: the league (`children`) with the colony score under it, once the view carries one. */
export function MonthScoreColumn({ view, children }: { view: MuleView; children: ReactNode }) {
  const at = monthScoreOf(view);
  if (!at) return children;
  return (
    <div className="flex min-h-0 flex-col gap-4">
      {children}
      <MonthScoreBand view={view} {...at} />
    </div>
  );
}

/** The phone's one line: "Colony score", the total and the change; `sum` adds the sum from 800 px of shell. */
function PhoneMonthScore({ view, colony, score, last, sum = false, children }: { view: MuleView; colony: ColonyView; score: ColonyScore; last: number | null; sum?: boolean; children?: ReactNode }) {
  const mood = moodOf(colony.gauges.band);
  return (
    <div className="flex min-w-0 flex-col gap-0.5" data-testid="phone-month-score">
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <span className="label-caps text-[10px]!">Colony score</span>
        <span data-num className="font-mono text-base font-bold leading-none text-holo" data-testid="colony-total">
          {fmt(score.total)}
        </span>
        <SinceLast score={score} last={last} month={view.month} size="phone" />
        {sum && (
          <span data-num className="hidden whitespace-nowrap font-mono text-[11px] text-ink-2 @min-[800px]/shell:inline" data-testid="score-sum">
            = {fmt(score.wealth)} + {fmt(score.environment)} + {fmt(score.prestige)} × <span className={mood.tone}>{score.factor.toFixed(2)}</span>
          </span>
        )}
      </span>
      {inCollapse(view) && <NotCut size="phone" />}
      {children}
    </div>
  );
}

/** Beside a TV, the month end's footnote place: the colony line once the view carries a score, else `children` (today's footnote). */
export function PhoneMonthScoreNote({ view, children }: { view: MuleView; children: ReactNode }) {
  const at = monthScoreOf(view);
  if (!at) return children;
  return (
    <div className="mt-auto" data-testid="colony-on-tv">
      <PhoneMonthScore view={view} {...at}>
        <span className="text-[11px] leading-snug text-ink-3">Its sum is on the TV; your own lines are beside, yours only.</span>
      </PhoneMonthScore>
    </div>
  );
}

/** With no TV, the colony line heading the colony panel, the sum on it where the phone is wide enough. */
export function PhoneMonthScoreHead({ view }: { view: MuleView }) {
  const at = monthScoreOf(view);
  if (!at) return null;
  return (
    <div className="mb-1 rounded-panel border border-holo-line bg-panel px-2.5 py-1">
      <PhoneMonthScore view={view} {...at} sum />
    </div>
  );
}

// --- Game over ----------------------------------------------------------------------------------------

/** The winner, shorter and horizontal, so the colony's band fits under it on the TV. */
export function TvWinner({ view, className }: { view: MuleView; className?: string }) {
  const lg = league(view);
  const top = lg.rows[0];
  if (!top) return null;
  return (
    <div className={cx('relative flex items-center gap-5 rounded-panel border-2 border-holo bg-holo-soft px-6 py-4 shadow-glow', className)} data-testid="tv-winner">
      <PlayerMark slot={top.slot} species={top.player.species} size={88} label={top.player.name} />
      <span className="flex flex-col gap-1">
        <span className="label-caps text-base!">The game goes to</span>
        <span className="font-display text-3xl font-semibold leading-tight" data-testid="winner-line">
          {winnerWords(view, lg)}
        </span>
      </span>
    </div>
  );
}

/** The TV's band at game over: how the colony did, beside who gave most. A failed colony is carried in alert, never just a low number. */
export function ColonyScoreBand({ view, colony }: { view: MuleView; colony: ColonyView }) {
  const failed = colonyVerdict(view.air);
  return (
    <section
      className={cx('grid shrink-0 grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-6 rounded-panel border p-5', failed.failed ? 'border-alert bg-alert-bg' : 'border-holo-line bg-panel')}
      aria-label="How the colony did"
      data-testid="colony-band"
      data-failed={failed.failed}
    >
      <div className="flex flex-col gap-2">
        <h2 className="label-caps text-base!">How the colony did</h2>
        {failed.failed && (
          <span className="flex flex-wrap items-baseline gap-x-4">
            <span className="font-display text-2xl font-semibold text-alert-ink" data-testid="verdict-title">
              {failed.title}
            </span>
            <span className="text-lg text-ink" data-testid="verdict-line">
              {failed.line}
            </span>
          </span>
        )}
        {colony.score ? <ScoreHero colony={colony} score={colony.score} size="tv" failed={failed.failed} /> : <ScorePending size="tv" />}
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="label-caps text-base!">Plaques · who gave most</h2>
        <PlaqueBoard colony={colony} players={view.players} size="tv" />
      </div>
    </section>
  );
}

/** The colony's score on a phone beside the TV, in the air verdict's place: so it carries a failed colony in alert. */
export function PhoneColonyScore({ view, colony, selfId, className }: { view: MuleView; colony: ColonyView; selfId: string; className?: string }) {
  const score = colony.score;
  const failed = colonyVerdict(view.air);
  const mine = plaquesOf(colony, selfId);
  return (
    <section className={cx('flex flex-col rounded-panel border', failed.failed ? 'border-alert bg-alert-bg' : 'border-holo-line bg-panel', className)} data-testid="phone-colony-score" data-failed={failed.failed}>
      {failed.failed && (
        <span className="flex flex-col" data-testid="verdict">
          <span className="font-display text-sm font-semibold leading-tight text-alert-ink" data-testid="verdict-title">
            {failed.title}
          </span>
          <span className="text-[11px] leading-tight text-ink" data-testid="verdict-line">
            {failed.line}
          </span>
        </span>
      )}
      {score ? (
        <>
          <span className="flex items-baseline gap-2">
            <span data-num className={cx('font-mono text-2xl font-bold leading-none', failed.failed ? 'text-alert-ink' : 'text-holo')} data-testid="colony-total">
              {fmt(score.total)}
            </span>
            <span className="flex flex-col">
              <span className="label-caps text-[10px]!">Colony score</span>
              {!failed.failed && <span className={cx('font-display text-sm font-semibold leading-tight', scoreVerdict(score).tone)}>{scoreVerdict(score).title}</span>}
            </span>
          </span>
          <ScoreSum score={score} colony={colony} size="phone" />
        </>
      ) : (
        <ScorePending size="phone" />
      )}
      <span className="text-[11px] leading-tight text-ink-2" data-testid="your-plaques">
        {mine.length === 0 ? 'You are on no plaque.' : `Your plaques: ${mine.map((q) => q.project.name).join(', ')} · ${fmt(mine.reduce((a, b) => a + b.value, 0))} cr given`}
      </span>
    </section>
  );
}
