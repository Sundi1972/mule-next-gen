import { Timer } from '@mule/ui';
import type { ReactNode } from 'react';
import { MONTH } from '../../data';
import { AirGauge } from '../Air';

/** The top of every big screen: month, phase and time left, sized to read from across the room. */
export function TvHeader({ phase, seconds, right }: { phase: string; seconds?: number; right?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-6">
      <div className="flex flex-col gap-1">
        <span className="label-caps text-base!">Month {MONTH} / 12</span>
        <h1 className="font-display text-5xl font-semibold leading-none">{phase}</h1>
      </div>
      <div className="flex items-center gap-4">
        {right}
        <AirGauge tv />
        {seconds !== undefined && <Timer seconds={seconds} className="h-14 px-5 text-3xl" />}
      </div>
    </header>
  );
}
