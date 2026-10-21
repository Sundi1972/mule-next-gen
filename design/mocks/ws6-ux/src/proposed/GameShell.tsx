import { cx, PlayerMark, SPECIES_NAME, Timer } from '@mule/ui';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ThemeToggle } from '../../../../../apps/web/src/components/ThemeToggle';
import { fmt } from '../../../../../apps/web/src/game/derive';
import { usePhoneGame } from '../../../../../apps/web/src/phone/game';

/**
 * The responsive redesign of PhoneShell (GRAFT TARGET apps/web/src/phone/Shell.tsx).
 *
 * One frame for every player screen, from a phone held sideways to a laptop:
 * the STAGE on the left is the thing you act on (map, store, creature); the
 * GUIDE rail on the right always opens with "Now": the one next step and why.
 * The main action sits at the bottom of the rail.
 *
 * It sizes from its own width (a container query), not the window's, so it
 * behaves the same in the mock frames and in the app. Under 1100 px it is
 * today's phone layout; from 1100 px the rail widens, the type grows, and the
 * stage may hold two things at once instead of stretching one.
 */

/** From this width of the shell the layout is "wide" (laptop and up). One number, shared by CSS and code. */
export const WIDE_PX = 1100;
const Wide = createContext(false);
/** True when the shell is wide: for components that size in code (the hall's type, how many stages show). */
export const useWide = () => useContext(Wide);

export interface Now {
  /** Step n of m, when the turn is a sequence. */
  step?: number;
  of?: number;
  title: string;
  detail?: ReactNode;
  /** Something the player must notice: shown amber. */
  warn?: boolean;
}

export function NowCard({ now }: { now: Now }) {
  return (
    <section
      className={cx('flex flex-col gap-1 rounded-panel border-2 p-2.5 @min-[1100px]/shell:gap-1.5 @min-[1100px]/shell:p-4', now.warn ? 'border-warn bg-warn/10' : 'border-holo bg-holo-soft')}
      data-testid="now"
      aria-live="polite"
    >
      <span className="flex items-center gap-2">
        <span className="label-caps text-[10px]! @min-[1100px]/shell:text-xs!">Now</span>
        {now.step !== undefined && now.of !== undefined && (
          <span className="flex items-center gap-1" aria-label={`Step ${now.step} of ${now.of}`} data-testid="now-steps">
            {Array.from({ length: now.of }, (_, i) => (
              <span key={i} className={cx('h-1.5 rounded-full @min-[1100px]/shell:h-2', i + 1 === now.step ? 'w-4 bg-holo @min-[1100px]/shell:w-6' : i + 1 < (now.step ?? 0) ? 'w-1.5 bg-ok @min-[1100px]/shell:w-2' : 'w-1.5 bg-holo-line @min-[1100px]/shell:w-2')} />
            ))}
          </span>
        )}
      </span>
      <h2 className="font-display text-base font-semibold leading-tight @min-[1100px]/shell:text-2xl" data-testid="now-title">
        {now.title}
      </h2>
      {now.detail && <p className="text-xs leading-snug text-ink-2 @min-[1100px]/shell:text-base">{now.detail}</p>}
    </section>
  );
}

export function GameShell({
  phase,
  seconds,
  now,
  rail,
  footer,
  children,
}: {
  phase: string;
  seconds?: number | undefined;
  now: Now;
  rail?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { view, self, slot } = usePhoneGame();
  const root = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWide((e?.contentRect.width ?? 0) >= WIDE_PX));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <Wide.Provider value={wide}>
    <div ref={root} className="h-full @container/shell">
      <div className="flex h-full bg-table text-ink" data-testid="game-shell">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col p-2.5 @min-[1100px]/shell:p-6" data-testid="stage">
          {children}
        </main>
        <aside className="flex w-(--rail) shrink-0 flex-col border-l border-holo-faint bg-void/40 @min-[1100px]/shell:w-[400px]" data-testid="guide">
          <header className="flex flex-col gap-1 border-b border-holo-faint px-3 pb-2 pt-2 @min-[1100px]/shell:gap-2 @min-[1100px]/shell:px-5 @min-[1100px]/shell:py-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-col">
                <span className="label-caps text-[10px]! @min-[1100px]/shell:text-xs!">
                  Month {view.month} / {view.maxMonths}
                </span>
                <span className="truncate font-display text-lg font-semibold leading-tight @min-[1100px]/shell:text-2xl">{phase}</span>
              </div>
              {seconds !== undefined && <Timer seconds={seconds} className="@min-[1100px]/shell:h-11 @min-[1100px]/shell:px-4 @min-[1100px]/shell:text-2xl" />}
            </div>
            <div className="flex items-center gap-2">
              <PlayerMark slot={slot} species={self.species} size={12} label={`You, ${SPECIES_NAME[self.species]}`} />
              <span className="min-w-0 truncate text-sm font-semibold @min-[1100px]/shell:text-base">{self.name}</span>
              <ThemeToggle className="ml-1 shrink-0" />
              <span data-num className="ml-auto shrink-0 font-mono text-sm font-bold text-ink @min-[1100px]/shell:text-lg" data-testid="money">
                {fmt(self.money)} cr
              </span>
            </div>
          </header>
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-2.5 *:shrink-0 @min-[1100px]/shell:gap-4 @min-[1100px]/shell:px-5 @min-[1100px]/shell:py-4">
            <NowCard now={now} />
            {rail}
          </div>
          {footer && (
            <div className="flex flex-col gap-2 border-t border-holo-faint bg-void/60 px-3 pb-2.5 pt-2.5 @min-[1100px]/shell:gap-3 @min-[1100px]/shell:px-5 @min-[1100px]/shell:py-4" data-testid="actions">
              {footer}
            </div>
          )}
        </aside>
      </div>
    </div>
    </Wide.Provider>
  );
}
