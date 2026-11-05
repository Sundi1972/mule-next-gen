import { GOOD_NAME, type Good } from '../components/tokens';
import { signLook, type ShowCast } from './frame';
import { epidemicSick, sickBecause } from './sick';
import type { EventSegment } from './timing';
import type { ShowEffect, ShowEventKey, ShowEventView, ShowHit, ShowPhase } from './types';

/** The show's words, the gallery's own (design/mocks/ws8-events src/copy.ts). */

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const KIND_OF_PLOT: Partial<Record<Good, [string, string]>> = { energy: ['plant', 'plants'], food: ['farm', 'farms'], water: ['well', 'wells'], smithore: ['mine', 'mines'], crystite: ['mine', 'mines'] };
const plots = (good: Good | undefined, n: number) => {
  const [one, many] = (good && KIND_OF_PLOT[good]) ?? ['plot', 'plots'];
  return plural(n, one, many);
};
const signed = (n: number) => `${n < 0 ? '−' : '+'}${Math.abs(n)}`;
const lower = (w: string) => (/^[A-Z][a-z]/.test(w) ? w[0]!.toLowerCase() + w.slice(1) : w);
const isGood = (what: ShowEffect['what']): what is Good => what in GOOD_NAME;

/** The word a plot's chip shows instead of a number, when the change isn't one: LOST, TAKEN, CAVED IN. */
export function hitText(hit: ShowHit): string | undefined {
  if (hit.muleLost && hit.becomes === 'crater') return 'LOST';
  if (hit.becomes === 'idle') return 'TAKEN';
  if (hit.becomes === 'plain') return 'CAVED IN';
  return undefined;
}

/** One change off the map in a few words: "−64 cr", "+3 Food", "Colonists +12", "Energy need +100%". */
export function effectWords(f: ShowEffect): string {
  const n = signed(f.delta);
  switch (f.what) {
    case 'money':
      return `${n} cr`;
    case 'colonists':
      return `Colonists ${n}`;
    case 'energyNeed':
      return `Energy need ${n}%`;
    case 'mules':
      return `${n} MULEs`;
    default:
      return `${n} ${GOOD_NAME[f.what]}`;
  }
}

/** The share an event's line names ("takes 10% of the cash"), for its stamp; null when it names none. */
export const lineShare = (ev: ShowEventView) => ev.line.match(/(\d+)%/)?.[0] ?? null;

/** What a phase's stretch of time is called: a development turn, otherwise a month. */
export const phaseNoun = (phase: ShowPhase) => (phase === 'development' ? 'turn' : 'month');

const allSick = (evs: ShowEventView[]) => evs.length > 0 && evs.every((e) => e.key === 'sickness');
/** Everyone a roll call names, in its order: "Lena and Brix". */
const names = (evs: ShowEventView[], cast: ShowCast) => {
  const all = evs.map((e) => cast.name(cast.playerOf(e) ?? ''));
  return all.length > 1 ? `${all.slice(0, -1).join(', ')} and ${all.at(-1)}` : (all[0] ?? '');
};

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
  const first = ev.hits[0];
  const whose = (h: ShowHit) => cast.name(cast.ownerAt(h.x, h.y) ?? '');
  const kindOf = (h: ShowHit) => {
    // A MULE lost has gone from the map's tile; the hit names the good it made.
    const good = h.good ?? cast.goodAt(h.x, h.y);
    return `${good ? `${GOOD_NAME[good]} ` : ''}${plots(good, 1).slice(2)}`;
  };
  if (ev.key === 'meteorStrike' && first) return cast.ownerAt(first.x, first.y) ? `${whose(first)}’s ${first.muleLost ? `${kindOf(first)} lost its MULE` : 'plot was struck'} · a crater` : 'A crater on open land';
  if (first?.becomes === 'idle') return `${whose(first)}’s ${kindOf(first)} stands idle`;
  if (first?.becomes === 'plain') return `${whose(first)}’s crystal cavern is a plain plot`;
  // A hit that changed nothing is no loss: it is in no figure and no plot count; with none left, the effects speak.
  const hits = ev.hits.filter((h) => h.delta !== 0);
  if (hits.length === 0) return effectsSummary(ev, cast);
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

/** What an event changed off the map, for the TV's log: "−74 cr from 3 players", "Ossa −6 Crystite · Store −8 Crystite". */
function effectsSummary(ev: ShowEventView, cast: ShowCast): string {
  const fx = ev.effects ?? [];
  const players = fx.filter((f) => f.on !== 'colony' && f.on !== 'store');
  const rest = fx.filter((f) => f.on === 'colony' || f.on === 'store');
  const named = (f: ShowEffect) => `${cast.name(f.on)} ${lower(effectWords(f))}`;
  // Several players' money in one figure: "−215 cr from 4 players".
  const money = players.filter((f) => f.what === 'money');
  const parts =
    !ev.player && money.length === players.length && money.length > 1
      ? [`${signed(money.reduce((n, f) => n + f.delta, 0))} cr ${money[0]!.delta < 0 ? 'from' : 'to'} ${money.length} players`]
      : players.map(named);
  // The store's held goods carry its name, so a chip of goods never reads as a player's: "Store −8 Crystite".
  const bare = (f: ShowEffect) => (f.on === 'store' && (players.length > 0 || isGood(f.what)) ? `Store ${lower(effectWords(f))}` : effectWords(f));
  return [...parts, ...rest.map(bare)].join(' · ');
}

/** The whole segment's effect, for the TV's log. A roll call says each person's in turn. */
export function eventSegmentSummary(seg: EventSegment, cast: ShowCast): string {
  if (allSick(seg.events)) return `${names(seg.events, cast)} ${seg.events.length === 1 ? "walks" : "walk"} at half pace`;
  return seg.events.map((e) => (e.key === 'sickness' ? `${cast.name(cast.playerOf(e) ?? '')} sick` : eventSummary(e, cast))).join(' · ');
}

/** The phone's second line when an event hit you: what it means, in the event's own words. */
const YOU: Partial<Record<ShowEventKey, (ev: ShowEventView) => string>> = {
  federationTax: () => 'A tenth of your cash went to the colony fund.',
  federationGrant: () => 'The Federation helps the two poorest players.',
  inheritance: () => 'A relative back home left you credits.',
  muleTheft: () => 'Your plot stands idle until you outfit it again.',
  epidemic: () => 'You walk at half pace this turn and next. Holding Medicine would have kept you well.',
  pirateRaid: () => 'Pirates took all the Crystite you held, and the store’s too, before the auction opens.',
  ratsInSilo: () => 'Rats ate half the Food you had stored.',
  crookedAccountant: () => 'Your accountant skimmed a tenth of your cash.',
  packageFromHome: () => 'Family sent food from home.',
  wildfire: () => 'One farm burned out; the farms joined to it make 1 less. This month only.',
  bumperHarvest: () => 'One plot of yours makes double this month.',
  cavernCollapse: () => 'Your crystal cavern caved in: it’s a plain plot now, with no cavern Crystite.',
};

/** The phone's line for an event that touches everyone the same: the colony's news. */
const ALL: Partial<Record<ShowEventKey, (ev: ShowEventView) => string>> = {
  immigrationWave: () => 'For everyone: more colonists, for good. The store buys more Food, Water and Energy.',
  storeFire: () => 'For everyone: the store lost everything it held, every good and its MULEs, until it’s restocked.',
  coldSnap: () => 'For everyone: every plot needs twice its Energy this month.',
};

/** Whether a segment is the colony's news: it touches everyone the same, so it never "missed" anyone. */
export const colonyNews = (seg: EventSegment) => seg.events.length === 1 && ALL[seg.events[0]!.key] !== undefined;

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
    const why = sickBecause(ev.line);
    return { headline: 'You’re sick', short: 'sick', detail: `You walk at half pace this turn.${why ? ` Why: ${why}.` : ''}`, change: {}, sick: true };
  }
  const detail = YOU[ev.key]?.(ev);
  const fx = (ev.effects ?? []).filter((f) => f.on === id);
  if (ev.key === 'epidemic') {
    if (epidemicSick(ev, cast.players).includes(id)) return { headline: 'You’re sick, 2 turns', short: 'sick, 2 turns', detail: detail ?? '', change: {}, sick: true };
    const words = fx.map(effectWords).join(', ');
    return { headline: `${words} for you`, short: words, detail: 'You held Medicine, so you stay well.', change: goodsOf(fx) };
  }
  // A plot that changed what it is did not miss its owner, even with no change in output.
  const changed = ev.hits.find((h) => h.becomes && cast.ownerAt(h.x, h.y) === id);
  if (changed?.becomes === 'crater') {
    const lost = changed.muleLost === true;
    return { headline: lost ? 'Your MULE was destroyed' : 'A meteor struck your plot', short: lost ? 'MULE destroyed' : 'a crater', detail: 'The plot is a crater now: rich in Crystite, empty until you outfit it.', change: {} };
  }
  if (changed?.becomes === 'idle') return { headline: 'Your MULE was taken', short: 'MULE taken', detail: detail ?? '', change: {} };
  if (changed?.becomes === 'plain') return { headline: 'Your cavern caved in', short: 'caved in', detail: detail ?? '', change: {} };
  // As in eventSummary, a hit that changed nothing is no loss: a player only it reached was missed.
  const mine = ev.hits.filter((h) => h.delta !== 0 && cast.ownerAt(h.x, h.y) === id);
  if (mine.length === 0 && fx.length === 0) return null;
  const change = goodsOf(fx);
  for (const h of mine) {
    const g = cast.goodAt(h.x, h.y);
    if (g) change[g] = (change[g] ?? 0) + h.delta;
  }
  const first = mine[0] ? cast.goodAt(mine[0].x, mine[0].y) : undefined;
  const short = [...(Object.entries(change) as [Good, number][]).map(([g, n]) => `${signed(n)} ${GOOD_NAME[g]}`), ...fx.filter((f) => !isGood(f.what)).map(effectWords)].join(', ');
  return {
    headline: `${short} for you`,
    short,
    detail: detail ?? (mine.length ? `On ${plots(mine.every((p) => cast.goodAt(p.x, p.y) === first) ? first : undefined, mine.length)} of yours, this month only.` : ''),
    change,
  };
}

/** The held goods among some changes off the map, per good. */
function goodsOf(fx: readonly ShowEffect[]): Partial<Record<Good, number>> {
  const change: Partial<Record<Good, number>> = {};
  for (const f of fx) if (isGood(f.what)) change[f.what] = (change[f.what] ?? 0) + f.delta;
  return change;
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
  const all = ALL[ev.key]?.(ev);
  if (all) return all;
  if (ev.key === 'meteorStrike') return `Not your land: ${lower(eventSummary(ev, cast))}.`;
  const player = cast.playerOf(ev);
  if (player) return ev.hits.length ? `Not your land: it hit ${cast.name(player)}.` : `Not you: it hit ${cast.name(player)}.`;
  if (ev.effects?.length && !ev.hits.length) return `Not you: ${eventSummary(ev, cast)}.`;
  return 'Your plots are clear of it.';
}
