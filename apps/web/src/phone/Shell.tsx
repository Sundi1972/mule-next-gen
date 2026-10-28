import { cx, PlayerMark, SPECIES_NAME, Timer } from '@mule/ui';
import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { TableChat } from '../chat/Chat';
import { ThemeToggle } from '../components/ThemeToggle';
import { fmt } from '../game/derive';
import { useEscape } from './dialog';
import { usePhoneGame } from './game';
import { MoveToPhone } from './MoveToPhone';

/**
 * From this width of the shell the layout is "wide" (laptop and up). One number, shared by the container query
 * (`@min-[1100px]/shell:` below, on the container named `shell`, so a nested container such as MapFit never
 * captures it) and by code that sizes itself (useWide). HC-8: never the window's width, never a
 * second breakpoint per screen.
 */
export const WIDE_PX = 1100;
const Wide = createContext(false);
/** True when the shell is wide: for components that size in code rather than in CSS. */
export const useWide = () => useContext(Wide);

/**
 * What floats over every game screen, such as emotes. The shell draws it inside its own container, so it can sit
 * clear of the rail at the rail's real width: `--rail` there is the rail's width at both sizes.
 */
export const ShellLayer = createContext<ReactNode>(null);

/**
 * Opens the move-to-phone dialog, which is held above the per-phase screens so it stays open, with its code, as the
 * phase moves on. `button` is the current shell's move-to-phone, for focus to return to.
 */
export const MoveToPhoneOpener = createContext<{ open: () => void; button: RefObject<HTMLButtonElement> } | null>(null);

/** What the player does next, at the top of the rail. */
export interface Now {
  /** Step n of m, when the turn is a sequence. */
  step?: number;
  of?: number;
  /** One action, named. */
  title: string;
  /** One line of why. */
  detail?: ReactNode;
  /** Something the player must notice, such as time running short: shown amber. */
  warn?: boolean;
}

/** "Now": the one next step and why. It opens the rail of every screen that gives one. */
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

/** Before paint in the browser; the server renderer (and the node tests) has nothing to measure and no paint. */
const useBeforePaint = typeof document === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Whether the element is at least WIDE_PX wide, the same answer as the container query in every painted frame:
 * measured before the first paint (the shell remounts with each phase), then on every resize, which
 * ResizeObserver reports before paint and flushSync commits there too.
 */
function useWideRef<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [wide, setWide] = useState(false);
  useBeforePaint(() => {
    const el = ref.current;
    if (!el) return;
    setWide(el.getBoundingClientRect().width >= WIDE_PX);
    const ro = new ResizeObserver(([e]) => flushSync(() => setWide((e?.contentRect.width ?? 0) >= WIDE_PX)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, wide] as const;
}

/**
 * Every player screen, from a phone held sideways to a laptop: the stage on the left holds the screen's content;
 * the guide rail on the right holds the phase, the clock, your money, then "Now" when the screen gives one, the
 * screen's controls and, at the bottom within thumb reach, the main action. It sizes from its own width (HC-8):
 * under WIDE_PX it is the phone layout; from WIDE_PX the rail is 400 px, the type and the clock grow, and the
 * stage gets room around it.
 */
export function PhoneShell({
  phase,
  seconds,
  now,
  rail,
  footer,
  fill = false,
  children,
}: {
  phase: string;
  seconds?: number | undefined;
  /** The one next step, first in the rail. Screens without it draw no Now card. */
  now?: Now | undefined;
  /** Controls and details for the side rail; scrolls if it runs long. */
  rail?: ReactNode;
  /** The main action, pinned to the bottom of the rail. */
  footer?: ReactNode;
  /** The content fills the main area without scrolling, as the map does. */
  fill?: boolean;
  children: ReactNode;
}) {
  const { view, self, slot } = usePhoneGame();
  const [root, wide] = useWideRef<HTMLDivElement>();
  const layer = useContext(ShellLayer);
  const move = useContext(MoveToPhoneOpener);
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
                  <span className="truncate font-display text-lg font-semibold leading-tight @min-[1100px]/shell:text-2xl">{phase}</span>
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
                <span data-num className="ml-auto shrink-0 font-mono text-sm font-bold text-ink @min-[1100px]/shell:text-lg" data-testid="money">
                  {fmt(self.money)} cr
                </span>
              </div>
              <TableChat />
            </header>
            <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-2.5 *:shrink-0 @min-[1100px]/shell:gap-4 @min-[1100px]/shell:px-5 @min-[1100px]/shell:py-4">
              {now && <NowCard now={now} />}
              {rail}
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

/**
 * Mid-game, the move of this seat to another device, over the whole game screen. Escape closes it, as Done does.
 * It sits outside the screen's shell, so it is a `shell` container itself.
 */
export function MoveDialog({ room, name, onClose }: { room: string; name: string; onClose: () => void }) {
  const titleId = useId();
  useEscape(onClose);
  return (
    // The container has no padding: a query measures the content box, so padding here would make it go wide late.
    <div className="absolute inset-0 z-40 @container/shell">
      <div className="grid h-full place-items-center bg-void/70 p-4" role="dialog" aria-modal aria-labelledby={titleId} data-testid="host-dialog">
        <div className="flex max-w-[560px] flex-col gap-3 rounded-sheet border-2 border-holo bg-panel p-4 shadow-glow @min-[1100px]/shell:max-w-[720px] @min-[1100px]/shell:gap-5 @min-[1100px]/shell:p-8">
          <MoveToPhone
            titleId={titleId}
            title="Move to your phone"
            room={room}
            who={name}
            what=", mid-game, with your money, goods and plots. This screen then steps aside. The code works once, for 2 minutes; the game doesn't pause."
            doneTestId="handoff-done"
            onDone={onClose}
          />
        </div>
      </div>
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
