import type { Good, OverruleWhy } from '@mule/engine';
import type { BudgetView, MuleView, OverruleView } from '@mule/protocol';
import { GOOD_NAME } from '@mule/ui';

/* The words every budget and overrule screen shares, so the phone, the TV and the month end say the same thing the same way. */

export type LineId = BudgetView['lines'][number]['line'];

export const LINE_NAME: Record<LineId, string> = { projects: 'Projects', welfare: 'Welfare', security: 'Security' };

/** "432 cr": a share's credits at today's fund (budgetCredits), as §3's worked example states them (AM-5). */
export const about = (credits: number) => `${credits.toLocaleString('en')} cr`;

/** "a, b and c". */
const and = (parts: string[]) => (parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`);

/** Each open building and what it still needs, in commission order, from the colony view's cost and funded (AM-7). */
export function stillNeeds(view: Pick<MuleView, 'colony'>): string[] {
  return (view.colony?.projects ?? [])
    .filter((p) => p.stage === 'commissioned')
    .map((p) => {
      const credits = p.cost.credits - p.funded.credits;
      const goods = (Object.entries(p.cost.goods) as [Good, number][]).map(([g, n]) => [g, n - (p.funded.goods[g] ?? 0)] as const).filter(([, n]) => n > 0);
      const parts = [...(credits > 0 ? [about(credits)] : []), ...goods.map(([g, n]) => `${n} ${GOOD_NAME[g]}`)];
      return parts.length ? `the ${p.name} still needs ${and(parts)}` : `the ${p.name} has all it needs`;
    });
}

/**
 * A line's words after its share, the same on every screen: "up to 432 cr · the Observatory still needs 350 cr and 2
 * Crystite" (AM-7: the Projects share is a ceiling; each building takes only what it still needs), "54 cr to Kai, last
 * on Worth".
 */
export function lineWords(line: LineId, view: Pick<MuleView, 'players' | 'colony'>, welfareTo: string | null, credits: number): string {
  if (line === 'welfare') {
    if (credits === 0) return 'nothing this month';
    const to = view.players.find((p) => p.id === welfareTo)?.name;
    return `${about(credits)} ${to ? `to ${to}, last on Worth` : 'to whoever is last on Worth'}`;
  }
  if (credits === 0) return 'nothing to buildings';
  const needs = stillNeeds(view);
  return `up to ${about(credits)} · ${needs.length ? needs.join(' · ') : 'no building is waiting'}`;
}

/** The kept line's words (AM-7): what the share keeps, and what the buildings don't take stays too. */
export const keptWords = (credits: number) => (credits > 0 ? `${about(credits)}, and what the buildings don’t take` : 'what the buildings don’t take');

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

/** Why the call button is not there while the tax has moved and a caller still cannot call: the engine's own words for the two reasons a phone can see. */
export const OVERRULE_REFUSAL: Partial<Record<OverruleWhy, string>> = {
  notNow: 'Call an overrule once the votes are over',
  noGovernor: 'There is no Governor to overrule',
};
