// Copied from politics-p2 (WS8), variant B: design/mocks/politics-p2/src/sheriff/desk-state.ts at 73e797fd. Not redesigned; changes for the tabs are marked TABS:.
import type { IncidentView } from '@mule/protocol';
import { useState } from 'react';
import { INVESTIGATION, type SheriffState } from './fixture';
import { caseState, type CaseState } from './parts';

/**
 * The desk's local play, as the server would answer it: an investigation's verdict (scripted per case), a fine sent.
 * A solved case joins `fineable`, as the server would list it, so the reviewer can fine straight after.
 */
export function useSheriffDesk(start: SheriffState, incidents: IncidentView[]) {
  const [results, setResults] = useState<Record<string, string | null>>({});
  const [fined, setFined] = useState<Record<string, number>>({});
  const used = Object.keys(results).length;
  const sheriff: SheriffState = {
    ...start,
    investigationsLeft: Math.max(0, start.investigationsLeft - used),
    fineable: [...start.fineable, ...Object.entries(results).filter(([, who]) => who).map(([id]) => id)].filter((id) => !(id in fined)),
  };
  const cases = incidents.map((c): { c: IncidentView; state: CaseState; result: string | null | undefined; fine: number | undefined } => {
    const result = c.id in results ? results[c.id]! : undefined;
    const solved = result ? { ...c, culprit: result, how: 'investigation' as const } : result === null ? { ...c, investigated: true } : c;
    return { c: solved, state: c.id in fined ? 'closed' : caseState(solved, sheriff), result, fine: fined[c.id] };
  });
  return {
    sheriff,
    cases,
    investigate: (id: string) => setResults((r) => ({ ...r, [id]: INVESTIGATION[id] ?? null })),
    fine: (id: string, amount: number) => setFined((f) => ({ ...f, [id]: amount })),
  };
}
