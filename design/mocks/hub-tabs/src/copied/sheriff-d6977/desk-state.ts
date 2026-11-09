// Copied from politics-p2 (WS8), variant B: design/mocks/politics-p2/src/sheriff/desk-state.ts at d6977e1a (unchanged since 73e797fd),
// for the Sheriff path. TABS: the desk's play goes to the table as the real intents (investigate, fine) and every
// verdict and fine is read back from the view, so the TV, the other phones and the month end follow; WS8's copy
// answered locally from a scripted table.
import type { IncidentView } from '@mule/protocol';
import { useState } from 'react';
import { useClient } from '../../../../../../apps/web/src/net/react';
import type { SheriffState } from '../sheriff/fixture';
import { caseState, type CaseState } from './parts';

/**
 * The desk as the server answers it. `start` is MyView.sheriff (its fineable list already holds a case an
 * investigation just solved); `incidents` are the view's public cases. A case acted on this month is "touched": it
 * shows its verdict or its fine in place and stays where it was in the list, as WS8's desk does.
 */
export function useSheriffDesk(start: SheriffState, incidents: IncidentView[]) {
  const client = useClient();
  const [touched, setTouched] = useState<string[]>([]);
  const touch = (id: string) => setTouched((t) => (t.includes(id) ? t : [...t, id]));
  const cases = incidents.map((c): { c: IncidentView; state: CaseState; result: string | null | undefined; fine: number | undefined } => {
    const mine = touched.includes(c.id);
    return {
      c,
      state: c.fine ? 'closed' : caseState(c, start),
      result: mine && c.investigated ? (c.how === 'investigation' ? c.culprit : null) : undefined,
      fine: mine && c.fine ? c.fine.due : undefined,
    };
  });
  return {
    sheriff: start,
    cases,
    investigate: (id: string) => {
      touch(id);
      client.intent({ type: 'investigate', order: id });
    },
    fine: (id: string, amount: number) => {
      touch(id);
      client.intent({ type: 'fine', order: id, amount });
    },
  };
}
