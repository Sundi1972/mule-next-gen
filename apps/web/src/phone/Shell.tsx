import { PhaseBar, PlayerMark } from '@mule/ui';
import type { ReactNode } from 'react';
import { ThemeToggle } from '../components/ThemeToggle';
import { fmt } from '../game/derive';
import { usePhoneGame } from './game';

/** Every phone screen: the phase on top, the content in the middle, the main action at the bottom within thumb reach. */
export function PhoneShell({ phase, seconds, footer, children }: { phase: string; seconds?: number | undefined; footer?: ReactNode; children: ReactNode }) {
  const { view, self, slot } = usePhoneGame();
  return (
    <div className="flex h-full flex-col bg-table text-ink">
      <div className="flex flex-col gap-3 border-b border-holo-faint px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <PhaseBar month={view.month} maxMonths={view.maxMonths} phase={phase} {...(seconds !== undefined ? { seconds } : {})} />
        <div className="flex items-center gap-2">
          <PlayerMark slot={slot} size={14} label="You" />
          <span className="truncate text-sm font-semibold">{self.name}</span>
          <ThemeToggle className="ml-2" />
          <span data-num className="ml-auto font-mono text-sm font-bold text-ink" data-testid="money">
            {fmt(self.money)} cr
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
      {footer && <div className="border-t border-holo-faint bg-void/60 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">{footer}</div>}
    </div>
  );
}
