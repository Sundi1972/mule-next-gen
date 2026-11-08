import type { BudgetLine } from '@mule/engine';
import type { BudgetView, MuleView, PoliticsView } from '@mule/protocol';
import { Button, cx } from '@mule/ui';
import { useContext, useId, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Commission } from '../../../../../apps/web/src/components/ColonyActions';
import { fmt } from '../../../../../apps/web/src/game/derive';
import { useClient } from '../../../../../apps/web/src/net/react';
import { usePhoneGame } from '../../../../../apps/web/src/phone/game';
import { COLONY } from '@mule/engine';
import { creditsOf, type RcLine, type Shares } from '../fixture';
import { DraftSeed } from '../seed';
import { keptWords, LINE_NAME, lineWords } from './words';

/*
 * P12 · the Governor's budget. GRAFT TARGET: apps/web/src/phone/hub/politics/Governor.tsx, right under SalesTax and
 * before LawPicker ("beside the tax", S5-C10). Two variants for Heiko: A, a stepper per line (the tax row's own − n +);
 * B, one split bar with a handle per boundary. Both send the whole set of shares with Set (setBudget, S5-RULE-2).
 * FrozenTax replaces SalesTax's row while an overrule on the tax is called (moment 2).
 *
 * In RC the budget never freezes (S5-RULE-2 "in RC": a call freezes the tax only), so Set stays live through a call.
 */

export type Variant = 'a' | 'b';

type Line = BudgetView['lines'][number];
const rc = (l: BudgetLine): l is RcLine => l === 'projects' || l === 'welfare';

/** The budget's draft on this phone: what the Governor is setting, against what stands. */
function useDraft(budget: BudgetView) {
  const seed = useContext(DraftSeed);
  const standing = Object.fromEntries(budget.lines.filter((l) => rc(l.line)).map((l) => [l.line, l.share])) as Shares;
  // The mock's seed opens a draft over the default budget only; once Set, the draft starts at what stands.
  const [draft, setDraft] = useState<Shares>(seed && budget.setBy === null ? seed : standing);
  const kept = 100 - draft.projects - draft.welfare;
  const dirty = draft.projects !== standing.projects || draft.welfare !== standing.welfare;
  // Set this month: the budget in force has moved from where planning opened it.
  const setThisMonth = budget.lines.some((l) => l.share !== l.start);
  return { draft, setDraft, kept, dirty, done: !dirty && setThisMonth };
}

/** P12, the Governor's budget block, in either variant. */
export function GovernorBudget({ variant }: { variant: Variant }) {
  const { view } = usePhoneGame();
  const politics = view.politics;
  if (!politics?.budget) return null;
  return <Budget key={JSON.stringify(politics.budget.lines.map((l) => l.share))} view={view} politics={politics} budget={politics.budget} variant={variant} />;
}

function Budget({ view, politics, budget, variant }: { view: MuleView; politics: PoliticsView; budget: BudgetView; variant: Variant }) {
  const client = useClient();
  const { draft, setDraft, kept, dirty, done } = useDraft(budget);
  const [why, setWhy] = useState(false);
  const whyId = useId();
  const line = (id: RcLine) => budget.lines.find((l) => l.line === id)!;
  const spare = Math.max(0, politics.fund - COLONY.reserve);
  return (
    <section className="flex flex-col gap-1 border-t border-holo-faint pt-1.5 @min-[1100px]/shell:gap-2 @min-[1100px]/shell:pt-3" data-testid="gov-budget" data-variant={variant}>
      <span className="flex items-baseline justify-between gap-2">
        <span className="label-caps text-[10px]! @min-[1100px]/shell:text-xs!">Colony budget</span>
        <span className="truncate text-[11px] text-ink-2 @min-[1100px]/shell:text-sm" data-testid="budget-spare">
          shares of {fmt(spare)} cr at today’s fund
        </span>
      </span>
      {variant === 'a' ? (
        <Steppers view={view} budget={budget} draft={draft} kept={kept} onChange={setDraft} line={line} />
      ) : (
        <SplitBar view={view} budget={budget} draft={draft} kept={kept} onChange={setDraft} />
      )}
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
  const credits = creditsOf(id, share, view.politics!.fund);
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

// --- Variant A: a stepper per line ----------------------------------------------------------------------------------

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
          <span className="text-[11px] leading-tight text-ink-2 @min-[1100px]/shell:text-sm">{keptWords(keptCredits(view, kept))}</span>
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

const keptCredits = (view: MuleView, kept: number) => Math.floor((kept * Math.max(0, view.politics!.fund - COLONY.reserve)) / 100);

// --- Variant B: one split bar ---------------------------------------------------------------------------------------

/** The bar's three parts, in order. The colours are the app's: holo for buildings, ok for help, raised for what stays. */
const PART = {
  projects: { fill: 'bg-holo', text: 'text-on-holo' },
  welfare: { fill: 'bg-ok', text: 'text-on-holo' },
  kept: { fill: 'bg-ink-3/40', text: 'text-ink' },
} as const;

function SplitBar({ view, budget, draft, kept, onChange }: Editor) {
  const bar = useRef<HTMLDivElement>(null);
  const welfare = budget.lines.find((l) => l.line === 'welfare')!;
  const stepPct = welfare.step;
  // The two handles: where Projects ends, and where Welfare ends. Kept is the rest.
  const a = draft.projects;
  const b = draft.projects + draft.welfare;
  const snap = (pct: number) => Math.max(0, Math.min(100, Math.round(pct / stepPct) * stepPct));
  const moveA = (to: number) => {
    // Projects | Welfare: trades the two, Welfare kept within its cap.
    const x = Math.max(b - welfare.maxShare, Math.min(b, snap(to)));
    onChange({ projects: x, welfare: b - x });
  };
  const moveB = (to: number) => {
    // Welfare | Kept: trades Welfare with what stays.
    const y = Math.max(a, Math.min(a + welfare.maxShare, snap(to)));
    onChange({ projects: a, welfare: y - a });
  };
  const drag = (move: (pct: number) => void) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const at = (ev: PointerEvent) => {
      const r = bar.current!.getBoundingClientRect();
      move(((ev.clientX - r.left) / r.width) * 100);
    };
    const up = () => {
      handle.removeEventListener('pointermove', at);
      handle.removeEventListener('pointerup', up);
    };
    handle.addEventListener('pointermove', at);
    handle.addEventListener('pointerup', up);
  };
  const keys = (pos: number, move: (pct: number) => void) => (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') move(pos - stepPct);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') move(pos + stepPct);
    else return;
    e.preventDefault();
  };
  const parts = [
    { id: 'projects', share: draft.projects },
    { id: 'welfare', share: draft.welfare },
    { id: 'kept', share: kept },
  ] as const;
  return (
    <div className="flex flex-col gap-1 @min-[1100px]/shell:gap-2" data-testid="budget-split">
      {/* The bar is the whole of what upkeep shares out: 100%. Widths are the shares themselves, not design values. */}
      <div ref={bar} className="relative flex h-10 w-full overflow-visible rounded-control border border-holo-line bg-panel @min-[1100px]/shell:h-12" data-testid="budget-bar">
        {parts.map((p) => (
          <span
            key={p.id}
            className={cx('flex h-full items-center justify-center overflow-hidden font-mono text-[11px] font-bold first:rounded-l-control last:rounded-r-control', PART[p.id].fill, PART[p.id].text)}
            style={{ width: `${p.share}%` }}
            data-testid={`budget-bar-${p.id}`}
          >
            {p.share >= 15 && `${p.share}%`}
          </span>
        ))}
        <Handle pos={a} label="Projects ends, Welfare begins" value={`Projects ${draft.projects}%, Welfare ${draft.welfare}%`} onPointerDown={drag(moveA)} onKeyDown={keys(a, moveA)} testid="budget-handle-projects" />
        <Handle pos={b} label="Welfare ends, kept begins" value={`Welfare ${draft.welfare}%, kept ${kept}%`} onPointerDown={drag(moveB)} onKeyDown={keys(b, moveB)} testid="budget-handle-welfare" />
      </div>
      <ul className="flex flex-col gap-0.5" data-testid="budget-legend">
        {parts.map((p) => (
          <li key={p.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-1.5" data-testid={`budget-legend-${p.id}`}>
            <span aria-hidden className={cx('size-2.5 self-center rounded-chip border border-holo-line', PART[p.id].fill)} />
            <span className="flex min-w-0 flex-col">
              <span className="text-xs font-semibold @min-[1100px]/shell:text-base">
                {p.id === 'kept' ? 'Kept in the fund' : LINE_NAME[p.id]}
                {p.id !== 'kept' && draft[p.id] !== budget.lines.find((l) => l.line === p.id)!.start && (
                  <span className="ml-1.5 text-[10px] font-normal text-ink-3 @min-[1100px]/shell:text-xs" data-testid={`budget-was-${p.id}`}>
                    was {budget.lines.find((l) => l.line === p.id)!.start}%
                  </span>
                )}
              </span>
              {p.id === 'kept' ? (
                <span className="text-[11px] leading-tight text-ink-2 @min-[1100px]/shell:text-sm">{keptWords(keptCredits(view, kept))}</span>
              ) : (
                <Pays view={view} budget={budget} id={p.id} share={p.share} />
              )}
            </span>
            <span data-num className="font-mono text-sm font-bold @min-[1100px]/shell:text-lg" data-testid={`budget-share-${p.id}`}>
              {p.share}%
            </span>
            {p.id === 'projects' && (
              <span className="col-span-3">
                <ProjectsCommission />
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A boundary on the bar: a 32 px wide target for a thumb, its visible mark a thin rule; drag it, or arrow keys. */
function Handle({ pos, label, value, onPointerDown, onKeyDown, testid }: { pos: number; label: string; value: string; onPointerDown(e: ReactPointerEvent<HTMLButtonElement>): void; onKeyDown(e: KeyboardEvent): void; testid: string }) {
  return (
    <button
      type="button"
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pos}
      aria-valuetext={value}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className="absolute -inset-y-1 z-10 flex w-8 -translate-x-1/2 touch-none items-center justify-center"
      style={{ left: `${pos}%` }}
      data-testid={testid}
    >
      <span className="pointer-events-none h-full w-1 rounded-chip bg-ink shadow-chip" />
    </button>
  );
}

// --- Moment 2 on the Governor's desk: the tax frozen ---------------------------------------------------------------

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
