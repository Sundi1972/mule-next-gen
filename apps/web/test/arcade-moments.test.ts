import { DEV_STEER, GLINT, HALL, WOLVES } from '@mule/engine';
import type { DevFrame, MuleView, PlayerView } from '@mule/protocol';
import { SeatSpeciesProvider, type Slot } from '@mule/ui';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { seatSpecies } from '../src/game/derive';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { LaptopArcade, PhoneLandscape } from '../src/phone/arcade/Develop';
import { markPacks, momentsAt, pushFrame, startFrameLog, type FrameMoments, type FramePack, type MomentsNow, type PackMarks } from '../src/phone/arcade/frames';
import { bannerBox, FRAMES, overlap, phoneLayout, type Box } from '../src/phone/arcade/layout';
import { StaticLive, type Live } from '../src/phone/arcade/live';
import { TV_LINE, tvLinesPlace } from '../src/phone/arcade/moments';
import { pubPay } from '../src/phone/arcade/seat';
import { PhoneGameProvider } from '../src/phone/game';
import { TvArcade } from '../src/table/TvDevelop';
import { at, devView, FRAMED, LENAS_PLOTS, lenasMe, NOW, PLAYERS, STORE, tableOf, TILES } from './fixtures/arcade';

/**
 * C11, C12: the moments' layers grafted from the approved mock (WolfLayer, GlintLayer, ScrambleLayer) onto the frames'
 * moments (DevFrame.moments) and the view, rendered as the phone, the laptop and the TV draw them; each covering 0 px²
 * of the store, your plots and the controls. The browser half is B-AC-5, B-AC-6 and B-AC-7 in the e2e.
 */

function clientFor(view: MuleView, role: 'player' | 'board' = 'player'): TableClient {
  return {
    subscribe: () => () => {},
    getState: () => ({ status: 'open', role, code: 'MULE', seatId: role === 'player' ? 's1' : null, view: tableOf(view), chat: [], emotes: [], toasts: [], notice: null, clockOffset: 0, handoffCode: null }),
    serverNow: () => NOW,
    savedSeat: () => null,
    join: () => {},
    watch: () => {},
    intent: () => {},
    onFrame: () => () => {},
    roundTripMs: () => null,
  } as unknown as TableClient;
}

const clean = (html: string) => html.replaceAll('<!-- -->', '');

function onPhone(view: MuleView, now: Live, child: ReactElement): string {
  const me = view.me!;
  const self = view.players.find((p) => p.id === me.id)!;
  const value = { table: tableOf(view), view, me, self, slot: self.slot as Slot };
  const tree = createElement(ClientProvider, {
    client: clientFor(view),
    children: createElement(SeatSpeciesProvider, { value: seatSpecies(view), children: createElement(PhoneGameProvider, { value, children: createElement(StaticLive, { live: now, children: child }) }) }),
  });
  return clean(renderToStaticMarkup(tree));
}
const phone = (view: MuleView, now: Live, size: 844 | 667 = 844) => onPhone(view, now, createElement(PhoneLandscape, { frame: { w: FRAMES[size].w, h: FRAMES[size].h } }));
const laptop = (view: MuleView, now: Live) => onPhone(view, now, createElement(LaptopArcade, { frame: { w: 1440, h: 900 } }));
const tv = (view: MuleView, now: Live) => clean(renderToStaticMarkup(createElement(ClientProvider, { client: clientFor(view, 'board'), children: createElement(StaticLive, { live: now, children: createElement(TvArcade, { game: view }) }) })));

const tag = (html: string, testid: string) => new RegExp(`<[^>]*data-testid="${testid}"[^>]*>`).exec(html)?.[0] ?? null;
function inside(html: string, testid: string): string {
  const start = html.indexOf(`data-testid="${testid}"`);
  if (start < 0) return '';
  const open = html.lastIndexOf('<', start);
  const name = /^<([a-z]+)/.exec(html.slice(open))![1]!;
  let depth = 0;
  const re = new RegExp(`<(/?)${name}\\b[^>]*>`, 'g');
  re.lastIndex = open;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[0].endsWith('/>')) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(open, m.index + m[0].length);
  }
  return html.slice(open);
}
const text = (html: string, testid: string) => inside(html, testid).replace(/<[^>]+>/g, '');
/** Where an element moved by transform alone stands, as shares of its layer. */
function moved(html: string, testid: string): { x: number; y: number } {
  const m = /transform:translate\((-?[\d.]+)%, ?(-?[\d.]+)%\)/.exec(tag(html, testid) ?? '');
  if (!m) throw new Error(`no transform on ${testid}`);
  return { x: Number(m[1]), y: Number(m[2]) };
}
const leftTop = (html: string, testid: string) => {
  const t = tag(html, testid) ?? '';
  return { x: Number(/left:(-?[\d.]+)%/.exec(t)![1]), y: Number(/top:(-?[\d.]+)%/.exec(t)![1]) };
};

const TICK = DEV_STEER.tickMs;
/** Lena (s1, this phone) on the forest at 3·2. */
const LENA = { x: 2.5, y: 1.5 };
const framed = () => FRAMED.map((c) => (c.id === 's1' ? at('s1', LENA.x, LENA.y) : c));

/** Lena's pack: three wolves round her. */
const pack = (stage: FramePack['stage'], wolves: FramePack['wolves'] = [
  { x: 1.2, y: 1.1, state: 'prowl', target: null },
  { x: 3.6, y: 0.9, state: 'tell', target: { x: 2.5, y: 1.5 } },
  { x: 2.6, y: 2.9, state: 'open', target: null },
]): FramePack => ({ who: 's1', stage, wolves });

const NONE: FrameMoments = { packs: [], glint: null, scramble: null };

/** A moment on the screens: the frames' moments at `tick`, what the frames so far mark, everyone where FRAMED has them. */
function moment(moments: Partial<FrameMoments>, { tick = 100, racers = [], marks = new Map(), me = LENA }: { tick?: number; racers?: string[]; marks?: PackMarks; me?: { x: number; y: number; space?: 'map' | 'hall' } } = {}): Live {
  const now: MomentsNow = { moments: { ...NONE, ...moments }, tick, racers };
  const others = framed().filter((c) => c.id !== 's1');
  return { me: { x: me.x, y: me.y, space: me.space ?? 'map', facing: 'right', moving: false, lead: null }, others: new Map(others.map((c) => [c.id, c])), status: 'live', beats: [], moments: now, marks };
}
const onTv = (l: Live): Live => ({ ...l, me: null, others: new Map(framed().map((c) => [c.id, c])) });

/** The view with Lena's own colonist in an encounter, bitten, with pelts, as the server's ColonistView says. */
function viewWith(over: Partial<NonNullable<PlayerView['colonist']>>, me = lenasMe()): MuleView {
  return devView(me, { players: PLAYERS.map((p) => (p.id === 's1' ? { ...p, colonist: { ...p.colonist!, ...over } } : p)) });
}

describe('C11, C12: the wolves (RULE-4)', () => {
  const mark = (stage: FramePack['stage'], sinceTick: number, over: Partial<PackMarks extends ReadonlyMap<string, infer M> ? M : never> = {}): PackMarks =>
    new Map([['s1', { stage, sinceTick, centre: { ...LENA }, strikes: 0, bites: 0, ...over }]]);

  it('B-AC-5: your pack choosing: your phone rings you with the choice and its countdown, and draws each wolf where the frame has it', () => {
    const html = phone(viewWith({ encounter: 'choose' }), moment({ packs: [pack('choose')] }, { tick: 100, marks: mark('choose', 80) }));
    // 20 ticks in, a second of chooseSeconds gone.
    expect(text(html, 'wolf-choice-s1')).toBe(`WOLVES!stick: RUN · button: FIGHT · ${WOLVES.chooseSeconds - 1}s`);
    const layer = inside(html, 'wolves-layer');
    pack('choose').wolves.forEach((w, i) => {
      expect(moved(layer, `wolf-s1-${i}`).x).toBeCloseTo((w.x / 15) * 100, 6);
      expect(moved(layer, `wolf-s1-${i}`).y).toBeCloseTo((w.y / 9) * 100, 6);
      expect(tag(layer, `wolf-s1-${i}`)).toContain(`data-state="${w.state}"`);
    });
    // The crouched wolf's spot is ringed, where it will land.
    expect(moved(layer, 'lunge-target-s1')).toEqual({ x: (2.5 / 15) * 100, y: (1.5 / 9) * 100 });
    // The callout rides with Lena's own colonist.
    expect(inside(inside(html, 'walkers-map'), 'colonist-s1')).toContain('wolf-choice-s1');
  });

  it('B-AC-5: the TV shows every pack and the choice in everyone\'s words, and says it along the map', () => {
    const html = tv(viewWith({ encounter: 'choose' }), onTv(moment({ packs: [pack('choose')] }, { marks: mark('choose', 100) })));
    const map = inside(html, 'tv-map-stage');
    expect(text(map, 'wolf-choice-s1')).toBe(`WOLVES!run or fight? · ${WOLVES.chooseSeconds}s`);
    expect(inside(map, 'wolves-layer').match(/data-testid="wolf-s1-\d"/g)).toHaveLength(3);
    expect(text(html, 'tv-beats')).toContain('Wolves! Lena: run or fight?');
    expect(text(html, 'pace-s1')).toContain('WOLVES');
    expect(text(html, 'pace-s2')).not.toContain('WOLVES');
  });

  it('B-AC-5 (negative): nothing on, no pack and no callout on any screen', () => {
    const quiet = moment({});
    for (const html of [phone(devView(), quiet), tv(devView(), onTv(quiet)), laptop(devView(), quiet)]) {
      expect(html).not.toMatch(/data-testid="wolf-s/);
      expect(html).not.toContain('wolf-choice-');
      expect(html).not.toContain('fight-hud-');
    }
  });

  it('B-AC-5: the chase says RUN!; the fight its ground, DODGE or STRIKE! with a wolf open in reach, and the score the frames counted', () => {
    expect(text(phone(viewWith({ encounter: 'chase' }), moment({ packs: [pack('chase')] })), 'wolf-chase-s1')).toBe('RUN!');
    const fight = phone(viewWith({ encounter: 'fight' }), moment({ packs: [pack('fight')] }, { tick: 160, marks: mark('fight', 100, { strikes: 1, bites: 2 }) }));
    // The open wolf at 2.6·2.9 is 1.4 tiles off: out of a strike's reach.
    expect(text(fight, 'fight-hud-s1')).toBe(`DODGE⚔ 1/${WOLVES.strikesToWin}bites 2/${WOLVES.bitesToLose}${WOLVES.fightSeconds - 3}s`);
    expect(moved(inside(fight, 'wolves-layer'), 'arena-s1')).toEqual({ x: (2.5 / 15) * 100, y: (1.5 / 9) * 100 });
    const near = pack('fight', [{ x: 2.9, y: 1.6, state: 'open', target: null }]);
    expect(text(phone(viewWith({ encounter: 'fight' }), moment({ packs: [near] }, { marks: mark('fight', 100) })), 'fight-hud-s1')).toMatch(/^STRIKE!/);
  });

  it('B-AC-5: a bite and pelts, as the view says, ride under the colonist on the phone and the TV', () => {
    const view = viewWith({ bitten: true, pelts: 2 });
    for (const html of [phone(view, moment({})), tv(view, onTv(moment({})))]) {
      expect(text(html, 'bitten-s1')).toBe('BITTEN');
      expect(text(html, 'pelts-s1')).toBe('2 PELTS');
    }
  });
});

describe('C11, C12: the glint race (RULE-5)', () => {
  const lit = { x: 9, y: 2, untilTick: 100 + (GLINT.showSeconds * 1_000) / TICK / 2 };

  it('B-AC-6: lit, the glint shows on its tile on the phone, the laptop and the TV at once, its ring at the share of its time left', () => {
    const now = moment({ glint: lit }, { tick: 100 });
    for (const html of [phone(devView(), now), laptop(devView(), now), tv(devView(), onTv(now))]) {
      expect(tag(html, 'glint')).toContain('data-x="9"');
      expect(leftTop(html, 'glint')).toEqual({ x: (9.5 / 15) * 100, y: (2.5 / 9) * 100 });
      expect(tag(html, 'glint')).toContain(`data-left="${(GLINT.showSeconds / 2).toFixed(2)}"`);
      expect(tag(html, 'glint-ring')).toContain('data-share="0.500"');
    }
  });

  it('B-AC-6: inside the store the phone says where it is lit outside, by which door, and for how long', () => {
    const html = phone(devView(), moment({ glint: lit }, { me: { x: 4, y: 6, space: 'hall' } }));
    expect(tag(html, 'glint')).toBeNull();
    expect(text(html, 'glint-strip')).toBe(`GLINT outside at 10·3 · the right door · ${GLINT.showSeconds / 2} s`);
  });

  it('B-AC-6: on the TV each colonist turns to look, a line from each racer, the line along the map, and GLINT in the racer\'s pace row', () => {
    const html = tv(devView(), onTv(moment({ glint: lit }, { racers: ['s2'] })));
    const map = inside(html, 'tv-map-stage');
    expect(tag(map, 'glint-turn-s2')).not.toBeNull();
    expect(inside(map, 'glint-sightlines')).toContain('data-who="s2"');
    expect(inside(map, 'glint-sightlines')).not.toContain('data-who="s4"');
    expect(text(html, 'tv-beats')).toContain('A Crystite glint at 10·3! First there wins');
    expect(text(html, 'pace-s2')).toContain('GLINT');
    expect(text(html, 'pace-s4')).not.toContain('GLINT');
  });

  it('B-AC-6 (negative): past its untilTick the glint is gone from every screen, though the frame still carries it', () => {
    let log = startFrameLog();
    const frame = (tick: number): DevFrame & { moments: FrameMoments } => ({ tick, at: tick * TICK, colonists: framed(), beats: [], moments: { ...NONE, glint: { x: 9, y: 2, untilTick: 104 } } });
    for (const t of [100, 101, 102, 103, 104, 105]) log = pushFrame(log, frame(t), t * TICK);
    // Drawn interpolateMs behind the newest: tick 103, still lit; then 105, past it.
    expect(momentsAt(log, 105 * TICK, DEV_STEER)!.moments.glint).not.toBeNull();
    const later = momentsAt(log, 105 * TICK + 2 * TICK, DEV_STEER)!;
    expect(later.tick).toBeGreaterThanOrEqual(104);
    expect(later.moments.glint).toBeNull();
    const html = phone(devView(), { ...moment({}), moments: later });
    expect(tag(html, 'glint')).toBeNull();
  });
});

describe('C11, C12: the corral scramble (RULE-6)', () => {
  const called = { untilTick: 400, needers: ['s1', 's2', 's3'], got: [], over: null, leftOut: [] };

  it('B-AC-7: called, every screen says so: you racing, the others racing, the one who got one; the TV\'s corral counts what is left', () => {
    const view = devView(lenasMe(), { storeMules: 2 });
    expect(text(phone(view, moment({ scramble: called })), 'scramble-banner')).toBe('2 MULEs left! Race to the corral');
    expect(tag(phone(view, moment({ scramble: called })), 'scramble-banner')).toContain('data-tone="alert"');
    const got = phone(devView(lenasMe({ carriedMule: 'empty' }), { storeMules: 2 }), moment({ scramble: { ...called, got: ['s1'] } }));
    expect(text(got, 'scramble-banner')).toBe('You got one! 2 left for the others');
    const tvHtml = tv(view, onTv(moment({ scramble: called })));
    expect(tag(tvHtml, 'scramble-corral')).toContain('data-left="2"');
    expect(text(tvHtml, 'tv-beats')).toContain('2 MULEs left! Race to the corral');
    expect(inside(tvHtml, 'scramble-lines-map')).toContain('data-who="s2"');
    expect(text(tvHtml, 'pace-s2')).toContain('CORRAL');
    expect(laptop(view, moment({ scramble: called }))).toContain('data-testid="scramble-banner"');
  });

  it('B-AC-7: left out, your phone tells you, with what the pub pays now: the engine\'s pubPayoutFor through pubPay', () => {
    const view = devView(lenasMe(), { storeMules: 0 });
    const html = phone(view, moment({ scramble: { ...called, got: ['s2', 's3'], over: 'empty', leftOut: ['s1'] } }));
    const pay = pubPay(view, lenasMe(), 30);
    expect(text(html, 'scramble-banner')).toBe(`The corral is empty: no MULE for you this turn. The pub pays +${pay} cr now, less the longer you wait.`);
    expect(tag(html, 'scramble-banner')).toContain('data-tone="warn"');
  });

  it('B-AC-7: ended on its clock, the frames still carry it to the turn\'s end: the one left out is still told, the corral no longer pulses', () => {
    const view = devView(lenasMe(), { storeMules: 1 });
    const ended = moment({ scramble: { ...called, got: ['s2'], over: 'time', leftOut: ['s1', 's3'] } });
    const html = phone(view, ended);
    // A MULE is still in the corral: she can still buy it, so the phone says the scramble is over, not that none is left.
    expect(text(html, 'scramble-banner')).toBe('The scramble is over: 1 MULE left');
    const empty = devView(lenasMe(), { storeMules: 0 });
    expect(text(phone(empty, ended), 'scramble-banner')).toBe(`The corral is empty: no MULE for you this turn. The pub pays +${pubPay(empty, lenasMe(), 30)} cr now, less the longer you wait.`);
    expect(tag(tv(view, onTv(ended)), 'scramble-corral')).toBeNull();
    // Not left out and without one, after a scramble that ran out of time: nothing to say.
    const ossa = devView({ ...lenasMe(), id: 's4' }, { storeMules: 1 });
    expect(tag(phone(ossa, ended), 'scramble-banner')).toBeNull();
  });

  it('B-AC-7 (negative): no scramble, no banner, no corral call: the guide\'s note keeps the box', () => {
    const html = phone(devView(lenasMe(), { storeMules: 2 }), moment({}));
    expect(tag(html, 'scramble-banner')).toBeNull();
    expect(tag(tv(devView(), onTv(moment({}))), 'scramble-corral')).toBeNull();
  });
});

describe('C11, C12: the moments cover 0 px² of the store, your plots and the controls (B-AC-4 extended)', () => {
  const tile = (L: ReturnType<typeof phoneLayout>, p: { x: number; y: number }): Box => ({ x: L.stage.x + p.x * L.cell, y: L.stage.y + p.y * L.cell, w: L.cell, h: L.cell });

  it.each([844, 667] as const)('C11: at %i the banner on the map keeps off the store, your plots and the controls, also with plots of yours along the bottom rows', (size) => {
    const L = phoneLayout(FRAMES[size], 'map', 15, 9);
    const bottom = [5, 6, 7, 8, 9].flatMap((x) => [{ x, y: 8 }, { x, y: 7 }]);
    for (const plots of [LENAS_PLOTS, [...LENAS_PLOTS, ...bottom]]) {
      const b = bannerBox(L, 'map', 9, [...plots, STORE]);
      expect(b.w).toBeGreaterThanOrEqual(4 * L.cell - 4);
      for (const k of [...plots, STORE].map((p) => tile(L, p))) expect(overlap(b, k)).toBe(0);
      for (const c of [L.stick, L.button]) expect(overlap(b, c)).toBe(0);
    }
  });

  it.each([844, 667] as const)('C11: at %i in the hall the banner and the glint strip keep off the controls', (size) => {
    const L = phoneLayout(FRAMES[size], 'hall');
    const strip: Box = { x: L.stage.x + 8, y: L.stage.y + 8, w: L.stage.w - 16, h: 24 };
    for (const b of [bannerBox(L, 'hall', 9, []), strip]) for (const c of [L.stick, L.button]) expect(overlap(b, c)).toBe(0);
  });

  it('C11: the phone draws the banner in that box', () => {
    const plots = [5, 6, 7, 8, 9].map((x) => ({ x, y: 8 }));
    const tiles = TILES.map((t) => (plots.some((p) => p.x === t.x && p.y === t.y) ? { ...t, owner: 's1' } : t));
    const view = devView(lenasMe(), { tiles, storeMules: 2 });
    const html = phone(view, moment({ scramble: { untilTick: 400, needers: ['s1'], got: [], over: null, leftOut: [] } }));
    const L = phoneLayout(FRAMES[844], 'map', 15, 9);
    const b = bannerBox(L, 'map', 9, [...tiles.filter((t) => t.owner === 's1'), STORE]);
    expect(tag(html, 'scramble-banner-box')).toContain(`left:${b.x}px;top:${b.y}px;width:${b.w}px`);
    expect(inside(html, 'scramble-banner-box')).toContain('scramble-banner');
  });

  it('C12: the TV\'s lines stack along the map\'s foot only as far as the store\'s row, and above it when the store sits low', () => {
    const mapW = 740;
    const cell = mapW / 15;
    const place = tvLinesPlace(devView(), mapW);
    expect(place.edge).toBe('bottom');
    const stack = place.most * TV_LINE.h + (place.most - 1) * TV_LINE.gap;
    const lines: Box = { x: 0, y: 9 * cell - TV_LINE.inset - stack, w: mapW, h: stack };
    expect(overlap(lines, { x: STORE.x * cell, y: STORE.y * cell, w: cell, h: cell })).toBe(0);
    const low = TILES.map((t) => (t.terrain === 'store' ? { ...t, terrain: 'plains' as const } : t.x === 7 && t.y === 8 ? { ...t, terrain: 'store' as const } : t));
    const top = tvLinesPlace(devView(lenasMe(), { tiles: low }), mapW);
    expect(top.edge).toBe('top');
    expect(TV_LINE.inset + top.most * TV_LINE.h + (top.most - 1) * TV_LINE.gap).toBeLessThanOrEqual(8 * cell);
    // Four seats meeting wolves, a glint and a scramble still leave the store clear: the lines beyond the room are not drawn.
    const busy = devView(lenasMe(), { players: PLAYERS.map((p) => ({ ...p, colonist: { ...p.colonist!, encounter: 'choose' as const } })) });
    const html = tv(busy, onTv(moment({ glint: { x: 9, y: 2, untilTick: 200 }, scramble: { untilTick: 400, needers: ['s1'], got: [], over: null, leftOut: [] } })));
    expect(inside(html, 'tv-beats').match(/data-testid="tv-beat"/g)).toHaveLength(place.most);
  });
});

describe('C11, C12: the frames\' moments, as the screens read them', () => {
  const frame = (tick: number, packs: FramePack[], colonists = framed()): DevFrame & { moments: FrameMoments } => ({ tick, at: tick * TICK, colonists, beats: [], moments: { ...NONE, packs } });

  it('C12: between two frames the wolves are drawn interpolated, as the walkers are; the glint\'s racers are those closing on it', () => {
    let log = startFrameLog();
    const w = (x: number) => [{ x, y: 1, state: 'prowl' as const, target: null }];
    const lit = (f: DevFrame & { moments: FrameMoments }) => ({ ...f, moments: { ...f.moments, glint: { x: 9, y: 2, untilTick: 99 } } });
    log = pushFrame(log, lit(frame(10, [pack('chase', w(1))])), 10 * TICK);
    const closer = framed().map((c) => (c.id === 's2' ? { ...c, x: c.x - 0.1 } : c));
    log = pushFrame(log, lit(frame(11, [pack('chase', w(2))], closer)), 11 * TICK);
    // Drawn interpolateMs behind now, the instant falls half way between the two frames.
    const now = momentsAt(log, 11 * TICK + DEV_STEER.interpolateMs - TICK / 2, DEV_STEER)!;
    expect(now.tick).toBeCloseTo(10.5, 6);
    expect(now.moments.packs[0]!.wolves[0]!.x).toBeCloseTo(1.5, 6);
    expect(now.racers).toEqual(['s2']);
  });

  it('C11: the marks: a stage\'s start and spot, and a fight\'s strikes and bites counted from wolves turning hurt', () => {
    const f = (tick: number, stage: FramePack['stage'], states: FramePack['wolves'][number]['state'][]) => frame(tick, [pack(stage, states.map((state, i) => ({ x: i, y: 1, state, target: null })))]);
    let marks: PackMarks = new Map();
    let before: DevFrame | null = null;
    for (const fr of [f(1, 'choose', ['prowl', 'prowl']), f(2, 'fight', ['tell', 'open']), f(3, 'fight', ['lunge', 'hurt']), f(4, 'fight', ['hurt', 'hurt']), f(5, 'fight', ['prowl', 'prowl'])]) {
      marks = markPacks(marks, fr, before);
      before = fr;
    }
    expect(marks.get('s1')).toEqual({ stage: 'fight', sinceTick: 2, centre: LENA, strikes: 1, bites: 1 });
    // A frame no newer changes nothing; a pack gone takes its mark.
    expect(markPacks(marks, f(5, 'fight', ['hurt', 'hurt']), before)).toBe(marks);
    expect(markPacks(marks, frame(6, []), before).size).toBe(0);
  });
});
