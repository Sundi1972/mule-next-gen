import { cx } from './tokens';

/** A number on the hologram. Rise and fall colour the change, never the number itself. */
export function Stat({ label, value, change, size = 'md', className }: { label: string; value: string | number; change?: number; size?: 'md' | 'lg'; className?: string }) {
  return (
    <div className={cx('flex flex-col gap-0.5', className)}>
      <span className="label-caps">{label}</span>
      <span data-num className={cx('font-mono font-bold text-ink', size === 'lg' ? 'text-3xl' : 'text-xl')}>{value}</span>
      {change !== undefined && (
        <span data-num className={cx('font-mono text-xs font-medium', change > 0 ? 'text-rise' : change < 0 ? 'text-fall' : 'text-ink-3')}>
          {change > 0 ? '+' : change < 0 ? '−' : '±'}
          {Math.abs(change)}%
        </span>
      )}
    </div>
  );
}
