import { moodBand } from '@mule/engine';
import type { ColonyView } from '@mule/protocol';
import { airBandStyle, cx } from '@mule/ui';
import type { ReactNode } from 'react';
import { LANDING, type GaugeChange, type GaugeId, type GaugeLanding, type Size } from '../../../../apps/web/src/components/Colony';
import { fmt } from '../../../../apps/web/src/game/derive';
import { MOOD, standingCount, type MoodBand } from '../../../../apps/web/src/game/colony';
import { HEALTH_FLOOR, type HealthView } from './fixture';

/**
 * COPY: apps/web/src/components/Colony.tsx at trunk 0ece94ba: `Gauge` (:41-62), `BAND_AT`, `countAt` and `landed`
 * (:85-111), `ColonyGauges` (:174-196) and `HappinessGauge` (:198-219), verbatim. `Gauge` is not exported, so the mock
 * cannot extend it any other way. Every change to the copy is marked EXTEND; everything new is below the copy, marked
 * NEW. Graft target: Colony.tsx itself (WS8's file).
 */

// --- The health words (NEW) ---------------------------------------------------------------------------

export interface HealthBand {
  label: string;
  tone: string;
  bar: string;
}

// PROPOSAL (WS5 to rule): display bands
// 90 and up: Well. 61 to 89: Sick spell. 60, the floor: At the limit. The tones are the mood's and the air's own.
export function healthBand(well: number): HealthBand {
  if (well >= 90) return { label: 'Well', tone: 'text-ok', bar: 'bg-ok' };
  if (well > HEALTH_FLOOR) return { label: 'Sick spell', tone: 'text-warn', bar: 'bg-warn' };
  return { label: 'At the limit', tone: 'text-alert', bar: 'bg-alert' };
}

export const atLimit = (h: HealthView) => h.well <= HEALTH_FLOOR;

/** "4 in 10 sick": the sick share in tens, as WS5's rule says it. */
export const sickInTen = (h: HealthView) => `${Math.round(h.sick / 10)} in 10 sick`;

/** The month's move in the Happiness note's own words: "↓ 19 this month", "↑ 6 this month", "± 0". */
export const moveWords = (move: number) => (move === 0 ? '± 0' : `${move > 0 ? '↑' : '↓'} ${Math.abs(move)} this month`);

/** The Health gauge's note: at the limit, how many are sick; otherwise the month's move; nothing in month 1. */
export function healthNote(h: HealthView): string | null {
  if (atLimit(h)) return sickInTen(h);
  return h.lastWell === null ? null : moveWords(h.well - h.lastWell);
}

// --- The floor tick (NEW) -----------------------------------------------------------------------------

/**
 * The 1 px tick at 60 % on the Health bar: health never goes below it. A transparent hit area is its sibling, so a
 * reviewer can select the tick; both sit outside the bar's overflow-hidden, so the hit area is not clipped.
 * DS-GAP: a threshold mark on a bar. The design system has no gauge or meter with a marker; this is a new mark.
 */
function FloorTick({ at }: { at: number }) {
  return (
    <>
      <span className="absolute -inset-y-1.5 w-3 -translate-x-1/2" style={{ left: `${at}%` }} title={`The floor: health never goes below ${at}`} aria-label={`floor at ${at}`} data-testid="health-floor" />
      <span className="pointer-events-none absolute -inset-y-0.5 w-px -translate-x-1/2 bg-ink" style={{ left: `${at}%` }} />
    </>
  );
}

// --- COPY: the four gauges ----------------------------------------------------------------------------

/** EXTEND: testids on the value, band and note (`ids`), and a floor tick on the bar (`floor`). Both optional, so the
 * four existing gauges render as the original does. */
interface GaugeIds {
  value: string;
  band: string;
  note: string;
}

function Gauge({ label, value, band, tone, bar, fill, note, size, testid, pulse = false, change, ids, floor }: { label: string; value: string; band?: string; tone?: string; bar?: string; fill?: number; note?: ReactNode; size: Size; testid: string; pulse?: boolean; change?: GaugeChange | undefined; ids?: GaugeIds; floor?: number }) {
  const tv = size === 'tv';
  // EXTEND: the bar, as the original draws it, kept in a variable so the floor can wrap it.
  const track = (
    <span className={cx('relative overflow-hidden rounded-full', tv ? 'h-2' : 'h-1.5', fill === undefined ? 'bg-transparent' : 'bg-raised')}>
      {fill !== undefined && <span className={cx('absolute inset-y-0 left-0 rounded-full', bar)} style={{ width: `${Math.max(0, Math.min(100, fill))}%` }} />}
    </span>
  );
  return (
    // DS-GAP (WS8): the band flip's pulse, cev-pulse in packages/ui's events.css, until the design system has one.
    <div className={cx('flex min-w-0 flex-col rounded-control border border-holo-line bg-panel', tv ? 'gap-1 px-3 py-1.5' : 'gap-0.5 px-2 py-1', pulse && 'animate-[cev-pulse_0.8s_ease-out]')} data-testid={testid} data-from={change?.from} data-to={change?.to}>
      <span className="flex items-baseline justify-between gap-2">
        <span className={cx('label-caps', !tv && 'text-[10px]!')}>{label}</span>
        <span data-num className={cx('whitespace-nowrap font-mono font-bold', tv ? 'text-lg' : 'text-xs')} data-testid={ids?.value}>
          {value}
        </span>
      </span>
      {/* EXTEND: with a floor, the bar sits in a wrapper that also holds the tick. */}
      {floor === undefined ? (
        track
      ) : (
        <span className="relative flex flex-col">
          {track}
          <FloorTick at={floor} />
        </span>
      )}
      <span className={cx('flex items-baseline justify-between gap-2 whitespace-nowrap', tv ? 'text-xs' : 'text-[10px]')}>
        {band && (
          <span className={cx('font-display font-semibold uppercase', tone)} data-testid={ids?.band}>
            {band}
          </span>
        )}
        {note && (
          <span className="truncate text-ink-3" data-testid={ids?.note}>
            {note}
          </span>
        )}
      </span>
    </div>
  );
}

/** The banded gauges' band at a value, from the engine's thresholds (mood) and the air's. */
const BAND_AT: Partial<Record<GaugeId, (v: number) => string>> = { happiness: moodBand, environment: (v) => airBandStyle(v).label };

/** A change's value at `t`: `from` until it lands, then counting to `to`; reduced, it jumps to `to` as it lands. */
function countAt(c: GaugeChange, t: number, reduced: boolean): number {
  if (t < c.landsAt) return c.from;
  if (reduced) return c.to;
  const k = Math.min(1, (t - c.landsAt) / LANDING.count);
  return Math.round(c.from + (c.to - c.from) * k);
}

/** A gauge's number at `t` under a landing, and whether it pulses: its band just flipped, or a chip just landed on it. */
function landed(id: GaugeId, value: number, landing: GaugeLanding | undefined): { value: number; pulse: boolean; change?: GaugeChange } {
  const c = landing?.changes.find((x) => x.gauge === id);
  if (!landing || !c) return { value, pulse: false };
  const now = countAt(c, landing.t, landing.reduced);
  const band = BAND_AT[id];
  const flipped = band !== undefined && !landing.reduced && band(now) !== band(countAt(c, landing.t - LANDING.pulse, false));
  const flips = band !== undefined && band(c.from) !== band(c.to);
  const struck = c.chip === true && !flips && !landing.reduced && landing.t >= c.landsAt && landing.t < c.landsAt + LANDING.pulse;
  return { value: now, pulse: flipped || struck, change: c };
}

const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '±0');

/** Where Health sits: `today` draws trunk's four gauges, A a fifth cell, B a pair with Happiness. */
export type HealthVariant = 'today' | 'A' | 'B';

/**
 * Wealth, Environment, Prestige and Happiness. Environment is the air, so it keeps the air's bands. A `landing` holds
 * each changed gauge at its old number until its change lands, then counts it, the band flipping with a pulse.
 * EXTEND: `health` and `variant`. A adds Health as a fifth cell after Happiness (5 columns); B pairs it with Happiness
 * in one two-row cell (4 columns, as today). Without health, or `today`, it is the original.
 */
export function ColonyGauges({ colony, size, className, landing, health = null, variant = 'today' }: { colony: ColonyView; size: Size; className?: string; landing?: GaugeLanding | undefined; health?: HealthView | null; variant?: HealthVariant }) {
  const g = colony.gauges;
  const last = colony.lastGauges;
  const wealth = landed('wealth', g.wealth, landing);
  const environment = landed('environment', g.environment, landing);
  const prestige = landed('prestige', g.prestige, landing);
  const air = airBandStyle(environment.value);
  const tv = size === 'tv';
  const moodMove = last?.happiness == null || g.happiness === null ? null : g.happiness - last.happiness;
  // EXTEND: which layout, and the grid's columns for it.
  const shown: HealthVariant = health === null ? 'today' : variant;
  return (
    <div className={cx('grid', shown === 'A' ? 'grid-cols-5' : 'grid-cols-4', tv ? 'gap-2' : 'gap-1.5', className)} data-testid="colony-gauges" data-health={shown}>
      <Gauge size={size} testid="gauge-wealth" label="Wealth" value={`${fmt(wealth.value)} cr`} note={`fund ${fmt(colony.fund)} cr`} change={wealth.change} />
      <Gauge size={size} testid="gauge-environment" label="Environment" value={`${environment.value}`} band={air.label} tone={air.tone} bar={air.bar} fill={environment.value} pulse={environment.pulse} change={environment.change} />
      <Gauge size={size} testid="gauge-prestige" label="Prestige" pulse={prestige.pulse} change={prestige.change} value={`${prestige.value}`} note={`${standingCount(colony)} standing${last && g.prestige !== last.prestige ? ` · ${signed(g.prestige - last.prestige)}` : ''}`} />
      {/* EXTEND: B replaces the Happiness cell with the pair. */}
      {shown === 'B' && health !== null ? (
        <MoodHealthGauge size={size} happiness={g.happiness} band={g.band} moodMove={tv ? moodMove : null} health={health} landing={landing} />
      ) : g.happiness === null || g.band === null ? (
        <Gauge size={size} testid="gauge-happiness" label="Happiness" value="—" note="not yet" />
      ) : (
        <HappinessGauge size={size} happiness={g.happiness} band={g.band} moodMove={tv ? moodMove : null} landing={landing} />
      )}
      {/* EXTEND: A's fifth cell. */}
      {shown === 'A' && health !== null && <HealthGauge size={size} health={health} />}
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

// --- Variant A: Health, a fifth cell (NEW) ------------------------------------------------------------

/** Health as its own gauge: the well share, its band word under the bar, the month's move (or "4 in 10 sick"). */
function HealthGauge({ size, health }: { size: Size; health: HealthView }) {
  const b = healthBand(health.well);
  const note = healthNote(health);
  return (
    <Gauge
      size={size}
      testid="gauge-health"
      label="Health"
      value={`${health.well}%`}
      band={b.label}
      tone={b.tone}
      bar={b.bar}
      fill={health.well}
      floor={HEALTH_FLOOR}
      ids={{ value: 'health-value', band: 'health-band', note: 'health-note' }}
      {...(note === null ? {} : { note })}
    />
  );
}

// --- Variant B: Happiness and Health, one cell (NEW) --------------------------------------------------

/**
 * One row of the pair: the label and value on the first line, as every gauge has them; under them the thin bar with the
 * band word after it. (Measured: the band word beside the label is cut short at 760 px, "REST…", "SICK S…", so it
 * shares the bar's line instead.)
 */
function PairRow({ label, value, band, fill, size, testid, ids, floor }: { label: string; value: string; band: HealthBand | null; fill: number | null; size: Size; testid: string; ids: Omit<GaugeIds, 'note'>; floor?: number }) {
  const tv = size === 'tv';
  return (
    <span className={cx('flex flex-col', tv ? 'gap-0.5' : 'gap-px')} data-testid={testid}>
      <span className="flex items-baseline justify-between gap-2">
        <span className={cx('label-caps', !tv && 'text-[10px]!')}>{label}</span>
        <span data-num className={cx('whitespace-nowrap font-mono font-bold leading-tight', tv ? 'text-lg' : 'text-xs')} data-testid={ids.value}>
          {value}
        </span>
      </span>
      <span className="flex items-center gap-2">
        {/* DS-GAP: a thin bar (h-1), half the gauge's h-2, so two rows fit in one cell. */}
        <span className="relative flex min-w-0 flex-1 flex-col">
          <span className={cx('relative h-1 overflow-hidden rounded-full', fill === null ? 'bg-transparent' : 'bg-raised')}>
            {fill !== null && band && <span className={cx('absolute inset-y-0 left-0 rounded-full', band.bar)} style={{ width: `${Math.max(0, Math.min(100, fill))}%` }} />}
          </span>
          {floor !== undefined && <FloorTick at={floor} />}
        </span>
        {band && (
          <span className={cx('shrink-0 whitespace-nowrap font-display font-semibold uppercase leading-tight', tv ? 'text-xs' : 'text-[10px]', band.tone)} data-testid={ids.band}>
            {band.label}
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * The pair's one note: the larger of the two moves this month, named, or none. Health's own "4 in 10 sick" gives way
 * here; the row's band word "At the limit" carries the limit. A tie goes to health, the newer gauge.
 */
export function pairNote(moodMove: number | null, health: HealthView): { of: 'health' | 'mood'; words: string } | null {
  const healthMove = health.lastWell === null ? null : health.well - health.lastWell;
  const best = [
    ['health', healthMove],
    ['mood', moodMove],
  ].filter((x): x is ['health' | 'mood', number] => x[1] !== null && x[1] !== 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
  return best ? { of: best[0], words: `${best[0]} ${moveWords(best[1])}` } : null;
}

/** B: the Happiness cell as two rows, Happiness and Health, each with its value, band word and thin bar. */
function MoodHealthGauge({ size, happiness, band, moodMove, health, landing }: { size: Size; happiness: number | null; band: MoodBand | null; moodMove: number | null; health: HealthView; landing: GaugeLanding | undefined }) {
  const tv = size === 'tv';
  const moodNow = happiness === null ? null : landed('happiness', happiness, landing);
  const mood = moodNow === null || band === null ? null : MOOD[moodNow.value === happiness ? band : moodBand(moodNow.value)];
  const note = pairNote(moodMove, health);
  return (
    <div className={cx('flex min-w-0 flex-col rounded-control border border-holo-line bg-panel', tv ? 'gap-1 px-3 py-1.5' : 'gap-0.5 px-2 py-1', moodNow?.pulse && 'animate-[cev-pulse_0.8s_ease-out]')} data-testid="gauge-happiness" data-from={moodNow?.change?.from} data-to={moodNow?.change?.to}>
      <PairRow size={size} testid="gauge-mood" label="Happiness" value={moodNow === null ? '—' : `${moodNow.value}`} band={mood} fill={moodNow?.value ?? null} ids={{ value: 'happiness-value', band: 'happiness-band' }} />
      <PairRow size={size} testid="gauge-health" label="Health" value={`${health.well}%`} band={healthBand(health.well)} fill={health.well} floor={HEALTH_FLOOR} ids={{ value: 'health-value', band: 'health-band' }} />
      {note && (
        <span className={cx('truncate text-right text-ink-3', tv ? 'text-xs' : 'text-[10px]')} data-testid="health-note" data-of={note.of}>
          {note.words}
        </span>
      )}
    </div>
  );
}
