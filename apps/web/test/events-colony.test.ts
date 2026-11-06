import { createGame, EVENT_SHOW, rollPhase, type Phase } from '@mule/engine';
import type { ColonyProjectView, EventView } from '@mule/protocol';
import { EventEffectChip, EventLivingMap, EventShow, EventSoloRail, EventTvLog, eventSegments, type MapTile, type ShowEffect, type ShowEventView, type ShowMode, type ShowPlayer, type Slot } from '@mule/ui';
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
/** Four farms across three players; the park stands on (5,4). */
const OWNED: Record<string, [Slot, MapTile['good']]> = { '1,1': [0, 'food'], '2,1': [0, 'food'], '6,3': [1, 'smithore'], '7,3': [1, 'energy'], '2,3': [2, 'food'], '6,1': [3, 'food'] };
const PARK = { x: 5, y: 4 };
function tilesWith(park: 'standing' | 'damaged'): MapTile[] {
  return Array.from({ length: W * H }, (_, i) => {
    const x = i % W;
    const y = Math.floor(i / W);
    const own = OWNED[`${x},${y}`];
    if (x === STORE.x && y === STORE.y) return { x, y, terrain: 'store', owner: null };
    if (x === PARK.x && y === PARK.y) return { x, y, terrain: 'plains', owner: null, object: { kind: 'park', name: 'Park', stage: park, buildMonths: 1 } };
    return own ? { x, y, terrain: 'plains', owner: own[0], good: own[1] } : { x, y, terrain: 'plains', owner: null };
  });
}
const tiles = tilesWith('standing');
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
// As #370 builds it: kind 'colony', from the first struck plot, every working plot of the good at delta 0.
const STRIKE = event('generalStrike', 'planning', {
  kind: 'colony',
  origin: { ...FOOD_PLOTS[0]! },
  title: 'General strike',
  line: 'This month every Food plot makes 20%, unless the Governor pays the strikers 240 cr from the colony fund.',
  hits: FOOD_PLOTS.map((p, order) => ({ ...p, order, delta: 0 })),
});
const riot = (object: 'park' | 'hospital') =>
  event('riot', 'upkeep', {
    title: 'Riot',
    line: 'One prestige object is damaged (no prestige until repaired); the store loses a third of its stock.',
    hits: object === 'park' ? [{ ...PARK, order: 0, delta: 0 }] : [],
    objects: [{ id: object, becomes: 'damaged' }],
    effects: [
      { on: 'store', what: 'food', delta: -6 },
      { on: 'store', what: 'energy', delta: -4 },
      { on: 'store', what: 'smithore', delta: -5 },
    ],
  });

/** Each of the nine in the phase that rolls it, and the words the TV's log keeps for it. */
const NINE: { ev: ShowEventView; words: string; story?: string[] }[] = [
  { ev: FESTIVAL, words: 'Mood +10 · Prestige +2 · Store +6 Food', story: ['festival-bunting', 'festival-crowd'] },
  { ev: STRIKE, words: 'Food at 20% on 4 farms unless the Governor pays' },
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
  /** The store's stock per good as the view's market sends it, after the phase's events. */
  storeStock?: Partial<Record<'food' | 'energy' | 'smithore', number>>;
}
function screen(events: ShowEventView[], t: number, where: Where, { reduced = false, me = LENA, map = tiles, storeStock }: Opts = {}): string {
  const mode: ShowMode = where === 'alone' ? 'solo' : 'tv';
  const slot = players.find((p) => p.id === me)!.slot;
  const parts =
    where === 'tv'
      ? [createElement(EventLivingMap, { key: 'm', size: 'tv' }), createElement(EventTvLog, { key: 'l' })]
      : [createElement(EventLivingMap, { key: 'm', size: 'phone', focusSlot: slot, onSkip: () => undefined }), createElement(EventSoloRail, { key: 'r', me })];
  return renderToStaticMarkup(createElement(EventShow, { events, introMs: INTRO_MS, t, mode, reduced, width: W, height: H, tiles: map, players, ...(storeStock ? { storeStock } : {}), children: parts }));
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
const plotStage = (html: string, x: number, y: number) => html.match(new RegExp(`data-testid="plot-object-${x}-${y}"[^>]*data-stage="(\\w+)"`))?.[1];

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
  // The view's tiles are after the event: the park is damaged already.
  const after = tilesWith('damaged');

  it('B-AC-26-3: the park: each shelf counts down from the store’s real stock, the park keeps standing until the riot reaches it, then its HIT mark', () => {
    const ev = [riot('park')];
    // The view's market after the riot: 11 Food, 9 Energy, 10 Smithore left, so 17, 13 and 15 before.
    const storeStock = { food: 11, energy: 9, smithore: 10 };
    expect(text(inside(storyAt(ev, 1.5, { map: after, storeStock }), 'riot-storage')).match(/\d+/g)).toEqual(['17', '13', '15']);
    const shelves = storyAt(ev, 4.3, { map: after, storeStock });
    expect(text(inside(shelves, 'riot-storage')).match(/\d+/g)).toEqual(['11', '9', '10']);
    expect(plotStage(shelves, PARK.x, PARK.y)).toBe('standing');
    expect(has(shelves, 'store-flames')).toBe(false);
    // The card is up, but the park's chip waits for the riot to reach it.
    expect(has(shelves, 'effects-card')).toBe(true);
    expect(text(inside(shelves, 'effects-card'))).not.toContain('Park damaged');

    for (const reduced of [false, true]) {
      const end = result(ev, 'tv', { map: after, reduced });
      expect(plotStage(end, PARK.x, PARK.y)).toBe('damaged');
      expect(text(inside(end, `plot-object-${PARK.x}-${PARK.y}`))).toContain('HIT');
      expect(text(inside(end, 'effects-card'))).toContain('Park damaged');
    }
    expect(text(inside(result(ev, 'alone', { map: after }), 'phone-card'))).toContain('Park damaged in the riot');
  });

  it('B-AC-26-3: without the store’s stock, each shelf shows only what it lost, never a guessed count', () => {
    const shelves = text(inside(storyAt([riot('park')], 4.3, { map: after }), 'riot-storage'));
    expect(shelves.match(/[−-]?\d+/g)).toEqual(['−6', '−4', '−5']);
  });

  it('B-AC-26-3: the hospital: damaged, said on the card and in the log, with no mark on the map', () => {
    const ev = [riot('hospital')];
    for (const html of showFrames(ev, 'tv')) expect(text(html)).not.toContain('HIT');
    const end = result(ev, 'tv');
    expect(plotStage(end, PARK.x, PARK.y)).toBe('standing');
    expect(text(inside(end, 'effects-card'))).toContain('Hospital damaged');
    expect(text(inside(end, 'log'))).toContain('Hospital damaged');
  });

  it('B-AC-26-3: the damaged object’s build-site row says it counts 0 until repaired', () => {
    const park: ColonyProjectView = { id: 'park', name: 'Park', stage: 'damaged', cost: { credits: 420, goods: {} }, funded: { credits: 420, goods: {} }, buildMonths: 1, monthsLeft: null, plot: PARK.y * W + PARK.x, prestige: 2, upkeep: 30, repairCost: 150, plaque: [] };
    const row = renderToStaticMarkup(createElement(ProjectRow, { p: park, players: [], size: 'tv' }));
    expect(row).toContain('data-stage="damaged"');
    expect(text(row)).toContain('Damaged in the riot');
  });
});

describe('B-AC-26-4: the planning strike announcement on the TV', () => {
  it('B-AC-26-4: strikers walk out to every Food plot, each gets STRIKE · 20%, and the log says what it costs', () => {
    const ev = [STRIKE];
    const seg = segOf(ev, 'tv');
    expect(text(inside(screen(ev, seg.announceAt + 0.3, 'tv'), 'title-card'))).toContain('unless the Governor pays the strikers 240 cr');
    for (const reduced of [false, true]) {
      const standing = reduced ? result(ev, 'tv', { reduced }) : storyAt(ev, 2.6 + 3 * 0.35 + 0.2);
      for (const p of FOOD_PLOTS) {
        expect(has(standing, `striker-${p.x}-${p.y}`)).toBe(true);
        expect(text(inside(standing, `strike-chip-${p.x}-${p.y}`))).toBe(' STRIKE · 20% ');
      }
      // Nothing stands on land that isn't Food.
      expect(has(standing, 'striker-6-3')).toBe(false);
    }
    expect(text(inside(result(ev, 'tv'), 'log'))).toContain('Food at 20% on 4 farms unless the Governor pays');
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

describe('B-AC-26-6: today’s events are unchanged by the riot’s object marks', () => {
  it('B-AC-26-6: a meteor on an already-damaged park keeps it damaged, before and after it lands', () => {
    const meteor = event('meteorStrike', 'production', { title: 'Meteor strike', origin: { ...PARK }, hits: [{ ...PARK, order: 0, delta: 0, becomes: 'crater' }] });
    const seg = segOf([meteor], 'tv');
    const map = tilesWith('damaged');
    expect(plotStage(screen([meteor], seg.playAt + 0.5, 'tv', { map }), PARK.x, PARK.y)).toBe('damaged');
    expect(plotStage(result([meteor], 'tv', { map }), PARK.x, PARK.y)).toBe('damaged');
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
