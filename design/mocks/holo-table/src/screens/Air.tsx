import { cx } from '@mule/ui';
import { COLONY_AIR } from '../data';

const BANDS = [
  { from: 0, name: 'Clean', tone: 'text-ok', bar: 'bg-ok' },
  { from: 30, name: 'Smoggy', tone: 'text-warn', bar: 'bg-warn' },
  { from: 60, name: 'Toxic', tone: 'text-alert', bar: 'bg-alert' },
  { from: 80, name: 'Collapse', tone: 'text-alert', bar: 'bg-alert' },
];

export function airBand(level = COLONY_AIR) {
  return [...BANDS].reverse().find((b) => level >= b.from)!;
}

/** The colony's pollution gauge: one number everyone shares, with its band. */
export function AirGauge({ level = COLONY_AIR, tv = false }: { level?: number; tv?: boolean }) {
  const band = airBand(level);
  return (
    <div className={cx('flex flex-col rounded-control border border-holo-line bg-panel', tv ? 'w-64 gap-1.5 px-4 py-2' : 'gap-1 px-3 py-2')}>
      <span className="flex items-baseline justify-between">
        <span className="label-caps">Colony air</span>
        <span className={cx('font-mono font-bold', band.tone, tv ? 'text-base' : 'text-xs')}>
          {level} · {band.name.toUpperCase()}
        </span>
      </span>
      <span className="relative h-2 overflow-hidden rounded-full bg-raised">
        {[30, 60, 80].map((m) => (
          <span key={m} className="absolute inset-y-0 w-px bg-ink-3/40" style={{ left: `${m}%` }} />
        ))}
        <span className={cx('absolute inset-y-0 left-0 rounded-full', band.bar)} style={{ width: `${level}%` }} />
      </span>
    </div>
  );
}
