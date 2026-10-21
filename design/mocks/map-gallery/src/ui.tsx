import type { ReactNode } from 'react';
import { cx } from '@mule/ui';

export const pct = (n: number) => `${Math.round(n * 100)}%`;

/** One decimal, dropped when whole. */
export const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function Section({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-panel border border-holo-line bg-panel p-4', className)}>
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="label-caps">{title}</h2>
        {aside && <div className="font-mono text-xs text-ink-2">{aside}</div>}
      </header>
      {children}
    </section>
  );
}

/** A small segmented control. */
export function Choice<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange(v: T): void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-1 rounded-control border border-holo-line bg-raised p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-[8px] px-2.5 py-1 text-sm',
            o.value === value ? 'bg-holo text-on-holo font-semibold' : 'text-ink-2 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
