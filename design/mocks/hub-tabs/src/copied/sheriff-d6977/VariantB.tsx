// Copied from politics-p2 (WS8), variant B, folded with WS7's tips: design/mocks/politics-p2/src/sheriff/VariantB.tsx at d6977e1a, for
// the Sheriff path only. Not redesigned; changes for the tabs are marked TABS:.
import type { IncidentView, MuleView } from '@mule/protocol';
import { cx } from '@mule/ui';
import { useState } from 'react';
import type { SheriffState } from '../sheriff/fixture';
// TABS: the desk's play goes to the table (the investigate and fine intents), so the TV and the month end follow.
import { useSheriffDesk } from './desk-state';
import { GoodIcon } from '@mule/ui';
import { caseShort, CaseHead, CaseMeta, DeskHead, DeskWaits, FineControl, Fined, GuardRow, howFound, Investigate, StepChip, type CaseState } from './parts';

/**
 * Variant B, "the case file": guards stay a single line at the top, and every sabotage the colony has seen is one case,
 * newest first. A case carries only its next step: Investigate while unsolved, Fine once revealed, nothing once fined or
 * cold. Closed and cold cases fold under one line so the open work stays on top.
 *
 * Folded (8 Nov, WS6's finding): in WS6's Sheriff sub-tab at 667 (357 × 309 px) B measured 651 px tall, the first screen
 * showing the guards and one case's head. Now every case is one 44 px row with its next step on a chip; a tap opens it
 * in place (one at a time), scrolled just into view, and stays open once acted on. Guards are one row. Nothing moves
 * but the opened case. Measured at 357 wide: 294 px folded (fits 309); fine case open 415; an open case's step on screen.
 */
const ORDER: Record<CaseState, number> = { fineable: 0, open: 1, cold: 2, closed: 3 };

export function SheriffDeskB({ view, start, incidents, onMap }: { view: MuleView; start: SheriffState; incidents: IncidentView[]; onMap(): void }) {
  const { sheriff, cases, investigate, fine } = useSheriffDesk(start, incidents);
  const [history, setHistory] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  if (sheriff.canAct !== true) return <><DeskHead sheriff={sheriff} /><DeskWaits why={sheriff.canAct} /></>;
  // A case touched this month stays where it was, so it does not jump from under the thumb.
  const live = cases.filter((k) => k.state === 'open' || k.state === 'fineable' || k.result !== undefined || k.fine !== undefined);
  const past = cases.filter((k) => !live.includes(k));
  live.sort((a, b) => (a.result !== undefined || a.fine !== undefined ? 0 : ORDER[a.state]) - (b.result !== undefined || b.fine !== undefined ? 0 : ORDER[b.state]) || b.c.month - a.c.month);
  return (
    <div className="flex flex-col gap-2" data-testid="sheriff-desk-b">
      <DeskHead sheriff={sheriff} />
      <div data-testid="b-guard">
        <GuardRow view={view} sheriff={sheriff} onMap={onMap} />
      </div>
      <section className="flex flex-col gap-1" data-testid="b-cases">
        <h3 className="label-caps flex items-center gap-1.5 @min-[1100px]/shell:text-xs!">Cases</h3>
        {live.length === 0 && <p className="text-xs text-ink-3" data-testid="b-no-cases">No open case: nothing to investigate or fine.</p>}
        <ul className="flex flex-col gap-1">
          {live.map(({ c, state, result, fine: done }) => {
            const open = openId === c.id;
            return (
              <li key={c.id} className={cx('flex flex-col rounded-panel border bg-panel', state === 'fineable' ? 'border-alert' : 'border-holo-line')} data-testid={`b-case-${c.id}`}>
                <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : c.id)} className="flex min-h-11 items-center gap-2 px-2 text-left" data-testid={`b-case-row-${c.id}`}>
                  <GoodIcon good={c.good} size={16} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{caseShort(view, c)}</span>
                  <span className="shrink-0 font-mono text-[10px] text-ink-3">M{c.month}</span>
                  <StepChip view={view} c={c} state={state} result={result} fined={done} />
                </button>
                {open && (
                  <div ref={(el) => el?.scrollIntoView({ block: 'nearest' })} className="flex flex-col gap-1.5 border-t border-holo-faint p-2" data-testid={`b-case-body-${c.id}`}>
                    <CaseMeta c={c} extra={state === 'fineable' && result === undefined ? howFound(c) : undefined} />
                    {result !== undefined && <Investigate view={view} c={c} left={0} result={result} onInvestigate={() => {}} />}
                    {state === 'open' && result === undefined && <Investigate view={view} c={c} left={sheriff.investigationsLeft} result={undefined} onInvestigate={() => investigate(c.id)} />}
                    {state === 'fineable' && <FineControl view={view} c={c} sheriff={sheriff} onFine={(a) => fine(c.id, a)} />}
                    {done !== undefined && <Fined view={view} c={c} amount={done} multiplier={sheriff.multiplier} />}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {past.length > 0 && (
          <>
            <button type="button" onClick={() => setHistory((h) => !h)} aria-expanded={history} className="flex min-h-11 items-center gap-1 text-xs font-semibold text-holo" data-testid="b-history-toggle">
              {history ? 'Hide' : 'Show'} {past.length} closed or cold
            </button>
            {history && (
              <ul className="flex flex-col gap-1.5" data-testid="b-history">
                {past.map(({ c, state }) => (
                  <li key={c.id} className="rounded-panel border border-holo-faint p-2 opacity-80" data-testid={`b-past-${c.id}`}>
                    <CaseHead view={view} c={c} state={state} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}
