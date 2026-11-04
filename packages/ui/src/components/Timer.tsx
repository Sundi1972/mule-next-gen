import { cx } from './tokens';

/** Time left in a phase. At 10 seconds or less it turns alert red and pulses. */
export function Timer({ seconds, className }: { seconds: number; className?: string }) {
  const s = Math.max(0, Math.ceil(seconds));
  const urgent = s <= 10;
  return (
    <span
      role="timer"
      aria-label={`${s} seconds left`}
      data-num
      className={cx(
        'inline-flex h-8 items-center rounded-chip border px-2.5 font-mono text-sm font-bold',
        urgent ? 'animate-pulse-glow border-alert text-alert' : 'border-holo-line text-holo',
        className,
      )}
    >
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </span>
  );
}
