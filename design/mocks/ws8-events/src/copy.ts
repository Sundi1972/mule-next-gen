import { GOOD_NAME, type Good } from '@mule/ui';
import { TIER, whoLine, type Segment, type ShowEvent } from './events';
import { ownerAt, seat } from './fixture';

/** The words every direction shares, so the three differ in look only. */

export const name = (id: string) => seat(id).name;
export const who = (ev: ShowEvent) => whoLine(ev, name);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const KIND_OF_PLOT: Partial<Record<Good, [string, string]>> = { energy: ['plant', 'plants'], food: ['farm', 'farms'], water: ['well', 'wells'], smithore: ['mine', 'mines'], crystite: ['mine', 'mines'] };
const plots = (good: Good | undefined, n: number) => {
  const [one, many] = (good && KIND_OF_PLOT[good]) ?? ['plot', 'plots'];
  return plural(n, one, many);
};

/** Who a segment is about: a roll call names everyone in it. */
export const whoSeg = (seg: Segment) => (seg.events.length > 1 && seg.events.every((e) => e.player) ? seg.events.map((e) => name(e.player!)).join(' and ') : who(seg.events[0]!));

/** "Bad news" or "Good news", and the count: "1 of 3". */
export const label = (seg: Segment) => `${seg.events[0]!.sign === 'good' ? 'Good news' : 'Bad news'}${seg.count > 1 ? ` · ${seg.n} of ${seg.count}` : ''}`;

/** What the phase's intro says: "3 things happen this month". */
export function introLine(count: number, phase: ShowEvent['phase'], events: ShowEvent[]): string {
  if (events.every((e) => TIER[e.key] === 'bulletin')) return `${plural(events.length, 'colonist')} ${events.length === 1 ? 'is' : 'are'} sick this turn`;
  return count === 1 ? 'Something happens this month' : `${count} things happen this ${phase === 'production' ? 'month' : 'turn'}`;
}

/** The whole segment's effect, for the TV's log: "−11 Energy on 6 plants". */
export function segmentSummary(seg: Segment): string {
  const ev = seg.events[0]!;
  if (ev.key === 'sickness') return `${seg.events.map((e) => name(e.player!)).join(' and ')} walk at half pace`;
  if (ev.key === 'meteorStrike') {
    const h = ev.plots[0]!;
    const owner = ownerAt(h.x, h.y);
    return owner ? `${name(owner)}’s ${h.good ? GOOD_NAME[h.good] : ''} ${plots(h.good, 1).slice(2)} destroyed · a crater` : 'A crater on open land';
  }
  const total = ev.plots.reduce((n, h) => n + h.delta, 0);
  const good = ev.plots[0]?.good;
  const owner = ev.player ? `${name(ev.player)}: ` : '';
  return `${owner}${total < 0 ? '−' : '+'}${Math.abs(total)} ${good ? GOOD_NAME[good] : ''} on ${plots(good, ev.plots.length)}`;
}

/** What the segment did to one player, for their phone; null when it missed them. */
export function youSummary(seg: Segment, id: string): { headline: string; detail: string; change: Partial<Record<Good, number>>; sick?: boolean } | null {
  const ev = seg.events[0]!;
  if (ev.key === 'sickness') {
    const mine = seg.events.find((e) => e.player === id);
    if (!mine) return null;
    return { headline: 'You’re sick', detail: `You walk at half pace this turn. Why: ${mine.because}.`, change: {}, sick: true };
  }
  const change: Partial<Record<Good, number>> = {};
  let n = 0;
  let lost = false;
  for (const e of seg.events)
    for (const h of e.plots)
      if (ownerAt(h.x, h.y) === id) {
        n++;
        if (h.good) change[h.good] = (change[h.good] ?? 0) + h.delta;
        if (h.muleLost) lost = true;
      }
  if (n === 0) return null;
  const [g, total] = (Object.entries(change) as [Good, number][])[0]!;
  return {
    headline: lost ? 'Your MULE was destroyed' : `${total < 0 ? '−' : '+'}${Math.abs(total)} ${GOOD_NAME[g]} for you`,
    detail: lost ? 'The plot is a crater now: rich in Crystite, empty until you outfit it.' : `On ${plots(g, n)} of yours, this month only.`,
    change,
  };
}

/** For the phone when an event missed you: where it went instead. */
export function missLine(seg: Segment): string {
  const ev = seg.events[0]!;
  if (ev.key === 'sickness') return `You’re well. ${seg.events.map((e) => name(e.player!)).join(' and ')} walk at half pace.`;
  if (ev.key === 'meteorStrike') return `Not your land: ${segmentSummary(seg).replace(' · a crater', '')}.`;
  return ev.player ? `Not your land: it hit ${name(ev.player)}.` : 'Your plots are clear of it.';
}
