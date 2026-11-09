import { cx, PlayerMark, Timer, type Slot } from '@mule/ui';
import type { ReactNode } from 'react';
import { ThemeToggle } from '../../App';

/**
 * The phone held sideways, as the real app draws it (apps/web/src/phone/Shell.tsx):
 * content on the left, a narrow rail on the right with the phase, clock, money,
 * controls and, at the bottom within thumb reach, the main action.
 */
export function LandShell({
  month,
  maxMonths = 12,
  phase,
  seconds,
  me,
  money,
  rail,
  footer,
  fill = false,
  children,
}: {
  month: number;
  maxMonths?: number;
  phase: string;
  seconds?: number;
  me: { slot: Slot; name: string };
  money: number;
  rail?: ReactNode;
  footer?: ReactNode;
  fill?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full bg-table text-ink">
      <main className={cx('min-w-0 flex-1 p-2.5', fill ? 'flex min-h-0 flex-col' : 'overflow-y-auto')}>{children}</main>
      <aside className="flex w-(--rail) shrink-0 flex-col border-l border-holo-faint bg-void/40">
        <header className="flex flex-col gap-1 border-b border-holo-faint px-3 pb-2 pt-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-col">
              <span className="label-caps text-[10px]!">
                Month {month} / {maxMonths}
              </span>
              <span className="truncate font-display text-lg font-semibold leading-tight">{phase}</span>
            </div>
            {seconds !== undefined && <Timer seconds={seconds} />}
          </div>
          <div className="flex items-center gap-2">
            <PlayerMark slot={me.slot} size={12} label="You" />
            <span className="min-w-0 truncate text-sm font-semibold">{me.name}</span>
            <ThemeToggle />
            <span data-num className="ml-auto shrink-0 font-mono text-sm font-bold text-ink">
              {money.toLocaleString('en')} cr
            </span>
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-2.5 *:shrink-0">{rail}</div>
        {footer && <div className="flex flex-col gap-2 border-t border-holo-faint bg-void/60 px-3 pb-2.5 pt-2.5">{footer}</div>}
      </aside>
    </div>
  );
}
