import { Button, cx, PlayerMark, SPECIES_NAME, Timer } from '@mule/ui';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ThemeToggle } from '../../../../../apps/web/src/components/ThemeToggle';
import { fmt } from '../../../../../apps/web/src/game/derive';
import { usePhoneGame } from '../../../../../apps/web/src/phone/game';
import { SeatRow, Ticker, useChat } from './Chat';
import { HandoffCode, useHandoffCode, type CodeState } from './HandoffCode';

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

/**
 * The Now card that folds once read (UX audit H-7, #audit-hub): folded it is one line, its title, and a tap opens it.
 * A new step opens it again (the title changing re-mounts it), so nothing new is missed.
 */
function FoldingNowCard({ now, mark }: { now: Now; mark?: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (open)
    return (
      <div className="relative">
        <NowCard now={now} />
        <button type="button" onClick={() => setOpen(false)} aria-expanded aria-label="Fold the Now card" className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-chip text-holo hover:bg-holo-soft" data-testid="now-fold">
          <svg aria-hidden viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 15l6-6 6 6" />
          </svg>
        </button>
        {mark}
      </div>
    );
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        className={cx('flex w-full items-center gap-2 rounded-panel border-2 px-2.5 py-1.5 text-left @min-[1100px]/shell:px-4 @min-[1100px]/shell:py-2.5', now.warn ? 'border-warn bg-warn/10' : 'border-holo bg-holo-soft')}
        data-testid="now"
      >
        <span className="label-caps shrink-0 text-[10px]! @min-[1100px]/shell:text-xs!">Now</span>
        <span className="min-w-0 flex-1 font-display text-sm font-semibold leading-tight @min-[1100px]/shell:text-lg" data-testid="now-title">
          {now.title}
        </span>
        <svg aria-hidden viewBox="0 0 24 24" width={14} height={14} className="shrink-0 text-holo" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
        <span className="sr-only">Tap to read it again</span>
      </button>
      {mark}
    </div>
  );
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
  status,
  now,
  rail,
  footer,
  handoff: handoffOpen = false,
  anchored = [],
  standing,
  foldNow = false,
  nowMark,
  children,
}: {
  phase: string;
  seconds?: number | undefined;
  /** Shown where the clock goes when the phase has none (planning's ready count, AM-16). */
  status?: ReactNode;
  now: Now;
  rail?: ReactNode;
  footer?: ReactNode;
  /** Mock only: open with the hand-off dialog showing (#game-handoff), its code in that state. */
  handoff?: boolean | CodeState;
  /** Seats this screen draws as creatures (they wrap them in Speaker): their bubbles pop there, not in the seat row. */
  anchored?: string[];
  /**
   * Under the money: where you stand against the others, and the money and rank together open the standings (UX
   * audit H-4, #audit-hub). Off unless given.
   */
  standing?: { label: string; aria: string; onOpen: () => void; mark?: ReactNode };
  /** The Now card folds to its title once read (UX audit H-7, #audit-hub). Off by default. */
  foldNow?: boolean;
  /** Mock only: drawn over the Now card, the audit's numbered marker. */
  nowMark?: ReactNode;
  children: ReactNode;
}) {
  const chat = useChat();
  const { view, self, slot } = usePhoneGame();
  const [handoff, setHandoff] = useState(!!handoffOpen);
  const code = useHandoffCode(typeof handoffOpen === 'string' ? handoffOpen : 'ready');
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
      <div className="relative flex h-full bg-table text-ink" data-testid="game-shell">
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
              {seconds !== undefined ? <Timer seconds={seconds} className="@min-[1100px]/shell:h-11 @min-[1100px]/shell:px-4 @min-[1100px]/shell:text-2xl" /> : status}
            </div>
            <div className="flex items-center gap-2">
              <PlayerMark slot={slot} species={self.species} size={12} label={`You, ${SPECIES_NAME[self.species]}`} />
              <span className="min-w-0 truncate text-sm font-semibold @min-[1100px]/shell:text-base">{self.name}</span>
              <ThemeToggle className="ml-1 shrink-0" />
              {/* Move this seat to another device mid-game (WS4's hand-off): an icon on a phone, labelled on a laptop. */}
              <button
                type="button"
                onClick={() => setHandoff(true)}
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
              {standing ? (
                <button
                  type="button"
                  onClick={standing.onOpen}
                  aria-haspopup="dialog"
                  aria-label={`${fmt(self.money)} cr. ${standing.aria}`}
                  className="relative -my-1 ml-auto flex shrink-0 flex-col items-end rounded-chip px-1 py-0.5 hover:bg-holo-soft"
                  data-testid="standing"
                >
                  <span data-num className="font-mono text-sm font-bold leading-tight text-ink @min-[1100px]/shell:text-lg" data-testid="money">
                    {fmt(self.money)} cr
                  </span>
                  <span className="flex items-center gap-0.5 text-[10px] font-semibold leading-tight text-holo @min-[1100px]/shell:text-sm" data-testid="standing-rank">
                    {standing.label}
                    <svg aria-hidden viewBox="0 0 24 24" width={10} height={10} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </span>
                  {standing.mark}
                </button>
              ) : (
                <span data-num className="ml-auto shrink-0 font-mono text-sm font-bold text-ink @min-[1100px]/shell:text-lg" data-testid="money">
                  {fmt(self.money)} cr
                </span>
              )}
            </div>
            {/* Live table chat (C20): everyone's seat, the bubble's fallback anchor, and the last lines. */}
            {chat && (
              <div className="relative flex flex-col gap-1 border-t border-holo-faint pt-1.5 @min-[1100px]/shell:gap-2 @min-[1100px]/shell:pt-2.5" data-testid="table-chat">
                <SeatRow anchored={anchored} />
                <Ticker />
              </div>
            )}
          </header>
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-2.5 *:shrink-0 @min-[1100px]/shell:gap-4 @min-[1100px]/shell:px-5 @min-[1100px]/shell:py-4">
            {foldNow ? <FoldingNowCard key={now.title} now={now} mark={nowMark} /> : <NowCard now={now} />}
            {rail}
          </div>
          {footer && (
            <div className="flex flex-col gap-2 border-t border-holo-faint bg-void/60 px-3 pb-2.5 pt-2.5 @min-[1100px]/shell:gap-3 @min-[1100px]/shell:px-5 @min-[1100px]/shell:py-4" data-testid="actions">
              {footer}
            </div>
          )}
        </aside>
        {handoff && (
          <div className="absolute inset-0 z-40 grid place-items-center bg-void/70 p-4" role="dialog" aria-modal data-testid="host-dialog">
            <div className="flex max-w-[560px] flex-col gap-3 rounded-sheet border-2 border-holo bg-panel p-4 shadow-glow @min-[1100px]/shell:max-w-[720px] @min-[1100px]/shell:gap-5 @min-[1100px]/shell:p-8">
              <h2 className="font-display text-xl font-semibold @min-[1100px]/shell:text-3xl">Move to your phone</h2>
              <div className="flex items-center gap-4">
                <HandoffCode url={`https://mule.example/handoff/${self.id}-7f3a`} state={code.state} onRenew={code.renew} />
                <p className="text-sm text-ink-2 @min-[1100px]/shell:text-lg">
                  Scan this with your phone. It becomes <strong className="text-ink">you, {self.name}</strong>, mid-game, with your money, goods and plots. This screen then steps aside. The code works once, for 2 minutes; the game doesn't pause.
                </p>
              </div>
              <Button size="md" variant="outline" onClick={() => setHandoff(false)} data-testid="handoff-done">
                Done
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
    </Wide.Provider>
  );
}
