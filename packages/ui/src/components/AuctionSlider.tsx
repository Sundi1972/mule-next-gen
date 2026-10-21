import { cx } from './tokens';

/**
 * The phone's auction control: a tall slider you drag up and down, like the
 * original's walk toward the middle. The store's buy and sell prices are
 * marked on the track, so you can see whether you'd trade with a player or
 * with the store.
 */
export function AuctionSlider({ value, min, max, storeBuys, storeSells, side, onChange, className }: {
  value: number;
  min: number;
  max: number;
  /** Null when the store isn't buying. */
  storeBuys: number | null;
  /** Null when the store is sold out. */
  storeSells: number | null;
  side: 'buy' | 'sell';
  onChange(value: number): void;
  className?: string;
}) {
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  // Only the store prices it quotes, and only where they fit on the track.
  const marks = (list: { v: number | null; label: string; tone: string }[]) =>
    list.filter((m): m is { v: number; label: string; tone: string } => m.v !== null && m.v >= min && m.v <= max);
  return (
    <div className={cx('relative flex h-full min-h-64 w-full select-none', className)}>
      <div className="relative mx-auto h-full w-24 overflow-hidden rounded-panel border border-holo-line bg-void">
        <div className="absolute inset-x-0 bottom-0 bg-holo-soft transition-[height]" style={{ height: `${pct(value)}%` }} />
        {marks([
          { v: storeSells, label: 'Store sells', tone: 'text-rise border-rise' },
          { v: storeBuys, label: 'Store buys', tone: 'text-fall border-fall' },
        ]).map((m) => (
          <div key={m.label} className={cx('absolute inset-x-0 border-t border-dashed', m.tone)} style={{ bottom: `${pct(m.v)}%` }} />
        ))}
        <div
          className="absolute inset-x-1 flex h-12 -translate-y-1/2 items-center justify-center rounded-control bg-holo font-mono text-xl font-bold text-on-holo shadow-glow"
          style={{ top: `${100 - pct(value)}%` }}
        >
          <span data-num>{value}</span>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[calc(50%-56px)]">
        {marks([
          { v: storeSells, label: `Store sells ${storeSells}`, tone: 'text-rise' },
          { v: storeBuys, label: `Store buys ${storeBuys}`, tone: 'text-fall' },
        ]).map((m) => (
          <span key={m.label} data-num className={cx('absolute right-2 translate-y-1/2 whitespace-nowrap font-mono text-xs font-bold', m.tone)} style={{ bottom: `${pct(m.v)}%` }}>
            {m.label}
          </span>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex w-[calc(50%-56px)] flex-col justify-between py-2 pl-2 font-mono text-xs text-ink-3">
        <span>{side === 'sell' ? 'Ask more' : 'Pay more'}</span>
        <span>{side === 'sell' ? 'Sell faster' : 'Pay less'}</span>
      </div>
      <input
        type="range"
        aria-label={side === 'sell' ? 'Your asking price' : 'Your bid'}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="absolute inset-y-0 left-1/2 w-24 -translate-x-1/2 cursor-ns-resize opacity-0"
        style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
      />
    </div>
  );
}
