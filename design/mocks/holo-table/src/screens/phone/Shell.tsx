import { PhaseBar, PlayerMark } from '@mule/ui';
import type { ReactNode } from 'react';
import { ME, MONTH, seat } from '../../data';

/** Every phone screen: the phase on top, the content in the middle, the main action at the bottom within thumb reach. */
export function PhoneShell({ phase, seconds, footer, children }: { phase: string; seconds?: number; footer?: ReactNode; children: ReactNode }) {
  const me = seat(ME);
  return (
    <div className="flex h-full flex-col bg-table text-ink">
      <div className="flex flex-col gap-3 border-b border-holo-faint px-4 pb-3 pt-4">
        <PhaseBar month={MONTH} phase={phase} {...(seconds !== undefined ? { seconds } : {})} />
        <div className="flex items-center gap-2">
          <PlayerMark slot={ME} size={14} label="You" />
          <span className="text-sm font-semibold">{me.name}</span>
          <span data-num className="ml-auto font-mono text-sm font-bold text-ink">{me.money.toLocaleString('en')} cr</span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
      {footer && <div className="border-t border-holo-faint bg-void/60 px-4 pb-6 pt-3">{footer}</div>}
    </div>
  );
}
