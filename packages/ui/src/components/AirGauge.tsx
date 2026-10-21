import { cx } from './tokens';

export type AirBandName = 'clean' | 'smoggy' | 'toxic' | 'collapse';

const BANDS: { from: number; name: AirBandName; label: string; tone: string; bar: string }[] = [
  { from: 0, name: 'clean', label: 'Clean', tone: 'text-ok', bar: 'bg-ok' },
  { from: 30, name: 'smoggy', label: 'Smoggy', tone: 'text-warn', bar: 'bg-warn' },
  { from: 60, name: 'toxic', label: 'Toxic', tone: 'text-alert', bar: 'bg-alert' },
  { from: 80, name: 'collapse', label: 'Collapse', tone: 'text-alert', bar: 'bg-alert' },
];

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
        {[30, 60, 80].map((m) => (
          <span key={m} className="absolute inset-y-0 w-px bg-ink-3/40" style={{ left: `${m}%` }} />
        ))}
        <span className={cx('absolute inset-y-0 left-0 rounded-full', style.bar)} style={{ width: `${Math.min(100, level)}%` }} />
      </span>
    </div>
  );
}
