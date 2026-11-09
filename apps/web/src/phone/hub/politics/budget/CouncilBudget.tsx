import { spareOf } from '@mule/engine';
import { cx } from '@mule/ui';
import { usePhoneGame } from '../../../game';
import { Who } from '../parts';
import { keptWords, LINE_NAME, lineWords, shareChange } from './words';

/** The budget as set, for every seat but the Governor's: a standing setting like the laws, and the month's news when it moved. Read-only. */
export function CouncilBudget() {
  const { view, self } = usePhoneGame();
  const politics = view.politics;
  const budget = politics?.budget;
  if (!politics || !budget) return null;
  const moved = budget.lines.some((l) => l.share !== l.start);
  const keptStart = 100 - budget.lines.reduce((n, l) => n + l.start, 0);
  return (
    <section className={cx('flex flex-col gap-0.5 rounded-panel border bg-panel p-2 @min-[1100px]/shell:gap-1.5 @min-[1100px]/shell:p-4', moved ? 'border-holo' : 'border-holo-line')} data-testid="council-budget">
      <span className="flex items-baseline justify-between gap-2">
        <span className="label-caps text-[10px]! @min-[1100px]/shell:text-xs!">Colony budget</span>
        <span className="flex min-w-0 items-center gap-1 truncate text-[11px] text-ink-2 @min-[1100px]/shell:text-sm" data-testid="council-budget-by">
          {budget.setBy ? (
            <>
              {moved ? 'changed by' : 'set by'} <Who view={view} id={budget.setBy} me={self.id} size={12} />
            </>
          ) : (
            'as the game began'
          )}
        </span>
      </span>
      <ul className="flex flex-col gap-0.5 @min-[1100px]/shell:gap-1">
        {budget.lines.map((l) => {
          if (l.line === 'security') return null;
          const changed = l.share !== l.start;
          return (
            <li key={l.line} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2" data-testid={`council-budget-${l.line}`}>
              <strong className="text-xs font-semibold @min-[1100px]/shell:text-base">{LINE_NAME[l.line]}</strong>
              <span data-num className={cx('whitespace-nowrap font-mono text-xs font-bold @min-[1100px]/shell:text-base', changed && 'text-holo')} data-testid={`council-budget-share-${l.line}`}>
                {shareChange(l.start, l.share)}
              </span>
              <span className="col-span-2 text-[11px] leading-tight text-ink-2 @min-[1100px]/shell:text-sm" data-testid={`council-budget-pays-${l.line}`}>
                {lineWords(l.line, view, budget.welfareTo, l.credits)}
              </span>
            </li>
          );
        })}
        <li className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2" data-testid="council-budget-kept">
          <span className="text-xs text-ink-2 @min-[1100px]/shell:text-base">Kept in the fund</span>
          <span data-num className={cx('whitespace-nowrap font-mono text-xs font-bold @min-[1100px]/shell:text-base', keptStart === budget.kept ? 'text-ink-2' : 'text-holo')} data-testid="council-budget-share-kept">
            {shareChange(keptStart, budget.kept)}
          </span>
          <span className="col-span-2 text-[11px] leading-tight text-ink-2 @min-[1100px]/shell:text-sm" data-testid="council-budget-kept-words">
            {keptWords(Math.floor((budget.kept * spareOf(politics.fund)) / 100))}
          </span>
        </li>
      </ul>
    </section>
  );
}
