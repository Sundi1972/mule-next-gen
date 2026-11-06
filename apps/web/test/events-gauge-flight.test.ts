// A browser's document before react-dom loads: the flight measures its ends in layout effects, which a server render skips.
import { document, FakeElement } from './fake-dom';
import { EVENT_SHOW, HAPPINESS } from '@mule/engine';
import type { ColonyView, EventView, MuleView, TableView, TileView } from '@mule/protocol';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { TableApp } from '../src/table/TableApp';
import { aMuleView, aPlayer } from './fixtures/views';

/**
 * A colony event's gauge change flies from its card into the TV header's gauge (G-5 C26, WS8 PR-E4c; the colony events
 * mock's landing.tsx and TvFestival): the TV as TableApp shows it from the views the server sends, the show's clock
 * stepped through the view's eventShow.
 */

// The TV's layout, as the test arranges it: where the card's chips and the header's gauges sit, in the frame's pixels.
const CHIP: Record<string, { x: number; y: number }> = { mood: { x: 330, y: 415 }, prestige: { x: 430, y: 415 }, air: { x: 330, y: 415 } };
const GAUGE: Record<string, { x: number; y: number }> = { 'gauge-environment': { x: 880, y: 60 }, 'gauge-prestige': { x: 1000, y: 60 }, 'gauge-happiness': { x: 1120, y: 60 } };
const box = (c: { x: number; y: number } | undefined) => {
  const { x, y } = c ?? { x: 0, y: 0 };
  const w = c ? 80 : 0;
  const h = c ? 40 : 0;
  return { left: x - w / 2, top: y - h / 2, right: x + w / 2, bottom: y + h / 2, width: w, height: h, x: x - w / 2, y: y - h / 2 };
};
function matches(el: FakeElement, selector: string): boolean {
  const m = selector.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
  if (!m) throw new Error(`The fake DOM reads only [attr] and [attr="value"] selectors, not ${selector}`);
  const v = el.getAttribute(m[1]!);
  return m[2] === undefined ? v !== null : v === m[2];
}
function all(node: FakeElement, ok: (e: FakeElement) => boolean, out: FakeElement[] = []): FakeElement[] {
  for (const c of node.childNodes) {
    if (!(c instanceof FakeElement)) continue;
    if (ok(c)) out.push(c);
    all(c, ok, out);
  }
  return out;
}
Object.assign(document.documentElement, { dataset: {} });
Object.assign(FakeElement.prototype, {
  getBoundingClientRect(this: FakeElement) {
    return box(CHIP[this.getAttribute('data-fly-from') ?? ''] ?? GAUGE[this.getAttribute('data-testid') ?? '']);
  },
  offsetWidth: 0,
  offsetHeight: 0,
  querySelector(this: FakeElement, selector: string) {
    return all(this, (e) => matches(e, selector))[0] ?? null;
  },
  querySelectorAll(this: FakeElement, selector: string) {
    return all(this, (e) => matches(e, selector));
  },
  focus: () => undefined,
});
Object.assign(document, { createElementNS: (_ns: string, tag: string) => document.createElement(tag) });

// --- The table: four players, a small map with the store in its middle ------------------------------------------------

const W = 3;
const H = 3;
const NOW = 5_000_000;
const PLAYERS = [aPlayer({ id: 's1', name: 'Lena', slot: 0 }), aPlayer({ id: 's2', name: 'Ossa', slot: 1 })];
const TILES = Array.from({ length: W * H }, (_, i) => {
  const x = i % W;
  const y = Math.floor(i / W);
  return { x, y, terrain: x === 1 && y === 1 ? 'store' : 'plains', peaks: 0, owner: null, outfit: null, pollution: 0, filter: false } as unknown as TileView;
});

type Effect = NonNullable<EventView['effects']>[number];
function event(key: string, phase: MuleView['phase'], effects: Effect[], over: Partial<EventView> = {}): EventView {
  return { key, kind: 'colony', title: key, line: `${key} happens.`, sign: 'good', scope: 'colony', origin: { x: 1, y: 1 }, hits: [], phase, weight: 'headline', playMs: EVENT_SHOW.playMs.headline, effects, ...over } as unknown as EventView;
}
const FESTIVAL = event('festival', 'planning', [
  { on: 'colony', what: 'mood', delta: 10 },
  { on: 'colony', what: 'prestige', delta: 2 },
  { on: 'store', what: 'food', delta: 6 },
] as Effect[]);
const CLEANUP = event('volunteerCleanup', 'upkeep', [{ on: 'colony', what: 'air', delta: -5 }] as Effect[]);
const EMIGRATION = event('emigrationWave', 'planning', [{ on: 'colony', what: 'colonists', delta: -12 }] as Effect[], { sign: 'bad' });

/** The colony as the server sends it after the phase's events: the gauges already carry each event's change. */
function colony(g: { happiness?: number; prestige?: number; environment?: number }): ColonyView {
  const happiness = g.happiness ?? 64;
  const band = happiness >= HAPPINESS.bands.thriving ? 'thriving' : happiness >= HAPPINESS.bands.content ? 'content' : 'restless';
  return {
    gauges: { wealth: 26_400, environment: g.environment ?? 34, prestige: g.prestige ?? 5, happiness, band },
    lastGauges: null,
    fund: 2_340,
    ledger: null,
    projects: [],
    catalogue: [],
    score: null,
  } as unknown as ColonyView;
}

/** The view at show second `t`: the server's clock is `t` past the show's start, which lasts the intro and its event. */
function viewAt(t: number, ev: EventView, c: ColonyView): MuleView {
  const showMs = EVENT_SHOW.introMs + ev.playMs;
  const startsAt = NOW - t * 1000;
  return aMuleView({
    players: PLAYERS,
    me: null,
    politics: null,
    month: 3,
    phase: ev.phase as MuleView['phase'],
    width: W,
    height: H,
    tiles: TILES,
    colony: c,
    events: [ev],
    eventShow: { startsAt, showMs, introMs: EVENT_SHOW.introMs, endsAt: startsAt + showMs, held: true },
  });
}

// --- The TV, mounted, with a client whose view the test moves on --------------------------------------------------------

const mounted = new Set<() => void>();
let device = { reduced: false };
beforeEach(() => {
  device = { reduced: false };
  Object.assign(window, {
    matchMedia: (q: string) => ({ media: q, matches: device.reduced && q === '(prefers-reduced-motion: reduce)', addEventListener() {}, removeEventListener() {} }),
    setInterval: () => 0,
    clearInterval: () => undefined,
  });
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
afterEach(() => {
  for (const unmount of mounted) unmount();
  mounted.clear();
  delete (window as { matchMedia?: unknown }).matchMedia;
  vi.unstubAllGlobals();
});

function find(node: FakeElement, ok: (e: FakeElement) => boolean): FakeElement | null {
  return all(node, ok)[0] ?? null;
}
const byTestid = (node: FakeElement | null, testid: string) => (node ? find(node, (e) => e.getAttribute('data-testid') === testid) : null);
const words = (node: FakeElement): string => node.childNodes.map((c) => (c instanceof FakeElement ? ` ${words(c)} ` : c.textContent)).join('');
const px = (v: string | undefined) => (v === undefined || v === '' ? NaN : parseFloat(v));

/** The TV showing `ev` over its phase screen, at show second `t` on each `at`. */
function tv(ev: EventView, c: ColonyView) {
  const table = (game: MuleView) => ({ code: 'ABCD', status: 'playing', hostId: 's1', boards: 1, seats: [], game }) as unknown as TableView<MuleView>;
  const listeners = new Set<() => void>();
  let state = { status: 'playing', role: 'board', seatId: null, code: 'ABCD', view: table(viewAt(0, ev, c)), chat: [], emotes: [], toasts: [], notice: null, clockOffset: 0, handoffCode: null };
  const client = {
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getState: () => state,
    serverNow: () => NOW,
    watch: () => undefined,
    intent: () => undefined,
    chat: () => undefined,
    onFrame: () => () => undefined,
    roundTripMs: () => null,
  } as unknown as TableClient;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host as unknown as HTMLElement);
  flushSync(() => root.render(createElement(ClientProvider, { client, children: createElement(TableApp, { room: 'ABCD' }) })));
  mounted.add(() => {
    root.unmount();
    document.body.removeChild(host);
  });
  return {
    /** What the TV shows at show second `t`. */
    at(t: number) {
      state = { ...state, view: table(viewAt(t, ev, c)) };
      flushSync(() => listeners.forEach((l) => l()));
      const overlay = byTestid(host, 'tv-event-overlay');
      // While the show plays its header is the one on screen; after it, the phase screen's.
      const screen = overlay ?? host;
      return {
        overlay: overlay !== null,
        gauge(testid: string) {
          const el = byTestid(screen, testid)!;
          const said = words(el).replace(/\s+/g, ' ').trim();
          return { said, value: Number(said.match(/\d+/)?.[0]), pulses: (el.getAttribute('class') ?? '').includes('animate-[cev-pulse'), from: el.getAttribute('data-from') };
        },
        /** The chip in flight for `what`, where its middle is; null when none flies. */
        flight(what: string) {
          const el = overlay ? find(overlay, (e) => e.getAttribute('data-testid') === `gauge-flight-${what}`) : null;
          return el ? { x: px(el.style.left), y: px(el.style.top) } : null;
        },
        flights: () => (overlay ? all(overlay, (e) => (e.getAttribute('data-testid') ?? '').startsWith('gauge-flight-')).length : 0),
        /** The card's chip for `what`, with its opacity; null when the card shows none. */
        cardChip(what: string) {
          const card = byTestid(overlay, 'effects-card');
          const el = card ? find(card, (e) => e.getAttribute('data-fly-from') === what) : null;
          return el ? { opacity: el.style.opacity === undefined || el.style.opacity === '' ? 1 : Number(el.style.opacity) } : null;
        },
      };
    },
  };
}
type Screen = ReturnType<ReturnType<typeof tv>['at']>;

const STEP = 0.02;
const SHOW_END = (EVENT_SHOW.introMs + EVENT_SHOW.playMs.headline) / 1000;
/** Every frame of the show, STEP apart. */
function frames(screen: ReturnType<typeof tv>): { t: number; s: Screen }[] {
  const out: { t: number; s: Screen }[] = [];
  for (let t = 0; t < SHOW_END; t += STEP) out.push({ t, s: screen.at(t) });
  return out;
}
/** The first show second its chip is on the card: the test's ground truth for when the chip's trip starts. */
function onCardAt(screen: ReturnType<typeof tv>, what: string): number {
  for (let t = 0; t < SHOW_END; t += STEP) if (screen.at(t).cardChip(what)) return t;
  return expect.unreachable(`the event's card never shows its ${what} chip`);
}

// The mock's timings (landing.tsx, TvFestival): the chip sits on the card 0.7 s, flies 0.9 s, the gauge counts 0.8 s.
const WAIT = 0.7;
const FLY = 0.9;
const COUNT = 0.8;

describe('B-AC-23-7: a colony event’s gauge change flies from its card into the TV header’s gauge, which then counts', () => {
  it('B-AC-23-7: the festival’s Mood +10 holds the Happiness gauge at 64 until its chip leaves the card, flies on an arc to the gauge, and lands 74 with a pulse', () => {
    const screen = tv(FESTIVAL, colony({ happiness: 74, prestige: 7 }));
    const card = onCardAt(screen, 'mood');
    const leaves = card + WAIT;
    const lands = leaves + FLY;

    // From the show's start until the chip leaves, the header reads the mood before the festival.
    for (const t of [0, card, leaves - 0.05]) {
      const s = screen.at(t);
      expect(s.gauge('gauge-happiness').said).toContain('64 Content');
      expect(s.flight('mood')).toBeNull();
    }
    expect(screen.at(leaves - 0.05).cardChip('mood')!.opacity).toBe(1);

    // Mid-flight: the chip is between the card and the gauge, above the straight line (it arcs), and the card's chip has faded.
    const mid = screen.at(leaves + FLY / 2);
    const chip = mid.flight('mood')!;
    expect(chip).not.toBeNull();
    expect(chip.x).toBeGreaterThan(CHIP.mood!.x);
    expect(chip.x).toBeLessThan(GAUGE['gauge-happiness']!.x);
    const chord = CHIP.mood!.y + ((GAUGE['gauge-happiness']!.y - CHIP.mood!.y) * (chip.x - CHIP.mood!.x)) / (GAUGE['gauge-happiness']!.x - CHIP.mood!.x);
    expect(chip.y).toBeLessThan(chord);
    expect(mid.gauge('gauge-happiness').value).toBe(64);
    expect(mid.cardChip('mood')!.opacity).toBe(0.15);

    // It lands: the gauge pulses and counts up from 64, never down.
    const landed = screen.at(lands + 0.1);
    expect(landed.gauge('gauge-happiness').pulses).toBe(true);
    const counting = [lands + 0.1, lands + 0.3, lands + 0.5].map((t) => screen.at(t).gauge('gauge-happiness').value);
    counting.slice(1).forEach((v, i) => expect(v).toBeGreaterThanOrEqual(counting[i]!));
    expect(counting[0]).toBeGreaterThanOrEqual(64);
    expect(counting.at(-1)).toBeGreaterThan(64);

    // Once counted, the TV reads the server's 74.
    expect(screen.at(lands + COUNT + 0.05).gauge('gauge-happiness').said).toContain('74 Content');
  });

  it('B-AC-23-7: its Prestige +2 flies to the Prestige gauge after the mood’s, which reads 5 until it lands and 7 once counted', () => {
    const screen = tv(FESTIVAL, colony({ happiness: 74, prestige: 7 }));
    const leaves = onCardAt(screen, 'prestige') + WAIT;
    const lands = leaves + FLY;
    expect(leaves).toBeGreaterThan(onCardAt(screen, 'mood') + WAIT);
    expect(screen.at(leaves - 0.05).gauge('gauge-prestige').value).toBe(5);
    const mid = screen.at(leaves + FLY / 2);
    expect(mid.flight('prestige')!.x).toBeGreaterThan(CHIP.prestige!.x);
    expect(mid.flight('prestige')!.x).toBeLessThan(GAUGE['gauge-prestige']!.x);
    expect(mid.gauge('gauge-prestige').value).toBe(5);
    expect(screen.at(lands + 0.1).gauge('gauge-prestige').pulses).toBe(true);
    expect(screen.at(lands + COUNT + 0.05).gauge('gauge-prestige').value).toBe(7);
  });

  it('B-AC-23-7: a festival that lifts the mood 72 → 82 flips Content → Thriving as the count crosses, with a pulse', () => {
    const screen = tv(FESTIVAL, colony({ happiness: 82, prestige: 7 }));
    const lands = onCardAt(screen, 'mood') + WAIT + FLY;
    expect(screen.at(lands - 0.05).gauge('gauge-happiness').said).toContain('72 Content');
    const seen: Screen['gauge'] extends (...a: never[]) => infer R ? R[] : never = [];
    for (let t = lands; t < lands + COUNT + 0.05; t += STEP) seen.push(screen.at(t).gauge('gauge-happiness'));
    for (const g of seen) expect(g.said).toContain(`${g.value} ${g.value >= HAPPINESS.bands.thriving ? 'Thriving' : 'Content'}`);
    const flipAt = seen.findIndex((g) => g.value >= HAPPINESS.bands.thriving);
    expect(flipAt).toBeGreaterThan(0);
    expect(seen[flipAt]!.pulses).toBe(true);
    expect(seen.at(-1)!.said).toContain('82 Thriving');
  });

  it('B-AC-23-7: the volunteer clean-up’s Air −5 flies to the Environment gauge, which reads 22 until it lands and 17 once counted', () => {
    const screen = tv(CLEANUP, colony({ environment: 17 }));
    const leaves = onCardAt(screen, 'air') + WAIT;
    const lands = leaves + FLY;
    expect(screen.at(leaves - 0.05).gauge('gauge-environment').value).toBe(22);
    const chip = screen.at(leaves + FLY / 2).flight('air')!;
    expect(chip.x).toBeGreaterThan(CHIP.air!.x);
    expect(chip.x).toBeLessThan(GAUGE['gauge-environment']!.x);
    expect(screen.at(lands + COUNT + 0.05).gauge('gauge-environment').value).toBe(17);
  });

  it('B-AC-23-7: with reduced motion nothing travels: the chip shows on its gauge as the gauge jumps to the new value, no count, no pulse', () => {
    device.reduced = true;
    const seen = frames(tv(FESTIVAL, colony({ happiness: 74, prestige: 7 })));
    const at = GAUGE['gauge-happiness']!;
    const withChip = seen.filter((f) => f.s.flight('mood') !== null);
    expect(withChip.length).toBeGreaterThan(0);
    // Wherever the mood chip shows, it sits on its gauge, never on the way.
    for (const f of withChip) expect(f.s.flight('mood')).toEqual({ x: at.x, y: at.y });
    const first = seen.indexOf(withChip[0]!);
    // Before: the old value; from the chip's landing: the new one at once, never a number between.
    for (const f of seen.slice(0, first)) expect(f.s.gauge('gauge-happiness').value).toBe(64);
    for (const f of seen.slice(first)) expect(f.s.gauge('gauge-happiness').value).toBe(74);
    expect(seen.some((f) => f.s.gauge('gauge-happiness').pulses)).toBe(false);
  });
});

describe('B-AC-23-8 (negative): an event that moves no gauge flies nothing', () => {
  it('B-AC-23-8: an emigration wave (colonists only) flies no chip, and every gauge reads the server’s value from the first frame to the last', () => {
    const seen = frames(tv(EMIGRATION, colony({ happiness: 64, prestige: 5, environment: 34 })));
    expect(seen.some((f) => f.s.overlay)).toBe(true);
    for (const { s } of seen) {
      expect(s.flights()).toBe(0);
      expect(s.gauge('gauge-happiness')).toMatchObject({ value: 64, pulses: false, from: null });
      expect(s.gauge('gauge-prestige')).toMatchObject({ value: 5, from: null });
      expect(s.gauge('gauge-environment')).toMatchObject({ value: 34, from: null });
    }
  });
});
