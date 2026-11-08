import { cx } from '@mule/ui';
import type { ComponentType } from 'react';
import { usePhoneGame } from '../../game';
import type { Now } from '../../Shell';
import { roadmapSteps } from '../month-steps';
import { Glyph } from './parts';

/*
 * The tabbed hub's own parts of the shell, from the approved hub-tabs mock's TabShell: the tab column at the stage's
 * left edge, and the rail head every tab keeps (the phase line and the Now line with its "?"). They are drawn inside
 * PhoneShell, which has no `tabs` or `head` slot of its own.
 */

export interface TabButton {
  id: string;
  label: string;
  icon: string;
  on: boolean;
  Badge?: ComponentType | undefined;
  onPick(): void;
}

/** The tab column: a 56 px column at the stage's left edge, under the left thumb; each tab a 56 px target. */
export function TabColumn({ tabs }: { tabs: TabButton[] }) {
  return (
    <nav role="tablist" aria-label="Planning" aria-orientation="vertical" className="-my-2.5 -ml-2.5 flex w-14 shrink-0 flex-col gap-1 border-r border-holo-faint bg-void/40 px-1 py-1.5" data-testid="tabs-a">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.on}
          onClick={t.onPick}
          className={cx('relative flex h-14 w-full flex-col items-center justify-center gap-0.5 rounded-control text-[10px] font-semibold leading-tight', t.on ? 'bg-holo-soft text-holo ring-1 ring-holo' : 'text-ink-2 hover:text-ink')}
          data-testid={`tab-${t.id}`}
        >
          <Glyph d={t.icon} size={18} />
          <span className="truncate">{t.label}</span>
          {t.Badge && <t.Badge />}
        </button>
      ))}
    </nav>
  );
}

/** The month's steps as one slim line: a bar per step, this one lit; the month, and the next step by name. */
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
        {next && <>next {next.label}</>}
      </span>
    </div>
  );
}

/**
 * The one Now line, whatever the tab: its title only (two lines at most); the "?" opens the sheet with the whole
 * explanation. When the step lives in a tab (a sub-tab asking first), the title is a door to it.
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
