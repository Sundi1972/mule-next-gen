import type { ReactNode } from 'react';
import { Timer } from './Timer';
import { cx } from './tokens';

/** The top of every screen: which month, which phase, how long is left. */
export function PhaseBar({ month, maxMonths = 12, phase, seconds, right, className }: { month: number; maxMonths?: number; phase: string; seconds?: number; right?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-center justify-between gap-3', className)}>
      <div className="flex min-w-0 flex-col">
        <span className="label-caps">
          Month {month} / {maxMonths}
        </span>
        <span className="truncate font-display text-xl font-semibold">{phase}</span>
      </div>
      <div className="flex items-center gap-2">
        {right}
        {seconds !== undefined && <Timer seconds={seconds} />}
      </div>
    </div>
  );
}
