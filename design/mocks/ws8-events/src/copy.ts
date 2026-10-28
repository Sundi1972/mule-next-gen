import { GOOD_NAME, type Good } from '@mule/ui';
import type { EventKey, Phase } from './catalogue';
import { TIER, whoLine, type Effect, type Segment, type ShowEvent } from './events';
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
const signed = (n: number) => `${n < 0 ? '−' : '+'}${Math.abs(n)}`;
const period = (phase: Phase) => (phase === 'development' ? 'turn' : 'month');
const names = (evs: ShowEvent[]) => evs.map((e) => name(e.player!)).join(' and ');
const allSick = (evs: ShowEvent[]) => evs.every((e) => e.key === 'sickness');
const lower = (w: string) => (/^[A-Z][a-z]/.test(w) ? w[0]!.toLowerCase() + w.slice(1) : w);
const named = (f: Effect) => `${name(f.on)} ${lower(effectWords(f))}`;

/** One effect in a few words: "−64 cr", "Reputation −1", "Food demand +25%". */
export function effectWords(f: Effect): string {
  const n = `${signed(f.delta)}${f.pct ? '%' : ''}`;
  switch (f.what) {
    case 'cash':
    case 'fund':
      return `${n} cr`;
    case 'pace':
      return `${100 + f.delta}% pace${f.turns ? `, ${f.turns} turns` : ''}`;
    case 'reputation':
      return `Reputation ${n}`;
    case 'mood':
      return `Mood ${n}`;
    case 'prestige':
      return `Prestige ${n}`;
    case 'air':
      return `Air ${n}`;
    case 'colonists':
      return `Colonists ${n}`;
    case 'demand':
      return `${f.good ? GOOD_NAME[f.good] : ''} demand ${n}`.trim();
    case 'price':
      return `${f.good ? GOOD_NAME[f.good] : ''} price ${n}`.trim();
    case 'energyNeed':
      return `Energy need ${n}`;
    case 'mules':
      return 'No MULEs for sale';
    default:
      return `${n} ${GOOD_NAME[f.what]}`;
  }
}

/** Who a segment is about: a roll call names everyone in it. */
export const whoSeg = (seg: Segment) => (seg.events.length > 1 && seg.events.every((e) => e.player) ? names(seg.events) : who(seg.events[0]!));

/** "Bad news", "Good news" or, for a mix or the colony plot, "News"; and the count: "1 of 3". */
export function label(seg: Segment): string {
  const signs = new Set(seg.events.map((e) => e.sign));
  const word = signs.size > 1 || signs.has('neutral') ? 'News' : signs.has('good') ? 'Good news' : 'Bad news';
  return `${word}${seg.count > 1 ? ` · ${seg.n} of ${seg.count}` : ''}`;
}

/** What the phase's intro says: "3 things happen this month". */
export function introLine(count: number, phase: Phase, events: ShowEvent[]): string {
  if (events.every((e) => TIER[e.key] === 'bulletin')) {
    if (allSick(events)) return `${plural(events.length, 'colonist')} ${events.length === 1 ? 'is' : 'are'} sick this turn`;
    return `${events.length === 1 ? 'One piece' : `${events.length} pieces`} of news this ${period(phase)}`;
  }
  return count === 1 ? `Something happens this ${period(phase)}` : `${count} things happen this ${period(phase)}`;
}

/** What one event did, for the TV's log: "−11 Energy on 6 plants", "Kai +260 cr". */
function eventSummary(ev: ShowEvent): string {
  const owner = (h: ShowEvent['plots'][number]) => ownerAt(h.x, h.y);
  if (ev.key === 'meteorStrike') {
    const h = ev.plots[0]!;
    return owner(h) ? `${name(owner(h)!)}’s ${h.good ? GOOD_NAME[h.good] : ''} ${plots(h.good, 1).slice(2)} destroyed · a crater` : 'A crater on open land';
  }
  const h = ev.plots[0];
  if (h?.becomes === 'idle') return `${name(owner(h)!)}’s ${h.good ? GOOD_NAME[h.good] : ''} ${plots(h.good, 1).slice(2)} stands idle`;
  if (h?.becomes === 'plain') return `${name(owner(h)!)}’s crystal cavern is a plain plot`;
  if (ev.key === 'colonyPlot') return 'One free plot goes to auction after the grant';
  if (h?.pending) return `Every ${h.good ? GOOD_NAME[h.good] : ''} plot makes 20% in production, unless the Governor pays`;
  if (ev.plots.length) {
    const total = ev.plots.reduce((n, p) => n + p.delta, 0);
    const good = h?.good;
    return `${ev.player ? `${name(ev.player)}: ` : ''}${signed(total)} ${good ? GOOD_NAME[good] : ''} on ${plots(good, ev.plots.length)}`;
  }
  const fx = ev.effects ?? [];
  const players = fx.filter((f) => f.on !== 'colony' && f.on !== 'store');
  const rest = fx.filter((f) => f.on === 'colony' || f.on === 'store');
  // Several players' money in one figure: "−215 cr from 4 players".
  const cash = players.filter((f) => f.what === 'cash' && !f.pct);
  const parts =
    ev.player || players.length === 1
      ? players.map(named)
      : cash.length === players.length && cash.length > 1
        ? [`${signed(cash.reduce((n, f) => n + f.delta, 0))} cr ${cash[0]!.delta < 0 ? 'from' : 'to'} ${cash.length} players`]
        : players.map(named);
  return [...parts, ...rest.filter((f) => f.what !== 'fund').map(effectWords)].join(' · ');
}

/** The whole segment's effect, for the TV's log. A roll call says each person's in turn. */
export function segmentSummary(seg: Segment): string {
  if (allSick(seg.events)) return `${names(seg.events)} walk at half pace`;
  if (seg.events.length > 1) return seg.events.map((e) => (e.key === 'sickness' ? `${name(e.player!)} sick` : eventSummary(e))).join(' · ');
  return eventSummary(seg.events[0]!);
}

/** The phone's second line when an event hit you: what it means, in the event's own words. */
const YOU: Partial<Record<EventKey, (ev: ShowEvent) => string>> = {
  federationTax: () => 'A tenth of your cash went to the colony fund.',
  federationGrant: () => 'The Federation helps the two poorest players.',
  inheritance: () => 'A relative back home left you credits.',
  blamedForUnrest: () => 'The colony blames you for the unrest: fewer votes in the council.',
  muleTheft: (ev) => `Your ${ev.plots[0]?.good ? GOOD_NAME[ev.plots[0].good] : ''} plot stands idle until you outfit it again.`,
  epidemic: () => 'You walk at half pace this turn and next. Holding Medicine would have kept you well.',
  coldSnap: () => 'Every plot needed twice its Energy; yours ran short.',
  wildfire: () => 'One farm burned out; the farms joined to it make 1 less. This month only.',
  bumperHarvest: () => 'One plot of yours makes double this month.',
  cavernCollapse: () => 'Your crystal cavern caved in: it’s a plain plot now, with no cavern Crystite.',
  walkout: (ev) => `Your ${ev.plots[0]?.good ? GOOD_NAME[ev.plots[0].good] : ''} crews walked out: those plots make a fifth this month.`,
  loyalCrew: () => 'Your crew worked through: one plot makes 1 more this month.',
  generalStrike: (ev) => `Your ${ev.plots[0]?.good ? GOOD_NAME[ev.plots[0].good] : ''} plots make 20% in production, unless the Governor pays the strikers.`,
  pirateRaid: () => 'Pirates took all the Crystite you held, before the auction opens.',
  ratsInSilo: () => 'Rats ate half the Food you had stored.',
  crookedAccountant: () => 'Your accountant skimmed a tenth of your cash.',
  packageFromHome: () => 'Family sent food from home.',
};

/** The phone's line for an event that touches everyone the same: the colony's news. */
const ALL: Partial<Record<EventKey, (ev: ShowEvent) => string>> = {
  immigrationWave: () => 'For everyone: 10% more colonists, for good. The store buys more Food, Water and Energy.',
  emigrationWave: () => 'For everyone: 10% fewer colonists, for good. The store buys less.',
  festival: () => 'For everyone: mood +10, prestige +2, and Food demand +25% this month.',
  colonyPlot: () => 'One free plot, flagged on your map, goes to auction after the grant. Bid for it there.',
  storeStrike: () => 'For everyone: the store sells no MULEs this turn.',
  storeFire: (ev) => {
    const g = ev.effects?.find((f) => f.on === 'store' && f.what !== 'price')?.what as Good | undefined;
    return `For everyone: the store lost all its ${g ? GOOD_NAME[g] : 'stock'}; the price jumps until it’s restocked.`;
  },
  riot: () => 'For everyone: the stadium is damaged (no prestige until it’s repaired), and the store lost a third of its stock.',
  volunteerCleanup: () => 'For everyone: volunteers cleaned up, and the air gauge drops by 5.',
  coldSnap: () => 'For everyone: every plot needs twice its Energy this month.',
};

/** What one event did to one player, or null when it passed them by. */
function youFor(ev: ShowEvent, id: string): { headline: string; detail: string; change: Partial<Record<Good, number>>; sick?: boolean } | null {
  const detail = YOU[ev.key]?.(ev);
  if (ev.key === 'sickness') return ev.player === id ? { headline: 'You’re sick', detail: `You walk at half pace this turn. Why: ${ev.because}.`, change: {}, sick: true } : null;
  const mine = ev.plots.filter((h) => ownerAt(h.x, h.y) === id);
  const fx = (ev.effects ?? []).filter((f) => f.on === id);
  if (mine.length === 0 && fx.length === 0) return null;
  if (fx.some((f) => f.what === 'pace')) return { headline: 'You’re sick, 2 turns', detail: detail ?? '', change: {}, sick: true };
  const change: Partial<Record<Good, number>> = {};
  for (const h of mine) if (h.good) change[h.good] = (change[h.good] ?? 0) + h.delta;
  for (const f of fx) if (f.what in GOOD_NAME) change[f.what as Good] = (change[f.what as Good] ?? 0) + f.delta;
  const h = mine[0];
  if (h?.muleLost && h.becomes === 'crater') return { headline: 'Your MULE was destroyed', detail: 'The plot is a crater now: rich in Crystite, empty until you outfit it.', change };
  if (h?.muleLost) return { headline: 'Your MULE was taken', detail: detail ?? '', change };
  if (h?.becomes === 'plain') return { headline: 'Your cavern caved in', detail: detail ?? '', change };
  if (h?.pending) return { headline: `Strike on your ${h.good ? GOOD_NAME[h.good] : ''}`, detail: detail ?? '', change };
  const words = [
    ...(Object.entries(change) as [Good, number][]).map(([g, n]) => `${signed(n)} ${GOOD_NAME[g]}`),
    ...fx.filter((f) => !(f.what in GOOD_NAME)).map(effectWords),
  ];
  return {
    headline: `${words.join(', ')} for you`,
    detail: detail ?? (mine.length ? `On ${plots(mine.every((p) => p.good === h?.good) ? h?.good : undefined, mine.length)} of yours, this month only.` : ''),
    change,
  };
}

/** What the segment did to one player, for their phone; null when it missed them. */
export function youSummary(seg: Segment, id: string): { headline: string; detail: string; change: Partial<Record<Good, number>>; sick?: boolean } | null {
  for (const ev of seg.events) {
    const you = youFor(ev, id);
    if (you) return you;
  }
  return null;
}

/** For the phone when an event missed you: the colony's news, or where it went instead. */
export function missLine(seg: Segment): string {
  const ev = seg.events[0]!;
  if (allSick(seg.events)) return `You’re well. ${names(seg.events)} walk at half pace.`;
  if (seg.events.length > 1) return `Not you this time: ${seg.events.map((e) => (e.key === 'sickness' ? `${name(e.player!)} is sick` : eventSummary(e))).join('; ')}.`;
  const all = ALL[ev.key]?.(ev);
  if (all) return all;
  if (ev.key === 'meteorStrike') return `Not your land: ${eventSummary(ev).replace(' · a crater', '')}.`;
  if (ev.key === 'epidemic') return 'You hold Medicine, so you stay well.';
  if (ev.plots.some((h) => h.pending)) return `Not your land: ${lower(eventSummary(ev))}.`;
  if (ev.player) return ev.plots.length ? `Not your land: it hit ${name(ev.player)}.` : `Not you: it hit ${name(ev.player)}.`;
  if (ev.effects?.length && !ev.plots.length) return `Not you: ${eventSummary(ev)}.`;
  return 'Your plots are clear of it.';
}

/** The word a plot's chip shows instead of a number, when the change isn't one: LOST, TAKEN, CAVED IN. */
export function hitText(ev: ShowEvent, h: ShowEvent['plots'][number]): string | undefined {
  if (h.muleLost && h.becomes === 'crater') return 'LOST';
  if (h.becomes === 'idle') return 'TAKEN';
  if (h.becomes === 'plain') return 'CAVED IN';
  if (h.pending) return 'STRIKE';
  if (ev.key === 'colonyPlot') return 'FOR SALE';
  return undefined;
}

/** A roll call's title: "Sickness ×2", or "Personal news" when it holds several kinds. */
export function segTitle(seg: Segment): string {
  const ev = seg.events[0]!;
  if (seg.events.length === 1) return ev.title;
  return seg.events.every((e) => e.key === ev.key) ? `${ev.title} ×${seg.events.length}` : 'Personal news';
}

/** Whether a segment is the colony's news: it touches everyone the same, so it never "missed" anyone. */
export const colonyNews = (seg: Segment) => seg.events.length === 1 && ALL[seg.events[0]!.key] !== undefined;
