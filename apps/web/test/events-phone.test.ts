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

// The fake document has no dataset; the map's theme reads the page's.
Object.assign(document.documentElement, { dataset: {} });

const W = 6;
const H = 3;
const NOW = 1_000_000;
const LENA = 's1';
const OSSA = 's2';

// The month: a dust storm takes 2 Energy from Lena's plant at (1, 0), then a drought takes 1 Food from Ossa's farm
// at (2, 2) and passes Lena by. Each plays 3 s after the server's 1.8 s intro.
const fired = (key: ProductionEventView['key'], hits: [x: number, y: number, delta: number][]): ProductionEventView => ({
  key,
  kind: 'storm',
  title: key === 'dustStorm' ? 'Dust storm' : 'Drought',
  line: `${key} happens.`,
  sign: 'bad',
  scope: 'colony',
  origin: { x: 0, y: 0 },
  from: 'w',
  hits: hits.map(([x, y, delta], order) => ({ x, y, order, delta })),
  phase: 'production',
  weight: 'headline',
  playMs: 3000,
});
const events = [fired('dustStorm', [[1, 0, -2]]), fired('drought', [[2, 2, -1]])];
const introMs = EVENT_SHOW.introMs;
// The server's length for this month (RULE-1): a quiet month's, plus what the intro and events run past its window.
const lengthMs = PHASES.productionMs + Math.max(0, introMs + 6000 - EVENT_SHOW.productionWindowMs);
const production: ProductionView = {
  lines: [
    { x: 1, y: 0, owner: LENA, good: 'energy', made: 4, parts: [] },
    { x: 2, y: 2, owner: OSSA, good: 'food', made: 3, parts: [] },
  ],
  events,
  lengthMs,
  introMs,
};

// Show seconds, worked by hand: the events open at 4.8, the intro runs to 6.6, the dust storm 6.6..9.6, the drought
// 9.6..12.6; the goods fly after it and the phase ends at 18 (15 + the 3 s the events run past a quiet window).
const INTRO_AT = 4.8;
const DUST_AT = 6.6;
const DROUGHT_AT = 9.6;
const EVENTS_END = 12.6;
const END = 18;

const person = (id: string, name: string, slot: number): PlayerView =>
  ({ id, name, isAi: false, color: '', slot, species: 'mollox', money: 1000, worth: 0, plots: 1, ready: false, doneDeveloping: false, colonist: null, condition: null }) as PlayerView;
const players = [person(LENA, 'Lena', 0), person(OSSA, 'Ossa', 1)];
const tiles = Array.from({ length: W * H }, (_, i) => {
  const x = i % W;
  const y = Math.floor(i / W);
  const owner = x === 1 && y === 0 ? LENA : x === 2 && y === 2 ? OSSA : null;
  return { x, y, terrain: 'plains', owner, outfit: x === 1 && y === 0 ? 'energy' : x === 2 && y === 2 ? 'food' : null };
});

/** The phase's end, so that the show stands at `t` seconds when the client reads the server time NOW. */
const endsAtFor = (t: number) => NOW + lengthMs * (1 - t / END);

function game(boards: number, t: number): PhoneGame {
  const view = { phase: 'production', month: 5, maxMonths: 12, phaseEndsAt: endsAtFor(t), width: W, height: H, tiles, players, production } as unknown as MuleView;
  const me = { id: LENA, stock: { food: 2, water: 0, energy: 4, smithore: 0, crystite: 0, rareEarth: 0, alloy: 0, electronics: 0, medicine: 0 } } as unknown as MyView;
  return { table: { code: 'ABCD', status: 'playing', hostId: LENA, boards, seats: [], game: null } as TableView<MuleView>, view, me, self: players[0]!, slot: 0 };
}

const sent: unknown[] = [];
const client = {
  subscribe: () => () => undefined,
  getState: () => ({ chat: [], view: null, seatId: LENA }),
  serverNow: () => NOW,
  intent: (i: unknown) => sent.push(i),
  chat: (c: unknown) => sent.push(c),
} as unknown as TableClient;

/** The device's reduced-motion setting, as the screen reads it. */
function prefersReduced(reduced: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: reduced && q.includes('prefers-reduced-motion'), media: q, addEventListener() {}, removeEventListener() {} }));
}

async function screen(boards: number, t: number) {
  const { Production } = await import('../src/phone/Production');
  const { ClientProvider } = await import('../src/net/react');
  const { PhoneGameProvider } = await import('../src/phone/game');
  return createElement(ClientProvider, { client, children: createElement(PhoneGameProvider, { value: game(boards, t), children: createElement(Production, { production }) }) });
}
const render = async (boards: number, t: number, reduced = false) => {
  prefersReduced(reduced);
  return renderToStaticMarkup(await screen(boards, t));
};

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
const camera = (html: string) => /style="[^"]*transform:\s*translate[^"]*"/.test(tag(html, 'event-map'));

afterEach(() => {
  vi.unstubAllGlobals();
  sent.length = 0;
});

/** Mounts the screen in the fake DOM, where a tap runs; returns the host and a way to tap the map. */
async function mount(boards: number, t: number) {
  prefersReduced(false);
  const doc = document as unknown as { createElementNS?: (ns: string, tag: string) => FakeElement };
  doc.createElementNS ??= (_ns, tag) => document.createElement(tag);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host as unknown as HTMLElement);
  const el = await screen(boards, t);
  flushSync(() => root.render(el));
  const html = () => outer(host);
  const tap = () => {
    const button = find(host, (e) => e.getAttribute('data-testid') === 'skip');
    expect(button, 'the map is a tap target').not.toBeNull();
    const props = Object.entries(button!).find(([k]) => k.startsWith('__reactProps$'))?.[1] as { onClick?: () => void };
    flushSync(() => props.onClick!());
  };
  return { html, tap, unmount: () => root.unmount() };
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
    ] as const) {
      const html = await render(0, t);
      expect(playing(html), `the phone's map at ${t}`).toBe(ev);
      expect(html, `the map is the tap target at ${t}`).toContain('data-testid="skip"');
    }
    expect(text(await render(0, DUST_AT + 0.5), 'phone-now')).toContain('Dust storm');
    expect(card(await render(0, DUST_AT + 2.4))).toEqual({ event: 'dustStorm', at: 'you' });

    // A tap in the middle of the dust storm jumps the phone's show to what it did to Lena; nothing is sent.
    const phone = await mount(0, DUST_AT + 0.5);
    expect(card(phone.html())).toBeNull();
    phone.tap();
    expect(card(phone.html())).toEqual({ event: 'dustStorm', at: 'you' });
    expect(text(phone.html(), 'phone-you')).toMatch(/[−-]2 Energy for you/);
    expect(sent).toEqual([]);
    phone.unmount();

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
    expect(card(await render(1, EVENTS_END - 0.1))).toEqual({ event: 'drought', at: 'you' });
    expect(text(await render(1, EVENTS_END - 0.1), 'phone-miss')).toContain('Your plots are clear of it.');

    // Row 4, boards 0: the phone's own show with its camera free, then the result holds until the phase ends (AM-8).
    const solo = await render(0, DUST_AT + 1);
    expect(tag(solo, 'event-map-box')).toContain('data-reduced="false"');
    for (const t of [EVENTS_END + 0.5, END - 0.5, END]) {
      const held = await render(0, t);
      expect(card(held), `the result holds at ${t}`).toEqual({ event: 'drought', at: 'you' });
      expect(text(held, 'phone-miss')).toContain('Your plots are clear of it.');
      expect(playing(held)).toBeNull();
    }

    // Row 3, boards 0 and reduced: the same show with no camera, the same cards and figures.
    for (const t of [DUST_AT + 0.5, DUST_AT + 1.5, DUST_AT + 2.4]) {
      const still = await render(0, t, true);
      expect(tag(still, 'event-map-box'), `reduced at ${t}`).toContain('data-reduced="true"');
      expect(camera(still), `no camera at ${t}`).toBe(false);
      expect(playing(still)).toBe('dustStorm');
    }
    expect(card(await render(0, DUST_AT + 2.4, true))).toEqual({ event: 'dustStorm', at: 'you' });

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
    expect(playing(phone.html()), 'past the last event, the result holds').toBeNull();
    expect(card(phone.html())).toEqual({ event: 'drought', at: 'you' });
    expect(text(phone.html(), 'harvest'), 'the harvest list stays').toContain('+2');
    expect(sent, 'a skip is this phone’s alone: nothing is sent').toEqual([]);
    phone.unmount();
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
