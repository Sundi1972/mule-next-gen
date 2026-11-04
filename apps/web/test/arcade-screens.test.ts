import { HALL } from '@mule/engine';
import type { ChatMessage, MuleView, MyView, TileView } from '@mule/protocol';
import { ActionButton, Joystick, LiveWalkers, SeatSpeciesProvider, type Slot } from '@mule/ui';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { seatSpecies } from '../src/game/derive';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { keyDown, keyUp, startControls, stickOf } from '../src/phone/arcade/controls';
import { LaptopArcade, PhoneLandscape } from '../src/phone/arcade/Develop';
import { FRAMES, overlap, phoneLayout, type Box } from '../src/phone/arcade/layout';
import { StaticLive, type Live } from '../src/phone/arcade/live';
import { PhoneGameProvider } from '../src/phone/game';
import { fitHall, TvArcade } from '../src/table/TvDevelop';
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

function onPhone(view: MuleView, now: Live, child: ReactElement): string {
  const me = view.me!;
  const self = view.players.find((p) => p.id === me.id)!;
  const value = { table: tableOf(view), view, me, self, slot: self.slot as Slot };
  const tree = createElement(ClientProvider, {
    client: clientFor(view),
    children: createElement(SeatSpeciesProvider, { value: seatSpecies(view), children: createElement(PhoneGameProvider, { value, children: createElement(StaticLive, { live: now, children: child }) }) }),
  });
  return renderToStaticMarkup(tree).replaceAll('<!-- -->', '');
}

const phone = (view: MuleView, now: Live, size: 844 | 667 = 844) => onPhone(view, now, createElement(PhoneLandscape, { frame: { w: FRAMES[size].w, h: FRAMES[size].h } }));

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

  it('C11 (RULE-9, V-7): no MULE and not the money for one: never the corral; what you can do instead, in words', () => {
    const view = devView(lenasMe(), { players: PLAYERS.map((p) => (p.id === 's1' ? { ...p, money: 100 } : p)) });
    const html = phone(view, live(mine(6.6, 4.5)));
    expect(text(html, 'guide-label')).toBe('ANALYSE · 4·1');
    expect(text(html, 'guide-note')).toMatch(/^A MULE costs 148 cr; you have 100\. Analyse a plot, or end at the pub for ≈\d+ cr\.$/);
    expect(guide(lenasMe(), 'hall')).toContain('guide-room-corral');
    expect(phone(view, live(mine(4, 6, { space: 'hall' })))).not.toContain('guide-room-corral');
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

  it('C11 (RULE-10): reconnecting says so, and the colonist stands where the last frame had it', () => {
    const html = phone(devView(), live(mine(5.5, 4.5), undefined, 'reconnecting'));
    expect(text(html, 'reconnecting')).toBe('RECONNECTING…');
    expect(phone(devView(), live(mine(5.5, 4.5)))).not.toContain('data-testid="reconnecting"');
  });

  it('C11 (AM-20, A-1): while month 1\'s clock waits, the side room says so in A-1\'s words, not only a full clock', () => {
    const waits = (me: MyView, size: 844 | 667 = 844, waitsFor = ['s2']) => phone(devView(me, { month: 1, clockWaitsFor: waitsFor }), live(mine(5.5, 4.5)), size);
    // Your MULE is in and Ossa's still to come.
    const inAt844 = waits(lenasMe({ installedThisTurn: true }));
    expect(text(inside(inAt844, 'phone-status-left'), 'wait-title')).toBe('Your MULE is in · waiting for Ossa');
    expect(text(inAt844, 'wait-detail')).toBe('Buying, installing and analysing wait for the clock.');
    expect(inside(inAt844, 'phone-status-left')).toContain('data-testid="shared-clock"');
    // At 667 the status is a bar over the map: the title goes there.
    expect(text(inside(waits(lenasMe({ installedThisTurn: true }), 667), 'phone-status-bar'), 'wait-title')).toBe('Your MULE is in · waiting for Ossa');
    // Before your first MULE (the clock waits for you too), no rush: the corral, and why.
    const before = waits(lenasMe(), 844, ['s1', 's2']);
    expect(text(before, 'wait-title')).toBe('Buy a MULE at the corral');
    expect(text(before, 'wait-detail')).toBe('Your first month: no rush. The clock starts when your first MULE is in.');
    // Once the clock runs, no wait words.
    expect(phone(devView(lenasMe({ installedThisTurn: true }), { month: 1 }), live(mine(5.5, 4.5)))).not.toContain('wait-title');
  });

  it('C11: the turn over in the pub: the card says so, and how many MULEs went in', () => {
    const view = devView(lenasMe({ installedThisTurn: true, reach: reach('IN THE PUB', 'turn over', false) }), { players: PLAYERS.map((p) => (p.id === 's1' ? { ...p, doneDeveloping: true } : p)) });
    const html = phone(view, live(null));
    expect(text(html, 'over-card')).toMatch(/^In the pub: your turn is over/);
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
    const html = onPhone(devView(lenasMe({ reach: reach('BUY MULE', '148 cr') })), live(mine(5.5, 4.5)), createElement(LaptopArcade, { frame: { w: 1440, h: 900 } }));
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

  it('C12: month 1\'s clock waits for the first MULEs, as today', () => {
    const html = onTv(devView(lenasMe(), { month: 1, clockWaitsFor: ['s2'] }), everyone());
    expect(html).toContain('data-testid="tv-clock-label"');
    expect(html).toContain('data-testid="tv-first-mules"');
    expect(html).not.toContain('data-testid="shared-clock"');
  });

  it("C12 (A-1): while month 1's clock waits the TV's header shows no clock, as the flag-off TV; once it runs, it does", () => {
    const header = (html: string) => /<header[\s\S]*?<\/header>/.exec(html)?.[0] ?? '';
    const waiting = onTv(devView(lenasMe(), { month: 1, clockWaitsFor: ['s2'], phaseEndsAt: null }), everyone());
    expect(header(waiting)).not.toBe('');
    expect(header(waiting)).not.toContain('role="timer"');
    expect(header(onTv(devView(lenasMe(), { month: 1, phaseEndsAt: Date.now() + 30_000 }), everyone()))).toContain('role="timer"');
  });

  it('C12 (A-1): the host started the clock: the news shows on the TV as a beat; other news does not', () => {
    const started = onTv(devView(lenasMe(), { month: 1, news: ['Kai installed a MULE.', 'Lena started the clock without Ossa.'] }), everyone());
    expect([...started.matchAll(/data-testid="tv-beat"[^>]*>([^<]+)</g)].map((m) => m[1])).toEqual(['Lena started the clock without Ossa.']);
    expect(onTv(devView(lenasMe(), { news: ['Kai installed a MULE.'] }), everyone())).not.toContain('tv-beat');
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
