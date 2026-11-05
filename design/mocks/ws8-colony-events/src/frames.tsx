import type { ColonyView } from '@mule/protocol';
import { cx, PlayerMark, Timer, type Slot } from '@mule/ui';
import { forwardRef, type ReactNode } from 'react';
import { ColonyGauges } from '../../../../apps/web/src/components/Colony';
import { fmt } from '../../../../apps/web/src/game/derive';

/** The big screen at its design size (1280 × 720), scaled to fit the page. */
export const TvFrame = forwardRef<HTMLDivElement, { children: ReactNode; reduced: boolean; scale?: number; testid: string }>(function TvFrame({ children, reduced, scale = 0.8, testid }, ref) {
  return (
    <div className="max-w-full overflow-x-auto">
      <div className="overflow-hidden rounded-panel border border-holo-line" style={{ width: 1280 * scale, height: 720 * scale }} data-testid="tv-frame">
        <div ref={ref} className="relative flex h-[720px] w-[1280px] origin-top-left flex-col gap-4 bg-table px-10 py-6 text-ink" style={{ transform: `scale(${scale})` }} data-reduced={reduced} data-testid={testid}>
          {children}
        </div>
      </div>
    </div>
  );
});

/**
 * DS-GAP (WS8): the TV's strike badge, beside the gauges, read from ColonyView.strike: "STRIKE · Food 20%" while it
 * holds, "PAID · −240 cr" once the fund paid. Graft target: TableApp.tsx TvHeader's `extra`, from the view.
 */
export function StrikeBadge({ strike, size = 'tv' }: { strike: ColonyView['strike']; size?: 'tv' | 'phone' }) {
  if (!strike) return null;
  const tv = size === 'tv';
  return (
    <span
      className={cx('flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-chip border-2 font-mono font-bold leading-tight', tv ? 'px-2 py-0.5 text-base' : 'px-1 text-[10px]', strike.paid ? 'border-ok bg-holo-soft text-ok' : 'border-alert bg-alert-bg text-alert-ink', !strike.paid && 'shadow-glow-alert')}
      data-testid="strike-badge"
      data-paid={strike.paid}
    >
      {strike.paid ? `PAID · −${fmt(strike.cost)} cr` : `STRIKE · ${strike.good === 'food' ? 'Food' : strike.good} 20%`}
    </span>
  );
}

/**
 * TableApp's TvHeader (graft target: apps/web/src/table/TableApp.tsx), drawn here because the real one reads the table
 * chat's context for its ticker. The four gauges are C34's real ColonyGauges.
 */
export function TvHeader({ title, month = 7, colony, extra, seconds, gaugeClass, badge }: { title: string; month?: number; colony: ColonyView; extra?: ReactNode; seconds?: number; gaugeClass?: string; badge?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-6" data-testid="tv-header">
      <div className="flex shrink-0 flex-col gap-1">
        <span className="flex items-center gap-3">
          <span className="label-caps text-base!">Month {month} / 12</span>
          {badge}
        </span>
        <h1 className="font-display text-5xl font-semibold leading-none" data-testid="tv-phase">
          {title}
        </h1>
      </div>
      <div className="flex min-w-0 items-center gap-4">
        {extra}
        <ColonyGauges colony={colony} size="tv" className={cx('w-[700px] shrink-0', gaugeClass)} />
        {seconds !== undefined && <Timer seconds={seconds} className="h-14! px-5! text-3xl!" />}
      </div>
    </header>
  );
}

/**
 * The phone on its side (844 × 390), as PhoneShell lays it out (graft target: apps/web/src/phone/Shell.tsx, which reads
 * the phone game's context): the stage, and the rail with its header, Now, the desks and the footer.
 */
export const PhoneFrame = forwardRef<
  HTMLDivElement,
  { phase: string; name: string; slot: Slot; money: number; seconds?: number; status?: ReactNode; now?: ReactNode; rail?: ReactNode; footer?: ReactNode; children: ReactNode; over?: ReactNode; testid: string; reduced?: boolean }
>(function PhoneFrame({ phase, name, slot, money, seconds, status, now, rail, footer, children, over, testid, reduced = false }, ref) {
  return (
    <div ref={ref} className="relative flex h-[390px] w-[844px] shrink-0 overflow-hidden rounded-[28px] border-4 border-raised bg-table text-ink" data-testid={testid} data-reduced={reduced}>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-2.5" data-testid="stage">
        {children}
      </main>
      <aside className="flex w-[300px] shrink-0 flex-col border-l border-holo-faint bg-void/40" data-testid="guide">
        <header className="flex flex-col gap-1 border-b border-holo-faint px-3 pb-2 pt-2">
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex min-w-0 flex-col">
              <span className="label-caps text-[10px]!">Month 7 / 12</span>
              <span className="truncate font-display text-lg font-semibold leading-tight">{phase}</span>
            </div>
            {seconds !== undefined ? <Timer seconds={seconds} /> : status}
          </div>
          <div className="flex items-center gap-1.5">
            <PlayerMark slot={slot} size={12} label="You" />
            <span className="min-w-0 truncate text-sm font-semibold" data-testid="self-name">
              {name}
            </span>
            <span data-num className="ml-auto shrink-0 font-mono text-sm font-bold text-ink" data-testid="money">
              {fmt(money)} cr
            </span>
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-2.5 *:shrink-0">
          {now}
          {rail}
        </div>
        {footer && (
          <div className="flex flex-col gap-2 border-t border-holo-faint bg-void/60 px-3 pb-2.5 pt-2.5" data-testid="actions">
            {footer}
          </div>
        )}
      </aside>
      {over}
    </div>
  );
});
