import { cx, PlayerMark, SPECIES_NAME, Timer } from '@mule/ui';
import type { ReactNode } from 'react';
import { ThemeToggle } from '../components/ThemeToggle';
import { fmt } from '../game/derive';
import { usePhoneGame } from './game';

/**
 * Every phone screen, held sideways: the content fills the left, a narrow rail on
 * the right holds the phase, the clock, your money, the screen's controls and,
 * at the bottom within thumb reach, the main action.
 */
export function PhoneShell({
  phase,
  seconds,
  rail,
  footer,
  fill = false,
  children,
}: {
  phase: string;
  seconds?: number | undefined;
  /** Controls and details for the side rail; scrolls if it runs long. */
  rail?: ReactNode;
  /** The main action, pinned to the bottom of the rail. */
  footer?: ReactNode;
  /** The content fills the main area without scrolling, as the map does. */
  fill?: boolean;
  children: ReactNode;
}) {
  const { view, self, slot } = usePhoneGame();
  return (
    <div className="flex h-full bg-table pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] text-ink">
      <main className={cx('min-w-0 flex-1 p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]', fill ? 'flex min-h-0 flex-col' : 'overflow-y-auto')}>{children}</main>
      <aside className="flex w-(--rail) shrink-0 flex-col border-l border-holo-faint bg-void/40">
        <header className="flex flex-col gap-1 border-b border-holo-faint px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-col">
              <span className="label-caps text-[10px]!">
                Month {view.month} / {view.maxMonths}
              </span>
              <span className="truncate font-display text-lg font-semibold leading-tight">{phase}</span>
            </div>
            {seconds !== undefined && <Timer seconds={seconds} />}
          </div>
          <div className="flex items-center gap-2">
            <PlayerMark slot={slot} species={self.species} size={12} label={`You, ${SPECIES_NAME[self.species]}`} />
            <span className="min-w-0 truncate text-sm font-semibold">{self.name}</span>
            <ThemeToggle className="ml-1 shrink-0" />
            <span data-num className="ml-auto shrink-0 font-mono text-sm font-bold text-ink" data-testid="money">
              {fmt(self.money)} cr
            </span>
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-2.5 *:shrink-0">{rail}</div>
        {footer && <div className="flex flex-col gap-2 border-t border-holo-faint bg-void/60 px-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2.5">{footer}</div>}
      </aside>
    </div>
  );
}

/** The colony map, as large as the main area allows without changing its shape. */
export function MapFit({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center [container-type:size]">
      <div style={{ width: `min(100cqw, calc(100cqh * ${width} / ${height}))` }}>{children}</div>
    </div>
  );
}

/** Turned upright, the phone asks to be held sideways. The game stays mounted underneath. */
export function TurnSideways() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 bg-table px-8 text-center text-ink" data-testid="turn-sideways">
      <svg aria-hidden width="96" height="96" viewBox="0 0 96 96" className="text-holo">
        <rect x="34" y="14" width="28" height="50" rx="5" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.35" />
        <rect x="22" y="40" width="56" height="30" rx="5" fill="none" stroke="currentColor" strokeWidth="3" />
        <path d="M70 26 a22 22 0 0 1 8 14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path d="M80 34 l-2 7 -7 -3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-semibold">Turn your phone sideways</h1>
        <p className="text-ink-2">M.U.L.E. is played with the phone held across, so the colony map has room.</p>
      </div>
    </div>
  );
}
