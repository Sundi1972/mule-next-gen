import { GOOD_NAME, type Good } from '@mule/ui';
import { CAUGHT_MOVE, NAME, RUMOUR_SHIFT, SAB_TERMS, VICTIM_SHARE, type SabOrder } from './fixture';
import { incidentOf } from './fixture';

/*
 * The Sheriff path's words. Every line is WS8's (#p10's PHONE_LINES and MONTH_END, design/mocks/politics-p2 at
 * d6977e1a), which #750 builds word for word, or the spec's ("What the table sees", docs/specs/2026-11-07-ws7-slice4-
 * sabotage.md), with this table's names: the victim is Brix, the Sheriff Kai. A good is capitalised ("Food plot"),
 * as the spec and the PM's 8 Nov ruled lines write it. Every number comes from the config, via the fixture.
 */

const name = (id: string | null) => (id ? (NAME[id] ?? id) : 'someone');
const good = (g: Good) => GOOD_NAME[g];
const pts = (n: number) => `−${Math.abs(n)}`;
/** The victim's share of a fine, in words: "half" at 0.5, as the spec says it. */
const share = () => (VICTIM_SHARE === 0.5 ? 'half' : `${Math.round(VICTIM_SHARE * 100)}%`);

export type Role = 'culprit' | 'victim' | 'sheriff' | 'other';

/** Production: the private line each phone gets after the show (#750's PHONE_LINES, in the rail's "what it did to you" card). Null: nothing for this seat. */
export function productionLine(o: SabOrder, seat: string, sheriff: string): { line: string; tone: 'alert' | 'ok' | 'ink' } | null {
  const c = incidentOf(o);
  const victim = c.victim;
  const role: Role = seat === o.by ? 'culprit' : seat === sheriff ? 'sheriff' : seat === victim ? 'victim' : 'other';
  const at = (who: string | null) => (who === seat ? 'your plot' : `${name(who)}’s plot`);
  if (o.guarded) {
    if (role === 'culprit') return { line: `Caught by a guard at ${at(victim)}. ${pts(CAUGHT_MOVE)} reputation; the Sheriff can fine you.`, tone: 'alert' };
    if (role === 'victim') return { line: `A guard caught ${name(o.by)} at your ${good(c.good)} plot. The power stayed on.`, tone: 'ok' };
    if (role === 'sheriff') return { line: `Your guard caught ${name(o.by)} at ${at(victim)}. Fine ${name(o.by)} in planning.`, tone: 'ok' };
    return null;
  }
  if (o.target.kind === 'powerCut' && o.worked && !o.seen) {
    if (role === 'culprit') return { line: `Your crew cut the power to ${name(victim)}’s ${good(c.good)} plot. Nobody saw. ${SAB_TERMS.powerCut.cost} cr at the month end.`, tone: 'ok' };
    if (role === 'victim') return { line: `Your ${good(c.good)} plot went dark: sabotage. It makes nothing this month.`, tone: 'alert' };
    if (role === 'sheriff') return { line: `A new case: a power cut on ${name(victim)}’s ${good(c.good)} plot. Investigate it in planning.`, tone: 'ink' };
    return null;
  }
  return null;
}

/** The month end's news line for an order resolved this month, everyone's: "Sabotage" and "someone" or a name, never more (#p10's MONTH_END). */
export function monthEndNews(o: SabOrder): string {
  const c = incidentOf(o);
  if (o.guarded) return `Sabotage: ${name(o.by)} was caught by a guard at ${name(c.victim)}’s plot. The power stayed on.`;
  if (o.target.kind === 'powerCut') return c.culprit ? `Sabotage: ${name(c.culprit)} cut the power to ${name(c.victim)}’s ${good(c.good)} plot, and was seen.` : `Sabotage: someone cut the power to ${name(c.victim)}’s ${good(c.good)} plot.`;
  const pct = `${Math.round(RUMOUR_SHIFT * 100)}%`;
  // Seen: the PM's ruled line (8 Nov), "Sabotage: Lena was seen starting a rumour. Food opened 25% higher."
  if (c.culprit) return `Sabotage: ${name(c.culprit)} was seen starting a rumour.${c.worked ? ` ${good(c.good)} opened ${pct} ${c.dir === 'down' ? 'lower' : 'higher'}.` : ''}`;
  return `Sabotage: a rumour moved ${good(c.good)}’s opening price ${pct} ${c.dir === 'down' ? 'down' : 'up'}.`;
}

/** A fine paid at this month end, everyone's (the spec's month-end row): "Lena was fined 150 for sabotage; half to Brix". */
export function fineNews(o: SabOrder): string {
  const c = incidentOf(o);
  return `${name(o.by)} was fined ${o.fine!.due} for sabotage${c.victim ? `; ${share()} to ${name(c.victim)}` : ''}.`;
}

/** This seat's own month-end lines (the spec's month-end row): the crew it paid, a fine it paid, restitution it got. */
export function ownMonthEnd(orders: SabOrder[], month: number, seat: string): { id: string; label: string; amount: string; tone: 'alert' | 'ok' }[] {
  const out: { id: string; label: string; amount: string; tone: 'alert' | 'ok' }[] = [];
  for (const o of orders) {
    if (o.by === seat && o.month === month) out.push({ id: `crew-${o.id}`, label: 'Sabotage crew', amount: `${SAB_TERMS[o.target.kind].cost} cr`, tone: 'alert' });
    if (o.fine && o.finedMonth === month) {
      const victim = incidentOf(o).victim;
      if (o.by === seat) out.push({ id: `fine-${o.id}`, label: 'Sabotage fine', amount: `${o.fine.due} cr`, tone: 'alert' });
      if (victim === seat && o.fine.toVictim > 0) out.push({ id: `restitution-${o.id}`, label: `Restitution (${share()} of ${name(o.by)}’s fine)`, amount: `+${o.fine.toVictim} cr`, tone: 'ok' });
    }
  }
  return out;
}

/** The investigation's verdict, as the TV's moment and the Sheriff's desk say it (the spec's planning row). */
export const verdictWords = (o: SabOrder) => (o.solved ? `Solved by the Sheriff: it was ${name(o.by)}` : 'The trail went cold');
