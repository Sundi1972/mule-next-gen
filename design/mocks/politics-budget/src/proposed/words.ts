import type { BudgetView, MuleView, OverruleView } from '@mule/protocol';

/*
 * GRAFT TARGET: apps/web/src/phone/hub/politics/words.ts. The words every P12–P15 screen shares, so the phone, the TV and
 * the month end say the same thing the same way.
 */

export type LineId = BudgetView['lines'][number]['line'];

export const LINE_NAME: Record<LineId, string> = { projects: 'Projects', welfare: 'Welfare', security: 'Security' };

/** "432 cr": a share's credits at today's fund (budgetCredits), as §3's worked example states them (AM-5). */
export const about = (credits: number) => `${credits.toLocaleString('en')} cr`;

/** Where a line's money goes, in a few words: "toward the Observatory", "to Kai, last on Worth". */
export function lineGoes(line: LineId, view: Pick<MuleView, 'players' | 'colony'>, welfareTo: string | null, credits: number): string {
  if (credits === 0) return line === 'welfare' ? 'nothing this month' : 'nothing to buildings';
  if (line === 'welfare') {
    const to = view.players.find((p) => p.id === welfareTo)?.name;
    return to ? `to ${to}, last on Worth` : 'to whoever is last on Worth';
  }
  const open = (view.colony?.projects ?? []).filter((p) => p.stage === 'commissioned' || p.stage === 'building');
  return open.length === 0 ? 'for the next building commissioned' : `toward the ${open.map((p) => p.name).join(', then the ')}`;
}

/** "Welfare 0% → 10%" when a line moved this month; just "Welfare 10%" when it didn't. */
export const shareChange = (start: number, share: number) => (start === share ? `${share}%` : `${start}% → ${share}%`);

/** The overrule's question, with what Yes restores against what stands now (P13, P14). */
export function overruleQuestion(o: Pick<OverruleView, 'restores' | 'stands'>): { question: string; startNow: string; restore: number; now: number } {
  const restore = 'tax' in o.restores ? o.restores.tax : 0;
  const now = 'tax' in o.stands ? o.stands.tax : 0;
  return { question: 'Undo the Governor’s tax?', startNow: `${restore}% at the month’s start → ${now}% now`, restore, now };
}

/** "needs 5 of 9 votes" — of all the table's votes, so not voting counts against it (S5-RULE-8). */
export const neededWords = (o: Pick<OverruleView, 'needed' | 'total'>) => `needs ${o.needed} of ${o.total} votes`;

/** The verdict line, the same on every screen: "Yes 6 · needed 5: Overruled, the tax goes back to 5%". */
export function verdictWords(o: Pick<OverruleView, 'needed' | 'restores' | 'stands'>, r: NonNullable<OverruleView['result']>): { stamp: string; line: string } {
  const { restore, now } = overruleQuestion(o);
  return r.passed
    ? { stamp: 'Overruled', line: `Yes ${r.yes} · needed ${o.needed}: Overruled, the tax goes back to ${restore}%` }
    : { stamp: 'It stands', line: `Yes ${r.yes} · needed ${o.needed}: The Governor’s tax stands at ${now}%` };
}
