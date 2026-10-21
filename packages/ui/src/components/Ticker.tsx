import { GoodTag } from './GoodTag';
import { cx, type Good } from './tokens';

export interface TickerItem {
  good: Good;
  price: number;
  /** Change since last month, in percent. */
  change: number;
}

/** The colony market as a row of trading-screen cells. */
export function Ticker({ items, size = 'md', className }: { items: TickerItem[]; size?: 'md' | 'lg'; className?: string }) {
  return (
    <div
      className={cx('grid gap-px overflow-hidden rounded-panel border border-holo-line bg-holo-line', className)}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((it) => (
        <div key={it.good} className={cx('flex flex-col gap-1 bg-panel', size === 'lg' ? 'p-4' : 'p-2.5')}>
          <GoodTag good={it.good} />
          <span data-num className={cx('font-mono font-bold', size === 'lg' ? 'text-3xl' : 'text-lg')}>{it.price}</span>
          <span data-num className={cx('font-mono text-xs', it.change > 0 ? 'text-rise' : it.change < 0 ? 'text-fall' : 'text-ink-3')}>
            {it.change > 0 ? '▲' : it.change < 0 ? '▼' : '•'} {Math.abs(it.change)}%
          </span>
        </div>
      ))}
    </div>
  );
}
