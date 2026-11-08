import type { IncidentView, MuleView } from '@mule/protocol';
import { Section } from '../../../../../apps/web/src/phone/hub/politics/parts';
import type { SheriffState } from '../fixture';
import { useSheriffDesk } from './desk-state';
import { CaseHead, DeskHead, DeskWaits, FineControl, Fined, GuardLine, howFound, Investigate } from './parts';

/**
 * Variant A, "three jobs": the desk reads as the office's three powers, each its own section, in the order a month uses
 * them. Guards (where to stand this month), Investigate (the open cases), Fine (the revealed culprits). Closed and cold
 * cases are not on the desk; they are history, and the month end and the standings carry them.
 */
export function SheriffDeskA({ view, start, incidents, onMap }: { view: MuleView; start: SheriffState; incidents: IncidentView[]; onMap(): void }) {
  const { sheriff, cases, investigate, fine } = useSheriffDesk(start, incidents);
  if (sheriff.canAct !== true) return <><DeskHead sheriff={sheriff} /><DeskWaits why={sheriff.canAct} /></>;
  const open = cases.filter((k) => k.state === 'open' || (k.result !== undefined && k.state !== 'fineable'));
  const fines = cases.filter((k) => k.state === 'fineable' || k.fine !== undefined);
  return (
    <div className="flex flex-col gap-3" data-testid="sheriff-desk-a">
      <DeskHead sheriff={sheriff} />
      <Section title="Guard" testid="a-guard">
        <GuardLine view={view} sheriff={sheriff} onMap={onMap} />
      </Section>
      <Section title={`Investigate · ${sheriff.investigationsLeft} left this month`} testid="a-investigate">
        {open.length === 0 ? (
          <p className="text-xs text-ink-3" data-testid="a-no-cases">No unsolved sabotage. Nothing to investigate.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {open.map(({ c, state, result }) => (
              <li key={c.id} className="flex flex-col gap-1.5 rounded-panel border border-holo-line bg-panel p-2" data-testid={`a-case-${c.id}`}>
                <CaseHead view={view} c={c} state={state} solved={result} />
                <Investigate view={view} c={c} left={sheriff.investigationsLeft} result={result} onInvestigate={() => investigate(c.id)} />
              </li>
            ))}
          </ul>
        )}
      </Section>
      {fines.length > 0 && (
        <Section title="Fine" testid="a-fine">
          <ul className="flex flex-col gap-2">
            {fines.map(({ c, state, fine: done }) => (
              <li key={c.id} className="flex flex-col gap-1.5 rounded-panel border border-alert bg-panel p-2" data-testid={`a-fine-${c.id}`}>
                <CaseHead view={view} c={c} state={state} />
                <span className="text-[11px] text-ink-2">{howFound(c)}</span>
                {done !== undefined ? <Fined view={view} c={c} amount={done} multiplier={sheriff.multiplier} /> : <FineControl view={view} c={c} sheriff={sheriff} onFine={(a) => fine(c.id, a)} />}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
