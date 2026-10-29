import { document, FakeElement } from './fake-dom';
import { EVENT_SHOW } from '@mule/engine';
import type { EventView, MuleView, MyView, PlayerView, TableView, TileView } from '@mule/protocol';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TableClient } from '../src/net/client';

/**
 * C10 and C11's display, at promise altitude: what the TV and each phone show while a phase's events play over its
 * screen, rendered through the apps' own screens (TableApp, PhoneApp) from a view as the server sends it (the lead's
 * contract: MuleView.events, MuleView.eventShow { startsAt, showMs, introMs, endsAt, held }).
 */

// The fake document has no dataset (the map's theme reads the page's) and no layout (the shell measures).
Object.assign(document.documentElement, { dataset: {} });
Object.assign(FakeElement.prototype, { getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }), offsetWidth: 0, offsetHeight: 0, querySelectorAll: () => [] });

const W = 9;
const H = 5;
const NOW = 5_000_000;
const LENA = 's1';
const OSSA = 's2';
const BRIX = 's3';
/** The table's pace: the server's clock runs the show at a quarter of its full-pace length. */
const SCALE = 0.25;

// Development, month 5: Lena and Brix fall sick as the walk starts. Two bulletins share ONE roll call (RULE-1): the
// server sends each with half of it, after the intro.
type Sick = EventView & { player: string };
const sick = (player: string, name: string): Sick =>
  ({
    key: 'sickness',
    kind: 'sickness',
    title: 'Sickness',
    // The server's wording, verbatim (sickView): the phone parses its reason out of it.
    line: `${name} fell sick: the air is bad.`,
    sign: 'bad',
    scope: 'personal',
    player,
    origin: { x: 4, y: 2 },
    hits: [],
    phase: 'development',
    weight: 'bulletin',
    playMs: EVENT_SHOW.rollCallMs / 2,
  }) as unknown as Sick;
const SICK = [sick(LENA, 'Lena'), sick(BRIX, 'Brix')];
const SHOW_MS = EVENT_SHOW.introMs + EVENT_SHOW.rollCallMs;
/** A pest swarm the auction fired on Lena's plot, playing as long as the roll call so the timings above hold. */
const AUCTION_EVENT = {
  key: 'pestSwarm',
  kind: 'pests',
  title: 'Pest swarm',
  line: 'Pests strip a farm.',
  sign: 'bad',
  scope: 'personal',
  player: LENA,
  origin: { x: 1, y: 1 },
  hits: [{ x: 1, y: 1, order: 0, delta: -1 }],
  phase: 'auction',
  weight: 'spotlight',
  playMs: EVENT_SHOW.rollCallMs,
} as unknown as EventView;

/** Show seconds (full pace) of the roll call's result, by its beats: the intro, then announce, play, settle. */
const INTRO_S = EVENT_SHOW.introMs / 1000;
const RESULT_S = SHOW_MS / 1000 - 0.3;
const ROLL_S = INTRO_S + 0.5;

const condition = (isSick: boolean) => ({ foodShare: 1, sick: isSick, sickBecause: isSick ? 'smog' : null, conditionPace: isSick ? 0.5 : 1 });
const person = (id: string, name: string, slot: number, isSick: boolean): PlayerView =>
  ({ id, name, isAi: false, color: '', slot, species: 'mollox', money: 640, worth: 0, plots: 1, ready: false, doneDeveloping: false, colonist: null, condition: condition(isSick) }) as unknown as PlayerView;
const players = [person(LENA, 'Lena', 0, true), person(OSSA, 'Ossa', 1, false), person(BRIX, 'Brix', 2, true)];
const tiles: TileView[] = Array.from({ length: W * H }, (_, i) => {
  const x = i % W;
  const y = Math.floor(i / W);
  return { x, y, terrain: x === 4 && y === 2 ? 'store' : 'plains', peaks: 0, owner: x === 1 && y === 1 ? LENA : null, outfit: null, pollution: 0, filter: false } as TileView;
});
const STOCK = { food: 3, water: 2, energy: 2, smithore: 0, crystite: 0, rareEarth: 0, alloy: 0, electronics: 0, medicine: 0 };

/**
 * The view at show second `t` (full pace): the server's clock is `t × SCALE` past the show's start. `events: []` is a
 * quiet phase; production carries its own show and the overlay must stay out of it. `held`: the server holds the
 * phase's clocks for the show.
 */
function viewAt(t: number, { phase = 'development' as MuleView['phase'], events = SICK as EventView[], held = true } = {}): MuleView {
  const startsAt = NOW - t * 1000 * SCALE;
  const show = events.length ? { startsAt, showMs: SHOW_MS, introMs: EVENT_SHOW.introMs, endsAt: startsAt + Math.round(SHOW_MS * SCALE), held } : null;
  return {
    finished: false,
    month: 5,
    maxMonths: 12,
    phase,
    phaseEndsAt: NOW + 60_000,
    width: W,
    height: H,
    tiles,
    lit: null,
    players,
    me: null,
    market: [],
    storeMules: 8,
    mulePrice: 120,
    colonists: 1000,
    air: { level: 40, band: 'smoggy' },
    lastAir: null,
    colonistsFed: null,
    ship: { wants: [] },
    treasury: { money: 0, salesTax: 0 },
    news: [],
    scores: null,
    auction: null,
    listings: [],
    lotSlots: { used: 0, max: 0 },
    landAuction: null,
    production: phase === 'production' || phase === 'upkeep' ? { lines: [], events: [], lengthMs: 15_000, introMs: 0 } : null,
    events,
    eventShow: show,
    politics: null,
  } as unknown as MuleView;
}
const mine = (id: string): MyView =>
  ({
    id,
    species: 'mollox',
    stock: STOCK,
    carriedMule: null,
    claimsLeft: 0,
    hungry: false,
    sick: id !== OSSA,
    needs: { food: 3, water: 2 },
    monthNeeds: STOCK,
    devEndsAt: NOW + 60_000,
    devSeconds: 60,
    produced: null,
    mulePrice: 120,
    outfitCosts: { food: 25, water: 25, energy: 50, smithore: 75, crystite: 100, rareEarth: 100, greenBelt: 25 },
    droneOrder: [],
    politics: null,
    installedThisTurn: false,
    worthParts: {},
  }) as unknown as MyView;

const table = (game: MuleView, boards: number): TableView<MuleView> => ({ code: 'ABCD', status: 'playing', hostId: LENA, boards, seats: [], game }) as unknown as TableView<MuleView>;
function client(state: object): TableClient {
  return {
    subscribe: () => () => undefined,
    getState: () => state,
    serverNow: () => NOW,
    savedSeat: () => null,
    join: () => undefined,
    watch: () => undefined,
    intent: () => undefined,
    chat: () => undefined,
  } as unknown as TableClient;
}
const base = { status: 'playing', chat: [], emotes: [], toasts: [], notice: null, clockOffset: 0, handoffCode: null, code: 'ABCD' };

async function phone(me: string, boards: number, view: MuleView, my: Partial<MyView> = {}) {
  const { PhoneApp } = await import('../src/phone/PhoneApp');
  const { ClientProvider } = await import('../src/net/react');
  const game = { ...view, me: { ...mine(me), ...my } };
  return createElement(ClientProvider, { client: client({ ...base, role: 'player', seatId: me, view: table(game, boards) }), children: createElement(PhoneApp, { room: 'ABCD' }) });
}
async function tv(view: MuleView) {
  const { TableApp } = await import('../src/table/TableApp');
  const { ClientProvider } = await import('../src/net/react');
  return createElement(ClientProvider, { client: client({ ...base, role: 'board', seatId: null, view: table(view, 1) }), children: createElement(TableApp, { room: 'ABCD' }) });
}

/** The opening tag of the element carrying this data-testid, or ''. */
const tag = (html: string, testid: string) => html.match(new RegExp(`<[^>]*data-testid="${testid}"[^>]*>`))?.[0] ?? '';
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
const count = (html: string, s: string) => html.split(s).length - 1;

const mounted = new Set<() => void>();
afterEach(() => {
  for (const unmount of mounted) unmount();
  mounted.clear();
  delete (window as { matchMedia?: unknown }).matchMedia;
  vi.unstubAllGlobals();
});

/** Mounts in the fake DOM, where effects and taps run, with the device's prefers-reduced-motion set to `reduced`. */
async function mount(el: ReturnType<typeof createElement>, reduced = false) {
  Object.assign(window, { matchMedia: (q: string) => ({ media: q, matches: reduced && q === '(prefers-reduced-motion: reduce)', addEventListener() {}, removeEventListener() {} }) });
  // The fake window has no timers; the auction screen ticks on one.
  Object.assign(window, { setInterval: () => 0, clearInterval: () => undefined });
  const doc = document as unknown as { createElementNS?: (ns: string, tag: string) => FakeElement };
  doc.createElementNS ??= (_ns, t) => document.createElement(t);
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host as unknown as HTMLElement);
  flushSync(() => root.render(el));
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
  return { html: () => outer(host), tap };
}
/** The screen's markup once mounted: the apps read the client's store, which a server render cannot. */
const render = async (el: ReturnType<typeof createElement>) => (await mount(el)).html();
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

describe('B-AC-4 (C10): a phase’s events play over its screen on the phone', () => {
  it('B-AC-4: alone, the phone plays development’s sickness itself over the development screen', async () => {
    const html = await render(await phone(OSSA, 0, viewAt(ROLL_S)));
    expect(tag(html, 'phone-event-overlay')).toContain('data-mode="solo"');
    expect(tag(html, 'phone-event-overlay')).toContain('data-event-phase="development"');
    // Over the development screen: the screen is still there under it, and the show plays its own map.
    expect(html).toContain('data-testid="game-shell"');
    expect(inside(html, 'phone-event-overlay')).toContain('data-testid="event-map"');
    expect(inside(html, 'phone-event-overlay')).toContain('data-testid="roll-call"');
    expect(inside(html, 'phone-event-overlay')).toContain('data-testid="skip"');
  });

  it('B-AC-4: with a board, the light card: the gallery’s PhoneShow over the screen, its map never playing the event', async () => {
    const html = await render(await phone(LENA, 1, viewAt(RESULT_S)));
    const over = inside(html, 'phone-event-overlay');
    expect(tag(html, 'phone-event-overlay')).toContain('data-mode="light"');
    expect(over).toContain('data-testid="phone-card"');
    // Its own map only marks its own: no weather, no roll call, no tap target; its own colonist carries its sick tag.
    expect(over).toContain('data-testid="event-map"');
    expect(over).not.toContain('data-testid="roll-call"');
    expect(over).not.toContain('data-testid="skip"');
    expect(over.match(/data-testid="colonist-[^"]+"/g)).toEqual(['data-testid="colonist-s1"']);
    expect(inside(over, 'colonist-s1')).toContain('sick-tag');
  });

  it('B-AC-4: through development’s hold (no clocks yet) the overlay covers the whole screen, with a TV and alone', async () => {
    for (const boards of [0, 1]) {
      const held = { ...viewAt(ROLL_S), phaseEndsAt: null } as MuleView;
      const html = await render(await phone(OSSA, boards, held, { devEndsAt: null }));
      expect(tag(html, 'phone-event-overlay'), `boards ${boards}`).toMatch(/class="absolute inset-0 z-40 /);
      expect(tag(html, 'phone-event-overlay'), `boards ${boards}`).not.toContain('pointer-events-none');
    }
  });

  it('B-AC-4: planning is never held (RULE-4 c): with a TV the light card floats and the planning screen stays usable; alone the show plays, and a tap leaves the light card', async () => {
    const planning = viewAt(ROLL_S, { phase: 'planning', events: SICK.map((e) => ({ ...e, phase: 'planning' })) as EventView[], held: false });
    // With a TV: the card floats over the planning screen, taps go through, no map of its own.
    const tv = await render(await phone(OSSA, 1, planning));
    expect(tag(tv, 'phone-event-overlay')).toContain('data-mode="light"');
    expect(tag(tv, 'phone-event-overlay')).toContain('pointer-events-none');
    expect(tag(tv, 'phone-event-overlay')).not.toMatch(/absolute inset-0/);
    expect(inside(tv, 'phone-event-overlay')).toContain('data-testid="phone-card"');
    expect(inside(tv, 'phone-event-overlay')).not.toContain('data-testid="event-map"');
    expect(tv).toContain('data-testid="game-shell"');
    // Alone: the gallery's PhoneSolo plays over the screen; the first tap collapses it to the floating light card.
    const m = await mount(await phone(OSSA, 0, planning));
    expect(tag(m.html(), 'phone-event-overlay')).toMatch(/class="absolute inset-0 z-40 /);
    m.tap();
    expect(tag(m.html(), 'phone-event-overlay')).toContain('pointer-events-none');
    expect(tag(m.html(), 'phone-event-overlay')).not.toMatch(/absolute inset-0/);
    expect(inside(m.html(), 'phone-event-overlay')).toContain('data-testid="phone-card"');
    expect(inside(m.html(), 'phone-event-overlay')).not.toContain('data-testid="event-map"');
  });

  it('B-AC-4: the server, not the phase, says whether the show covers: an upkeep event the server does not hold floats over the month end', async () => {
    const upkeep = viewAt(ROLL_S, { phase: 'upkeep', events: [AUCTION_EVENT].map((e) => ({ ...e, phase: 'upkeep' })) as EventView[], held: false });
    const tv = await render(await phone(OSSA, 1, upkeep));
    expect(tag(tv, 'phone-event-overlay')).toContain('data-event-phase="upkeep"');
    expect(tag(tv, 'phone-event-overlay')).toContain('pointer-events-none');
    expect(tag(tv, 'phone-event-overlay')).not.toMatch(/absolute inset-0/);
    expect(tv).toContain('data-testid="game-shell"');
    const m = await mount(await phone(OSSA, 0, upkeep));
    m.tap();
    expect(tag(m.html(), 'phone-event-overlay')).toContain('pointer-events-none');
    expect(tag(m.html(), 'phone-event-overlay')).not.toMatch(/absolute inset-0/);
  });

  it('B-AC-4: an auction event the server holds the auction for: alone the phone plays it and covers; with a board the light card covers', async () => {
    const auction = viewAt(ROLL_S + 1, { phase: 'auction', events: [AUCTION_EVENT], held: true });
    const solo = await render(await phone(OSSA, 0, auction));
    expect(tag(solo, 'phone-event-overlay')).toContain('data-event-phase="auction"');
    expect(tag(solo, 'phone-event-overlay')).toContain('data-mode="solo"');
    expect(tag(solo, 'phone-event-overlay')).toMatch(/class="absolute inset-0 z-40 /);
    expect(inside(solo, 'phone-event-overlay')).toContain('data-testid="event-map"');
    expect(inside(solo, 'phone-event-overlay')).toContain('data-testid="skip"');
    const tv = await render(await phone(OSSA, 1, auction));
    expect(tag(tv, 'phone-event-overlay')).toContain('data-mode="light"');
    expect(tag(tv, 'phone-event-overlay')).toMatch(/class="absolute inset-0 z-40 /);
    expect(inside(tv, 'phone-event-overlay')).toContain('data-testid="phone-card"');
    expect(inside(tv, 'phone-event-overlay')).not.toContain('data-testid="skip"');
  });

  it('B-AC-4: nothing over production (its screen plays its own show), nor in a quiet phase, nor outside the show', async () => {
    for (const boards of [0, 1]) {
      expect(await render(await phone(OSSA, boards, viewAt(ROLL_S, { phase: 'production' })))).not.toContain('phone-event-overlay');
      expect(await render(await phone(OSSA, boards, viewAt(ROLL_S, { events: [] })))).not.toContain('phone-event-overlay');
      // Before the show starts, and once the server clock reaches endsAt (startsAt + showMs × the table's pace).
      expect(await render(await phone(OSSA, boards, viewAt(-0.5)))).not.toContain('phone-event-overlay');
      expect(await render(await phone(OSSA, boards, viewAt(SHOW_MS / 1000)))).not.toContain('phone-event-overlay');
    }
    expect(await render(await tv(viewAt(ROLL_S, { phase: 'production' })))).not.toContain('tv-event-overlay');
  });

  it('B-AC-4: the server clock runs at the table’s pace: the show at t full-pace seconds is t × scale ms past startsAt', async () => {
    expect(await render(await phone(OSSA, 0, viewAt(SHOW_MS / 1000 - 0.05)))).toContain('phone-event-overlay');
  });
});

describe('T-AC-10 display / C11: two sick players play in ONE roll call, on the TV and each phone', () => {
  it('T-AC-10: the TV plays the show over development: one roll call names each sick player once; their colonists and slots carry the sick tag', async () => {
    const html = await render(await tv(viewAt(RESULT_S)));
    expect(tag(html, 'tv-event-overlay')).toContain('data-event-phase="development"');
    // The development screen is still under it, and the overlay never claims the phase screen's own attribute
    // (other lanes' browser steps select the phase screen by [data-phase]).
    expect(html.match(/ data-phase="/g)?.length).toBe(1);
    const over = inside(html, 'tv-event-overlay');
    expect(count(over, 'data-testid="roll-call"')).toBe(1);
    const roll = inside(over, 'roll-call');
    expect(count(roll, '>Lena<')).toBe(1);
    expect(count(roll, '>Brix<')).toBe(1);
    expect(roll).not.toContain('>Ossa<');
    expect(inside(over, 'colonist-s1')).toContain('sick-tag');
    expect(inside(over, 'colonist-s3')).toContain('sick-tag');
    expect(inside(over, 'colonist-s2')).not.toContain('sick-tag');
    expect(inside(over, 'slot-s1')).toContain('sick-tag');
    expect(inside(over, 'slot-s3')).toContain('sick-tag');
    expect(inside(over, 'slot-s2')).not.toContain('sick-tag');
    // The header's pips: one badge row for the one roll call.
    expect(count(inside(over, 'pips'), 'data-pip=')).toBe(1);
  });

  it('T-AC-10: each phone, with a TV: the sick say it is them, the well name both, once each', async () => {
    for (const [id, says] of [
      [LENA, 'You walk at half pace this turn. Why: the air is bad.'],
      [BRIX, 'You walk at half pace this turn. Why: the air is bad.'],
      [OSSA, 'You’re well. Lena and Brix walk at half pace.'],
    ] as const) {
      const card = inside(await render(await phone(id, 1, viewAt(RESULT_S))), 'phone-event-overlay');
      expect(card, id).toContain(says);
      expect(count(card, 'data-testid="phone-card"'), id).toBe(1);
    }
    const news = inside(await render(await phone(OSSA, 1, viewAt(ROLL_S))), 'phone-event-overlay');
    expect(count(news, '>Lena<')).toBe(1);
    expect(count(news, '>Brix<')).toBe(1);
  });

  it('T-AC-10: each phone alone: one roll call over its own map', async () => {
    for (const id of [LENA, OSSA, BRIX]) {
      const over = inside(await render(await phone(id, 0, viewAt(RESULT_S))), 'phone-event-overlay');
      expect(count(over, 'data-testid="roll-call"'), id).toBe(1);
      const roll = inside(over, 'roll-call');
      expect(count(roll, '>Lena<'), id).toBe(1);
      expect(count(roll, '>Brix<'), id).toBe(1);
    }
  });

  it('T-AC-10: the sick status line on the sick player’s development screen is unchanged, under the overlay', async () => {
    for (const boards of [0, 1]) {
      const html = await render(await phone(LENA, boards, viewAt(ROLL_S)));
      expect(html).toContain('data-testid="sick-strikes"');
      expect(inside(html, 'phone-event-overlay')).not.toContain('sick-strikes');
    }
  });
});

describe('RULE-3 for the overlay (T-AC-5 style): boards 0/1 × reduced, and a tap', () => {
  const rows = [
    { boards: 1, reduced: false, mode: 'light', map: true },
    { boards: 1, reduced: true, mode: 'light', map: true },
    { boards: 0, reduced: false, mode: 'solo', map: true },
    { boards: 0, reduced: true, mode: 'solo', map: true },
  ];
  for (const row of rows) {
    it(`T-AC-5: boards ${row.boards}, reduced ${row.reduced}: ${row.mode}`, async () => {
      const { html } = await mount(await phone(OSSA, row.boards, viewAt(ROLL_S + 0.6)), row.reduced);
      const over = inside(html(), 'phone-event-overlay');
      expect(tag(html(), 'phone-event-overlay')).toContain(`data-mode="${row.mode}"`);
      expect(over.includes('data-testid="event-map"')).toBe(row.map);
      if (row.map) expect(tag(over, 'event-map-box')).toContain(`data-reduced="${row.reduced}"`);
    });
  }

  it('B-AC-4: alone in a held phase, a tap skips to the result; a second, past the last result, leaves the light card covering until endsAt', async () => {
    const m = await mount(await phone(OSSA, 0, viewAt(ROLL_S)));
    expect(inside(m.html(), 'phone-event-overlay')).toContain('data-testid="phone-now"');
    m.tap();
    expect(inside(m.html(), 'phone-event-overlay')).toContain('data-testid="phone-miss"');
    m.tap();
    // The phase's clocks have not started: its screen has nothing to show yet, so the light card stays over it.
    expect(tag(m.html(), 'phone-event-overlay')).toContain('data-mode="light"');
    expect(tag(m.html(), 'phone-event-overlay')).toMatch(/class="absolute inset-0 z-40 /);
    expect(inside(m.html(), 'phone-event-overlay')).toContain('data-testid="phone-card"');
    expect(inside(m.html(), 'phone-event-overlay')).not.toContain('data-testid="skip"');
    expect(m.html()).toContain('data-testid="game-shell"');
  });

  it('T-AC-5: with a TV the phone buzzes as the roll call is announced; alone it does not', async () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });
    await mount(await phone(OSSA, 1, viewAt(ROLL_S)));
    expect(vibrate).toHaveBeenCalledTimes(1);
    vibrate.mockClear();
    await mount(await phone(OSSA, 0, viewAt(ROLL_S)));
    expect(vibrate).not.toHaveBeenCalled();
  });
});

describe('HC-6: reduced motion on the overlays: no motion, the result still shown', () => {
  it('T-AC-5 (HC-6): the TV and a phone alone: no sneeze, no animation, no camera; the roll call and the tags are there', async () => {
    const t = INTRO_S + (SHOW_MS / 1000 - INTRO_S) / 2;
    for (const el of [await tv(viewAt(t)), await phone(OSSA, 0, viewAt(t)), await phone(LENA, 1, viewAt(t))]) {
      const { html } = await mount(el, true);
      const over = inside(html(), html().includes('tv-event-overlay') ? 'tv-event-overlay' : 'phone-event-overlay');
      expect(over).not.toBe('');
      expect(over).not.toContain('achoo');
      expect(over).not.toContain('vignette-sickness');
      expect(over).not.toMatch(/animate-\[ev-(pop|rise|stamp)/);
      expect(tag(over, 'event-map')).not.toMatch(/transform:\s*translate/);
    }
    const { html } = await mount(await tv(viewAt(t)), true);
    const over = inside(html(), 'tv-event-overlay');
    expect(over).toContain('data-testid="roll-call"');
    expect(count(over, 'data-testid="sick-tag"')).toBe(4);
  });
});
