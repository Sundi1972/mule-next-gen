// A browser's document before react-dom loads: the month end's drift is decided in effects, which a server render skips.
import { document, FakeElement } from './fake-dom';
import { HAPPINESS, moodBand } from '@mule/engine';
import type { ColonyView, MuleView, TableView } from '@mule/protocol';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ColonyGauges } from '../src/components/Colony';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { TableApp } from '../src/table/TableApp';
import { aMuleView, aPlayer } from './fixtures/views';

/**
 * The colony's gauges count and land (G-5, WS8 PR-E2): a change given to ColonyGauges lands on its gauge and its number
 * counts, the band flipping with a pulse as the count crosses it; and its first consumer, the month end's mood drift, on
 * the TV as TableApp shows it from the views the server sends.
 */

Object.assign(document.documentElement, { dataset: {} });
Object.assign(FakeElement.prototype, { getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }), offsetWidth: 0, offsetHeight: 0, querySelectorAll: () => [] });
Object.assign(document, { createElementNS: (_ns: string, tag: string) => document.createElement(tag) });

const PLAYERS = [aPlayer({ id: 's1', name: 'Heiko', slot: 0 }), aPlayer({ id: 's2', name: 'Mia', slot: 1 })];

function colony(happiness: number | null, last: number | null | 'none', over: Partial<ColonyView> = {}): ColonyView {
  const band = happiness === null ? null : moodBand(happiness);
  return {
    gauges: { wealth: 26_400, environment: 34, prestige: 5, happiness, band },
    lastGauges: last === 'none' ? null : { wealth: 24_900, prestige: 5, happiness: last },
    fund: 2_340,
    ledger: null,
    projects: [],
    catalogue: [],
    score: null,
    ...over,
  };
}

/** The month as the TV sees it: planning with the mood at 44, then its end with the server's drift to 31. */
const MONTH = 3;
const planning = (c: ColonyView | null) => aMuleView({ players: PLAYERS, me: null, politics: null, month: MONTH, phase: 'planning', colony: c });
const monthEnd = (c: ColonyView | null, over: Partial<MuleView> = {}) => aMuleView({ players: PLAYERS, me: null, politics: null, month: MONTH, phase: 'upkeep', colony: c, ...over });
const FALL = colony(31, 44);

// --- The TV, mounted, with a client whose view the test moves on, and frames the test steps by hand ---------------------

let frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;
const mounted = new Set<() => void>();
let device = { reduced: false };

beforeEach(() => {
  frames = new Map();
  device = { reduced: false };
  Object.assign(window, {
    matchMedia: (q: string) => ({ media: q, matches: device.reduced && q === '(prefers-reduced-motion: reduce)', addEventListener() {}, removeEventListener() {} }),
    setInterval: () => 0,
    clearInterval: () => undefined,
  });
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.set(nextFrame, cb);
    return nextFrame++;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});
afterEach(() => {
  for (const unmount of mounted) unmount();
  mounted.clear();
  delete (window as { matchMedia?: unknown }).matchMedia;
  vi.unstubAllGlobals();
});

/** Runs every frame asked for, at `ms` on the page's frame clock. */
function frame(ms: number) {
  const due = [...frames.values()];
  frames.clear();
  flushSync(() => due.forEach((cb) => cb(ms)));
}

function tv(first: MuleView) {
  const table = (game: MuleView) => ({ code: 'ABCD', status: 'playing', hostId: 's1', boards: 1, seats: [], game }) as unknown as TableView<MuleView>;
  const listeners = new Set<() => void>();
  let state = { status: 'playing', role: 'board', seatId: null, code: 'ABCD', view: table(first), chat: [], emotes: [], toasts: [], notice: null, clockOffset: 0, handoffCode: null };
  const client = {
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getState: () => state,
    serverNow: () => 0,
    watch: () => undefined,
    intent: () => undefined,
    chat: () => undefined,
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
    /** The server sends the next view. */
    send(game: MuleView) {
      state = { ...state, view: table(game) };
      flushSync(() => listeners.forEach((l) => l()));
    },
    happiness: () => gauge(host, 'gauge-happiness'),
  };
}

function find(node: FakeElement, testid: string): FakeElement | null {
  for (const c of node.childNodes) {
    if (!(c instanceof FakeElement)) continue;
    if (c.getAttribute('data-testid') === testid) return c;
    const deep = find(c, testid);
    if (deep) return deep;
  }
  return null;
}
/** The text under a node, its elements' texts apart, as a screen reads them. */
const words = (node: FakeElement): string => node.childNodes.map((c) => (c instanceof FakeElement ? ` ${words(c)} ` : c.textContent)).join('');
/** What a gauge says, its number, and whether it pulses; null when there is none. */
function gauge(host: FakeElement, testid: string): { said: string; value: number; pulses: boolean } | null {
  const el = find(host, testid);
  if (!el) return null;
  const said = words(el).replace(/\s+/g, ' ').trim();
  return { said, value: Number(said.match(/\d+/)?.[0]), pulses: (el.getAttribute('class') ?? '').includes('animate-[cev-pulse') };
}

/** The band a number reads in, from the engine's thresholds. */
const bandWord = (h: number) => (h >= HAPPINESS.bands.content ? 'Content' : h >= HAPPINESS.bands.restless ? 'Restless' : h >= HAPPINESS.bands.unhappy ? 'Unhappy' : 'Unrest');

/** Steps the frames 50 ms apart up to `toMs`, reading the gauge at each. */
function play(screen: ReturnType<typeof tv>, toMs: number) {
  const seen: { value: number; said: string; pulses: boolean }[] = [];
  for (let ms = 0; ms <= toMs; ms += 50) {
    frame(ms);
    seen.push(screen.happiness()!);
  }
  return seen;
}

describe('B-AC-23-6: at the month end the TV’s Happiness gauge counts from last month’s to the server’s, once', () => {
  it('B-AC-23-6: it counts 44 → 31 and the band flips Restless → Unhappy, with a pulse as the count crosses; no reasons', () => {
    const screen = tv(planning(colony(44, 50)));
    expect(screen.happiness()?.said).toContain('44 Restless');
    screen.send(monthEnd(FALL));

    // The month end opens on last month's mood, before any frame has run.
    expect(screen.happiness()?.value).toBe(44);
    expect(screen.happiness()?.said).toContain('Restless');
    const seen = play(screen, 6_000);

    const values = seen.map((s) => s.value);
    expect(values[0]).toBe(44);
    expect(values.at(-1)).toBe(31);
    // It counts down through the numbers between, never back up.
    expect(new Set(values).size).toBeGreaterThan(4);
    values.slice(1).forEach((v, i) => expect(v).toBeLessThanOrEqual(values[i]!));
    // At every frame the band is the one its number reads in: it flips as the count crosses the threshold.
    for (const s of seen) expect(s.said).toContain(`${s.value} ${bandWord(s.value)}`);
    // The pulse goes round the gauge while the band has just flipped, and only then.
    const flipAt = values.findIndex((v) => v < HAPPINESS.bands.restless);
    expect(seen[flipAt]!.pulses).toBe(true);
    expect(seen.slice(0, flipAt).some((s) => s.pulses)).toBe(false);
    expect(seen.at(-1)!.pulses).toBe(false);
    // It lands on the server's gauge, with nothing but today's month change beside it: no reasons.
    expect(seen.at(-1)!.said).toBe('Happiness 31 Unhappy ↓ 13 this month');
  });

  it('B-AC-23-6: it plays once; the next view of the same month end, and a TV that joins at the month end, show 31 at once', () => {
    const screen = tv(planning(colony(44, 50)));
    screen.send(monthEnd(FALL));
    play(screen, 6_000);
    // A player readies: the server sends the month end again. It does not play again.
    screen.send(monthEnd(FALL, { players: PLAYERS.map((p) => ({ ...p, ready: true })) }));
    expect(screen.happiness()?.value).toBe(31);
    expect(play(screen, 3_000).every((s) => s.value === 31)).toBe(true);

    // A TV that reloads or reconnects into the month end never saw it come: it shows the end state, at once.
    const joined = tv(monthEnd(FALL));
    expect(joined.happiness()?.said).toBe('Happiness 31 Unhappy ↓ 13 this month');
    expect(play(joined, 3_000).every((s) => s.value === 31 && !s.pulses)).toBe(true);
  });

  it('B-AC-23-6: under reduced motion it lands at once: 31 and Unhappy from the first frame, no count and no pulse', () => {
    device.reduced = true;
    const screen = tv(planning(colony(44, 50)));
    screen.send(monthEnd(FALL));
    expect(screen.happiness()?.said).toBe('Happiness 31 Unhappy ↓ 13 this month');
    expect(play(screen, 3_000).every((s) => s.value === 31 && !s.pulses)).toBe(true);
  });
});

describe('B-AC-23-8 (negative): no change, no animation; politics off, nothing', () => {
  it('B-AC-23-8: in month 1 (no last gauges) and with an unchanged mood, the month end shows the server’s value from the start', () => {
    for (const c of [colony(58, 'none'), colony(52, 52)]) {
      const screen = tv(planning(colony(60, 'none')));
      screen.send(monthEnd(c));
      const want = c.gauges.happiness!;
      expect(screen.happiness()?.value).toBe(want);
      expect(play(screen, 3_000).every((s) => s.value === want && !s.pulses)).toBe(true);
    }
  });

  it('B-AC-23-8: with politics off (colony null or absent) there are no gauges at the month end, and nothing plays', () => {
    for (const c of [null, undefined]) {
      const screen = tv({ ...planning(null), colony: c });
      screen.send({ ...monthEnd(null), colony: c });
      expect(screen.happiness()).toBeNull();
      frame(500);
      expect(screen.happiness()).toBeNull();
    }
  });
});

// --- The landing itself, as C26's effects will use it: a change given to ColonyGauges -----------------------------------

const at = (c: ColonyView, landing: Parameters<typeof ColonyGauges>[0]['landing']) => renderToStaticMarkup(createElement(ColonyGauges, { colony: c, size: 'tv', landing }));
function said(html: string, testid: string): { said: string; pulses: boolean } {
  const open = html.indexOf(`data-testid="${testid}"`);
  const tagStart = html.lastIndexOf('<', open);
  const next = html.indexOf('data-testid="gauge-', open + 1);
  const chunk = html.slice(tagStart, next === -1 ? undefined : html.lastIndexOf('<', next));
  return { said: chunk.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), pulses: html.slice(tagStart, html.indexOf('>', open)).includes('animate-[cev-pulse') };
}

describe('B-AC-23-7: a change given to ColonyGauges lands on its gauge and counts', () => {
  it('B-AC-23-7: Prestige 5 → 7 landing at 1 s reads 5 until it lands, counts, then reads 7; the other gauges keep the view’s', () => {
    const c = colony(64, 61, { gauges: { wealth: 26_400, environment: 34, prestige: 7, happiness: 64, band: 'content' } });
    const landing = (t: number) => ({ changes: [{ gauge: 'prestige' as const, from: 5, to: 7, landsAt: 1 }], t, reduced: false });
    expect(said(at(c, landing(0.5)), 'gauge-prestige').said).toMatch(/^Prestige 5\b/);
    expect(said(at(c, landing(1.4)), 'gauge-prestige').said).toMatch(/^Prestige 6\b/);
    expect(said(at(c, landing(5)), 'gauge-prestige').said).toMatch(/^Prestige 7\b/);
    expect(said(at(c, landing(0.5)), 'gauge-happiness').said).toContain('64 Content');
    expect(said(at(c, landing(0.5)), 'gauge-wealth').said).toContain('26,400 cr');
  });

  it('B-AC-23-7: Happiness 72 → 82 flips Content → Thriving with a pulse as it crosses 80; reduced, it jumps when it lands, no pulse', () => {
    const c = colony(82, 72);
    const landing = (t: number, reduced = false) => ({ changes: [{ gauge: 'happiness' as const, from: 72, to: 82, landsAt: 1 }], t, reduced });
    const seen = Array.from({ length: 60 }, (_, i) => said(at(c, landing(i * 0.05)), 'gauge-happiness'));
    const values = seen.map((s) => Number(s.said.match(/\d+/)![0]));
    expect(values[0]).toBe(72);
    expect(values.at(-1)).toBe(82);
    for (const [i, s] of seen.entries()) expect(s.said).toContain(`${values[i]} ${values[i]! >= HAPPINESS.bands.thriving ? 'Thriving' : 'Content'}`);
    const flipAt = values.findIndex((v) => v >= HAPPINESS.bands.thriving);
    expect(seen[flipAt]!.pulses).toBe(true);
    expect(seen.slice(0, flipAt).some((s) => s.pulses)).toBe(false);

    expect(said(at(c, landing(0.9, true)), 'gauge-happiness').said).toContain('72 Content');
    expect(said(at(c, landing(1, true)), 'gauge-happiness')).toEqual({ said: expect.stringContaining('82 Thriving'), pulses: false });
  });

  it('B-AC-23-8 (negative): a change from a value to itself does not move or pulse the gauge', () => {
    const c = colony(64, 61);
    const html = at(c, { changes: [{ gauge: 'happiness', from: 64, to: 64, landsAt: 0 }], t: 0.4, reduced: false });
    expect(said(html, 'gauge-happiness')).toEqual({ said: expect.stringContaining('64 Content'), pulses: false });
  });
});
