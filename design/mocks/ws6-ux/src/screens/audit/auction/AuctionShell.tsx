import { cx, PlayerMark, SPECIES_NAME, Timer } from '@mule/ui';
import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { TableChat } from '../../../../../../../apps/web/src/chat/Chat';
import { ThemeToggle } from '../../../../../../../apps/web/src/components/ThemeToggle';
import { fmt } from '../../../../../../../apps/web/src/game/derive';
import { usePhoneGame } from '../../../../../../../apps/web/src/phone/game';
import { MoveToPhoneOpener, ShellLayer, WIDE_PX } from '../../../../../../../apps/web/src/phone/Shell';
import { FallbackBubble, SeatRow, Ticker, useChat } from '../../../proposed/Chat';
import { useTickerRule } from '../../../proposed/TickerRule';

/**
 * A fork of the product's PhoneShell (apps/web/src/phone/Shell.tsx, WS4's file) for the goods auction audit, so the
 * mock can show one header change without editing it. Diff this against PhoneShell: everything new is marked
 * `AUDIT:`. It is optional, so a screen that passes none draws exactly today's shell.
 *
 * - `tally`: under the money, the month's running total from the auction (G-5).
 * - `money`: mock only, the money after this mock's own trades (the real shell reads it from the view).
 */

const Wide = createContext(false);
export const useWide = () => useContext(Wide);

function useWideRef<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [wide, setWide] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWide(el.getBoundingClientRect().width >= WIDE_PX);
    const ro = new ResizeObserver(([e]) => flushSync(() => setWide((e?.contentRect.width ?? 0) >= WIDE_PX)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, wide] as const;
}

export function AuctionShell({
  phase,
  seconds,
  tally,
  money,
  rail,
  footer,
  fill = false,
  children,
}: {
  phase: string;
  seconds?: number | undefined;
  /** AUDIT (G-5): under the money, the month's running total. */
  tally?: ReactNode;
  /** Mock only: the money after this mock's own trades. */
  money?: number;
  rail?: ReactNode;
  footer?: ReactNode;
  fill?: boolean;
  children: ReactNode;
}) {
  const { view, self, slot } = usePhoneGame();
  const [root, wide] = useWideRef<HTMLDivElement>();
  const layer = useContext(ShellLayer);
  const move = useContext(MoveToPhoneOpener);
  const chat = useChat();
  // The rail-chat proposal (TickerRule.tsx): on a phone the table chat follows the rail's content, not above it.
  const rule = useTickerRule();
  const chatUnder = !!chat && rule === 'under' && !wide;
  return (
    <Wide.Provider value={wide}>
      <div ref={root} className="h-full @container/shell">
        <div className="relative flex h-full bg-table @min-[1100px]/shell:[--rail:400px] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] text-ink" data-testid="game-shell" data-wide={wide}>
          <main
            className={cx(
              'min-w-0 flex-1 p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] @min-[1100px]/shell:p-6 @min-[1100px]/shell:pb-[max(1.5rem,env(safe-area-inset-bottom))]',
              fill ? 'flex min-h-0 flex-col' : 'overflow-y-auto',
            )}
            data-testid="stage"
          >
            {children}
          </main>
          <aside className="flex w-(--rail) shrink-0 flex-col border-l border-holo-faint bg-void/40" data-testid="guide">
            <header className="flex flex-col gap-1 border-b border-holo-faint px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] @min-[1100px]/shell:gap-2 @min-[1100px]/shell:px-5 @min-[1100px]/shell:pb-4 @min-[1100px]/shell:pt-[max(1rem,env(safe-area-inset-top))]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <span className="label-caps text-[10px]! @min-[1100px]/shell:text-xs!">
                    Month {view.month} / {view.maxMonths}
                  </span>
                  <span className="truncate font-display text-lg font-semibold leading-tight @min-[1100px]/shell:text-2xl" data-testid="phase">
                    {phase}
                  </span>
                </div>
                {seconds !== undefined && <Timer seconds={seconds} className="@min-[1100px]/shell:h-11 @min-[1100px]/shell:px-4 @min-[1100px]/shell:text-2xl" />}
              </div>
              <div className="flex items-center gap-2">
                <PlayerMark slot={slot} species={self.species} size={12} label={`You, ${SPECIES_NAME[self.species]}`} />
                <span className="min-w-0 truncate text-sm font-semibold @min-[1100px]/shell:text-base">{self.name}</span>
                <ThemeToggle className="ml-1 shrink-0" />
                {move && (
                  <button
                    ref={move.button}
                    type="button"
                    onClick={move.open}
                    className="flex h-7 shrink-0 items-center gap-1 rounded-chip border border-holo-line px-1.5 text-xs text-holo hover:border-holo @min-[1100px]/shell:h-8 @min-[1100px]/shell:px-2.5 @min-[1100px]/shell:text-sm"
                    aria-label="Move to my phone"
                    data-testid="move-to-phone"
                  >
                    <svg aria-hidden viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                      <rect x={7} y={2.5} width={10} height={19} rx={2} />
                      <path d="M11 18.5h2" />
                    </svg>
                    <span className="hidden @min-[1100px]/shell:inline">To my phone</span>
                  </button>
                )}
                {/* AUDIT (G-5): the money and, under it, the month's running total. */}
                <span className="relative ml-auto flex shrink-0 flex-col items-end">
                  <span data-num className="font-mono text-sm font-bold leading-tight text-ink @min-[1100px]/shell:text-lg" data-testid="money">
                    {fmt(money ?? self.money)} cr
                  </span>
                  {tally}
                </span>
              </div>
              {/* Mock only: with the review page's live table (a ChatProvider), the proposed seat row and ticker, as the hub's
                  rail draws them; without one, the product's TableChat, which the stand-in client keeps empty. */}
              {chatUnder ? (
                <div className="relative h-0">
                  <FallbackBubble />
                </div>
              ) : chat ? (
                <div className="relative flex flex-col gap-1 border-t border-holo-faint pt-1.5 @min-[1100px]/shell:gap-2 @min-[1100px]/shell:pt-2.5" data-testid="table-chat">
                  <SeatRow />
                  <Ticker />
                </div>
              ) : (
                <TableChat />
              )}
            </header>
            <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-2.5 *:shrink-0 @min-[1100px]/shell:gap-4 @min-[1100px]/shell:px-5 @min-[1100px]/shell:py-4" data-testid="rail">
              {rail}
              {chatUnder && (
                <div className="flex flex-col gap-1 border-t border-holo-faint pt-1.5" data-testid="table-chat">
                  <SeatRow bubble={false} />
                  <Ticker />
                </div>
              )}
            </div>
            {footer && (
              <div
                className="flex flex-col gap-2 border-t border-holo-faint bg-void/60 px-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2.5 @min-[1100px]/shell:gap-3 @min-[1100px]/shell:px-5 @min-[1100px]/shell:pb-[max(1rem,env(safe-area-inset-bottom))] @min-[1100px]/shell:pt-4"
                data-testid="actions"
              >
                {footer}
              </div>
            )}
          </aside>
          {layer}
        </div>
      </div>
    </Wide.Provider>
  );
}
