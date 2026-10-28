import type { Office } from '@mule/engine';
import type { PoliticsView } from '@mule/protocol';
import { Fragment, useEffect } from 'react';
import { usePhoneGame } from '../../game';
import { useHub } from '../Hub';
import { Who } from './parts';
import { OFFICE_NAME } from './words';

/** Who holds which office until when, and the next election, as one line on the hub; it opens the election's desks. */
export function Offices() {
  const { view, self } = usePhoneGame();
  const { governor, election } = view.politics!;
  useElectionDesks(election?.stage ?? null, governor === self.id);
  return <OfficesLine />;
}

/** The offices line alone: "Governor: Kai, until month 6 · Next election: month 7". */
export function OfficesLine() {
  const { view } = usePhoneGame();
  const politics = view.politics!;
  const held = (['governor', 'sheriff'] as const).flatMap((office) => (politics[office] ? [{ office, id: politics[office] }] : []));
  const next = nextElection(view.month, politics);
  if (held.length === 0 && next === null) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-1 text-[11px] text-ink-2 @min-[1100px]/shell:gap-x-1.5 @min-[1100px]/shell:text-sm" data-testid="roadmap-offices">
      {held.map(({ office, id }, i) => (
        <Fragment key={office}>
          {i > 0 && '·'}
          <OfficeHolder office={office} id={id} until={politics.term?.[1] ?? null} />
        </Fragment>
      ))}
      {next !== null && (
        <>
          {held.length > 0 && '·'}
          <span data-testid="next-election">Next election: month {next}</span>
        </>
      )}
    </p>
  );
}

function OfficeHolder({ office, id, until }: { office: Office; id: string; until: number | null }) {
  const { view } = usePhoneGame();
  return (
    <span data-testid={`office-${office}`}>
      {OFFICE_NAME[office]}: <Who view={view} id={id} size={12} />
      {until !== null && `, until month ${until}`}
    </span>
  );
}

/** This month's election until its result is out; then the next one, or null when the game ends first. */
function nextElection(month: number, { election, next }: PoliticsView): number | null {
  return election !== null && election.stage !== 'over' ? month : next;
}

/** Each election stage opens the Council desk; once it is over, the new Governor's phone opens the tax desk. */
function useElectionDesks(stage: string | null, governor: boolean): void {
  const { openDesk } = useHub();
  useEffect(() => {
    if (stage === 'announce' || stage === 'ballot' || stage === 'ceremony') openDesk('council');
    else if (stage === 'over' && governor) openDesk('governor');
    // Only a new stage or a new office moves the rail; openDesk is a new function on every render.
  }, [stage, governor]);
}
