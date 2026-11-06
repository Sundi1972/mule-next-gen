import { POLLUTION } from '@mule/engine';
import { cx } from './tokens';

/** The air bands' names, as config names them. */
export type AirBandName = (typeof POLLUTION.bands)[number]['name'];

/** Each band's look. Where a band starts is config's (POLLUTION.bands), never restated here. */
const LOOK: Record<AirBandName, { label: string; tone: string; bar: string }> = {
  clean: { label: 'Clean', tone: 'text-ok', bar: 'bg-ok' },
  smoggy: { label: 'Smoggy', tone: 'text-warn', bar: 'bg-warn' },
  toxic: { label: 'Toxic', tone: 'text-alert', bar: 'bg-alert' },
  collapse: { label: 'Collapse', tone: 'text-alert', bar: 'bg-alert' },
};

const BANDS = POLLUTION.bands.map((b) => ({ name: b.name, from: b.from, ...LOOK[b.name] }));

/** A level as a share of the gauge, in percent: the air runs from 0 to POLLUTION.airMax. */
const share = (level: number) => (Math.min(POLLUTION.airMax, Math.max(0, level)) / POLLUTION.airMax) * 100;

/** The look of an air band, by name or from the gauge level. */
export function airBandStyle(level: number, band?: AirBandName) {
  return (band ? BANDS.find((b) => b.name === band) : undefined) ?? [...BANDS].reverse().find((b) => level >= b.from)!;
}

/** The colony's pollution gauge: one number everyone shares, with its band. */
export function AirGauge({ level, band, tv = false, className }: { level: number; band?: AirBandName; tv?: boolean; className?: string }) {
  const style = airBandStyle(level, band);
  return (
    <div className={cx('flex flex-col rounded-control border border-holo-line bg-panel', tv ? 'w-64 gap-1.5 px-4 py-2' : 'gap-1 px-3 py-2', className)}>
      <span className="flex items-baseline justify-between">
        <span className="label-caps">Colony air</span>
        <span className={cx('font-mono font-bold', style.tone, tv ? 'text-base' : 'text-xs')}>
          {level} · {style.label.toUpperCase()}
        </span>
      </span>
      <span className="relative h-2 overflow-hidden rounded-full bg-raised">
        {BANDS.slice(1).map((b) => (
          <span key={b.name} className="absolute inset-y-0 w-px bg-ink-3/40" style={{ left: `${share(b.from)}%` }} />
        ))}
        <span className={cx('absolute inset-y-0 left-0 rounded-full', style.bar)} style={{ width: `${share(level)}%` }} />
      </span>
    </div>
  );
}
