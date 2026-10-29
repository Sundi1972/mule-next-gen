import { document, FakeElement } from './fake-dom';
import { EVENT_SHOW, PHASES } from '@mule/engine';
import type { MuleView, MyView, PlayerView, ProductionEventView, ProductionView, TableView } from '@mule/protocol';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TableClient } from '../src/net/client';
import type { PhoneGame } from '../src/phone/game';

/**
 * The phone's production screen as a player receives it (C7, RULE-3): rendered under the phone's game from a
 * fixture, its clock set by the server time the client reports.
 */

// The fake document has no dataset (the map's theme reads the page's) and no layout (the shell and the fly targets measure).
Object.assign(document.documentElement, { dataset: {} });
Object.assign(FakeElement.prototype, { getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }), offsetWidth: 0, offsetHeight: 0, querySelectorAll: () => [] });

const W = 6;
const H = 3;
const NOW = 1_000_000;
const LENA = 's1';
const OSSA = 's2';

// The month: a dust storm takes 2 Energy from Lena's plant at (1, 0); a drought takes 1 Food from Ossa's farm at (2, 2)
// and passes Lena by; a bumper harvest (a story: its camera flies in to its origin) gives Lena's plant 1 back, so
// it ends on 3: neither what it made (4) nor nothing. Each
// plays 3 s after the server's 1.8 s intro.
const fired = (key: ProductionEventView['key'], title: string, sign: 'good' | 'bad', origin: [number, number], hits: [x: number, y: number, delta: number][]): ProductionEventView => ({
  key,
  kind: 'storm',
  title,
  line: `${key} happens.`,
  sign,
  scope: 'colony',
  origin: { x: origin[0], y: origin[1] },
  from: 'w',
  hits: hits.map(([x, y, delta], order) => ({ x, y, order, delta })),
  phase: 'production',
  weight: 'headline',
  playMs: 3000,
});
const events = [
  fired('dustStorm', 'Dust storm', 'bad', [0, 0], [[1, 0, -2]]),
  fired('drought', 'Drought', 'bad', [0, 0], [[2, 2, -1]]),
  fired('bumperHarvest', 'Bumper harvest', 'good', [1, 0], [[1, 0, 1]]),
];
const introMs = EVENT_SHOW.introMs;
const lines: ProductionView['lines'] = [
  { x: 1, y: 0, owner: LENA, good: 'energy', made: 4, parts: [] },
  { x: 2, y: 2, owner: OSSA, good: 'food', made: 3, parts: [] },
];
/** The server's view of a month (RULE-1): a quiet month's length, plus what the intro and events run past its window. */
function monthOf(evs: ProductionEventView[]): ProductionView {
  const intro = evs.length > 0 ? introMs : 0;
  const play = evs.reduce((n, e) => n + e.playMs, 0);
  return { lines, events: evs, lengthMs: PHASES.productionMs + Math.max(0, intro + play - EVENT_SHOW.productionWindowMs), introMs: intro };
}
const production = monthOf(events);
const quiet = monthOf([]);

// Show seconds, worked by hand: the events open at 4.8, the intro runs to 6.6, the dust storm 6.6..9.6, the drought
// 9.6..12.6, the bumper harvest 12.6..15.6; the goods fly after it and the phase ends at 21 (15 + the 6 s the events
// run past a quiet window).
const INTRO_AT = 4.8;
const DUST_AT = 6.6;
const DROUGHT_AT = 9.6;
const BUMPER_AT = 12.6;
const EVENTS_END = 15.6;
const END = 21;
// The drought's result card, by the beats: the TV's (announce 2.2, sweep 3.6, settle 1.2 over 3 s) shows it from
// 11.886; a phone alone's (1.4, 3.6 × 0.75, 0.8) from 11.910. At 11.9 only the TV's beat has it up.
const BEATS_DIFFER = 11.9;

const person = (id: string, name: string, slot: number): PlayerView =>
  ({ id, name, isAi: false, color: '', slot, species: 'mollox', money: 1000, worth: 0, plots: 1, ready: false, doneDeveloping: false, colonist: null, condition: null }) as PlayerView;
const players = [person(LENA, 'Lena', 0), person(OSSA, 'Ossa', 1)];
const tiles = Array.from({ length: W * H }, (_, i) => {
  const x = i % W;
  const y = Math.floor(i / W);
  const owner = x === 1 && y === 0 ? LENA : x === 2 && y === 2 ? OSSA : null;
  return { x, y, terrain: 'plains', owner, outfit: x === 1 && y === 0 ? 'energy' : x === 2 && y === 2 ? 'food' : null };
});

function game(boards: number, t: number, month: ProductionView = production): PhoneGame {
  const end = 15 + Math.max(0, (month.introMs + month.events.reduce((n, e) => n + e.playMs, 0) - EVENT_SHOW.productionWindowMs) / 1000);
  // The phase's end, so that the show stands at `t` seconds when the client reads the server time NOW.
  const phaseEndsAt = NOW + month.lengthMs * (1 - t / end);
  const view = { phase: 'production', month: 5, maxMonths: 12, phaseEndsAt, width: W, height: H, tiles, players, production: month } as unknown as MuleView;
  const me = { id: LENA, stock: { food: 2, water: 0, energy: 4, smithore: 0, crystite: 0, rareEarth: 0, alloy: 0, electronics: 0, medicine: 0 } } as unknown as MyView;
  return { table: { code: 'ABCD', status: 'playing', hostId: LENA, boards, seats: [], game: null } as TableView<MuleView>, view, me, self: players[0]!, slot: 0 };
}

const sent: unknown[] = [];
const state = { chat: [], view: null, seatId: LENA };
const client = {
  subscribe: () => () => undefined,
  getState: () => state,
  serverNow: () => NOW,
  intent: (i: unknown) => sent.push(i),
  chat: (c: unknown) => sent.push(c),
} as unknown as TableClient;

async function screen(boards: number, t: number, month: ProductionView = production) {
  const { Production } = await import('../src/phone/Production');
  const { ClientProvider } = await import('../src/net/react');
  const { PhoneGameProvider } = await import('../src/phone/game');
  return createElement(ClientProvider, { client, children: createElement(PhoneGameProvider, { value: game(boards, t, month), children: createElement(Production, { production: month }) }) });
}
/** The screen as the server renders it: the device's reduced-motion setting reads as off there. */
const render = async (boards: number, t: number, month: ProductionView = production) => renderToStaticMarkup(await screen(boards, t, month));

/** The opening tag of the element carrying this data-testid, or ''. */
const tag = (html: string, testid: string) => html.match(new RegExp(`<[^>]*data-testid="${testid}"[^>]*>`))?.[0] ?? '';
/** The event the phone's own map is playing, or null. */
const playing = (html: string) => tag(html, 'event-map').match(/data-event="([^"]+)"/)?.[1] ?? null;
/** The rail's event card: which event, and whether it names it ('news') or says what it did ('you'). */
const card = (html: string) => {
  const t = tag(html, 'phone-card');
  return t ? { event: t.match(/data-event="([^"]+)"/)?.[1], at: t.match(/data-at="([^"]+)"/)?.[1] } : null;
};
/** The text inside the element carrying this data-testid, tags stripped. */
function text(html: string, testid: string): string {
  const at = html.indexOf(`data-testid="${testid}"`);
  if (at < 0) return '';
  return html
    .slice(html.indexOf('>', at) + 1)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 160);
}
/** Whether the map's camera has moved: a transform on the map inside its box. */
const camera = (html: string) => /transform:\s*translate/.test(tag(html, 'event-map'));
/** The markup inside the element carrying this data-testid, by balancing its tag. */
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
/** Show seconds from a to b, every `step`. */
const frames = (a: number, b: number, step = 0.1) => Array.from({ length: Math.floor((b - a) / step) }, (_, i) => a + (i + 0.5) * step);

const mounted = new Set<() => void>();
afterEach(() => {
  for (const unmount of mounted) unmount();
  mounted.clear();
  delete (window as { matchMedia?: unknown }).matchMedia;
  vi.unstubAllGlobals();
  sent.length = 0;
});

/**
 * Mounts the screen in the fake DOM, where effects and taps run, with the device's prefers-reduced-motion set to
 * `reduced`. A tap calls the skip button's React onClick, found on the rendered element; the real click on a real
 * page is Task 6's browser test.
 */
async function mount(boards: number, t: number, { reduced = false, month = production }: { reduced?: boolean; month?: ProductionView } = {}) {
  Object.assign(window, { matchMedia: (q: string) => ({ media: q, matches: reduced && q === '(prefers-reduced-motion: reduce)', addEventListener() {}, removeEventListener() {} }) });
  const doc = document as unknown as { createElementNS?: (ns: string, tag: string) => FakeElement };
  doc.createElementNS ??= (_ns, tag) => document.createElement(tag);
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} });
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host as unknown as HTMLElement);
  const show = async (b: number, at: number) => {
    const el = await screen(b, at, month);
    flushSync(() => root.render(el));
  };
  await show(boards, t);
  mounted.add(() => {
    root.unmount();
    document.body.removeChild(host);
  });
  const tap = () => {
    const button = find(host, (e) => e.getAttribute('data-testid') === 'skip');
    expect(button, 'the map is a tap target').not.toBeNull();
    const props = Object.entries(button!).find(([k]) => k.startsWith('__reactProps$'))?.[1] as { onClick?: () => void };
    flushSync(() => props.onClick!());
  };
  return { html: () => outer(host), tap, rerender: show };
}
function find(node: FakeElement, ok: (e: FakeElement) => boolean): FakeElement | null {
  for (const c of node.childNodes) {
    if (!(c instanceof FakeElement)) continue;
    if (ok(c)) return c;
    const deep = find(c, ok);
    if (deep) return deep;
  }
  return null;
}
/** The fake DOM as markup, enough for the same readers as the server render. */
function outer(node: FakeElement): string {
  const attrs = [...node.attributes].map(([k, v]) => ` ${k}="${v}"`).join('');
  const style = Object.entries(node.style)
    .filter(([k, v]) => typeof v === 'string' && v && k !== 'setProperty')
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${v}`)
    .join(';');
  const inner = node.childNodes.map((c) => (c instanceof FakeElement ? outer(c) : c.textContent)).join('');
  return `<${node.tagName.toLowerCase()}${attrs}${style ? ` style="${style}"` : ''}>${inner}</${node.tagName.toLowerCase()}>`;
}

describe('the phone plays the show alone (C7)', () => {
  it('B-AC-2: with no board connected each event plays on the phone’s own map, a tap skips to the result, and the result says what it did to you', async () => {
    // Each event plays on the phone's own map in turn, at the solo beat, with the "now" line in the rail.
    for (const [t, ev] of [
      [DUST_AT + 1, 'dustStorm'],
      [DUST_AT + 2.5, 'dustStorm'],
      [DROUGHT_AT + 1, 'drought'],
      [DROUGHT_AT + 2.5, 'drought'],
      [BUMPER_AT + 1, 'bumperHarvest'],
    ] as const) {
      const html = await render(0, t);
      expect(playing(html), `the phone's map at ${t}`).toBe(ev);
      expect(html, `the map is the tap target at ${t}`).toContain('data-testid="skip"');
    }
    expect(text(await render(0, DUST_AT + 0.5), 'phone-now')).toContain('Dust storm');
    expect(card(await render(0, DUST_AT + 2.4))).toEqual({ event: 'dustStorm', at: 'you' });
    // The rail plays the phone's own beat, not the TV's: at 11.9 the TV's beat has the drought's result up, the phone's not yet.
    expect(card(await render(0, BEATS_DIFFER)), 'alone: still playing').toBeNull();
    expect(card(await render(1, BEATS_DIFFER)), 'with a TV: the result').toEqual({ event: 'drought', at: 'you' });

    // A tap in the middle of the dust storm jumps the phone's show to what it did to Lena; nothing is sent.
    const phone = await mount(0, DUST_AT + 0.5);
    expect(card(phone.html())).toBeNull();
    phone.tap();
    expect(card(phone.html())).toEqual({ event: 'dustStorm', at: 'you' });
    expect(text(phone.html(), 'phone-you')).toMatch(/[−-]2 Energy for you/);
    expect(sent).toEqual([]);
    // A board connects after the tap: the phone follows the TV's clock again, not the skipped one.
    await phone.rerender(1, DUST_AT + 0.5);
    expect(card(phone.html()), 'a TV joins: back on its clock').toEqual({ event: 'dustStorm', at: 'news' });

    // Negative: with a board connected the phone plays no show on its own map; it carries the light card.
    for (const t of [DUST_AT + 1, DROUGHT_AT + 1]) {
      const html = await render(1, t);
      expect(playing(html), `with a TV, the phone's map at ${t}`).toBeNull();
      expect(html).not.toContain('data-testid="skip"');
      expect(card(html)?.event).toBe(t < DROUGHT_AT ? 'dustStorm' : 'drought');
    }
  });

  it('T-AC-5: RULE-3’s rows, in the rendered phone screen (boards 0/1 × reduced × skipped)', async () => {
    // Row 1, boards 1: the light card as each event plays: named and buzzing as it is announced, then what it did to you.
    const news = await render(1, DUST_AT + 0.3);
    expect(card(news)).toEqual({ event: 'dustStorm', at: 'news' });
    expect(news, 'it buzzes as it is announced').toContain('animate-[ev-buzz');
    expect(await render(1, DUST_AT + 1.5), 'and stops buzzing').not.toContain('animate-[ev-buzz');
    const you = await render(1, DROUGHT_AT - 0.1);
    expect(card(you)).toEqual({ event: 'dustStorm', at: 'you' });
    expect(text(you, 'phone-you')).toMatch(/[−-]2 Energy for you/);
    expect(card(await render(1, BUMPER_AT - 0.1))).toEqual({ event: 'drought', at: 'you' });
    expect(text(await render(1, BUMPER_AT - 0.1), 'phone-miss')).toContain('Your plots are clear of it.');
    // A hit that changed nothing is no loss: a drought that reaches Lena's plant with a delta of 0 still misses her,
    // in the rail's line for it once the next event plays, and on its own card.
    const grazed = monthOf([events[0]!, { ...events[1]!, hits: [...events[1]!.hits, { x: 1, y: 0, order: 1, delta: 0 }] }, events[2]!]);
    const words = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const later = words(await render(1, BUMPER_AT + 0.5, grazed));
    expect(later, "the drought's line in the rail").toMatch(/Drought not you/);
    expect(later, 'no +0 anywhere').not.toMatch(/[+−-]0\b/);
    const grazedCard = await render(1, BUMPER_AT - 0.1, grazed);
    expect(card(grazedCard)).toEqual({ event: 'drought', at: 'you' });
    expect(text(grazedCard, 'phone-miss'), 'a zero hit: the miss card').toContain('Your plots are clear of it.');
    expect(grazedCard, 'a zero hit: no figure for you').not.toContain('data-testid="phone-you"');
    // With a TV the phone's map plays no weather, no title card, no camera, and marks only Lena's own plots.
    for (const t of [...frames(DUST_AT, DUST_AT + 3, 0.5), ...frames(BUMPER_AT, EVENTS_END, 0.25)]) {
      const html = await render(1, t);
      for (const layer of ['front-dustStorm', 'vignette', 'title-card', 'intro-card']) expect(html, `with a TV, ${layer} at ${t}`).not.toContain(`data-testid="${layer}"`);
      expect(camera(html), `with a TV, the camera at ${t}`).toBe(false);
    }
    const marked = await render(1, EVENTS_END - 0.1);
    expect(marked, "Lena's own plot is marked").toContain('data-testid="mark-1-0"');
    expect(marked, "Ossa's plot is not, on Lena's phone").not.toContain('data-testid="mark-2-2"');
    // The phone vibrates once per event as it is announced, where it can; never on a phone alone.
    for (const [boards, calls] of [
      [1, 2],
      [0, 0],
    ] as const) {
      const vibrate = vi.fn(() => true);
      vi.stubGlobal('navigator', { vibrate });
      const buzzing = await mount(boards, DUST_AT + 0.3);
      await buzzing.rerender(boards, DUST_AT + 1.5);
      await buzzing.rerender(boards, DROUGHT_AT + 0.3);
      expect(vibrate, `boards ${boards}`).toHaveBeenCalledTimes(calls);
    }

    // Row 4, boards 0: the phone's own show with its camera free (the bumper harvest's story flies in), then the
    // result holds until the phase ends (AM-8).
    const solo = await render(0, DUST_AT + 1);
    expect(tag(solo, 'event-map-box')).toContain('data-reduced="false"');
    const story = await Promise.all(frames(BUMPER_AT, EVENTS_END, 0.25).map((t) => render(0, t)));
    expect(story.some(camera), 'alone, the camera flies in').toBe(true);
    expect(await render(0, DUST_AT + 0.4, quiet), 'a quiet month').toContain('Your plots are working');
    expect(card(await render(0, DUST_AT + 0.4, quiet))).toBeNull();
    for (const t of [EVENTS_END + 0.5, END - 0.5, END]) {
      const held = await render(0, t);
      expect(card(held), `the result holds at ${t}`).toEqual({ event: 'bumperHarvest', at: 'you' });
      expect(text(held, 'phone-you')).toContain('for you');
      expect(playing(held)).toBeNull();
    }
    // The skip hint sits with the screen's actions while an event is on, and only alone.
    const hint = (html: string) => text(inside(html, 'actions'), 'skip-hint');
    expect(hint(await render(0, DUST_AT + 0.5))).toContain('tap the map to skip');
    expect(hint(await render(0, DUST_AT + 2.6))).toContain('tap the map: next');
    // The hint and the rail agree on every frame: "skip" exactly while the rail still shows the event playing.
    for (const t of frames(DUST_AT, EVENTS_END, 0.05)) {
      const html = await render(0, t);
      expect(hint(html).includes('to skip'), `the hint says skip at ${t.toFixed(3)} iff the rail has no result yet`).toBe(card(html) === null);
    }
    for (const [boards, t] of [
      [0, INTRO_AT + 0.2],
      [0, EVENTS_END + 0.5],
      [1, DUST_AT + 0.5],
      [1, DUST_AT + 2.6],
    ] as const) {
      const html = await render(boards, t);
      expect(html, `no skip hint, boards ${boards} at ${t}`).not.toContain('data-testid="skip-hint"');
      expect(html, `no tap target, boards ${boards} at ${t}`).not.toContain('data-testid="skip"');
    }

    // Row 3, boards 0 and reduced: the same show with no camera, the same cards and figures.
    for (const t of frames(BUMPER_AT, EVENTS_END, 0.25)) {
      const still = await mount(0, t, { reduced: true });
      expect(tag(still.html(), 'event-map-box'), `reduced at ${t}`).toContain('data-reduced="true"');
      expect(camera(still.html()), `no camera at ${t}`).toBe(false);
      expect(playing(still.html())).toBe('bumperHarvest');
    }
    expect(card((await mount(0, DUST_AT + 2.4, { reduced: true })).html())).toEqual({ event: 'dustStorm', at: 'you' });

    // Row 2, boards 0 and skipped: tapping through gives the card of what each event did to you, then holds.
    const phone = await mount(0, DUST_AT + 0.5);
    phone.tap();
    expect(card(phone.html())).toEqual({ event: 'dustStorm', at: 'you' });
    phone.tap();
    expect(playing(phone.html()), 'tapped again: the next event').toBe('drought');
    phone.tap();
    expect(card(phone.html())).toEqual({ event: 'drought', at: 'you' });
    // The dust storm's result stays in the rail under the drought's.
    expect(phone.html()).toMatch(/Dust storm[^]*?[−-]2 Energy/);
    phone.tap();
    phone.tap();
    phone.tap();
    expect(playing(phone.html()), 'past the last event, the result holds').toBeNull();
    expect(card(phone.html())).toEqual({ event: 'bumperHarvest', at: 'you' });
    expect(text(phone.html(), 'harvest'), 'the harvest list stays: 4 − 2 + 1').toContain('+3');
    // The server's clock reaches the phase's end with the skip still ahead of it: the result and the harvest hold.
    await phone.rerender(0, END);
    expect(card(phone.html()), 'at the phase end').toEqual({ event: 'bumperHarvest', at: 'you' });
    expect(text(phone.html(), 'harvest'), 'at the phase end').toContain('+3');
    expect(sent, 'a skip is this phone’s alone: nothing is sent').toEqual([]);
  });

  it('B-AC-2: the harvest says its goods are flying home only once they fly, after the last event, never while one plays', async () => {
    // The drought plays at 10.6, past a quiet month's fly start (9.6); the goods fly from 15.6, when the events end.
    for (const boards of [0, 1]) {
      expect(text(await render(boards, EVENTS_END + 0.2), 'harvest'), `boards ${boards}, the goods fly`).toContain('flying home');
    }
    expect(text(await render(1, DROUGHT_AT + 1), 'harvest'), 'with a TV, mid-drought').not.toContain('flying home');
  });

  it('T-AC-5: alone, the rail is the show’s while it plays; the harvest returns as the show ends or is skipped past, and with a TV it stays', async () => {
    for (const t of [INTRO_AT + 0.2, DUST_AT + 1, DROUGHT_AT + 2.5, BUMPER_AT + 1]) {
      expect(await render(0, t), `alone at ${t}`).not.toContain('data-testid="harvest"');
      expect(text(await render(1, t), 'harvest'), `with a TV at ${t}`).toContain('+3');
    }
    expect(text(await render(0, EVENTS_END + 0.2), 'harvest'), 'alone, the show over').toContain('+3');
    expect(text(await render(0, DUST_AT + 0.4, quiet), 'harvest'), 'alone, a quiet month').toContain('+4');
    const phone = await mount(0, BUMPER_AT + 0.5);
    phone.tap();
    expect(phone.html(), 'on the last result').not.toContain('data-testid="harvest"');
    phone.tap();
    expect(text(phone.html(), 'harvest'), 'skipped past the last event').toContain('+3');
  });

  it('T-AC-5: inside the intro no story plays yet, and the first one starts as the intro ends', async () => {
    for (const t of [INTRO_AT + 0.2, DUST_AT - 0.2]) {
      const html = await render(0, t);
      expect(playing(html), `in the intro at ${t}`).toBeNull();
      expect(card(html)).toBeNull();
    }
    expect(playing(await render(0, DUST_AT + 0.3))).toBe('dustStorm');
    expect(card(await render(1, DUST_AT + 0.3))?.event).toBe('dustStorm');
  });
});

describe('a broken show never takes the screen under it down (§4)', () => {
  // A drought the view sent as a personal event without its origin (cast past the type): its title card and its rail
  // card throw as they name whose it is. Everything the screen computes from the view itself still works.
  const broken = { ...events[1]!, scope: 'personal', origin: undefined } as unknown as ProductionEventView;
  const month = monthOf([events[0]!, broken, events[2]!]);

  it("B-AC-2 (§4): while the broken event plays, the phone's map, Lena's plot, the stock strip, the harvest and the actions still render, alone and with a TV", async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (const boards of [0, 1]) {
      const phone = await mount(boards, DROUGHT_AT - 0.2, { month });
      for (const t of frames(DROUGHT_AT, BUMPER_AT + 1, 0.5)) {
        await phone.rerender(boards, t);
        const html = phone.html();
        expect(html, `boards ${boards}, the map at ${t}`).toContain('data-testid="holo-map"');
        expect(inside(html, 'plot-1-0'), `boards ${boards}, Lena's plot at ${t}`).toContain('data-bar="unit"');
        expect(html, `boards ${boards}, the stock strip at ${t}`).toContain('data-testid="stock-strip"');
        expect(text(html, 'actions'), `boards ${boards}, the actions at ${t}`).toContain('On to the auction');
        if (boards === 1) expect(text(html, 'harvest'), `with a TV, the harvest at ${t}`).toContain('+3');
      }
      // The broken show is logged, and the screen goes on to the harvest at the phase's end.
      await phone.rerender(boards, END);
      expect(text(phone.html(), 'harvest'), `boards ${boards}, at the phase end`).toContain('+3');
    }
    expect(errors.mock.calls.some((c) => String(c[0]).includes('event show')), 'the boundary logs what broke').toBe(true);
    errors.mockRestore();
  });
});
