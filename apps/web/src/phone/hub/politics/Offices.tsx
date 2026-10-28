import { useEffect } from 'react';
import { usePhoneGame } from '../../game';
import { useHub } from '../Hub';
import { Who } from './parts';

/** Who holds which office, the Land Baron and the next election, across the top of planning. */
export function Offices() {
  const { view, self } = usePhoneGame();
  const politics = view.politics!;
  const { governor, sheriff, baron, term, next, election } = politics;
  useElectionDesks(election?.stage ?? null, governor === self.id);
  const open = election !== null && election.stage !== 'over';
  const note = open ? `ELECTION NOW${next ? ` · NEXT M${next}` : ''}` : next ? `NEXT ELECTION M${next}` : null;
  const terms = term ? `M${term[0]}–${term[1]}` : '';
  const plots = view.players.find((p) => p.id === baron)?.plots ?? 0;
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control border border-holo-line bg-panel px-2 py-1 text-xs @min-[1100px]/shell:gap-x-5 @min-[1100px]/shell:px-3 @min-[1100px]/shell:py-1.5 @min-[1100px]/shell:text-sm"
      data-testid="offices"
    >
      {governor && (
        <span>
          Governor <Who view={view} id={governor} size={14} /> <span className="font-mono text-ink-3">{terms}</span>
        </span>
      )}
      {sheriff && (
        <span>
          Sheriff <Who view={view} id={sheriff} size={14} /> <span className="font-mono text-ink-3">{terms}</span>
        </span>
      )}
      {baron && (
        <span>
          Land Baron <Who view={view} id={baron} size={14} /> <span className="font-mono text-ink-3">{plots} PLOTS</span>
        </span>
      )}
      {note && <span className="ml-auto font-mono text-ink-3">{note}</span>}
    </div>
  );
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
