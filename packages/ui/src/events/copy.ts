import { GOOD_NAME, type Good } from '../components/tokens';
import { signLook, type ShowCast } from './frame';
import type { EventSegment } from './timing';
import type { ShowEventKey, ShowEventView, ShowPhase } from './types';

/** The show's words, the gallery's own (design/mocks/ws8-events src/copy.ts). */

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const KIND_OF_PLOT: Partial<Record<Good, [string, string]>> = { energy: ['plant', 'plants'], food: ['farm', 'farms'], water: ['well', 'wells'], smithore: ['mine', 'mines'], crystite: ['mine', 'mines'] };
const plots = (good: Good | undefined, n: number) => {
  const [one, many] = (good && KIND_OF_PLOT[good]) ?? ['plot', 'plots'];
  return plural(n, one, many);
};
const signed = (n: number) => `${n < 0 ? '−' : '+'}${Math.abs(n)}`;
/** What a phase's stretch of time is called: a development turn, otherwise a month. */
export const phaseNoun = (phase: ShowPhase) => (phase === 'development' ? 'turn' : 'month');

const allSick = (evs: ShowEventView[]) => evs.length > 0 && evs.every((e) => e.key === 'sickness');
/** Everyone a roll call names, in its order: "Lena and Brix". */
const names = (evs: ShowEventView[], cast: ShowCast) => {
  const all = evs.map((e) => cast.name(cast.playerOf(e) ?? ''));
  return all.length > 1 ? `${all.slice(0, -1).join(', ')} and ${all.at(-1)}` : (all[0] ?? '');
};
/** Why a sick player fell sick, from the server's line ("Lena fell sick: the air is Smoggy."), or null. */
const sickBecause = (ev: ShowEventView) => ev.line.match(/fell sick: (.+?)\.?$/)?.[1] ?? null;

/** Who a segment is about: a roll call names everyone in it. */
export function eventSegWho(seg: EventSegment, cast: ShowCast): string {
  return seg.events.length > 1 && seg.events.every((e) => cast.playerOf(e)) ? names(seg.events, cast) : eventWhoLine(seg.events[0]!, cast);
}

/** Who an event is about, in words, for its announcement. */
export function eventWhoLine(ev: ShowEventView, cast: ShowCast): string {
  const player = cast.playerOf(ev);
  if (player) return cast.name(player);
  if (ev.scope === 'colony') return 'The whole colony';
  if (ev.scope === 'local') return 'One area of the map';
  return 'One player';
}

/** "Bad news", "Good news" or, for a mixed event, "News"; and the count: "1 of 3". */
export function eventSegLabel(seg: EventSegment): string {
  const signs = new Set(seg.events.map((e) => signLook(e.sign)));
  const word = signs.size > 1 || signs.has('neutral') ? 'News' : signs.has('good') ? 'Good news' : 'Bad news';
  return `${word}${seg.count > 1 ? ` · ${seg.n} of ${seg.count}` : ''}`;
}

/** What the phase's intro says: "3 things happen this month"; a phase of only sick players, "2 colonists are sick this turn". */
export function introLine(count: number, phase: ShowPhase, events: ShowEventView[] = []): string {
  if (allSick(events)) return `${plural(events.length, 'colonist')} ${events.length === 1 ? 'is' : 'are'} sick this turn`;
  if (events.length > 0 && events.every((e) => e.weight === 'bulletin')) return `${events.length === 1 ? 'One piece' : `${events.length} pieces`} of news this ${phaseNoun(phase)}`;
  return count === 1 ? `Something happens this ${phaseNoun(phase)}` : `${count} things happen this ${phaseNoun(phase)}`;
}

/** A segment's title: its event's; a roll call's, "Sickness ×2", or "Personal news" when it holds several kinds. */
export function segTitle(seg: EventSegment): string {
  const ev = seg.events[0]!;
  if (seg.events.length === 1) return ev.title;
  return seg.events.every((e) => e.key === ev.key) ? `${ev.title} ×${seg.events.length}` : 'Personal news';
}

/**
 * What one event did, for the TV's log, each good's figure apart: "−11 Energy on 6 plants", "Lena: −4 Food on 2 farms",
 * "−2 Food, −2 Water on 4 plots".
 */
export function eventSummary(ev: ShowEventView, cast: ShowCast): string {
  // A hit that changed nothing is no loss: it is in no figure and no plot count.
  const hits = ev.hits.filter((h) => h.delta !== 0);
  if (hits.length === 0) return '';
  const change = new Map<Good | undefined, number>();
  for (const h of hits) {
    const good = cast.goodAt(h.x, h.y);
    change.set(good, (change.get(good) ?? 0) + h.delta);
  }
  const figures = [...change].map(([good, n]) => (good ? `${signed(n)} ${GOOD_NAME[good]}` : signed(n))).join(', ');
  const [only] = change.keys();
  const player = cast.playerOf(ev);
  return `${player ? `${cast.name(player)}: ` : ''}${figures} on ${plots(change.size === 1 ? only : undefined, hits.length)}`;
}

/** The whole segment's effect, for the TV's log. A roll call says each person's in turn. */
export function eventSegmentSummary(seg: EventSegment, cast: ShowCast): string {
  if (allSick(seg.events)) return `${names(seg.events, cast)} ${seg.events.length === 1 ? "walks" : "walk"} at half pace`;
  return seg.events.map((e) => (e.key === 'sickness' ? `${cast.name(cast.playerOf(e) ?? '')} sick` : eventSummary(e, cast))).join(' · ');
}

/** The phone's second line when an event hit you: what it means, in the event's own words. */
const YOU: Partial<Record<ShowEventKey, (ev: ShowEventView) => string>> = {
  wildfire: () => 'One farm burned out; the farms joined to it make 1 less. This month only.',
  bumperHarvest: () => 'One plot of yours makes double this month.',
  cavernCollapse: () => 'Your crystal cavern caved in: it’s a plain plot now, with no cavern Crystite.',
};

export interface EventYouSummary {
  /** "−2 Energy for you". */
  headline: string;
  /** The same figures without "for you": "−2 Energy", for the rail's one-line list. */
  short: string;
  detail: string;
  change: Partial<Record<Good, number>>;
  /** It made you sick: the sick tag goes beside the headline. */
  sick?: boolean;
}

/** What one event did to one player, or null when it passed them by. */
function youFor(ev: ShowEventView, id: string, cast: ShowCast): EventYouSummary | null {
  if (ev.key === 'sickness') {
    if (cast.playerOf(ev) !== id) return null;
    const why = sickBecause(ev);
    return { headline: 'You’re sick', short: 'sick', detail: `You walk at half pace this turn.${why ? ` Why: ${why}.` : ''}`, change: {}, sick: true };
  }
  const detail = YOU[ev.key]?.(ev);
  // As in eventSummary, a hit that changed nothing is no loss: a player only it reached was missed.
  const mine = ev.hits.filter((h) => h.delta !== 0 && cast.ownerAt(h.x, h.y) === id);
  if (mine.length === 0) return null;
  const change: Partial<Record<Good, number>> = {};
  for (const h of mine) {
    const g = cast.goodAt(h.x, h.y);
    if (g) change[g] = (change[g] ?? 0) + h.delta;
  }
  const first = mine[0] ? cast.goodAt(mine[0].x, mine[0].y) : undefined;
  const short = (Object.entries(change) as [Good, number][]).map(([g, n]) => `${signed(n)} ${GOOD_NAME[g]}`).join(', ');
  return {
    headline: `${short} for you`,
    short,
    detail: detail ?? `On ${plots(mine.every((p) => cast.goodAt(p.x, p.y) === first) ? first : undefined, mine.length)} of yours, this month only.`,
    change,
  };
}

/** What the segment did to one player, for their phone; null when it missed them. */
export function eventYouSummary(seg: EventSegment, id: string, cast: ShowCast): EventYouSummary | null {
  for (const ev of seg.events) {
    const you = youFor(ev, id, cast);
    if (you) return you;
  }
  return null;
}

/** For the phone when an event missed you: where it went instead. */
export function eventMissLine(seg: EventSegment, cast: ShowCast): string {
  const ev = seg.events[0]!;
  if (allSick(seg.events)) return `You’re well. ${names(seg.events, cast)} ${seg.events.length === 1 ? 'walks' : 'walk'} at half pace.`;
  if (seg.events.length > 1) return `Not you this time: ${seg.events.map((e) => (e.key === 'sickness' ? `${cast.name(cast.playerOf(e) ?? '')} is sick` : eventSummary(e, cast))).join('; ')}.`;
  const player = cast.playerOf(ev);
  if (player) return ev.hits.length ? `Not your land: it hit ${cast.name(player)}.` : `Not you: it hit ${cast.name(player)}.`;
  return 'Your plots are clear of it.';
}
