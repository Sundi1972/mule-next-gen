import { POLITICS, type DealCard } from '@mule/engine';
import type { IncidentView, MuleView } from '@mule/protocol';
import { GOOD_NAME, type EventSabotageSeat, type ShowEventView } from '@mule/ui';

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
  const seat = { mine: (me.politics?.sabotage?.mine ?? []).map((o) => o.id), sheriff: view.politics?.sheriff === me.id };
  const laws = view.politics?.laws;
  const cards = me.deals?.cards;
  // The loss only when the view can say it all: the ban in force and this player's own deal cards.
  if (!laws || !cards) return seat;
  const pacts = pactsThisMonth(cards, me.id, view.month);
  const brokeNow = pactsThisMonth(cards.filter((c) => c.status === 'broken'), me.id, view.month);
  return { ...seat, reputation: { ban: laws.sabotageBan?.setting ?? 1, pacts, unsure: unplaced(view, me.id, brokeNow) } };
}

/**
 * The pacts broken this month whose break the view cannot put on this production's catch (review of #750). An
 * investigation in planning can solve an older order on the same partner and break the pact first; then this catch's
 * pactBreach finds no pact and takes no pactBroken, but the card reads the same: broken by me, this month. The view
 * can rule that out only when no older order of mine on that partner was solved by investigation, or when the reveal
 * months (reputationReasons' 'caught', dated the investigation's month) hold none this month beyond this month's own
 * catches. Otherwise: unsure, and the line gives no number.
 */
function unplaced(view: MuleView, me: string, brokeNow: readonly string[]): string[] {
  const mine = view.me?.politics?.sabotage?.mine ?? [];
  const month = view.month;
  const reasons = view.politics?.reputationReasons?.[me];
  const revealedNow = reasons?.filter((r) => r.kind === 'caught' && r.month === month).length;
  const caughtNow = mine.filter((o) => o.month === month && o.how !== null).length;
  const earlierRevealNow = revealedNow === undefined || revealedNow > caughtNow;
  return brokeNow.filter((p) => earlierRevealNow && mine.some((o) => o.month < month && o.victim === p && o.how === 'investigation'));
}

/**
 * The players `me` held a pact with this month, as the engine's pactBetween reads it (running or kept, binding this
 * month), and those this player broke this month: the reveal breaks the pact at production, before the show plays.
 */
function pactsThisMonth(cards: readonly DealCard[], me: string, month: number): string[] {
  return cards
    .filter((c) => c.terms.kind === 'pact' && (c.from === me || c.to === me))
    .filter((c) => ((c.status === 'active' || c.status === 'kept') && c.offered <= month && month <= c.until) || (c.status === 'broken' && c.brokenBy === me && c.settled === month))
    .map((c) => (c.from === me ? c.to : c.from));
}

const shift = `${Math.round(POLITICS.sabotage.orders.rumour.shift * 100)}%`;

/** One incident as the month end's news says it: "Sabotage" and "someone" or a name, never more (MONTH_END). */
export function sabotageNewsLine(view: MuleView, incident: IncidentView): string {
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? 'someone';
  const culprit = incident.culprit === null ? null : name(incident.culprit);
  // WS7: `good` is null on the wire only in an orderer's own list; guarded anyway, the words then name no good.
  const good: string | null = incident.good ? GOOD_NAME[incident.good] : null;
  if (incident.kind === 'rumour') {
    const moved = `moved ${good ? `${good}’s` : 'an'} opening price ${shift} ${incident.dir === 'down' ? 'down' : 'up'}`;
    if (culprit === null) return `Sabotage: a rumour ${moved}.`;
    // WS6, 8 Nov: a rumour that took but was seen says so first, then what it did.
    const opened = good ? ` ${good} opened ${shift} ${incident.dir === 'down' ? 'lower' : 'higher'}.` : '';
    return incident.worked ? `Sabotage: ${culprit} was seen starting a rumour.${opened}` : `Sabotage: ${culprit} was caught starting a rumour${good ? ` on ${good}` : ''}.`;
  }
  const whose = incident.victim === null ? 'a' : `${name(incident.victim)}’s`;
  const plot = good ? `${whose} ${good.toLowerCase()} plot` : `${whose} plot`;
  if (culprit === null) return `Sabotage: someone cut the power to ${plot}.`;
  if (incident.how === 'guard') return `Sabotage: ${culprit} was caught by a guard at ${whose} plot. The power stayed on.`;
  return incident.worked ? `Sabotage: ${culprit} cut the power to ${plot}, and was seen.` : `Sabotage: ${culprit} was seen at ${whose} plot. The power stayed on.`;
}

/** The month end's sabotage news: one line per incident this month, in the order the view lists them. */
export function sabotageNews(view: MuleView): string[] {
  return (view.politics?.sabotage?.incidents ?? []).filter((i) => i.month === view.month).map((i) => sabotageNewsLine(view, i));
}

/**
 * A rumour's good and direction, for the show's whisper and price tag: the event does not carry them (the contract is
 * frozen), the public incident does, and its id is the event's order. Joined by id; every other event, and a rumour
 * with no incident yet, is left as it is. With no incidents the very same array comes back, so a memo holds.
 */
export function withSabotageDetail<E extends ShowEventView>(events: E[], incidents: readonly IncidentView[] | undefined): E[] {
  if (!incidents?.length || !events.some((e) => e.key === 'marketRumour' && e.sabotage)) return events;
  const byId = new Map(incidents.filter((i) => i.kind === 'rumour').map((i) => [i.id, i]));
  return events.map((e) => {
    const i = e.key === 'marketRumour' && e.sabotage ? byId.get(e.sabotage.order) : undefined;
    // No good (WS7: possible on the wire), no detail: the whisper reads "…psst…" alone.
    return i?.good ? { ...e, good: i.good, ...(i.dir ? { dir: i.dir } : {}) } : e;
  });
}
