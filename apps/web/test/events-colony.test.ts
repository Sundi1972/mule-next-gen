import { COLONY, createGame, EVENT_SHOW, rollPhase, type Phase } from '@mule/engine';
import type { ColonyProjectView, EventView } from '@mule/protocol';
import { EventEffectChip, EventLivingMap, EventShow, EventSoloRail, EventTvLog, eventSegments, ProductionMap, productionShowProps, showEnd, showTimes, type MapTile, type ShowData, type ShowEffect, type ShowEventView, type ShowMode, type ShowPlayer, type Slot } from '@mule/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProjectRow } from '../src/components/Colony';

/**
 * The colony's mood events (G-5 C26 visuals), at promise altitude: what the TV and a phone alone show while each one
 * plays, rendered from events in WS1's frozen C26 contract (design/mocks/ws8-colony-events src/fixture.ts). No server
 * sends them until C26 lands, so these are the contract's shapes with fixture numbers.
 */

const W = 9;
const H = 5;
const STORE = { x: 4, y: 2 };
const LENA = 's1';
const OSSA = 's2';
const BRIX = 's3';
const KAI = 's4';
const players: ShowPlayer[] = [
  { id: LENA, name: 'Lena', slot: 0 },
  { id: OSSA, name: 'Ossa', slot: 1 },
  { id: BRIX, name: 'Brix', slot: 2 },
  { id: KAI, name: 'Kai', slot: 3 },
];
/** Four farms across three players. The colony's objects stand on its own grounds, never on a map plot (G-5 C48). */
const OWNED: Record<string, [Slot, MapTile['good']]> = { '1,1': [0, 'food'], '2,1': [0, 'food'], '6,3': [1, 'smithore'], '7,3': [1, 'energy'], '2,3': [2, 'food'], '6,1': [3, 'food'] };
function tilesWith(): MapTile[] {
  return Array.from({ length: W * H }, (_, i) => {
    const x = i % W;
    const y = Math.floor(i / W);
    const own = OWNED[`${x},${y}`];
    if (x === STORE.x && y === STORE.y) return { x, y, terrain: 'store', owner: null };
    return own ? { x, y, terrain: 'plains', owner: own[0], good: own[1] } : { x, y, terrain: 'plains', owner: null };
  });
}
const tiles = tilesWith();
const INTRO_MS = EVENT_SHOW.introMs;
const PLAY_MS = EVENT_SHOW.playMs.headline;

type Effect = NonNullable<EventView['effects']>[number];
/** A C26 event as the server will send it: at the store unless it hits a plot, a headline, its effects in fired order. */
function event(key: ShowEventView['key'], phase: ShowEventView['phase'], extra: Partial<ShowEventView> & { effects?: Effect[] } = {}): ShowEventView {
  return { key, kind: key, title: key, line: `${key} happens.`, sign: 'bad', scope: 'colony', origin: { ...STORE }, hits: [], phase, weight: 'headline', playMs: PLAY_MS, ...extra } as ShowEventView;
}

const FOOD_PLOTS = [
  { x: 1, y: 1 },
  { x: 2, y: 1 },
  { x: 6, y: 1 },
  { x: 2, y: 3 },
];
const FESTIVAL = event('festival', 'planning', {
  kind: 'colony',
  title: 'Festival',
  line: 'Mood +10, prestige +2, Food demand +25% this month.',
  sign: 'good',
  effects: [
    { on: 'colony', what: 'mood', delta: 10 },
    { on: 'colony', what: 'prestige', delta: 2 },
    { on: 'store', what: 'food', delta: 6 },
  ],
});
/** The share of its output a struck plot makes, as the engine words it: "20%" at 0.2. */
const STRIKE_SHARE = `${Math.round(COLONY.strike.output * 100)}%`;
// As #370 builds it: kind 'colony', from the first struck plot, every working plot of the good at delta 0.
const STRIKE = event('generalStrike', 'planning', {
  kind: 'colony',
  origin: { ...FOOD_PLOTS[0]! },
  title: 'General strike',
  line: `This month every Food plot makes ${STRIKE_SHARE}, unless the Governor pays the strikers 240 cr from the colony fund.`,
  hits: FOOD_PLOTS.map((p, order) => ({ ...p, order, delta: 0 })),
});
/** The riot takes floor(stock / 3) of each shelf: 18 Food, 12 Energy and 15 Smithore leave 12, 8 and 10. */
const riot = (object: 'park' | 'hospital', { counted = true } = {}) =>
  event('riot', 'upkeep', {
    title: 'Riot',
    line: 'One prestige object is damaged (no prestige until repaired); the store loses a third of its stock.',
    hits: [],
    objects: [{ id: object, becomes: 'damaged' }],
    effects: [
      { on: 'store', what: 'food', delta: -6, ...(counted ? { to: 12 } : {}) },
      { on: 'store', what: 'energy', delta: -4, ...(counted ? { to: 8 } : {}) },
      { on: 'store', what: 'smithore', delta: -5, ...(counted ? { to: 10 } : {}) },
    ],
  });

/** Each of the nine in the phase that rolls it, and the words the TV's log keeps for it. */
const NINE: { ev: ShowEventView; words: string; story?: string[] }[] = [
  { ev: FESTIVAL, words: 'Mood +10 · Prestige +2 · Store +6 Food', story: ['festival-bunting', 'festival-crowd'] },
  { ev: STRIKE, words: `Food at ${STRIKE_SHARE} on 4 farms unless the Governor pays` },
  { ev: event('emigrationWave', 'planning', { kind: 'colony', title: 'Emigration wave', line: '10% fewer colonists, for good.', effects: [{ on: 'colony', what: 'colonists', delta: -12 }] }), words: 'Colonists −12' },
  { ev: event('blamedForUnrest', 'planning', { kind: 'ledger', title: 'Blamed for the unrest', line: 'Reputation −1, so fewer votes.', scope: 'personal', player: OSSA, effects: [{ on: OSSA, what: 'reputation', delta: -1 }] }), words: 'Ossa reputation −1' },
  { ev: event('storeStrike', 'development', { title: 'Store strike', line: 'The store sells no MULEs this turn.', effects: [{ on: 'store', what: 'mules', delta: 0 }] }), words: 'No MULEs this turn' },
  { ev: event('walkout', 'production', { title: 'Walkout', line: 'Your plots of one good make 20% this month.', scope: 'personal', player: BRIX, origin: { x: 2, y: 3 }, weight: 'spotlight', hits: [{ x: 2, y: 3, order: 0, delta: -3 }] }), words: 'Brix: −3 Food on 1 farm' },
  { ev: event('loyalCrew', 'production', { title: 'Loyal crew', line: 'One of your plots makes 1 more this month.', sign: 'good', scope: 'personal', player: LENA, origin: { x: 1, y: 1 }, weight: 'spotlight', hits: [{ x: 1, y: 1, order: 0, delta: 1 }] }), words: 'Lena: +1 Food on 1 farm' },
  { ev: riot('park'), words: 'Park damaged · Store −6 Food · Store −4 Energy · Store −5 Smithore' },
  { ev: event('volunteerCleanup', 'upkeep', { title: 'Volunteer clean-up', line: 'The air gauge drops by 5.', sign: 'good', effects: [{ on: 'colony', what: 'air', delta: -5 }] }), words: 'Air −5' },
];

type Where = 'tv' | 'alone';
interface Opts {
  reduced?: boolean;
  me?: string;
  map?: MapTile[];
}
function screen(events: ShowEventView[], t: number, where: Where, { reduced = false, me = LENA, map = tiles }: Opts = {}): string {
  const mode: ShowMode = where === 'alone' ? 'solo' : 'tv';
  const slot = players.find((p) => p.id === me)!.slot;
  const parts =
    where === 'tv'
      ? [createElement(EventLivingMap, { key: 'm', size: 'tv' }), createElement(EventTvLog, { key: 'l' })]
      : [createElement(EventLivingMap, { key: 'm', size: 'phone', focusSlot: slot, onSkip: () => undefined }), createElement(EventSoloRail, { key: 'r', me })];
  return renderToStaticMarkup(createElement(EventShow, { events, introMs: INTRO_MS, t, mode, reduced, width: W, height: H, tiles: map, players, children: parts }));
}
const segOf = (events: ShowEventView[], where: Where) => eventSegments({ events, introMs: INTRO_MS }, 0, where === 'alone' ? 'solo' : 'tv')[0]!;
function showFrames(events: ShowEventView[], where: Where, opts: Opts = {}): string[] {
  const seg = segOf(events, where);
  const n = Math.floor(seg.endAt / 0.1);
  return Array.from({ length: n }, (_, i) => screen(events, (i + 0.5) * 0.1, where, opts));
}
const result = (events: ShowEventView[], where: Where, opts: Opts = {}) => screen(events, segOf(events, where).endAt - 0.15, where, opts);
/** The story's second `u` at the TV's pace. */
const storyAt = (events: ShowEventView[], u: number, opts: Opts = {}) => {
  const seg = segOf(events, 'tv');
  return screen(events, seg.playAt + u * seg.pace, 'tv', opts);
};
const has = (html: string, testid: string) => html.includes(`data-testid="${testid}`);
function inside(html: string, testid: string): string {
  const open = html.match(new RegExp(`<(\\w+)[^>]*data-testid="${testid}"[^>]*>`));
  if (!open) return '';
  const name = open[1]!;
  const from = open.index! + open[0].length;
  let depth = 1;
  const re = new RegExp(`<${name}[\\s>]|</${name}>`, 'g');
  re.lastIndex = from;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(from, m.index);
  }
  return html.slice(from);
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, ' ');

describe('B-AC-26-1: each colony event shows in its phase’s show with its glyph and its words', () => {
  it.each(NINE)('B-AC-26-1: $ev.key in $ev.phase: its badge, its title, its words in the log; nothing prints "undefined"', ({ ev, words, story = [] }) => {
    for (const where of ['tv', 'alone'] as const) {
      const frames = showFrames([ev], where);
      for (const html of frames) {
        expect(text(html)).not.toMatch(/undefined|NaN/);
      }
      const seg = segOf([ev], where);
      const announced = screen([ev], seg.announceAt + 0.3, where);
      expect(text(inside(announced, 'title-card'))).toContain(ev.title);
      // Its own glyph, in its own colour: not the plain disc an unknown key falls back to.
      const glyph = announced.match(new RegExp(`<span class="relative flex" style="color:([^"]+)"><svg[^>]*data-glyph="${ev.key}"[^>]*>(.*?)</svg>`));
      expect(glyph, `${ev.key} has a badge`).not.toBeNull();
      expect(glyph![1]).not.toBe('currentColor');
      expect(glyph![2]).not.toBe('<circle cx="12" cy="12" r="7" fill="currentColor"></circle>');
    }
    expect(text(inside(result([ev], 'tv'), 'log'))).toContain(words);
    // Its own story plays mid-way on the TV.
    const mid = storyAt([ev], 2);
    for (const mark of story) expect(has(mid, mark), mark).toBe(true);
  });

  it('B-AC-26-1: the development show calls its stretch a turn, the others a month', () => {
    expect(text(inside(result([NINE[4]!.ev], 'tv'), 'log'))).toContain('This turn');
    expect(text(inside(result([FESTIVAL], 'tv'), 'log'))).toContain('This month');
  });
});

describe('B-AC-26-2: the festival on a phone alone reads as the colony’s mood', () => {
  it('B-AC-26-2: Lena’s phone, no TV: the colony’s news in mood and prestige, never "Not you: Store +6 Food"', () => {
    for (const reduced of [false, true]) {
      const card = text(inside(result([FESTIVAL], 'alone', { reduced }), 'phone-card'));
      expect(card).toContain('Festival');
      expect(card).toMatch(/the colony’s mood/i);
      expect(card).toContain('Mood +10');
      expect(card).toContain('Prestige +2');
      expect(card).not.toContain('Not you');
      expect(card).not.toContain('Store +6 Food');
    }
  });
});

describe('B-AC-26-3: the riot takes a third of each shelf and damages one object', () => {
  // The view's tiles are after the event; no map plot holds the park (C48).
  const after = tilesWith();

  it('B-AC-26-3: the park: each shelf counts down to the store’s count right after the riot, and the card names the park damaged, with no mark on the map', () => {
    const ev = [riot('park')];
    expect(text(inside(storyAt(ev, 1.5, { map: after }), 'riot-storage')).match(/\d+/g)).toEqual(['18', '12', '15']);
    const shelves = storyAt(ev, 4.3, { map: after });
    expect(text(inside(shelves, 'riot-storage')).match(/\d+/g)).toEqual(['12', '8', '10']);
    expect(has(shelves, 'store-flames')).toBe(false);
    // The card is up, but the park's chip waits for the riot to reach it.
    expect(has(shelves, 'effects-card')).toBe(true);
    expect(text(inside(shelves, 'effects-card'))).not.toContain('Park damaged');

    for (const reduced of [false, true]) {
      const end = result(ev, 'tv', { map: after, reduced });
      expect(has(end, 'plot-object-')).toBe(false);
      expect(text(inside(end, 'effects-card'))).toContain('Park damaged');
    }
    expect(text(inside(result(ev, 'alone', { map: after }), 'phone-card'))).toContain('Park damaged in the riot');
  });

  it('B-AC-26-3: without the count after the riot, each shelf shows only what it lost, never a guessed count', () => {
    const shelves = text(inside(storyAt([riot('park', { counted: false })], 4.3, { map: after }), 'riot-storage'));
    expect(shelves.match(/[−-]?\d+/g)).toEqual(['−6', '−4', '−5']);
  });

  it('B-AC-26-3: the hospital: damaged, said on the card and in the log, with no mark on the map', () => {
    const ev = [riot('hospital')];
    for (const html of showFrames(ev, 'tv')) expect(text(html)).not.toContain('HIT');
    const end = result(ev, 'tv');
    expect(text(inside(end, 'effects-card'))).toContain('Hospital damaged');
    expect(text(inside(end, 'log'))).toContain('Hospital damaged');
  });

  it('B-AC-26-3: the damaged object’s build-site row says it counts 0 until repaired', () => {
    const park: ColonyProjectView = { id: 'park', name: 'Park', stage: 'damaged', cost: { credits: 420, goods: {} }, funded: { credits: 420, goods: {} }, buildMonths: 1, monthsLeft: null, place: { x: 2, y: 1, w: 1, h: 1 }, prestige: 2, upkeep: 30, repairCost: 150, plaque: [] };
    const row = renderToStaticMarkup(createElement(ProjectRow, { p: park, players: [], size: 'tv' }));
    expect(row).toContain('data-stage="damaged"');
    expect(text(row)).toContain('Damaged in the riot');
  });
});

/** The strike chip's words, from the engine's share: what each struck plot makes in planning, what it loses in production. */
const STRIKE_MADE = ` STRIKE · ${STRIKE_SHARE} `;
const STRIKE_LOST = ` STRIKE −${Math.round((1 - COLONY.strike.output) * 100)}% `;

describe('B-AC-26-4: the planning strike announcement on the TV', () => {
  it('B-AC-26-4: strikers walk out to every Food plot, each gets STRIKE · its share made, and the log says what it costs', () => {
    const ev = [STRIKE];
    const seg = segOf(ev, 'tv');
    expect(text(inside(screen(ev, seg.announceAt + 0.3, 'tv'), 'title-card'))).toContain('unless the Governor pays the strikers 240 cr');
    for (const reduced of [false, true]) {
      const standing = reduced ? result(ev, 'tv', { reduced }) : storyAt(ev, 2.6 + 3 * 0.35 + 0.2);
      for (const p of FOOD_PLOTS) {
        expect(has(standing, `striker-${p.x}-${p.y}`)).toBe(true);
        expect(text(inside(standing, `strike-chip-${p.x}-${p.y}`))).toBe(STRIKE_MADE);
      }
      // Nothing stands on land that isn't Food.
      expect(has(standing, 'striker-6-3')).toBe(false);
    }
    expect(text(inside(result(ev, 'tv'), 'log'))).toContain(`Food at ${STRIKE_SHARE} on 4 farms unless the Governor pays`);
  });

  it('B-AC-26-4: Lena’s phone, no TV: the strike is everyone’s news, each struck plot making its share unless the Governor pays', () => {
    for (const reduced of [false, true]) {
      const card = text(inside(result([STRIKE], 'alone', { reduced }), 'phone-card'));
      expect(card).toContain(`For everyone: every plot of the struck good makes ${STRIKE_SHARE} this month, unless the Governor pays the strikers.`);
      expect(card).not.toContain('Not you');
    }
  });
});

describe('B-AC-26-4: the unpaid strike plays in production on the TV', () => {
  // What each Food plot made before the strike; (2,3) makes too little to keep anything of it.
  const MADE: Record<string, number> = { '1,1': 5, '2,1': 10, '6,1': 5, '2,3': 4 };
  const kept = (p: { x: number; y: number }) => Math.floor(MADE[`${p.x},${p.y}`]! * COLONY.strike.output);
  const owner = (x: number, y: number) => players.find((p) => p.slot === OWNED[`${x},${y}`]![0])!.id;
  const lines: ShowData['lines'] = [...FOOD_PLOTS.map((p) => ({ ...p, owner: owner(p.x, p.y), good: 'food' as const, made: MADE[`${p.x},${p.y}`]!, parts: [] })), { x: 6, y: 3, owner: OSSA, good: 'smithore' as const, made: 3, parts: [] }].sort((a, b) => a.y - b.y || a.x - b.x);
  // As production files it unpaid: the same key, every Food plot, each delta down to what the strike leaves it.
  const STRIKE_PRODUCTION = event('generalStrike', 'production', {
    kind: 'colony',
    origin: { ...FOOD_PLOTS[0]! },
    title: 'General strike',
    line: `The strikers held: every Food plot makes ${STRIKE_SHARE} this month.`,
    hits: FOOD_PLOTS.map((p, order) => ({ ...p, order, delta: kept(p) - MADE[`${p.x},${p.y}`]! })),
  });
  const month = (events: ShowEventView[]): ShowData => ({ lines, events, introMs: events.length ? INTRO_MS : 0, lengthMs: 0 });
  const unpaid = month([STRIKE_PRODUCTION]);
  const slots = Object.fromEntries(players.map((p) => [p.id, p.slot]));
  /** The production TV: the show around the map and the log, as TvProduction composes them. */
  const tv = (production: ShowData, t: number, reduced = false) =>
    renderToStaticMarkup(
      createElement(EventShow, {
        ...productionShowProps(production, t, { reduced, mode: 'tv', players, tiles, width: W, height: H }),
        children: [createElement(ProductionMap, { key: 'm', width: W, height: H, tiles, production, t, slots, players, reduced, mode: 'tv', tv: true }), createElement(EventTvLog, { key: 'l' })],
      }),
    );
  const seg = eventSegments(unpaid, showTimes(unpaid).eventsAt!, 'tv')[0]!;
  const at = (u: number, reduced = false) => tv(unpaid, seg.playAt + u * seg.pace, reduced);
  // The strike story's beat (STORY.generalStrike): it lands on the first plot at 2.6 s, then on each next 0.35 s later.
  const { lands, step } = { lands: 2.6, step: 0.35 };
  const where = (html: string, testid: string) => html.match(new RegExp(`data-testid="${testid}" style="left:([^;]+);top:([^;]+);`))?.slice(1);
  const units = (html: string, x: number, y: number) => {
    const plot = inside(html, `plot-${x}-${y}`);
    return { count: text(inside(plot, 'units')).trim(), bars: (plot.match(/data-bar="unit"/g) ?? []).length };
  };

  it('B-AC-26-4: the strikers stand on every Food plot from the start, no walk; each plot gets STRIKE −its share lost as the strike lands on it, none before', () => {
    const start = at(0.05);
    const before = at(lands - 0.1);
    const after = at(lands + 3 * step + 0.2);
    for (const p of FOOD_PLOTS) {
      const id = `striker-${p.x}-${p.y}`;
      expect(has(start, id), id).toBe(true);
      // Already on the plot: where it stands at the start is where it stands once the strike has landed.
      expect(where(start, id)).toEqual(where(after, id));
      expect(has(before, `strike-chip-${p.x}-${p.y}`)).toBe(false);
      expect(text(inside(after, `strike-chip-${p.x}-${p.y}`))).toBe(STRIKE_LOST);
    }
    // One plot after the next: as it reaches the second plot, the third has no chip yet.
    const second = at(lands + step + 0.05);
    expect(FOOD_PLOTS.map((p) => has(second, `strike-chip-${p.x}-${p.y}`))).toEqual([true, true, false, false]);
    // Nobody stands on the Smithore mine.
    expect(has(after, 'striker-6-3')).toBe(false);
    expect(has(after, 'strike-chip-6-3')).toBe(false);
  });

  it('B-AC-26-4: each struck plot ends on its share of what it made, the mine keeps its 3, and the log says what the strike cost', () => {
    const end = tv(unpaid, seg.endAt - 0.15);
    for (const p of FOOD_PLOTS) {
      const n = kept(p);
      expect(units(end, p.x, p.y), `${p.x},${p.y}`).toEqual({ count: n > 0 ? String(n) : '', bars: n });
    }
    expect(units(end, 2, 1)).toEqual({ count: '2', bars: 2 });
    expect(units(end, 6, 3)).toEqual({ count: '3', bars: 3 });
    const lost = FOOD_PLOTS.reduce((n, p) => n + MADE[`${p.x},${p.y}`]! - kept(p), 0);
    expect(text(inside(end, 'log'))).toContain(`−${lost} Food on 4 farms`);
    expect(text(inside(end, 'log'))).not.toContain('unless the Governor pays');
  });

  it('B-AC-26-4: with reduced motion the strikers and their chips are there at once', () => {
    const start = at(0.01, true);
    for (const p of FOOD_PLOTS) {
      expect(has(start, `striker-${p.x}-${p.y}`)).toBe(true);
      expect(text(inside(start, `strike-chip-${p.x}-${p.y}`))).toBe(STRIKE_LOST);
    }
  });

  it('B-AC-26-4: paid, the server sends no strike, so no striker and no strike chip ever shows and every plot keeps what it made', () => {
    const paid = month([]);
    const end = showEnd(paid);
    for (let t = 0.05; t < end; t += 0.1) {
      const html = tv(paid, t);
      expect(has(html, 'striker-')).toBe(false);
      expect(has(html, 'strike-chip-')).toBe(false);
    }
    const harvested = tv(paid, showTimes(paid).flightAt - 0.3);
    expect(units(harvested, 2, 1)).toEqual({ count: '10', bars: 8 });
  });
});

describe('B-AC-26-5: the four new changes have words, rising and falling, on any event', () => {
  const chip = (f: ShowEffect) => renderToStaticMarkup(createElement(EventEffectChip, { f }));
  it.each([
    { f: { on: 'colony', what: 'mood', delta: 10 }, words: 'Mood +10', good: true },
    { f: { on: 'colony', what: 'mood', delta: -4 }, words: 'Mood −4', good: false },
    { f: { on: 'colony', what: 'prestige', delta: 2 }, words: 'Prestige +2', good: true },
    { f: { on: 'colony', what: 'prestige', delta: -3 }, words: 'Prestige −3', good: false },
    // Air is pollution: less of it is good.
    { f: { on: 'colony', what: 'air', delta: -5 }, words: 'Air −5', good: true },
    { f: { on: 'colony', what: 'air', delta: 4 }, words: 'Air +4', good: false },
    { f: { on: OSSA, what: 'reputation', delta: 1 }, words: 'Reputation +1', good: true },
    { f: { on: OSSA, what: 'reputation', delta: -1 }, words: 'Reputation −1', good: false },
  ] as { f: ShowEffect; words: string; good: boolean }[])('B-AC-26-5: $words', ({ f, words, good }) => {
    const html = chip(f);
    expect(text(html).trim()).toBe(`${good ? '▲' : '▼'} ${words}`);
    expect(html).toContain(`data-delta="${good ? 1 : -1}"`);
  });

  it('B-AC-26-5: a mood change on today’s events is said too: the immigration wave and a MULE theft', () => {
    const immigration = event('immigrationWave', 'planning', { title: 'Immigration wave', sign: 'good', effects: [{ on: 'colony', what: 'colonists', delta: 12 }, { on: 'colony', what: 'mood', delta: 3 }] });
    const end = result([immigration], 'tv');
    expect(text(inside(end, 'effects-card'))).toContain('Mood +3');
    expect(text(inside(end, 'log'))).toContain('Colonists +12 · Mood +3');

    const theft = event('muleTheft', 'planning', { title: 'MULE theft', scope: 'personal', origin: { x: 1, y: 1 }, weight: 'spotlight', hits: [{ x: 1, y: 1, order: 0, delta: 0, becomes: 'idle' }], effects: [{ on: 'colony', what: 'mood', delta: -2 }] });
    const stolen = result([theft], 'tv');
    expect(text(inside(stolen, 'log'))).toContain('Lena’s Food farm stands idle · Mood −2');
    expect(text(inside(stolen, 'effects-card'))).toContain('Mood −2');
    for (const html of showFrames([theft], 'alone')) expect(text(html)).not.toMatch(/undefined|NaN/);
  });
});

describe('B-AC-26-6: with politics off, no colony event is ever rolled', () => {
  const COLONY: string[] = ['generalStrike', 'festival', 'riot', 'emigrationWave', 'volunteerCleanup', 'storeStrike', 'walkout', 'loyalCrew', 'blamedForUnrest'];
  // Live for festival, generalStrike, emigrationWave and blamedForUnrest since C26 PR-A; the other five once PR-B adds them.
  it('B-AC-26-6: 60 games, months 2 to 12, every phase that rolls', () => {
    const phases: Phase[] = ['planning', 'development', 'production', 'auction', 'upkeep'];
    const rolled = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const state = createGame({ seed, players: ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id, isAi: false })), politics: false });
      for (let month = 2; month <= 12; month++) {
        state.month = month;
        for (const phase of phases) for (const e of rollPhase(state, phase)) rolled.add(e.key);
      }
    }
    // The roll is real: today's events do fire in these games.
    expect(rolled.size).toBeGreaterThan(0);
    expect([...rolled].filter((k) => COLONY.includes(k))).toEqual([]);
  });
});
