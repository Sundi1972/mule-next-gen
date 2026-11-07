import { cx, PlayerMark, setTheme, SPECIES_NAME, Timer, useTheme, type Theme } from '@mule/ui';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { TableChat } from '../../../../../../apps/web/src/chat/Chat';
import { fmt } from '../../../../../../apps/web/src/game/derive';
import { usePhoneGame } from '../../../../../../apps/web/src/phone/game';

/**
 * A faithful copy of the product's PhoneShell as it stands on feat/strategist (ddb14a0c, C19 a1e9d8f9), for the land
 * grant's measurement. Not a proposal: nothing here changes. It is copied, not imported, because this worktree's
 * apps/web is behind feat/strategist and still has the shell before C19 (no `short:` packing, the toggle as the word
 * "Night" instead of the 32 px icon), which would put the wrong header over the rail.
 *
 * Two differences, both mock plumbing:
 * - `frame-short:` stands for the product's `short:` variant. The product's is `@media (max-height: 380px)` inside
 *   the shell container under 1100 px; a frame on a desktop page has the window's height, not the phone's, so the
 *   frame sets `data-short` when its own height is 380 px or less (grant.css).
 * - the rail window (the scrolling strip between the header and the footer) carries `data-testid="rail-window"`, so
 *   the measurement can find it. The product's has no testid.
 *
 * The product's MoveToPhoneOpener always exists in a running game (PhoneApp's InGame), so the move-to-phone button
 * always draws here; it does nothing in the mock.
 */

export const WIDE_PX = 1100;
const Wide = createContext(false);
export const useWide = () => useContext(Wide);

/** The product's ThemeToggle with `iconUntilWide` (feat/strategist): a 32 px moon under 1100 px, the word from there. */
function ThemeToggle({ className }: { className?: string }) {
  const theme = useTheme();
  const next: Theme = theme === 'light' ? 'dark' : 'light';
  const name = theme === 'light' ? 'Night' : 'Day';
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={name}
      className={cx(
        'rounded-chip border border-holo-line font-mono text-xs text-ink-2 hover:border-holo hover:text-holo',
        'grid size-8 place-items-center @min-[1100px]/shell:block @min-[1100px]/shell:size-auto @min-[1100px]/shell:px-2 @min-[1100px]/shell:py-0.5',
        className,
      )}
      data-testid="theme-toggle"
    >
      <svg aria-hidden viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="@min-[1100px]/shell:hidden">
        {theme === 'light' ? (
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
        ) : (
          <>
            <circle cx={12} cy={12} r={4} />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        )}
      </svg>
      <span className="hidden @min-[1100px]/shell:inline">{name}</span>
    </button>
  );
}

export function GrantShell({ phase, seconds, rail, footer, children }: { phase: string; seconds: number; rail: ReactNode; footer: ReactNode; children: ReactNode }) {
  const { view, self, slot } = usePhoneGame();
  const root = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    setWide(el.getBoundingClientRect().width >= WIDE_PX);
    const ro = new ResizeObserver(([e]) => setWide((e?.contentRect.width ?? 0) >= WIDE_PX));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <Wide.Provider value={wide}>
      <div ref={root} className="h-full @container/shell">
        <div className="relative flex h-full bg-table @min-[1100px]/shell:[--rail:400px] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] text-ink" data-testid="game-shell" data-wide={wide}>
          <main className="flex min-h-0 min-w-0 flex-1 flex-col p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] @min-[1100px]/shell:p-6 @min-[1100px]/shell:pb-[max(1.5rem,env(safe-area-inset-bottom))]" data-testid="stage">
            {children}
          </main>
          <aside className="flex w-(--rail) shrink-0 flex-col border-l border-holo-faint bg-void/40" data-testid="guide">
            <header
              className="flex flex-col gap-1 border-b border-holo-faint px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] frame-short:gap-0.5 frame-short:pb-1 frame-short:pt-[max(0.25rem,env(safe-area-inset-top))] @min-[1100px]/shell:gap-2 @min-[1100px]/shell:px-5 @min-[1100px]/shell:pb-4 @min-[1100px]/shell:pt-[max(1rem,env(safe-area-inset-top))]"
              data-testid="rail-header"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <span className="label-caps text-[10px]! @min-[1100px]/shell:text-xs!">
                    Month {view.month} / {view.maxMonths}
                  </span>
                  <span className="truncate font-display text-lg font-semibold leading-tight @min-[1100px]/shell:text-2xl">{phase}</span>
                </div>
                <Timer seconds={seconds} className="@min-[1100px]/shell:h-11 @min-[1100px]/shell:px-4 @min-[1100px]/shell:text-2xl" />
              </div>
              <div className="flex items-center gap-1.5 @min-[1100px]/shell:gap-2">
                <PlayerMark slot={slot} species={self.species} size={12} label={`You, ${SPECIES_NAME[self.species]}`} />
                <span className="min-w-0 truncate text-sm font-semibold @min-[1100px]/shell:text-base" data-testid="self-name">
                  {self.name}
                </span>
                <ThemeToggle className="shrink-0 @min-[1100px]/shell:ml-1" />
                <button
                  type="button"
                  className="flex size-8 shrink-0 items-center justify-center gap-1 rounded-chip border border-holo-line text-xs text-holo hover:border-holo @min-[1100px]/shell:w-auto @min-[1100px]/shell:px-2.5 @min-[1100px]/shell:text-sm"
                  aria-label="Move to my phone"
                  data-testid="move-to-phone"
                >
                  <svg aria-hidden viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                    <rect x={7} y={2.5} width={10} height={19} rx={2} />
                    <path d="M11 18.5h2" />
                  </svg>
                  <span className="hidden @min-[1100px]/shell:inline">To my phone</span>
                </button>
                <span data-num className="ml-auto shrink-0 font-mono text-sm font-bold text-ink @min-[1100px]/shell:text-lg" data-testid="money">
                  {fmt(self.money)} cr
                </span>
              </div>
              <TableChat />
            </header>
            <div
              className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-2.5 *:shrink-0 frame-short:gap-2 @min-[1100px]/shell:gap-4 @min-[1100px]/shell:px-5 @min-[1100px]/shell:py-4"
              data-testid="rail-window"
            >
              {rail}
            </div>
            <div
              className="flex flex-col gap-2 border-t border-holo-faint bg-void/60 px-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2.5 frame-short:gap-1.5 frame-short:pb-[max(0.375rem,env(safe-area-inset-bottom))] frame-short:pt-1.5 @min-[1100px]/shell:gap-3 @min-[1100px]/shell:px-5 @min-[1100px]/shell:pb-[max(1rem,env(safe-area-inset-bottom))] @min-[1100px]/shell:pt-4"
              data-testid="actions"
            >
              {footer}
            </div>
          </aside>
        </div>
      </div>
    </Wide.Provider>
  );
}
