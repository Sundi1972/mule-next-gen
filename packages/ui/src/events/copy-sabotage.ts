import { POLITICS } from '@mule/engine';
import { GOOD_NAME } from '../components/tokens';
import { percent } from './catalogue';
import type { ShowCast } from './frame';
import type { EventSabotageSeat, ShowEventView } from './types';

/**
 * Each phone's private line once a sabotage event has played (S4-C17), the approved mock's words: design/mocks/
 * politics-p2 @ d6977e1a, src/show/P10Page.tsx PHONE_LINES. Only the people it concerns get one: the order's own
 * phone, the Sheriff's and the cut plot's owner, in that order of precedence. Names, never pronouns. A culprit is named
 * only when the event names one (`sabotage.culprit`); the orderer's own phone knows its order by id (`seat.mine`).
 */

export interface SabotageYou {
  /** The phone's one line. */
  line: string;
  /** The rail's one-word list entry. */
  short: string;
  tone: 'ok' | 'alert' | 'ink';
}

const MINUS = '−';
const reputation = `${MINUS}${Math.abs(POLITICS.reputation.moves.caught)} reputation; the Sheriff can fine you.`;

/** What a sabotage event says to `me`, or null when it is not theirs to hear. */
export function sabotageYou(ev: ShowEventView, me: string, cast: ShowCast, seat?: EventSabotageSeat): SabotageYou | null {
  const sab = ev.sabotage;
  if (!sab) return null;
  const culprit = sab.culprit === null ? null : cast.name(sab.culprit);
  const mine = seat?.mine.includes(sab.order) === true;
  if (ev.key === 'powerCut') {
    const owner = cast.ownerAt(ev.origin.x, ev.origin.y);
    const good = cast.goodAt(ev.origin.x, ev.origin.y);
    const plot = good ? `${GOOD_NAME[good].toLowerCase()} plot` : 'plot';
    const whose = owner === me ? 'your' : owner === null ? 'a' : `${cast.name(owner)}’s`;
    if (mine) {
      if (culprit === null) return sab.worked ? { line: `Your crew cut the power to ${whose} ${plot}. Nobody saw. ${POLITICS.sabotage.orders.powerCut.cost} cr at the month end.`, short: 'nobody saw', tone: 'ok' } : null;
      if (sab.guarded) return { line: `Caught by a guard at ${whose} plot. ${reputation}`, short: 'caught', tone: 'alert' };
      return sab.worked
        ? { line: `The cut worked, but you were seen. ${reputation}`, short: 'seen', tone: 'alert' }
        : { line: `Your crew was seen, and the cut did not work. ${reputation}`, short: 'seen', tone: 'alert' };
    }
    if (seat?.sheriff) {
      if (culprit === null) return { line: `A new case: a power cut on ${whose} ${plot}. Investigate it in planning.`, short: 'a new case', tone: 'ink' };
      if (sab.guarded) return { line: `Your guard caught ${culprit} at ${whose} plot. Fine ${culprit} in planning.`, short: `fine ${culprit}`, tone: 'ok' };
      return sab.worked
        ? { line: `${culprit} was seen cutting ${whose} power. Fine ${culprit} in planning.`, short: `fine ${culprit}`, tone: 'ink' }
        : { line: `${culprit} was seen at ${whose} plot. Fine ${culprit} in planning.`, short: `fine ${culprit}`, tone: 'ink' };
    }
    if (owner !== me) return null;
    if (culprit === null) return { line: `Your ${plot} went dark: sabotage. It makes nothing this month.`, short: 'plot dark', tone: 'alert' };
    if (sab.guarded) return { line: `A guard caught ${culprit} at your ${plot}. The power stayed on.`, short: 'power on', tone: 'ok' };
    return sab.worked
      ? { line: `Your ${plot} went dark. ${culprit} was seen doing it.`, short: 'plot dark', tone: 'alert' }
      : { line: `${culprit} was seen at your ${plot}. The power stayed on.`, short: 'power on', tone: 'ok' };
  }
  // A rumour has no victim: only its orderer and the Sheriff hear of it.
  const good = ev.good ? GOOD_NAME[ev.good] : undefined;
  const on = good ? ` on ${good}` : '';
  if (mine) {
    if (culprit === null) {
      if (!sab.worked) return null;
      const took = good && ev.dir ? `: ${good} opens ${percent(POLITICS.sabotage.orders.rumour.shift)} ${ev.dir === 'up' ? 'higher' : 'lower'} at the auction` : '';
      return { line: `Your rumour took${took}. Nobody saw.`, short: 'nobody saw', tone: 'ok' };
    }
    return sab.worked
      ? { line: `Your rumour took, but you were seen. ${reputation}`, short: 'seen', tone: 'alert' }
      : { line: `Your rumour was seen and did not take. ${reputation}`, short: 'seen', tone: 'alert' };
  }
  if (!seat?.sheriff) return null;
  if (culprit === null) return { line: `A new case: a rumour${on}. Investigate it in planning.`, short: 'a new case', tone: 'ink' };
  return { line: `${culprit} was seen starting a rumour${on}. Fine ${culprit} in planning; it all goes to the fund.`, short: `fine ${culprit}`, tone: 'ink' };
}
