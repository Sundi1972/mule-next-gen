import { lineCredits, spareOf, COLONY, type BudgetLine } from '@mule/engine';
import type { BudgetView, MuleView, PoliticsView } from '@mule/protocol';
import { Button, cx } from '@mule/ui';
import { useId, useState } from 'react';
import { Commission } from '../../../../components/ColonyActions';
import { fmt } from '../../../../game/derive';
import { useClient } from '../../../../net/react';
import { usePhoneGame } from '../../../game';
import { keptWords, LINE_NAME, lineWords } from './words';

/*
 * The Governor's budget: a stepper per line, in the tax row's own style (− n +), the Commission under Projects. Set sends the
 * whole set of shares (setBudget). While a call on the tax stands, FrozenTax stands in for the tax row; the budget stays live.
 */

type Line = BudgetView['lines'][number];
type RcLine = Extract<BudgetLine, 'projects' | 'welfare'>;
type Shares = Record<RcLine, number>;
const rc = (l: BudgetLine): l is RcLine => l === 'projects' || l === 'welfare';

/** The budget's draft on this phone: what the Governor is setting, against what stands. */
function useDraft(budget: BudgetView) {
  const standing = Object.fromEntries(budget.lines.filter((l) => rc(l.line)).map((l) => [l.line, l.share])) as Shares;
  const [draft, setDraft] = useState<Shares>(standing);
  const kept = 100 - draft.projects - draft.welfare;
  const dirty = draft.projects !== standing.projects || draft.welfare !== standing.welfare;
  // Set this month: the budget in force has moved from where planning opened it.
  const setThisMonth = budget.lines.some((l) => l.share !== l.start);
  return { draft, setDraft, kept, dirty, done: !dirty && setThisMonth };
}

/** The Governor's budget block. */
export function GovernorBudget() {
  const { view } = usePhoneGame();
  const politics = view.politics;
  if (!politics?.budget) return null;
  return <Budget key={JSON.stringify(politics.budget.lines.map((l) => l.share))} view={view} budget={politics.budget} />;
}

function Budget({ view, budget }: { view: MuleView; budget: BudgetView }) {
  const client = useClient();
  const { draft, setDraft, kept, dirty, done } = useDraft(budget);
  const [why, setWhy] = useState(false);
  const whyId = useId();
  const line = (id: RcLine) => budget.lines.find((l) => l.line === id)!;
  const spare = spareOf(view.politics!.fund);
  return (
    <section className="flex flex-col gap-1 border-t border-holo-faint pt-1.5 @min-[1100px]/shell:gap-2 @min-[1100px]/shell:pt-3" data-testid="gov-budget">
      <span className="flex items-baseline justify-between gap-2">
        <span className="label-caps text-[10px]! @min-[1100px]/shell:text-xs!">Colony budget</span>
        <span className="truncate text-[11px] text-ink-2 @min-[1100px]/shell:text-sm" data-testid="budget-spare">
          shares of {fmt(spare)} cr at today’s fund
        </span>
      </span>
      <Steppers view={view} budget={budget} draft={draft} kept={kept} onChange={setDraft} line={line} />
      <div className="flex items-center gap-1.5" data-testid="budget-set-row">
        <Button
          size="md"
          variant="holo"
          className="h-10! min-w-0 flex-1 whitespace-nowrap px-1.5 @min-[1100px]/shell:h-11!"
          disabled={!dirty}
          onClick={() => client.intent({ type: 'setBudget', shares: { projects: draft.projects, welfare: draft.welfare, security: 0 } })}
          data-testid="budget-set"
        >
          {dirty ? `Set ${draft.projects} · ${draft.welfare} · kept ${kept}` : 'Set the budget'}
        </Button>
        {done && (
          <span className="shrink-0 rounded-chip border border-ok px-1 font-mono text-[10px] font-bold uppercase leading-4 text-ok" role="status" data-testid="budget-done">
            done
          </span>
        )}
      </div>
      <span className="flex flex-wrap items-center gap-x-2">
        {done && (
          <span className="text-[11px] font-semibold text-ok @min-[1100px]/shell:text-sm" data-testid="budget-done-words">
            Done: paid at this month’s upkeep.
          </span>
        )}
        <button type="button" onClick={() => setWhy((w) => !w)} aria-expanded={why} aria-controls={whyId} className="flex min-h-8 items-center gap-1 text-[11px] font-semibold text-holo @min-[1100px]/shell:text-sm" data-testid="budget-why">
          How the budget pays
          <svg aria-hidden viewBox="0 0 24 24" width={10} height={10} className={cx('transition-transform', why && 'rotate-90')} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </span>
      <p id={whyId} hidden={!why} className="text-[11px] leading-snug text-ink-3 @min-[1100px]/shell:text-sm" data-testid="budget-why-text">
        At upkeep, after office pay and the buildings’ upkeep, each line takes its share of what the fund holds above its {COLONY.reserve} cr reserve. The amounts here are at today’s fund; the
        month’s taxes add to it. Welfare goes by rule to whoever is last on Worth, never to you, at most {line('welfare').maxShare}% and {line('welfare').maxCredits} cr. What no line takes stays in the
        fund. Everyone sees your budget.
      </p>
    </section>
  );
}

interface Editor {
  view: MuleView;
  budget: BudgetView;
  draft: Shares;
  kept: number;
  onChange(s: Shares): void;
}

/** "up to 432 cr · the Observatory still needs 350 cr and 2 Crystite", "54 cr to Kai, last on Worth" (AM-7). At Welfare 0%, who it would go to (AM-5). */
function Pays({ view, budget, id, share, className }: { view: MuleView; budget: BudgetView; id: RcLine; share: number; className?: string }) {
  const credits = lineCredits(id, share, spareOf(view.politics!.fund));
  const to = view.players.find((p) => p.id === budget.welfareTo)?.name;
  if (id === 'welfare' && share === 0 && to)
    return (
      <span className={cx('min-w-0 text-[11px] leading-tight text-ink-2 @min-[1100px]/shell:text-sm', className)} data-testid="budget-pays-welfare">
        would go to {to}, last on Worth
      </span>
    );
  return (
    <span className={cx('min-w-0 text-[11px] leading-tight text-ink-2 @min-[1100px]/shell:text-sm', className)} data-testid={`budget-pays-${id}`}>
      {lineWords(id, view, budget.welfareTo, credits)}
    </span>
  );
}

/** Welfare's + takes from Kept first, then from Projects; Projects' + takes from Kept only. − always gives to Kept. */
function step(draft: Shares, kept: number, id: RcLine, by: number, max: number): Shares | null {
  const to = draft[id] + by;
  if (to < 0 || to > max) return null;
  if (by < 0) return { ...draft, [id]: to };
  if (kept >= by) return { ...draft, [id]: to };
  if (id === 'welfare' && draft.projects >= by) return { projects: draft.projects - by, welfare: to };
  return null;
}

function Steppers({ view, budget, draft, kept, onChange, line }: Editor & { line(id: RcLine): Line }) {
  return (
    <div className="flex flex-col gap-1 @min-[1100px]/shell:gap-2" data-testid="budget-steppers">
      {(['projects', 'welfare'] as const).map((id) => {
        const l = line(id);
        const up = step(draft, kept, id, l.step, l.maxShare);
        const down = step(draft, kept, id, -l.step, l.maxShare);
        return (
          <div key={id} className="flex flex-col gap-0.5" data-testid={`budget-line-${id}`}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1.5">
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="text-xs font-semibold @min-[1100px]/shell:text-base">{LINE_NAME[id]}</span>
                {draft[id] !== l.start && (
                  <span className="truncate text-[10px] text-ink-3 @min-[1100px]/shell:text-xs" data-testid={`budget-was-${id}`}>
                    was {l.start}%
                  </span>
                )}
              </span>
              <span className="flex items-center gap-1">
                <Button size="md" variant="outline" className="h-10! w-10 shrink-0 px-0 @min-[1100px]/shell:h-11! @min-[1100px]/shell:w-11" aria-label={`${LINE_NAME[id]} ${l.step} points lower`} disabled={!down} onClick={() => down && onChange(down)} data-testid={`budget-down-${id}`}>
                  −
                </Button>
                <span data-num className="w-12 text-center font-mono text-lg font-bold leading-none @min-[1100px]/shell:w-16 @min-[1100px]/shell:text-2xl" data-testid={`budget-share-${id}`}>
                  {draft[id]}%
                </span>
                <Button size="md" variant="outline" className="h-10! w-10 shrink-0 px-0 @min-[1100px]/shell:h-11! @min-[1100px]/shell:w-11" aria-label={`${LINE_NAME[id]} ${l.step} points higher`} disabled={!up} onClick={() => up && onChange(up)} data-testid={`budget-up-${id}`}>
                  +
                </Button>
              </span>
            </div>
            <Pays view={view} budget={budget} id={id} share={draft[id]} />
            {id === 'projects' && <ProjectsCommission />}
          </div>
        );
      })}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-1.5 border-t border-holo-faint pt-1" data-testid="budget-line-kept">
        <span className="flex min-w-0 flex-col">
          <span className="text-xs font-semibold @min-[1100px]/shell:text-base">Kept in the fund</span>
          <span className="text-[11px] leading-tight text-ink-2 @min-[1100px]/shell:text-sm">{keptWords(Math.floor((kept * spareOf(view.politics!.fund)) / 100))}</span>
        </span>
        {/* Under the steppers' value: right of it sit the + button and its gap, 10 + 1 spacing units. */}
        <span data-num className="mr-11 w-12 text-center font-mono text-lg font-bold leading-none text-ink-2 @min-[1100px]/shell:mr-12 @min-[1100px]/shell:w-16 @min-[1100px]/shell:text-2xl" data-testid="budget-share-kept">
          {kept}%
        </span>
      </div>
    </div>
  );
}

/** Commissioning moves under Projects (P12): the real Commission, unchanged, where the Projects line is. */
function ProjectsCommission() {
  return (
    <div className="flex flex-col gap-1 pl-3" data-testid="budget-commission">
      <Commission />
    </div>
  );
}

/** True while a call on the tax stands: the Governor's tax row gives way to FrozenTax. */
export const taxFrozen = (politics: Pick<PoliticsView, 'overrule'>) => politics.overrule?.target === 'tax' && politics.overrule.stage === 'called';

/** SalesTax's row while an overrule on the tax is called: read-only, who called it, and when it is held. */
export function FrozenTax() {
  const { view } = usePhoneGame();
  const politics = view.politics!;
  const o = politics.overrule!;
  const caller = view.players.find((p) => p.id === o.caller)?.name ?? o.caller;
  return (
    <section className="flex flex-col gap-1 rounded-panel border border-warn/60 bg-panel p-2 @min-[1100px]/shell:gap-2 @min-[1100px]/shell:p-4" data-testid="gov-tax-frozen">
      <span className="flex items-baseline justify-between gap-2">
        <span className="label-caps text-[10px]! @min-[1100px]/shell:text-xs!">Sales tax</span>
        <span className="rounded-chip border border-warn px-1 font-mono text-[10px] font-bold uppercase leading-4 text-warn" data-testid="gov-frozen-chip">
          frozen
        </span>
      </span>
      <span className="flex items-baseline gap-2">
        <span data-num className="font-mono text-xl font-bold leading-none @min-[1100px]/shell:text-3xl" data-testid="gov-frozen-value">
          {politics.tax.percent}%
        </span>
        <span className="text-[11px] text-ink-2 @min-[1100px]/shell:text-sm">from {politics.tax.start}% at the month’s start</span>
      </span>
      <span className="text-xs leading-snug @min-[1100px]/shell:text-base" data-testid="gov-frozen-words">
        Frozen: <strong className="font-semibold">{caller}</strong> called an overrule vote on the tax, held as planning ends.
      </span>
      <span className="text-[11px] leading-snug text-ink-2 @min-[1100px]/shell:text-sm" data-testid="gov-frozen-then">
        Your ballot starts at No. More than half of all votes puts it back to {politics.tax.start}% before anything is sold.
      </span>
    </section>
  );
}
