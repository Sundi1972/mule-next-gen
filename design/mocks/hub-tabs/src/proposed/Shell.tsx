import { cx, PlayerMark, SPECIES_NAME, Timer } from '@mule/ui';
import { type ComponentType, type ReactNode } from 'react';
import { ThemeToggle } from '../../../../../apps/web/src/components/ThemeToggle';
import { fmt } from '../../../../../apps/web/src/game/derive';
import { usePhoneGame } from '../../../../../apps/web/src/phone/game';
import { roadmapSteps } from '../../../../../apps/web/src/phone/hub/month-steps';
import type { Now } from '../../../../../apps/web/src/phone/Shell';
import { Glyph } from './parts';

/*
 * GRAFT TARGET: apps/web/src/phone/Shell.tsx — PhoneShell gains the tab strip and the slim rail head, for the
 * planning hub only (every other phase keeps PhoneShell as it is). Copied from PhoneShell's header (money, standing,
 * clock, ready count) with these changes, each marked CHANGE:
 *   1. a `tabs` region beside or under the stage: variant A a 56 px column at the stage's left edge, B a 44 px bar
 *      across the stage's foot;
 *   2. the rail head holds what every tab keeps: the phase as a slim stepper line, the one Now line and its "?";
 *      the stage-top explanation card (Roadmap) is gone, its words in the "?" sheet;
 *   3. the phase title and the month share one line;
 *   4. on a phone the table chat leaves the rail for the Talk tab (TableChat under / FallbackBubble not drawn).
 */

export type ShellVariant = 'a' | 'b';

export interface TabButton {
  id: string;
  label: string;
  icon: string;
  on: boolean;
  Badge?: ComponentType | undefined;
  onPick(): void;
}

/** The tab column (A) or the tab bar (B). Real tabs: role="tab", aria-selected, a 44 px target at least. */
function Tabs({ variant, tabs }: { variant: ShellVariant; tabs: TabButton[] }) {
  const column = variant === 'a';
  return (
    <nav
      role="tablist"
      aria-label="Planning"
      aria-orientation={column ? 'vertical' : 'horizontal'}
      className={cx(
        'flex shrink-0 bg-void/40',
        column
          ? 'w-14 flex-col gap-1 border-r border-holo-faint px-1 pb-[max(0.375rem,env(safe-area-inset-bottom))] pt-[max(0.375rem,env(safe-area-inset-top))]'
          : 'h-11 flex-row border-t border-holo-faint pb-[env(safe-area-inset-bottom)]',
      )}
      data-testid={`tabs-${variant}`}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.on}
          onClick={t.onPick}
          className={cx(
            'relative flex items-center justify-center font-semibold leading-tight',
            column ? 'h-14 w-full flex-col gap-0.5 rounded-control text-[10px]' : 'h-full min-w-0 flex-1 flex-row gap-1.5 text-xs',
            column ? (t.on ? 'bg-holo-soft text-holo ring-1 ring-holo' : 'text-ink-2 hover:text-ink') : cx('border-t-2', t.on ? 'border-holo bg-holo-soft text-holo' : 'border-transparent text-ink-2 hover:text-ink'),
          )}
          data-testid={`tab-${t.id}`}
        >
          <Glyph d={t.icon} size={column ? 18 : 16} />
          <span className="truncate">{t.label}</span>
          {t.Badge && <t.Badge />}
        </button>
      ))}
    </nav>
  );
}

/** CHANGE 2: the month's steps as one slim line: a bar per step, this one lit; the month, and the next step by name. */
export function PhaseLine() {
  const { view } = usePhoneGame();
  const steps = roadmapSteps(view);
  const next = steps[1];
  return (
    <div className="flex items-center gap-2" aria-label={`Month ${view.month}: step 1 of ${steps.length}, ${steps[0]!.label}.${next ? ` Next: ${next.label}.` : ''}`} role="img" data-testid="phase-line">
      <span className="flex min-w-0 flex-1 items-center gap-0.5" aria-hidden>
        {steps.map((s, i) => (
          <span key={s.id} className={cx('h-1 rounded-full', i === 0 ? 'w-5 bg-holo' : 'min-w-1 flex-1 bg-holo-line')} data-testid={`phase-step-${s.id}`} />
        ))}
      </span>
      <span className="shrink-0 whitespace-nowrap text-[10px] leading-none text-ink-2" aria-hidden data-testid="phase-next">
        <span className="label-caps text-[10px]!" data-testid="month">
          Month {view.month}/{view.maxMonths}
        </span>
        {next && <> · next {next.label}</>}
      </span>
    </div>
  );
}

/**
 * CHANGE 2: the one Now line, whatever the tab. Its title only (two lines at most); the "?" opens the sheet with the
 * whole explanation. When the step lives in a tab (a ballot), the title is a door to it.
 */
export function NowLine({ now, onHelp, onGo }: { now: Now; onHelp(): void; onGo?: (() => void) | undefined }) {
  const title = (
    <span className="line-clamp-2 min-w-0 flex-1 font-display text-sm font-semibold leading-tight" data-testid="now-title">
      {now.title}
    </span>
  );
  return (
    <section className={cx('flex min-h-10 items-center gap-1.5 rounded-panel border-2 py-0.5 pl-2 pr-0.5', now.warn ? 'border-warn bg-warn/10' : 'border-holo bg-holo-soft')} aria-live="polite" data-testid="now">
      <span className="label-caps shrink-0 text-[10px]!">Now</span>
      {now.step !== undefined && now.of !== undefined && (
        <span className="shrink-0 font-mono text-[10px] text-ink-2" data-testid="now-steps">
          {now.step}/{now.of}
        </span>
      )}
      {onGo ? (
        <button type="button" onClick={onGo} className="flex min-h-8 min-w-0 flex-1 items-center gap-1 text-left" data-testid="now-go">
          {title}
          <Glyph d="M9 6l6 6-6 6" size={12} className="shrink-0 text-holo" />
        </button>
      ) : (
        title
      )}
      <button type="button" onClick={onHelp} aria-haspopup="dialog" aria-label="What to do this month, in full" className="grid size-8 shrink-0 place-items-center rounded-full border border-holo-line font-display text-sm font-bold text-holo hover:border-holo" data-testid="help-open">
        ?
      </button>
    </section>
  );
}

/**
 * The planning hub's shell. Stage on the left (with the tabs), the guide rail on the right: its head holds what every
 * tab keeps, its body the open tab's own rail (Overview: the tool's panel), its foot the action and Ready, bottom
 * right under the right thumb.
 */
export function TabShell({
  variant,
  tabs,
  status,
  seconds,
  head,
  rail,
  footer,
  standing,
  stage,
  phase,
  layer,
}: {
  variant: ShellVariant;
  tabs: TabButton[];
  status?: ReactNode;
  seconds?: number | undefined;
  /** The rail head under the money: the phase line and Now. */
  head: ReactNode;
  rail?: ReactNode;
  footer: ReactNode;
  standing?: { label: string; aria: string; onOpen: () => void } | undefined;
  stage: ReactNode;
  phase: string;
  /** Sheets over the whole phone: "?", the standings. */
  layer?: ReactNode;
}) {
  const { view, self, slot } = usePhoneGame();
  return (
    <div className="h-full @container/shell">
      <div className="relative flex h-full bg-table pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] text-ink" data-testid="game-shell" data-variant={variant}>
        {variant === 'a' && <Tabs variant="a" tabs={tabs} />}
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col" data-testid="stage">
          <div className={cx('relative flex min-h-0 flex-1 flex-col p-2.5', variant === 'a' ? 'pb-[max(0.625rem,env(safe-area-inset-bottom))]' : 'pb-1.5')} data-testid="stage-body">
            {stage}
          </div>
          {variant === 'b' && <Tabs variant="b" tabs={tabs} />}
        </main>
        <aside className="flex w-(--rail) shrink-0 flex-col border-l border-holo-faint bg-void/40" data-testid="guide">
          <header className="flex flex-col gap-1.5 border-b border-holo-faint px-3 pb-2 pt-[max(0.375rem,env(safe-area-inset-top))]" data-testid="rail-head">
            {/* CHANGE 3: the phase on one line with the ready count (or the clock) where it always was; the month moves to the phase line. */}
            <div className="flex items-center justify-between gap-1.5">
              <span className="truncate font-display text-base font-semibold leading-tight">{phase}</span>
              {seconds !== undefined ? <Timer seconds={seconds} /> : status}
            </div>
            <div className="flex items-center gap-1.5">
              <PlayerMark slot={slot} species={self.species} size={12} label={`You, ${SPECIES_NAME[self.species]}`} />
              <span className="min-w-0 truncate text-sm font-semibold" data-testid="self-name">
                {self.name}
              </span>
              <ThemeToggle iconUntilWide className="shrink-0" />
              {standing ? (
                <button type="button" onClick={standing.onOpen} aria-haspopup="dialog" aria-label={`${fmt(self.money)} cr. ${standing.aria}`} className="relative -my-1 ml-auto flex shrink-0 flex-col items-end rounded-chip py-0.5 hover:bg-holo-soft" data-testid="standing">
                  <span data-num className="font-mono text-sm font-bold leading-tight text-ink" data-testid="money">
                    {fmt(self.money)} cr
                  </span>
                  <span className="flex items-center gap-0.5 text-[10px] font-semibold leading-tight text-holo" data-testid="standing-rank">
                    {standing.label}
                    <Glyph d="M9 6l6 6-6 6" size={10} />
                  </span>
                </button>
              ) : (
                <span data-num className="ml-auto shrink-0 font-mono text-sm font-bold text-ink" data-testid="money">
                  {fmt(self.money)} cr
                </span>
              )}
            </div>
            {head}
          </header>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-2 *:shrink-0" data-testid="rail-body">
            {rail}
          </div>
          <div className="flex flex-col gap-1.5 border-t border-holo-faint bg-void/60 px-3 pb-[max(0.375rem,env(safe-area-inset-bottom))] pt-1.5" data-testid="actions">
            {footer}
          </div>
        </aside>
        {layer}
      </div>
    </div>
  );
}
