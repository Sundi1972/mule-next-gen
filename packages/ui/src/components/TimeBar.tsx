import { cx } from './tokens';

/** How much of a stage's time is left, from 1 (all) to 0. */
export function timeFraction(seconds: number, total: number): number {
  return total > 0 ? Math.min(1, Math.max(0, seconds / total)) : 0;
}

/** The bar's sizes: the auction's on a phone and the TV, and the big development clock in a rail and on the TV. */
const SIZE = {
  phone: { track: 'h-3.5 rounded-[7px]', fill: 'rounded-[7px]', number: 'w-7 text-xs', label: 'text-[10px]' },
  tv: { track: 'h-5 rounded-[10px]', fill: 'rounded-[10px]', number: 'w-14 text-2xl', label: 'text-lg' },
  'phone-clock': { track: 'h-3.5 rounded-[7px]', fill: 'rounded-[7px]', number: 'w-12 text-lg @min-[1100px]/shell:w-16 @min-[1100px]/shell:text-2xl', label: 'text-[10px]' },
  'tv-clock': { track: 'h-6 rounded-[12px]', fill: 'rounded-[12px]', number: 'w-28 text-5xl', label: 'text-lg' },
};

/**
 * The auction's clock as a bar draining across the top of the board. Green
 * while more than half the time is left, amber above a quarter, red below
 * it, where it shakes and says "Hurry". While units change hands the clock
 * runs slower, and the bar shows moving stripes and says so.
 *
 * With `urgentSeconds` it is a plain clock instead: one colour until the last
 * `urgentSeconds`, then alert red, pulsing.
 */
export function TimeBar({
  seconds,
  total,
  slowed = false,
  size = 'phone',
  urgentSeconds,
  className,
}: {
  seconds: number;
  total: number;
  slowed?: boolean;
  size?: keyof typeof SIZE;
  urgentSeconds?: number | undefined;
  className?: string;
}) {
  const f = timeFraction(seconds, total);
  const s = Math.max(0, Math.ceil(seconds));
  const z = SIZE[size];
  const clock = urgentSeconds !== undefined;
  const urgent = clock && s <= urgentSeconds;
  const hurry = !clock && f <= 0.25 && !slowed && seconds > 0;
  const tone = clock ? (urgent ? 'bg-alert' : 'bg-holo') : f > 0.5 ? 'bg-fall' : f > 0.25 ? 'bg-warn' : 'bg-rise';
  const text = clock ? (urgent ? 'text-alert' : 'text-holo') : f > 0.5 ? 'text-fall' : f > 0.25 ? 'text-warn' : 'text-rise';
  const label = slowed ? 'Trading · clock slowed' : hurry ? 'Hurry' : null;
  return (
    <div
      className={cx('flex shrink-0 items-center gap-2', className)}
      data-testid="time-bar"
      data-tone={clock ? (urgent ? 'red' : 'calm') : f > 0.5 ? 'green' : f > 0.25 ? 'amber' : 'red'}
      data-slowed={slowed || undefined}
    >
      <div
        role="timer"
        aria-label={`${s} seconds left${slowed ? ', clock slowed by a trade' : ''}`}
        className={cx('relative flex-1 overflow-hidden border border-holo-line bg-holo-faint', z.track, hurry && 'motion-safe:animate-hurry')}
      >
        <i
          className={cx(
            'absolute inset-y-0 left-0 transition-[width,background-color] duration-500 ease-linear',
            z.fill,
            tone,
            slowed && 'motion-safe:animate-stripes',
            urgent && 'motion-safe:animate-pulse',
          )}
          style={{
            width: `${f * 100}%`,
            backgroundSize: '17px 17px',
            ...(slowed ? { backgroundImage: 'repeating-linear-gradient(-45deg, rgb(255 255 255 / 0.38) 0 6px, transparent 6px 12px)' } : {}),
          }}
        />
      </div>
      {label && <span className={cx('shrink-0 font-display font-semibold uppercase tracking-wide', z.label, slowed ? 'text-warn' : text)}>{label}</span>}
      <span data-num className={cx('shrink-0 text-right font-mono font-bold', z.number, text, urgent && 'motion-safe:animate-pulse')}>
        {s}s
      </span>
    </div>
  );
}
