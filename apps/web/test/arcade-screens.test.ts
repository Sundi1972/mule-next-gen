import { boxOf, buildFloor, createGame, DEV_WALK, floorConfig, HALL, pubPayoutFor, reachOf, reachWords, type HallPlace, type Player } from '@mule/engine';
import type { ChatMessage, MuleView, MyView, TileView } from '@mule/protocol';
import { ActionButton, FAN, Joystick, LiveWalkers, SeatSpeciesProvider, type Slot } from '@mule/ui';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { seatSpecies } from '../src/game/derive';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { keyDown, keyUp, startControls, stickOf } from '../src/phone/arcade/controls';
import { LaptopArcade, PhoneLandscape } from '../src/phone/arcade/Develop';
import { WORKS_CAPTION_PX } from '../src/phone/arcade/stages';
import { FRAMES, overlap, phoneLayout, type Box } from '../src/phone/arcade/layout';
import { pubPay } from '../src/phone/arcade/seat';
import { StaticLive, type Live } from '../src/phone/arcade/live';
import { PhoneGameProvider } from '../src/phone/game';
import { fitHall, TvArcade } from '../src/table/TvDevelop';
import { BUBBLE_MAX_MS } from '../src/chat/queue';
import { at, devView, FRAMED, LENAS_PLOTS, lenasMe, NOW, PLAYERS, reach, STORE, tableOf, TILES } from './fixtures/arcade';

/**
 * C11, C12, C13: the arcade's development screens grafted from the approved mock (design/mocks/ws6-ux/src/screens/
 * arcade/ at d30ae057) onto the real view and frames, rendered as the game draws them. The browser half (steering in a
 * real browser against the server's tick, B-AC-1/2/3/4/8) waits for the server tick and the harness's steering step.
 */

function clientFor(view: MuleView, role: 'player' | 'board' = 'player', chat: ChatMessage[] = []): TableClient {
  return {
    subscribe: () => () => {},
    getState: () => ({ status: 'open', role, code: 'MULE', seatId: role === 'player' ? 's1' : null, view: tableOf(view), chat, emotes: [], toasts: [], notice: null, clockOffset: 0, handoffCode: null }),
    serverNow: () => NOW,
    savedSeat: () => null,
    join: () => {},
    watch: () => {},
    intent: () => {},
    onFrame: () => () => {},
    roundTripMs: () => null,
  } as unknown as TableClient;
}

const live = (me: Live['me'], others = FRAMED.filter((c) => c.id !== 's1'), status: Live['status'] = 'live'): Live => ({ me, others: new Map(others.map((c) => [c.id, c])), status, beats: [] });
const mine = (x: number, y: number, over: Partial<NonNullable<Live['me']>> = {}): NonNullable<Live['me']> => ({ x, y, space: 'map', facing: 'right', moving: false, lead: null, ...over });

/** The screen in the providers the game gives it: the client, the seats' species, your seat and the live frames. */
function seated(view: MuleView, now: Live, child: ReactElement, client: TableClient = clientFor(view)): ReactElement {
  const me = view.me!;
  const self = view.players.find((p) => p.id === me.id)!;
  const value = { table: tableOf(view), view, me, self, slot: self.slot as Slot };
  return createElement(ClientProvider, {
    client,
    children: createElement(SeatSpeciesProvider, { value: seatSpecies(view), children: createElement(PhoneGameProvider, { value, children: createElement(StaticLive, { live: now, children: child }) }) }),
  });
}

function onPhone(view: MuleView, now: Live, child: ReactElement, chat: ChatMessage[] = []): string {
  return renderToStaticMarkup(seated(view, now, child, clientFor(view, 'player', chat))).replaceAll('<!-- -->', '');
}

const phone = (view: MuleView, now: Live, size: 844 | 667 = 844, chat: ChatMessage[] = []) => onPhone(view, now, createElement(PhoneLandscape, { frame: { w: FRAMES[size].w, h: FRAMES[size].h } }), chat);
const laptop = (view: MuleView, now: Live, chat: ChatMessage[] = []) => onPhone(view, now, createElement(LaptopArcade, { frame: { w: 1440, h: 900 } }), chat);

/** The opening tag of the element with this testid, or null. */
const tag = (html: string, testid: string) => new RegExp(`<[^>]*data-testid="${testid}"[^>]*>`).exec(html)?.[0] ?? null;
/**
 * A percentage from an element's inline style: its left or top, or for a live walker (C13, moved by transform alone)
 * the share of its layer its translate moves it by.
 */
function pct(html: string, testid: string, prop: 'left' | 'top'): number {
  const t = tag(html, testid);
  const m = t && new RegExp(`${prop}:(-?[\\d.]+)%`).exec(t);
  if (m) return Number(m[1]);
  const moved = t && /transform:translate\((-?[\d.]+)%, ?(-?[\d.]+)%\)/.exec(t);
  if (!moved) throw new Error(`no ${prop} on ${testid}`);
  return Number(prop === 'left' ? moved[1] : moved[2]);
}
/** The markup inside the first element with this testid, as far as its closing at the same depth. */
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

describe('C11: the plots legend in the hall fits above the button', () => {
  // Lena's plots along row 8, the free ones last on the map (x 4, 5, 6) so only the legend's own order puts them first.
  const many = (n: number) => TILES.map((t) => (t.y === 8 && t.x < n ? { ...t, owner: 's1', outfit: t.x >= 4 ? null : ('food' as const) } : t.owner === 's1' ? { ...t, owner: null, outfit: null } : t));
  const order = (html: string) => [...inside(html, 'my-plots-legend').matchAll(/data-testid="legend-(\d+)-8"/g)].map((m) => Number(m[1]));
  const rows = (html: string) => (inside(html, 'my-plots-legend').match(/data-testid="legend-\d+-\d+"/g) ?? []).length;

  it('C11 (B-AC-4): with up to five plots every one is listed', () => {
    const html = phone(devView(lenasMe({ carriedMule: 'empty' }), { tiles: many(5) }), live(mine(4, 6, { space: 'hall' })));
    expect(rows(html)).toBe(5);
    expect(order(html)).toEqual([4, 0, 1, 2, 3]);
    expect(text(html, 'my-plots-legend')).not.toContain('more');
  });

  it('C11 (B-AC-4): with six or more the free plots come first, four rows, the rest as "+N more", so it never reaches the button', () => {
    const html = phone(devView(lenasMe({ carriedMule: 'empty' }), { tiles: many(7) }), live(mine(4, 6, { space: 'hall' })));
    expect(rows(html)).toBe(4);
    expect(order(html)).toEqual([4, 5, 6, 0]);
    expect(text(html, 'my-plots-legend')).toContain('+3 more');
  });
});

describe('C11: the phone, held sideways', () => {
  it('C11: the whole map, every colonist where the frames have them, and yours where your own prediction is', () => {
    const html = phone(devView(), live(mine(5.5, 4.5, { moving: true })));
    expect(tag(html, 'phone-game')).toMatch(/data-mode="side"/);
    expect(tag(html, 'phone-game')).toMatch(/data-store="7,4"/);
    expect(tag(html, 'phone-game')).toMatch(/data-my-plots="3,0 14,0 3,3"/);
    const map = inside(html, 'walkers-map');
    expect(pct(map, 'colonist-s1', 'left')).toBeCloseTo((5.5 / 15) * 100, 6);
    expect(pct(map, 'colonist-s1', 'top')).toBeCloseTo((4.5 / 9) * 100, 6);
    expect(tag(map, 'colonist-s1')).toMatch(/data-moving="true"/);
    expect(pct(map, 'colonist-s2', 'left')).toBeCloseTo((10.5 / 15) * 100, 6);
    expect(pct(map, 'colonist-s4', 'top')).toBeCloseTo((6.8 / 9) * 100, 6);
    // Kai is in the store's hall: not on the map.
    expect(tag(map, 'colonist-s3')).toBeNull();
  });

  it('C11: the button says what the server\'s reach says, and is dim when the reach is', () => {
    const buy = phone(devView(lenasMe({ reach: reach('BUY MULE', '148 cr') })), live(mine(5.5, 4.5)));
    expect(text(buy, 'action-verb')).toBe('BUY MULE');
    expect(text(buy, 'action-detail')).toBe('148 cr');
    expect(tag(buy, 'action-button')).toMatch(/data-enabled="true"/);
    expect(tag(buy, 'action-button')).not.toMatch(/\sdisabled=""/);
    const dim = phone(devView(lenasMe({ reach: reach('TO THE STORE', null, false) })), live(mine(5.5, 4.5)));
    expect(text(dim, 'action-verb')).toBe('TO THE STORE');
    expect(tag(dim, 'action-button')).toMatch(/\sdisabled=""/);
    expect(tag(dim, 'action-detail')).toBeNull();
  });

  it('C11: inside the store the hall fills the screen: you at your own position, everyone inside at theirs', () => {
    const html = phone(devView(lenasMe({ reach: reach('LEAVE', 'to the colony') })), live(mine(4, 6, { space: 'hall' })));
    expect(tag(html, 'map-stage')).toBeNull();
    const hall = inside(html, 'hall-stage');
    expect(tag(hall, 'store-hall')).not.toBeNull();
    expect(pct(hall, 'visitor-s1', 'left')).toBeCloseTo((4 / HALL.w) * 100, 6);
    expect(pct(hall, 'visitor-s1', 'top')).toBeCloseTo((6 / HALL.h) * 100, 6);
    expect(pct(inside(hall, 'walkers-hall'), 'colonist-s3', 'left')).toBeCloseTo((8 / HALL.w) * 100, 6);
    // Your own colonist is the store's own visitor, once: not also a walker.
    expect(tag(inside(hall, 'walkers-hall'), 'colonist-s1')).toBeNull();
    // It faces the way the frame says it heads, as on the map, not the way its half of the hall would have it.
    expect(inside(hall, 'visitor-s1')).toContain('data-facing="right"');
    const back = phone(devView(lenasMe({ reach: reach('LEAVE', 'to the colony') })), live(mine(4, 6, { space: 'hall', facing: 'left' })));
    expect(inside(back, 'visitor-s1')).toContain('data-facing="left"');
    const kai = phone(devView(), live(mine(4, 6, { space: 'hall' }), FRAMED.filter((c) => c.id !== 's1').map((c) => (c.id === 's3' ? { ...c, facing: 'left' as const } : c))));
    expect(inside(inside(kai, 'walkers-hall'), 'colonist-s3')).toContain('data-facing="left"');
  });

  /** The guide's ring and label: on the map the first ring, in the hall each room's ring. */
  const guide = (me: MyView, where: 'map' | 'hall', x = where === 'map' ? 5.5 : 4, y = where === 'map' ? 4.5 : 6) => phone(devView(me), live(mine(x, y, { space: where })));

  it.each<[string, MyView, 'map' | 'hall', Record<string, string>]>([
    ['no MULE, the money for one: the store, then the corral', lenasMe(), 'map', { 'guide-label': 'STORE · CORRAL' }],
    ['no MULE, in the store: the corral', lenasMe(), 'hall', { 'guide-room-corral': 'CORRAL' }],
    ['an empty MULE with 60 cr: only the outfitters you can pay', lenasMe({ carriedMule: 'empty' }), 'hall', { 'guide-room-food': 'OUTFITTER', 'guide-room-water': 'OUTFITTER', 'guide-room-energy': 'OUTFITTER', 'guide-room-greenBelt': 'FIT' }],
    ['a Food MULE in the store: the door on your best plot\'s side', lenasMe({ carriedMule: 'food' }), 'hall', { 'guide-room-doorL': 'DOOR' }],
    ['a Food MULE on the map: your best free plot for Food', lenasMe({ carriedMule: 'food' }), 'map', { 'guide-label': 'YOUR PLOT 4·1' }],
    ['installed this turn: the store, then the pub', lenasMe({ installedThisTurn: true }), 'map', { 'guide-label': 'STORE · PUB' }],
    ['installed this turn, in the store: the pub', lenasMe({ installedThisTurn: true }), 'hall', { 'guide-room-pub': 'PUB' }],
  ])('C11 (RULE-9): %s', (_, me, where, rings) => {
    const poor = me.carriedMule === 'empty';
    const view = poor ? devView(me, { players: PLAYERS.map((p) => (p.id === 's1' ? { ...p, money: 60 } : p)) }) : devView(me);
    const html = phone(view, live(mine(where === 'map' ? 5.5 : 4, where === 'map' ? 4.5 : 6, { space: where })));
    for (const [testid, words] of Object.entries(rings)) expect(text(html, testid)).toBe(words);
    if (poor) for (const dear of ['smithore', 'crystite', 'rareEarth', 'alloy', 'electronics', 'medicine']) expect(tag(html, `guide-room-${dear}`)).toBeNull();
  });

  it('B-AC-SWAP-5 (AM-35): leading a MULE she swapped off a plot, Lena\'s walking screen warns it goes back to the corral at turn end; a MULE she bought never does', () => {
    const words = 'Turn ends: this MULE goes back to the corral';
    const swapped = lenasMe({ carriedMule: 'food', leadsSwapped: true });
    const onMap = guide(swapped, 'map');
    expect(text(onMap, 'guide-note')).toBe(words);
    expect(text(onMap, 'guide-label'), 'the ring still shows her best free plot for it').toBe('YOUR PLOT 4·1');
    expect(text(guide(swapped, 'hall'), 'guide-note'), 'in the store').toBe(words);
    const noFreePlot = devView(swapped, { tiles: TILES.map((t) => (t.owner === 's1' && t.outfit === null ? { ...t, owner: null } : t)) });
    expect(text(phone(noFreePlot, live(mine(5.5, 4.5))), 'guide-note'), 'no free plot of hers left: the pub, and still the warning').toBe(words);
    expect(tag(guide(lenasMe({ carriedMule: 'food' }), 'map'), 'guide-note'), 'a MULE she bought').toBeNull();
    expect(tag(guide(lenasMe({ carriedMule: 'food' }), 'hall'), 'guide-note'), 'a MULE she bought, in the store').toBeNull();
  });

  /** What the engine's pub pays Lena with `seconds` left, in month 2's development as the fixture has it. */
  function enginePay(seconds: number): number {
    const state = createGame({ seed: 1, players: [{ id: 's1', name: 'Lena', isAi: false, species: 'zipwing' }, { id: 's2', name: 'Ossa', isAi: false, species: 'gearling' }] });
    state.phase = 'development';
    state.month = 2;
    state.players[0]!.devSeconds = lenasMe().devSeconds;
    return pubPayoutFor(state, 's1', seconds);
  }
  const poorView = (me: MyView = lenasMe()) => devView(me, { players: PLAYERS.map((p) => (p.id === 's1' ? { ...p, money: 100 } : p)) });

  it('C11 (RULE-9, V-7): no MULE and not the money for one: never the corral; what you can do instead, in words', () => {
    const view = poorView();
    const html = phone(view, live(mine(6.6, 4.5)));
    expect(text(html, 'guide-label')).toBe('ANALYSE · 4·1');
    expect(text(html, 'guide-note')).toBe(`A MULE costs 148 cr; you have 100. Analyse a plot, or end at the pub for ≈${enginePay(30)} cr.`);
    expect(guide(lenasMe(), 'hall')).toContain('guide-room-corral');
    expect(phone(view, live(mine(4, 6, { space: 'hall' })))).not.toContain('guide-room-corral');
  });

  it('C11 (R-2): the pub\'s sum, in the guide\'s words and on the hall\'s pub, is the engine\'s pubPayoutFor, its clamps included', () => {
    const inHall = phone(poorView(), live(mine(4, 6, { space: 'hall' })));
    expect(text(inHall, 'guide-room-pub')).toBe(`PUB ≈ +${enginePay(30)} cr`);
    // A clock that reads more than the turn's full time pays the full share, as the engine caps it.
    const early = phone(poorView(lenasMe({ devEndsAt: NOW + 80_000 })), live(mine(4, 6, { space: 'hall' })));
    expect(text(early, 'guide-room-pub')).toBe(`PUB ≈ +${enginePay(80)} cr`);
    expect(enginePay(80)).toBe(enginePay(50));
    // Time past the end pays no share, never less than the base.
    expect(pubPay(poorView(), lenasMe(), -5)).toBe(enginePay(-5));
  });

  it('C11: the target is ringed with the map\'s own selected ring: your plot to install on, the door to enter by', () => {
    const install = phone(devView(lenasMe({ carriedMule: 'food', reach: reach('INSTALL · FOOD') })), live(mine(3.5, 0.6)));
    expect(tag(install, 'map-plot-3-0')).toMatch(/data-selected="true"/);
    expect(inside(install, 'map-plot-3-0')).toContain('data-testid="selected-ring"');
    const enter = phone(devView(lenasMe({ reach: reach('ENTER STORE') })), live(mine(6.82, 4.5)));
    expect(tag(enter, 'store-door-L')).toMatch(/data-next="true"/);
    expect(tag(enter, 'store-door-R')).not.toMatch(/data-next/);
    // A dim button lights nothing.
    const dim = phone(devView(lenasMe({ carriedMule: 'food', reach: reach('TO YOUR PLOT', null, false) })), live(mine(3.5, 0.6)));
    expect(dim).not.toContain('data-selected');
  });

  /** Lena's one free plot moved to (x, y), her Energy plot kept, a Food MULE on her lead: the ring goes there. */
  const onlyFreePlot = (x: number, y: number) =>
    devView(lenasMe({ carriedMule: 'food' }), { tiles: TILES.map((t) => ({ ...t, owner: t.x === x && t.y === y ? 's1' : t.owner === 's1' && t.outfit === null ? null : t.owner })) });
  it.each<[string, number, string, RegExp]>([
    ['column 0: anchored to the plot\'s inner side, its left edge', 0, 'start', /\bleft-0\b/],
    ['the last column: anchored to its right edge', 14, 'end', /\bright-0\b/],
    ['inside: centred on the ring', 4, 'middle', /left-1\/2 -translate-x-1\/2/],
  ])('C11 (RULE-9): the plot label stays inside the map at %s', (_, x, anchor, cls) => {
    for (const size of [844, 667] as const) {
      const html = phone(onlyFreePlot(x, 2), live(mine(5.5, 4.5)), size);
      expect(tag(html, 'guide-map')).toMatch(new RegExp(`data-x="${x}"`));
      expect(text(html, 'guide-label')).toBe(`YOUR PLOT ${x + 1}·3`);
      const label = tag(html, 'guide-label')!;
      expect(label).toMatch(new RegExp(`data-anchor="${anchor}"`));
      expect(label).toMatch(cls);
      if (anchor !== 'middle') expect(label).not.toMatch(/translate-x/);
    }
  });

  it('C11 (RULE-9): the works\' bay rings start below its caption, so "THE WORKS" sits above them; other rooms\' rings fill their box', () => {
    const html = phone(devView(lenasMe({ carriedMule: 'empty' })), live(mine(4, 6, { space: 'hall' })));
    for (const bay of ['alloy', 'electronics', 'medicine'] as const) {
      const ring = tag(html, `guide-room-${bay}`);
      expect(ring, bay).not.toBeNull();
      const b = boxOf(bay);
      // The bay's own top in the plan, pushed down by the caption strip's height as the phone draws it (Store.tsx).
      const top = /top:calc\(([\d.]+)% \+ (\d+)px\)/.exec(ring!);
      expect(Number(top?.[1])).toBeCloseTo((b.y0 / HALL.h) * 100, 6);
      expect(Number(top?.[2])).toBe(WORKS_CAPTION_PX);
      const height = /height:calc\(([\d.]+)% - (\d+)px\)/.exec(ring!);
      expect(Number(height?.[1])).toBeCloseTo(((b.y1 - b.y0) / HALL.h) * 100, 6);
      expect(Number(height?.[2])).toBe(WORKS_CAPTION_PX);
      expect(ring).toMatch(/data-below="works-caption"/);
    }
    expect(WORKS_CAPTION_PX).toBeGreaterThanOrEqual(21);
    // Negative: a shopfront's ring is its whole box.
    expect(tag(html, 'guide-room-food')).toMatch(/top:[\d.]+%;/);
    expect(tag(html, 'guide-room-food')).not.toMatch(/data-below/);
  });

  it('C13: two colonists on one spot are drawn side by side in seat order, each visible; the wire\'s positions are untouched', () => {
    const together = FRAMED.filter((c) => c.id !== 's1').map((c) => (c.id === 's2' ? { ...c, x: 6.6, y: 4.5, moving: false } : c));
    const map = inside(phone(devView(), live(mine(6.6, 4.5), together)), 'walkers-map');
    const [lena, ossa] = [pct(map, 'colonist-s1', 'left'), pct(map, 'colonist-s2', 'left')];
    expect(lena).toBeCloseTo(((6.6 - FAN.step.map / 2) / 15) * 100, 6);
    expect(ossa).toBeCloseTo(((6.6 + FAN.step.map / 2) / 15) * 100, 6);
    expect(pct(map, 'colonist-s1', 'top')).toBeCloseTo((4.5 / 9) * 100, 6);
    // Drawing only: each still says where it stands.
    expect(tag(map, 'colonist-s1')).toMatch(/data-x="6.600"/);
    expect(tag(map, 'colonist-s2')).toMatch(/data-x="6.600"/);
    // Brix, apart from them, is drawn where he stands.
    expect(pct(map, 'colonist-s4', 'left')).toBeCloseTo((9.5 / 15) * 100, 6);
    // In the hall your own colonist is the store's visitor: it moves aside by the same rule, the other walker the other way.
    const hall = inside(phone(devView(), live(mine(8, 6, { space: 'hall' }))), 'hall-stage');
    expect(pct(hall, 'visitor-s1', 'left')).toBeCloseTo(((8 - FAN.step.hall / 2) / HALL.w) * 100, 6);
    expect(pct(inside(hall, 'walkers-hall'), 'colonist-s3', 'left')).toBeCloseTo(((8 + FAN.step.hall / 2) / HALL.w) * 100, 6);
    // Negative: apart by more than 0.3, nobody moves.
    const apart = inside(phone(devView(), live(mine(6.6, 4.5), together.map((c) => (c.id === 's2' ? { ...c, x: 7.0 } : c)))), 'walkers-map');
    expect(pct(apart, 'colonist-s1', 'left')).toBeCloseTo((6.6 / 15) * 100, 6);
    expect(pct(apart, 'colonist-s2', 'left')).toBeCloseTo((7.0 / 15) * 100, 6);
  });

  it('C11 (RULE-10): reconnecting says so, and the colonist stands where the last frame had it', () => {
    const html = phone(devView(), live(mine(5.5, 4.5), undefined, 'reconnecting'));
    expect(text(html, 'reconnecting')).toBe('RECONNECTING…');
    expect(phone(devView(), live(mine(5.5, 4.5)))).not.toContain('data-testid="reconnecting"');
  });

  it('C11: the turn over in the pub: the card says so, and how many MULEs went in', () => {
    const view = devView(lenasMe({ installedThisTurn: true, reach: reach('IN THE PUB', 'turn over', false) }), { players: PLAYERS.map((p) => (p.id === 's1' ? { ...p, doneDeveloping: true } : p)) });
    const html = phone(view, live(null));
    expect(text(html, 'over-card')).toMatch(/^In the pub: your turn is over/);
  });
});

describe('C11: the store\'s promises on the walking screen (B-AC-9, B-AC-10)', () => {
  it('B-AC-9: fed and well, the pace line says full pace and her colonist wears no tag', () => {
    const html = phone(devView(), live(mine(5.5, 4.5)));
    expect(tag(html, 'pace-line')).toMatch(/data-pct="100"/);
    expect(text(html, 'pace-line')).toBe('Your pace 100%: fed and well');
    expect(tag(inside(html, 'walkers-map'), 'condition-s1')).toBeNull();
  });

  it('B-AC-9: hungry, the pace line says her pace and the Food she ate, and her colonist wears the hunger tag at its level', () => {
    const { hungryFrom, starvingFrom } = DEV_WALK.hungerLevels;
    const hungry = { foodShare: 1 - (hungryFrom + starvingFrom) / 2, conditionPace: 0.7 };
    const players = PLAYERS.map((p) => (p.id === 's1' ? { ...p, condition: { ...p.condition!, ...hungry } } : p));
    const me = lenasMe();
    const html = phone(devView(lenasMe({ stock: { ...me.stock, food: 2 }, needs: { ...me.needs, food: 5 } }), { players }), live(mine(5.5, 4.5)));
    expect(tag(html, 'pace-line')).toMatch(/data-pct="70"/);
    expect(text(html, 'pace-line')).toMatch(/^Your pace 70%: you ate 2 of the 5 Food you need/);
    expect(tag(inside(html, 'walkers-map'), 'condition-s1')).toMatch(/data-hunger="2"/);
  });

  it('B-AC-9 (sick, the PM\'s ruling A): fed but sick, the side room says she is sick, why, and her pace this turn, in the roll call\'s medicine colour', () => {
    const players = PLAYERS.map((p) => (p.id === 's1' ? { ...p, condition: { ...p.condition!, sick: true, sickBecause: 'air' as const, conditionPace: 0.5 } } : p));
    const html = phone(devView(lenasMe(), { players }), live(mine(5.5, 4.5)));
    expect(tag(html, 'pace-line')).toMatch(/data-sick="true"/);
    expect(text(html, 'sick-cause')).toBe('✚ Sick: the air is toxic.');
    expect(text(html, 'pace-line')).toMatch(/50% pace this turn/);
    // Never the hunger words when she ate what she needs.
    expect(text(html, 'pace-line')).not.toMatch(/Food/);
    // At 667 the bar says it short.
    expect(text(phone(devView(lenasMe(), { players }), live(mine(5.5, 4.5)), 667), 'pace-line')).toMatch(/^✚ Sick · 50% pace/);
  });

  it('B-AC-9 (sick and hungry): the line names the sickness first, then the pace and the Food she ate', () => {
    const players = PLAYERS.map((p) => (p.id === 's1' ? { ...p, condition: { ...p.condition!, sick: true, sickBecause: 'pollution' as const, conditionPace: 0.35 } } : p));
    const me = lenasMe();
    const html = phone(devView(lenasMe({ stock: { ...me.stock, food: 2 }, needs: { ...me.needs, food: 5 } }), { players }), live(mine(5.5, 4.5)));
    expect(text(html, 'sick-cause')).toBe('✚ Sick: your own pollution fouled the air.');
    expect(text(html, 'pace-line')).toMatch(/35% pace this turn · you ate 2 of 5 Food/);
  });

  /** The engine's words for Lena's press at `place` in the hall, leading `mule`. */
  function wordsAt(place: HallPlace, mule: Player['carriedMule']) {
    const state = createGame({ seed: 1, players: [{ id: 's1', name: 'Lena', isAi: false, species: 'zipwing' }, { id: 's2', name: 'Ossa', isAi: false, species: 'gearling' }] });
    state.phase = 'development';
    state.players[0]!.carriedMule = mule;
    const floor = buildFloor(state, floorConfig());
    const b = boxOf(place);
    const there = { space: 'hall' as const, x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
    return { there, words: reachWords(reachOf({ ...floor, colonists: floor.colonists.map((c) => (c.id === 's1' ? { ...c, ...there } : c)) }, state, 's1')) };
  }

  it.each<HallPlace>(['energy', 'alloy'])('B-AC-10: with no MULE in tow the %s outfitter is shut: its button is dim and points to the corral; leading an empty MULE it outfits', (place) => {
    const shut = wordsAt(place, null);
    const dim = phone(devView(lenasMe({ reach: shut.words })), live(mine(shut.there.x, shut.there.y, { space: 'hall' })));
    expect(text(dim, 'action-verb')).toBe('TO THE CORRAL');
    expect(tag(dim, 'action-button')).toMatch(/\sdisabled=""/);
    const open = wordsAt(place, 'empty');
    const lit = phone(devView(lenasMe({ carriedMule: 'empty', reach: open.words })), live(mine(open.there.x, open.there.y, { space: 'hall' })));
    expect(text(lit, 'action-verb')).toBe(`OUTFIT · ${place.toUpperCase()}`);
    expect(tag(lit, 'action-button')).toMatch(/data-enabled="true"/);
  });
});

describe('C11: it fits the phone (B-AC-4\'s layout half, B-AC-11\'s text floor)', () => {
  const inFrame = (b: Box, w: number, h: number) => b.x >= 0 && b.y >= 0 && b.x + b.w <= w && b.y + b.h <= h;
  const plot = (L: ReturnType<typeof phoneLayout>, p: { x: number; y: number }): Box => ({ x: L.stage.x + p.x * L.cell, y: L.stage.y + p.y * L.cell, w: L.cell, h: L.cell });

  it.each([844, 667] as const)('C11: at %i the map, the status and the controls stay in the frame, and neither control covers the store or a plot of Lena\'s', (size) => {
    const { w, h } = FRAMES[size];
    const L = phoneLayout({ w, h }, 'map', 15, 9);
    for (const b of [L.stage, L.stick, L.button, L.banner, ...(L.left ? [L.left] : []), ...(L.right ? [L.right] : [])]) expect(inFrame(b, w, h), JSON.stringify(b)).toBe(true);
    expect(L.mode).toBe(size === 667 ? 'top' : 'side');
    for (const control of [L.stick, L.button]) {
      expect(overlap(control, plot(L, STORE))).toBe(0);
      for (const p of LENAS_PLOTS) expect(overlap(control, plot(L, p))).toBe(0);
    }
  });

  it.each([844, 667] as const)('C11: at %i in the hall neither control covers a room or a door', (size) => {
    const { w, h } = FRAMES[size];
    const L = phoneLayout({ w, h }, 'hall');
    expect(inFrame(L.stage, w, h)).toBe(true);
    const box = (r: { x0: number; y0: number; x1: number; y1: number }): Box => ({ x: L.stage.x + r.x0 * L.cell, y: L.stage.y + r.y0 * L.cell, w: (r.x1 - r.x0) * L.cell, h: (r.y1 - r.y0) * L.cell });
    for (const room of [...Object.values(HALL.rooms), ...Object.values(HALL.doors)]) for (const control of [L.stick, L.button]) expect(overlap(control, box(room))).toBe(0);
  });

  it('C11: at 667 the status lies over the map\'s top edge, clear of Lena\'s plots on it and of the target', () => {
    const html = phone(devView(), live(mine(5.5, 4.5)), 667);
    expect(tag(html, 'phone-game')).toMatch(/data-mode="top"/);
    const L = phoneLayout(FRAMES[667], 'map', 15, 9);
    // Row 0's widest run clear of Lena's Plains 4·1 and Crater 15·1: columns 5 to 14.
    const left = Number(/left:([\d.]+)px/.exec(tag(html, 'phone-status-bar')!)![1]);
    const width = Number(/width:([\d.]+)px/.exec(tag(html, 'phone-status-bar')!)![1]);
    expect(left).toBeGreaterThanOrEqual(L.stage.x + 4 * L.cell);
    expect(left + width).toBeLessThanOrEqual(L.stage.x + 14 * L.cell);
    expect(tag(html, 'phone-status-left')).toBeNull();
  });

  /** The fixture's map with these plots handed to Lena (or anyone), each with its outfit. */
  const owning = (plots: { x: number; y: number; outfit?: TileView['outfit']; owner?: string }[]): TileView[] =>
    TILES.map((t) => {
      const p = plots.find((q) => q.x === t.x && q.y === t.y);
      return p ? { ...t, terrain: 'plains', owner: p.owner ?? 's1', outfit: p.outfit ?? null } : t;
    });
  const left = (html: string, testid: string) => Number(/left:([\d.]+)px/.exec(tag(html, testid)!)![1]);

  it('C11 (AM-20): a control fades over the target, so the ring reads through it', () => {
    // A Food MULE, and Lena's best free plot for it at 14·8, under the button at 844; she stands clear of it.
    const view = devView(lenasMe({ carriedMule: 'food' }), { tiles: owning([{ x: 3, y: 0, outfit: 'food' }, { x: 14, y: 0, outfit: 'food' }, { x: 13, y: 7 }]) });
    const html = phone(view, live(mine(11.5, 7.5)));
    expect(text(html, 'guide-label')).toBe('YOUR PLOT 14·8');
    expect(tag(html, 'overlay-button')).toMatch(/data-faded="true"/);
    expect(tag(html, 'overlay-stick')).not.toMatch(/data-faded/);
  });

  it('C11 (AM-20): over another plot of yours the controls are translucent, so its marks read through', () => {
    const L = phoneLayout(FRAMES[844], 'map', 15, 9);
    const under = { x: 0, y: 7 };
    expect(overlap(L.stick, { x: L.stage.x + under.x * L.cell, y: L.stage.y + under.y * L.cell, w: L.cell, h: L.cell })).toBeGreaterThan(0);
    const html = phone(devView(lenasMe(), { tiles: owning([under]) }), live(mine(5.5, 4.5)));
    // Not the target, and you are not near: no fade, but neither the pad nor the button's panel is opaque.
    expect(tag(html, 'overlay-stick')).not.toMatch(/data-faded/);
    expect(tag(html, 'joystick')).toMatch(/bg-panel\/30!/);
    expect(tag(html, 'overlay-button')).toMatch(/bg-panel\/80/);
  });

  it('C11 (AM-20): the plot card covers neither you nor the target: columns 5–14 when they are clear of it, 0–9 when not', () => {
    const L = phoneLayout(FRAMES[844], 'map', 15, 9);
    const cols5to14 = L.stage.x + 4.15 * L.cell;
    const cols0to9 = L.stage.x + 0.15 * L.cell;
    // On Plains 4·1, top left: the card is clear of her at columns 5–14.
    const clear = phone(devView(), live(mine(3.5, 0.6)));
    expect(left(clear, 'plot-card')).toBeCloseTo(cols5to14, 6);
    // On a plot of hers at 13·3, under columns 5–14: the card moves to 0–9.
    const underIt = phone(devView(lenasMe(), { tiles: owning([{ x: 12, y: 2 }]) }), live(mine(12.5, 2.6)));
    expect(left(underIt, 'plot-card')).toBeCloseTo(cols0to9, 6);
    // On Plains 4·1 (its Energy MULE in) with a Food MULE, the ring on her best free plot, 12·3, under columns 5–14:
    // the card moves to 0–9.
    const target = phone(devView(lenasMe({ carriedMule: 'food' }), { tiles: owning([{ x: 3, y: 0, outfit: 'energy' }, { x: 14, y: 0, outfit: 'food' }, { x: 11, y: 2 }]) }), live(mine(3.5, 0.6)));
    expect(text(target, 'guide-label')).toBe('YOUR PLOT 12·3');
    expect(left(target, 'plot-card')).toBeCloseTo(cols0to9, 6);
  });

  it('C11 (AM-20): under both of the card\'s places at once, the card is not drawn rather than cover you', () => {
    const html = phone(devView(lenasMe(), { tiles: owning([{ x: 8, y: 2 }]) }), live(mine(8.5, 2.6)));
    expect(tag(html, 'plot-card')).toBeNull();
  });

  it('C11: a control fades while you stand under it, so it never hides you', () => {
    const under = phone(devView(), live(mine(0.5, 7.5)));
    expect(tag(under, 'overlay-stick')).toMatch(/data-faded="true"/);
    expect(tag(under, 'overlay-button')).not.toMatch(/data-faded/);
    expect(tag(phone(devView(), live(mine(5.5, 4.5))), 'overlay-stick')).not.toMatch(/data-faded/);
  });

  it.each([844, 667] as const)('C11: at %i no phone text is drawn under 10 px, on the map or in the hall', (size) => {
    const map = phone(devView(lenasMe({ carriedMule: 'empty' })), live(mine(5.5, 4.5)), size);
    const hall = phone(devView(lenasMe({ carriedMule: 'empty' })), live(mine(8, 6, { space: 'hall' })), size);
    for (const html of [map, hall]) expect(html).not.toMatch(/text-\[(7|8|9)px\]/);
  });
});

describe('C11: the laptop', () => {
  it('C11: the stage, the one button with SPACE on it, and the controls legend', () => {
    const html = laptop(devView(lenasMe({ reach: reach('BUY MULE', '148 cr') })), live(mine(5.5, 4.5)));
    expect(tag(html, 'laptop-game')).not.toBeNull();
    expect(text(inside(html, 'laptop-rail'), 'action-verb')).toBe('BUY MULE');
    expect(text(html, 'controls-legend')).toContain('← ↑ → ↓');
    expect(pct(inside(html, 'walkers-map'), 'colonist-s1', 'left')).toBeCloseTo((5.5 / 15) * 100, 6);
  });

  it('C11: arrow keys steer, two at once diagonally, SPACE presses once a press; neither scrolls the page; other keys pass', () => {
    const c = startControls();
    let presses = 0;
    const press = () => presses++;
    const key = (k: string, repeat = false) => {
      let prevented = false;
      keyDown(c, { key: k, repeat, altKey: false, metaKey: false, ctrlKey: false, preventDefault: () => (prevented = true) }, press);
      return prevented;
    };
    expect(key('ArrowUp')).toBe(true);
    expect(key('ArrowLeft')).toBe(true);
    expect(stickOf(c, null)).toEqual({ x: -0.625, y: -0.625 });
    expect(key(' ')).toBe(true);
    expect(key(' ', true)).toBe(true);
    expect(presses).toBe(1);
    expect(key('Tab')).toBe(false);
    expect(key('a')).toBe(false);
    keyUp(c, { key: 'ArrowLeft' });
    expect(stickOf(c, null)).toEqual({ x: 0, y: -1 });
  });

  it('C11: the mouse held on a spot walks toward it, and stops there', () => {
    const c = startControls();
    c.mouse = { x: 8.5, y: 4.5, space: 'map' };
    expect(stickOf(c, { x: 5.5, y: 4.5, space: 'map' })).toEqual({ x: 1, y: 0 });
    expect(stickOf(c, { x: 8.45, y: 4.5, space: 'map' })).toEqual({ x: 0, y: 0 });
    // A spot in the other space is not walked to; the stick and the keys win over the mouse.
    expect(stickOf(c, { x: 5.5, y: 4.5, space: 'hall' })).toEqual({ x: 0, y: 0 });
    c.stick = { x: 0, y: 1 };
    expect(stickOf(c, { x: 5.5, y: 4.5, space: 'map' })).toEqual({ x: 0, y: 1 });
  });
});

describe('C12: the TV', () => {
  const onTv = (view: MuleView, now: Live, chat: ChatMessage[] = []) =>
    renderToStaticMarkup(
      createElement(ClientProvider, { client: clientFor(view, 'board', chat), children: createElement(StaticLive, { live: now, children: createElement(TvArcade, { game: view }) }) }),
    ).replaceAll('<!-- -->', '');
  const everyone = (): Live => live(null, FRAMED);

  it('C12: every colonist from the frames, named: on the map, and in the store\'s hall beside it', () => {
    const html = onTv(devView(), everyone());
    const map = inside(html, 'tv-map-stage');
    for (const c of FRAMED.filter((c) => c.space === 'map')) expect(pct(map, `colonist-${c.id}`, 'left')).toBeCloseTo((c.x / 15) * 100, 6);
    const hall = inside(html, 'tv-hall-stage');
    expect(pct(hall, 'colonist-s3', 'left')).toBeCloseTo((8 / HALL.w) * 100, 6);
    expect(text(inside(map, 'colonist-s2'), 'colonist-name-s2')).toBe('Ossa');
    // The TV is everyone's: it lights nobody's target.
    expect(html).not.toContain('data-selected');
    expect(html).not.toContain('guide-');
  });

  it('C12: the shared clock, the pace list with every seat, and the chat ticker, as today', () => {
    const html = onTv(devView(), everyone(), [{ id: 1, from: 's2', text: 'Race you to the corral', at: 0 }]);
    expect(html).toContain('data-testid="shared-clock"');
    for (const p of PLAYERS) expect(html).toContain(`data-testid="pace-${p.id}"`);
    expect(html).toContain('data-testid="chat-ticker"');
  });

  it('C12 (A-1): six seats: the hall takes the height the pace list leaves it, at 4:3, never more', () => {
    expect(fitHall({ w: 424, h: 400 })).toEqual({ w: 424, h: 318 });
    expect(fitHall({ w: 424, h: 206 })).toEqual({ w: (206 * 4) / 3, h: 206 });
    const html = onTv(devView(), everyone());
    // The hall's box is the one that gives: it shrinks, the pace list keeps its rows.
    expect(tag(html, 'tv-hall-box')).toMatch(/class="[^"]*\bmin-h-0\b[^"]*\bflex-1\b|class="[^"]*\bflex-1\b[^"]*\bmin-h-0\b/);
  });
});

describe('C13: live positions on the map', () => {
  it('C13: every walker drawn in its own layer, where it is this frame, with no CSS easing', () => {
    const html = renderToStaticMarkup(
      createElement(LiveWalkers, {
        space: 'map',
        cols: 15,
        rows: 9,
        cell: 43,
        density: 'phone',
        walkers: [
          { id: 's1', slot: 0, species: 'zipwing', name: 'Lena', x: 5.25, y: 4.5, facing: 'left', moving: true, lead: { good: 'food', x: 5.8, y: 4.5 }, pace: 1.25, terrain: 1, mine: true },
          { id: 's2', slot: 1, species: 'gearling', name: 'Ossa', x: 10.5, y: 3.5, facing: 'right', moving: false, lead: null, pace: 0.6, terrain: 0.6 },
        ],
      }),
    );
    expect(pct(html, 'colonist-s1', 'left')).toBeCloseTo(35, 6);
    expect(pct(html, 'colonist-s1', 'top')).toBeCloseTo(50, 6);
    expect(pct(html, 'mule-s1', 'left')).toBeCloseTo((5.8 / 15) * 100, 6);
    expect(html).not.toMatch(/transition|duration-/);
    // Moved by transform alone, from one fixed origin: no left or top to lay out on each frame (#195's lesson).
    for (const id of ['colonist-s1', 'colonist-s2', 'mule-s1']) expect(tag(html, id)).not.toMatch(/left:|top:/);
    // The walkers move by #195's gait: the creature walks, its MULE in step; the standing one breathes.
    expect(inside(html, 'colonist-s1')).toMatch(/data-motion="walk"/);
    expect(inside(html, 'colonist-s2')).toMatch(/data-motion="idle"/);
    expect(html).not.toContain('store-waddle');
  });

  it('C13: the phone\'s map passes HoloMap no avatars, so its 700 ms easing never draws a colonist', () => {
    const html = phone(devView(), live(mine(5.5, 4.5, { moving: true })));
    expect(html).not.toContain('duration-700');
    expect(html).not.toContain('store-waddle');
  });
});

describe('C11: the controls, as WS4 reviewed them', () => {
  it('C11: a dim button sends nothing, though Chrome hands a disabled button its pointer events; a lit one presses once', () => {
    let presses = 0;
    const press = () => presses++;
    const fire = (enabled: boolean, altKey = false) => {
      const button = ActionButton({ verb: 'BUY MULE', detail: '148 cr', enabled, onPress: press });
      const props = button.props as { onPointerDown(e: object): void; onClick(e: object): void };
      props.onPointerDown({ altKey, preventDefault: () => {} });
      props.onClick({ detail: 0 });
    };
    fire(false);
    expect(presses).toBe(0);
    fire(true, true);
    expect(presses).toBe(1);
    fire(true);
    expect(presses).toBe(3);
  });

  it('C11: the stick is an application with its label, not a slider with a value that never moves', () => {
    const html = renderToStaticMarkup(createElement(Joystick, { onStick: () => {} }));
    expect(tag(html, 'joystick')).toMatch(/role="application"/);
    expect(tag(html, 'joystick')).toMatch(/aria-label="Joystick: drag to walk"/);
    expect(html).not.toMatch(/aria-valuenow|role="slider"/);
  });
});

describe('C11 (AM-31): the table chat on the walking screen', () => {
  const CHAT: ChatMessage[] = [
    { id: 1, from: 's3', text: 'Crystite is up north', at: 0 },
    { id: 2, from: 's2', text: 'Race you to the corral, Lena, and the last one buys', at: 0 },
  ];
  /** The ticker's lines, newest first: each line's id and its words. */
  const tickerLines = (html: string) => [...inside(html, 'chat-ticker').matchAll(/data-testid="chat-line-(\d+)"/g)].map((m) => Number(m[1]));

  it('C11 (AM-31): at 844 the side room, under the clock, carries the newest line as one sentence wrapped to at most three rows', () => {
    for (const where of ['map', 'hall'] as const) {
      const html = phone(devView(), live(mine(where === 'map' ? 5.5 : 4, where === 'map' ? 4.5 : 6, { space: where })), 844, CHAT);
      const room = inside(html, 'phone-status-left');
      expect(tag(room, 'chat-ticker'), where).not.toBeNull();
      expect(room.indexOf('data-testid="chat-ticker"')).toBeGreaterThan(room.indexOf('data-testid="shared-clock"'));
      expect(tickerLines(html)).toEqual([2]);
      expect(tag(html, 'chat-line-2')).toMatch(/line-clamp-3/);
      expect(text(html, 'chat-line-2')).toBe('Ossa: Race you to the corral, Lena, and the last one buys');
    }
  });

  it('C11 (AM-31): at 667 the status bar over the map carries the newest line on one row, cut, after the pace line', () => {
    const html = phone(devView(), live(mine(5.5, 4.5)), 667, CHAT);
    const bar = inside(html, 'phone-status-bar');
    expect(tag(bar, 'chat-ticker')).not.toBeNull();
    expect(bar.indexOf('data-testid="chat-ticker"')).toBeGreaterThan(bar.indexOf('data-testid="pace-line"'));
    expect(tickerLines(html)).toEqual([2]);
    expect(tag(html, 'chat-line-2')).toMatch(/\btruncate\b/);
    expect(tag(html, 'chat-line-2')).not.toMatch(/line-clamp/);
  });

  it('C11 (AM-31): the laptop\'s rail has a Table chat panel above Controls with the newest two lines, each wrapped', () => {
    const html = laptop(devView(), live(mine(5.5, 4.5)), CHAT);
    const rail = inside(html, 'laptop-rail');
    expect(rail).toContain('Table chat');
    expect(rail.indexOf('data-testid="chat-ticker"')).toBeGreaterThan(-1);
    expect(rail.indexOf('data-testid="chat-ticker"')).toBeLessThan(rail.indexOf('data-testid="controls-legend"'));
    expect(tickerLines(html)).toEqual([2, 1]);
    for (const id of [1, 2]) expect(tag(html, `chat-line-${id}`)).toMatch(/line-clamp-3/);
    expect(text(html, 'chat-line-1')).toBe('Kai: Crystite is up north');
  });

  /** The fixture's map cut or grown to `w` × `h`: a table of 2–3 seats plays on 13 × 7, of 5–6 on 19 × 11. */
  const sized = (w: number, h: number): Partial<MuleView> => ({
    width: w,
    height: h,
    tiles: Array.from({ length: w * h }, (_, i) => {
      const x = i % w;
      const y = Math.floor(i / w);
      return TILES.find((t) => t.x === x && t.y === y) ?? { ...TILES.find((t) => t.terrain === 'plains')!, x, y, owner: null, outfit: null };
    }),
  });

  it.each([
    [13, 7],
    [19, 11],
  ])('C11 (AM-31): at 844 on a %i × %i map the status is a bar over the map, and the bar carries the newest line', (w, h) => {
    const html = phone(devView(lenasMe(), sized(w, h)), live(mine(5.5, 4.5)), 844, CHAT);
    expect(tag(html, 'phone-game')).toMatch(/data-mode="top"/);
    expect(tag(inside(html, 'phone-status-bar'), 'chat-ticker')).not.toBeNull();
    expect(tickerLines(html)).toEqual([2]);
  });

  it('C11 (AM-31): a line from someone not at this table is not drawn, and draws nothing in its place', () => {
    const stranger: ChatMessage = { id: 9, from: 'zz', text: 'Who am I', at: 0 };
    for (const html of [phone(devView(), live(mine(5.5, 4.5)), 844, [...CHAT, stranger]), laptop(devView(), live(mine(5.5, 4.5)), [...CHAT, stranger])]) {
      expect(tickerLines(html)).toEqual(tickerLines(html).length === 1 ? [2] : [2, 1]);
      expect(html).not.toContain('Who am I');
    }
  });

  it('C11 (AM-31): your own map and hall bound their colonists\' bubbles, which they clip; the TV\'s stages draw none', () => {
    expect(tag(phone(devView(), live(mine(5.5, 4.5))), 'map-stage')).toMatch(/data-bubble-bounds/);
    expect(tag(phone(devView(), live(mine(4, 6, { space: 'hall' }))), 'hall-stage')).toMatch(/data-bubble-bounds/);
    expect(tag(laptop(devView(), live(mine(5.5, 4.5))), 'map-stage')).toMatch(/data-bubble-bounds/);
    const tv = renderToStaticMarkup(createElement(ClientProvider, { client: clientFor(devView(), 'board'), children: createElement(StaticLive, { live: live(null, FRAMED), children: createElement(TvArcade, { game: devView() }) }) }));
    expect(tv).not.toContain('data-bubble-bounds');
  });

  it('C11 (AM-31): on a short laptop the chat panel folds, its older line first, so Controls stays in the window', () => {
    const rail = inside(laptop(devView(), live(mine(5.5, 4.5)), CHAT), 'laptop-rail');
    const panel = /<section class="([^"]*)"[^>]*><header[^>]*><h2[^>]*>Table chat/.exec(rail)?.[1] ?? '';
    expect(panel).toMatch(/\bmin-h-0\b/);
    expect(panel).toMatch(/\boverflow-hidden\b/);
    // Newest first, and no line gives up its rows: the panel folds from the bottom, the older line first.
    expect(tickerLines(rail)).toEqual([2, 1]);
    for (const id of [1, 2]) expect(tag(rail, `chat-line-${id}`)).toMatch(/\bshrink-0\b/);
  });

  it('C11 (AM-31): a whisper carries its lock in the ticker', () => {
    const html = phone(devView(), live(mine(5.5, 4.5)), 844, [{ id: 3, from: 's2', to: 's1', text: 'Psst', at: 0 }]);
    expect(text(html, 'chat-line-3')).toBe('Ossa 🔒: Psst');
  });

  /** A box from an element's inline left, top, width and one of its heights, in px (React writes a zero bare). */
  function styleBox(html: string, testid: string, height: 'height' | 'min-height' | 'max-height'): Box {
    const t = tag(html, testid)!;
    const px = (prop: string) => Number(new RegExp(`(?:^|[;"])${prop}:([\\d.]+)(?:px)?[;"]`).exec(t)?.[1] ?? NaN);
    return { x: px('left'), y: px('top'), w: px('width'), h: px(height) };
  }

  it.each<[844 | 667, 'map' | 'hall']>([
    [844, 'map'],
    [844, 'hall'],
    [667, 'map'],
    [667, 'hall'],
  ])('C11 (AM-31): at %i on the %s the phone shows the ticker, so a line from a speaker it doesn\'t draw still reaches it', (size, where) => {
    const html = phone(devView(), live(mine(where === 'map' ? 5.5 : 4, where === 'map' ? 4.5 : 6, { space: where })), size, CHAT);
    expect(tickerLines(html)).toEqual([2]);
    expect(text(html, 'chat-line-2')).toMatch(/^Ossa:/);
  });

  it('C11 (AM-31): at 667 in the hall the compact side room carries the newest line on one cut row at its foot, and it covers 0 px² of the store and the controls', () => {
    const L = phoneLayout(FRAMES[667], 'hall');
    const html = phone(devView(), live(mine(4, 6, { space: 'hall' })), 667, CHAT);
    const room = inside(html, 'phone-status-left');
    expect(tag(room, 'chat-ticker')).not.toBeNull();
    expect(tag(html, 'chat-line-2')).toMatch(/\btruncate\b/);
    expect(tag(room, 'chat-foot')).toMatch(/\bmt-auto\b/);
    expect(inside(room, 'chat-foot')).toContain('data-testid="chat-ticker"');
    const box = styleBox(html, 'phone-status-left', 'height');
    expect(box).toEqual(L.left);
    expect(tag(html, 'phone-status-left')).toMatch(/overflow-hidden/);
    // The hall is the store: the side room lies beside it.
    for (const kept of [L.stick, L.button, L.stage]) expect(overlap(box, kept), JSON.stringify(kept)).toBe(0);
  });

  it.each([844, 667] as const)('C11 (AM-31): at %i the ticker covers 0 px² of the store, Lena\'s plots and the controls', (size) => {
    const L = phoneLayout(FRAMES[size], 'map', 15, 9);
    const html = phone(devView(), live(mine(5.5, 4.5)), size, CHAT);
    // The ticker lies in its holder's box, which keeps to it: the side room clips at its height, the bar is one row.
    const holder = size === 844 ? 'phone-status-left' : 'phone-status-bar';
    expect(tag(inside(html, holder), 'chat-ticker')).not.toBeNull();
    const box = styleBox(html, holder, size === 844 ? 'height' : 'min-height');
    if (size === 844) {
      expect(box).toEqual(L.left);
      expect(tag(html, holder)).toMatch(/overflow-hidden/);
    }
    for (const b of Object.values(box)) expect(Number.isFinite(b)).toBe(true);
    const tile = (p: { x: number; y: number }): Box => ({ x: L.stage.x + p.x * L.cell, y: L.stage.y + p.y * L.cell, w: L.cell, h: L.cell });
    for (const kept of [L.stick, L.button, tile(STORE), ...LENAS_PLOTS.map(tile)]) expect(overlap(box, kept), JSON.stringify(kept)).toBe(0);
  });
});

/**
 * A bubble hangs at its speaker only once the speaker's creature has registered as its anchor, which a static render
 * never runs: these mount the screen into the fake DOM, last in this file, since the fake DOM stays for what follows.
 */
describe('C11 (AM-31): a speaking colonist\'s bubble, at that colonist (mounted)', () => {
  type Dom = typeof import('./fake-dom');
  let dom: Dom;
  let act: typeof import('react').act;
  let createRoot: typeof import('react-dom/client').createRoot;

  beforeAll(async () => {
    dom = await import('./fake-dom');
    ({ act } = await import('react'));
    ({ createRoot } = await import('react-dom/client'));
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const doc = dom.document as unknown as { createElementNS?: (ns: string, tag: string) => InstanceType<Dom['FakeElement']> };
    doc.createElementNS ??= (_ns, tag) => dom.document.createElement(tag);
    (dom.document.documentElement as unknown as { dataset?: object }).dataset ??= {};
    // What the screen and the bubble reach for that the fake DOM lacks: focus, a box, no layout to fit into, animation
    // frames (none run) and a mutation observer.
    const element = dom.FakeElement.prototype as unknown as { focus(): void; getBoundingClientRect(): object; closest(): null };
    element.focus = () => {};
    element.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 });
    element.closest = () => null;
    class Observer {
      observe() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    Object.assign(globalThis, { requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, MutationObserver: Observer });
  });

  /** A client whose chat grows as the table speaks, telling its listeners as the real one does. */
  function talkingClient(view: MuleView) {
    const listeners = new Set<() => void>();
    let state = { ...clientFor(view).getState(), chat: [] as ChatMessage[] };
    const client = { ...clientFor(view), subscribe: (l: () => void) => (listeners.add(l), () => listeners.delete(l)), getState: () => state } as unknown as TableClient;
    const say = (line: ChatMessage) => {
      state = { ...state, chat: [...state.chat, line] };
      for (const l of [...listeners]) l();
    };
    return { client, say };
  }

  function element(node: InstanceType<Dom['FakeElement']>, testid: string): InstanceType<Dom['FakeElement']> | null {
    if (node.getAttribute('data-testid') === testid) return node;
    for (const c of node.childNodes) {
      const hit = c instanceof dom.FakeElement ? element(c, testid) : null;
      if (hit) return hit;
    }
    return null;
  }

  /** Mounts Lena's phone where `me` stands, lets `from` say a line, and returns the screen. */
  function speak(me: NonNullable<Live['me']>, from: string, child: (view: MuleView) => ReactElement = () => createElement(PhoneLandscape, { frame: { w: FRAMES[844].w, h: FRAMES[844].h } })) {
    const view = devView();
    const { client, say } = talkingClient(view);
    const host = dom.document.createElement('div');
    const root = createRoot(host as unknown as HTMLElement);
    act(() => root.render(seated(view, live(me), child(view), client)));
    act(() => say({ id: 1, from, text: 'Race you to the corral', at: Date.now() }));
    return { host, unmount: () => act(() => root.unmount()) };
  }

  it.each<[string, NonNullable<Live['me']>, string, string]>([
    ['on the map, at another colonist', mine(5.5, 4.5), 's2', 'walkers-map'],
    ['on the map, at your own', mine(5.5, 4.5), 's1', 'walkers-map'],
    ['in the hall, at another colonist', mine(4, 6, { space: 'hall' }), 's3', 'walkers-hall'],
  ])('C11 (AM-31): %s', (_, me, from, layer) => {
    const { host, unmount } = speak(me, from);
    const colonist = element(element(host, layer)!, `colonist-${from}`);
    expect(colonist).not.toBeNull();
    expect(element(colonist!, `chat-bubble-${from}`)?.textContent).toBe('Race you to the corral');
    unmount();
  });

  it('C11 (AM-31): in the hall, at your own colonist, the store\'s own visitor', () => {
    const { host, unmount } = speak(mine(4, 6, { space: 'hall' }), 's1');
    expect(element(element(host, 'visitor-s1')!, 'chat-bubble-s1')?.textContent).toBe('Race you to the corral');
    unmount();
  });

  /** Boxes the fake DOM reports, by testid (a prefix for the bubbles), and the stage's search for a bubble. */
  function boxes(by: Record<string, { left: number; top: number; right: number; bottom: number }>) {
    const proto = dom.FakeElement.prototype as unknown as { getBoundingClientRect(): object; querySelector(sel: string): unknown };
    const before = { rect: proto.getBoundingClientRect, query: proto.querySelector };
    proto.getBoundingClientRect = function (this: InstanceType<Dom['FakeElement']>) {
      const id = this.getAttribute('data-testid') ?? '';
      const hit = Object.entries(by).find(([k]) => (k.endsWith('*') ? id.startsWith(k.slice(0, -1)) : id === k))?.[1];
      const r = hit ?? { left: 0, top: 0, right: 0, bottom: 0 };
      return { ...r, x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top };
    };
    proto.querySelector = function (this: InstanceType<Dom['FakeElement']>, sel: string) {
      const prefix = /^\[data-testid\^=([\w-]+)\]$/.exec(sel)?.[1];
      const find = (n: InstanceType<Dom['FakeElement']>): InstanceType<Dom['FakeElement']> | null => {
        for (const c of n.childNodes) {
          if (!(c instanceof dom.FakeElement)) continue;
          if (prefix && (c.getAttribute('data-testid') ?? '').startsWith(prefix)) return c;
          const deeper = find(c);
          if (deeper) return deeper;
        }
        return null;
      };
      return find(this);
    };
    return () => Object.assign(proto, { getBoundingClientRect: before.rect, querySelector: before.query });
  }
  const at667 = () => createElement(PhoneLandscape, { frame: { w: FRAMES[667].w, h: FRAMES[667].h } });

  it('C11 (AM-31): at 667 a bubble that meets the status bar fades the bar and paints above it, until the bubble ends', () => {
    // The chat store's clock: a bubble ends on its own timer, at most BUBBLE_MAX_MS after it starts.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const restore = boxes({ 'phone-status-bar': { left: 200, top: 2, right: 600, bottom: 37 }, 'chat-bubble-*': { left: 300, top: 10, right: 420, bottom: 44 } });
    try {
      const { host, unmount } = speak(mine(5.5, 4.5), 's2', at667);
      expect(element(host, 'phone-status-bar')!.getAttribute('data-faded')).toBe('true');
      const walkers = element(host, 'walkers-layer')!;
      expect(walkers.getAttribute('data-over-bar')).toBe('true');
      expect(walkers.getAttribute('class')).toMatch(/\bz-\[25\]/);
      expect(element(host, 'phone-status-bar')!.getAttribute('class')).toMatch(/\bz-20\b/);
      act(() => vi.advanceTimersByTime(BUBBLE_MAX_MS + 100));
      expect(element(host, 'chat-bubble-s2')).toBeNull();
      expect(element(host, 'phone-status-bar')!.getAttribute('data-faded')).toBeNull();
      expect(element(host, 'walkers-layer')!.getAttribute('data-over-bar')).toBeNull();
      expect(element(host, 'walkers-layer')!.getAttribute('class')).toMatch(/\bz-\[7\]/);
      unmount();
    } finally {
      restore();
      vi.useRealTimers();
    }
  });

  it('C11 (AM-31): at 667 a bubble clear of the bar leaves it, and the colonists stay under it', () => {
    const restore = boxes({ 'phone-status-bar': { left: 200, top: 2, right: 600, bottom: 37 }, 'chat-bubble-*': { left: 300, top: 120, right: 420, bottom: 154 } });
    const { host, unmount } = speak(mine(5.5, 4.5), 's2', at667);
    expect(element(host, 'chat-bubble-s2')).not.toBeNull();
    expect(element(host, 'phone-status-bar')!.getAttribute('data-faded')).toBeNull();
    expect(element(host, 'walkers-layer')!.getAttribute('data-over-bar')).toBeNull();
    expect(element(host, 'walkers-layer')!.getAttribute('class')).toMatch(/\bz-\[7\]/);
    unmount();
    restore();
  });

  it('C11 (AM-31): on the laptop, at the colonist on its map', () => {
    const { host, unmount } = speak(mine(5.5, 4.5), 's2', () => createElement(LaptopArcade, { frame: { w: 1440, h: 900 } }));
    expect(element(element(element(host, 'walkers-map')!, 'colonist-s2')!, 'chat-bubble-s2')).not.toBeNull();
    unmount();
  });
});
