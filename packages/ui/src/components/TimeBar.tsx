import { cx } from './tokens';

/** How much of a stage's time is left, from 1 (all) to 0. */
export function timeFraction(seconds: number, total: number): number {
  return total > 0 ? Math.min(1, Math.max(0, seconds / total)) : 0;
}

/**
 * The auction's clock as a bar draining across the top of the board. Green
 * while more than half the time is left, amber above a quarter, red below
 * it, where it shakes and says "Hurry". While units change hands the clock
 * runs slower, and the bar shows moving stripes and says so.
 */
export function TimeBar({
  seconds,
  total,
  slowed = false,
  size = 'phone',
  className,
}: {
  seconds: number;
  total: number;
  slowed?: boolean;
  size?: 'phone' | 'tv';
  className?: string;
}) {
  const f = timeFraction(seconds, total);
  const hurry = f <= 0.25 && !slowed && seconds > 0;
  const tone = f > 0.5 ? 'bg-fall' : f > 0.25 ? 'bg-warn' : 'bg-rise';
  const text = f > 0.5 ? 'text-fall' : f > 0.25 ? 'text-warn' : 'text-rise';
  const tv = size === 'tv';
  const s = Math.max(0, Math.ceil(seconds));
  const label = slowed ? 'Trading · clock slowed' : hurry ? 'Hurry' : null;
  return (
    <div className={cx('flex shrink-0 items-center gap-2', className)} data-testid="time-bar" data-tone={f > 0.5 ? 'green' : f > 0.25 ? 'amber' : 'red'} data-slowed={slowed || undefined}>
      <div
        role="timer"
        aria-label={`${s} seconds left${slowed ? ', clock slowed by a trade' : ''}`}
        className={cx(
          'relative flex-1 overflow-hidden border border-holo-line bg-holo-faint',
          tv ? 'h-5 rounded-[10px]' : 'h-3.5 rounded-[7px]',
          hurry && 'motion-safe:animate-hurry',
        )}
      >
        <i
          className={cx(
            'absolute inset-y-0 left-0 transition-[width,background-color] duration-500 ease-linear',
            tv ? 'rounded-[10px]' : 'rounded-[7px]',
            tone,
            slowed && 'motion-safe:animate-stripes',
          )}
          style={{
            width: `${f * 100}%`,
            backgroundSize: '17px 17px',
            ...(slowed ? { backgroundImage: 'repeating-linear-gradient(-45deg, rgb(255 255 255 / 0.38) 0 6px, transparent 6px 12px)' } : {}),
          }}
        />
      </div>
      {label && <span className={cx('shrink-0 font-display font-semibold uppercase tracking-wide', tv ? 'text-lg' : 'text-[10px]', slowed ? 'text-warn' : text)}>{label}</span>}
      <span data-num className={cx('shrink-0 text-right font-mono font-bold', tv ? 'w-14 text-2xl' : 'w-7 text-xs', text)}>
        {s}s
      </span>
    </div>
  );
}
