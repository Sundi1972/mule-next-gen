import type { ReactNode } from 'react';
import { cx } from './tokens';

/** A surface on the command table. Alert panels are for danger: sabotage, raids, shortages. */
export function Panel({ title, aside, tone = 'default', className, children }: { title?: ReactNode; aside?: ReactNode; tone?: 'default' | 'alert'; className?: string; children: ReactNode }) {
  return (
    <section
      className={cx(
        'flex flex-col gap-3 rounded-panel border p-4',
        tone === 'alert' ? 'border-alert bg-alert-bg' : 'border-holo-line bg-panel',
        className,
      )}
    >
      {(title || aside) && (
        <header className="flex items-center justify-between gap-3">
          {title && <h2 className={cx('label-caps', tone === 'alert' && 'text-alert-ink!')}>{title}</h2>}
          {aside && <div className="font-mono text-xs text-holo">{aside}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
