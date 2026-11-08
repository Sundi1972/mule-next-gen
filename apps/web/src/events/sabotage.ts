import { POLITICS } from '@mule/engine';
import type { IncidentView, MuleView } from '@mule/protocol';
import { GOOD_NAME, type EventSabotageSeat } from '@mule/ui';

/**
 * Sabotage's words off the show (slice 4, S4-C17), the approved mock's: design/mocks/politics-p2 @ d6977e1a,
 * src/show/P10Page.tsx (Heiko, 8 Nov). Names, never pronouns; a culprit only when the view names one.
 */

/**
 * What this phone knows of sabotage beyond the public event, for its private line after the show: its own orders'
 * ids (its MyView only) and whether its player is the Sheriff. Undefined on a screen with no player (the TV).
 */
export function sabotageSeat(view: MuleView): EventSabotageSeat | undefined {
  const me = view.me;
  if (!me) return undefined;
  return { mine: (me.politics?.sabotage?.mine ?? []).map((o) => o.id), sheriff: view.politics?.sheriff === me.id };
}

const shift = `${Math.round(POLITICS.sabotage.orders.rumour.shift * 100)}%`;

/** One incident as the month end's news says it: "Sabotage" and "someone" or a name, never more (MONTH_END). */
export function sabotageNewsLine(view: MuleView, incident: IncidentView): string {
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? 'someone';
  const culprit = incident.culprit === null ? null : name(incident.culprit);
  const good = GOOD_NAME[incident.good];
  if (incident.kind === 'rumour') {
    const moved = `moved ${good}’s opening price ${shift} ${incident.dir === 'down' ? 'down' : 'up'}`;
    if (culprit === null) return `Sabotage: a rumour ${moved}.`;
    return incident.worked ? `Sabotage: ${culprit}’s rumour ${moved}, and was seen.` : `Sabotage: ${culprit} was caught starting a rumour on ${good}.`;
  }
  const whose = incident.victim === null ? 'a' : `${name(incident.victim)}’s`;
  const plot = `${whose} ${good.toLowerCase()} plot`;
  if (culprit === null) return `Sabotage: someone cut the power to ${plot}.`;
  if (incident.how === 'guard') return `Sabotage: ${culprit} was caught by a guard at ${whose} plot. The power stayed on.`;
  return incident.worked ? `Sabotage: ${culprit} cut the power to ${plot}, and was seen.` : `Sabotage: ${culprit} was seen at ${whose} plot. The power stayed on.`;
}

/** The month end's sabotage news: one line per incident this month, in the order the view lists them. */
export function sabotageNews(view: MuleView): string[] {
  return (view.politics?.sabotage?.incidents ?? []).filter((i) => i.month === view.month).map((i) => sabotageNewsLine(view, i));
}
