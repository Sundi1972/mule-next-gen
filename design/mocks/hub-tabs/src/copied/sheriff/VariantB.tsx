// Copied from politics-p2 (WS8), variant B: design/mocks/politics-p2/src/sheriff/VariantB.tsx at 73e797fd. Not redesigned; changes for the tabs are marked TABS:.
import type { IncidentView, MuleView } from '@mule/protocol';
import { cx } from '@mule/ui';
import { useState } from 'react';
import type { SheriffState } from './fixture';
import { useSheriffDesk } from './desk-state';
import { CaseHead, DeskHead, DeskWaits, FineControl, Fined, GuardLine, howFound, Investigate, type CaseState } from './parts';

/**
 * Variant B, "the case file": guards stay a single line at the top, and every sabotage the colony has seen is one case,
 * newest first. A case carries only its next step: Investigate while unsolved, Fine once revealed, nothing once fined or
 * cold. Closed and cold cases fold under one line so the open work stays on top.
 */
const ORDER: Record<CaseState, number> = { fineable: 0, open: 1, cold: 2, closed: 3 };

export function SheriffDeskB({ view, start, incidents, onMap }: { view: MuleView; start: SheriffState; incidents: IncidentView[]; onMap(): void }) {
  const { sheriff, cases, investigate, fine } = useSheriffDesk(start, incidents);
  const [history, setHistory] = useState(false);
  if (sheriff.canAct !== true) return <><DeskHead sheriff={sheriff} /><DeskWaits why={sheriff.canAct} /></>;
  // A case touched this month stays where it was, so it does not jump from under the thumb.
  const live = cases.filter((k) => k.state === 'open' || k.state === 'fineable' || k.result !== undefined || k.fine !== undefined);
  const past = cases.filter((k) => !live.includes(k));
  live.sort((a, b) => (a.result !== undefined || a.fine !== undefined ? 0 : ORDER[a.state]) - (b.result !== undefined || b.fine !== undefined ? 0 : ORDER[b.state]) || b.c.month - a.c.month);
  return (
    <div className="flex flex-col gap-3" data-testid="sheriff-desk-b">
      <DeskHead sheriff={sheriff} />
      <div className="rounded-panel border border-holo-line bg-panel p-2" data-testid="b-guard">
        <GuardLine view={view} sheriff={sheriff} onMap={onMap} compact />
      </div>
      <section className="flex flex-col gap-1.5" data-testid="b-cases">
        <h3 className="label-caps flex items-center gap-1.5 @min-[1100px]/shell:text-xs!">Cases</h3>
        {live.length === 0 && <p className="text-xs text-ink-3" data-testid="b-no-cases">No open case: nothing to investigate or fine.</p>}
        <ul className="flex flex-col gap-2">
          {live.map(({ c, state, result, fine: done }) => (
            <li key={c.id} className={cx('flex flex-col gap-1.5 rounded-panel border bg-panel p-2', state === 'fineable' ? 'border-alert' : 'border-holo-line')} data-testid={`b-case-${c.id}`}>
              <CaseHead view={view} c={c} state={state} solved={result} />
              {result !== undefined && <Investigate view={view} c={c} left={0} result={result} onInvestigate={() => {}} />}
              {state === 'open' && result === undefined && <Investigate view={view} c={c} left={sheriff.investigationsLeft} result={undefined} onInvestigate={() => investigate(c.id)} />}
              {state === 'fineable' && result === undefined && <span className="text-[11px] text-ink-2">{howFound(c)}</span>}
              {state === 'fineable' && <FineControl view={view} c={c} sheriff={sheriff} onFine={(a) => fine(c.id, a)} />}
              {done !== undefined && <Fined view={view} c={c} amount={done} multiplier={sheriff.multiplier} />}
            </li>
          ))}
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
