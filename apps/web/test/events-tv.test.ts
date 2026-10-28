// A browser's document before react-dom loads, for the client-mounted HC-6 case; the server renders ignore it.
import { document, type FakeElement } from './fake-dom';
import { EVENT_SHOW, PHASES } from '@mule/engine';
import type { MuleView, PlayerView, ProductionEventView, ProductionView, TileView } from '@mule/protocol';
import { eventSegments, plotStrikes } from '@mule/ui';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { TvProduction } from '../src/table/TvProduction';

// What the TV screen reads that the shared fake document lacks: the theme on <html> and its observer, and SVG
// elements (drawn as plain elements: this file reads attributes and styles, never geometry).
Object.assign(document.documentElement, { dataset: {} });
Object.assign(document, { createElementNS: (_ns: string, tag: string) => document.createElement(tag) });
Object.assign(globalThis, { MutationObserver: class { observe() {} disconnect() {} } });

const W = 6;
const H = 3;
/** The production show's event window opens 4.8 s in; the phase's intro plays first, then each event's segment. */
const EVENT_AT = 4.8;
/** A plot's bars have all grown in by then; the goods fly one step apart. */
const FLY_STEP = 0.09;

const player = (id: string, name: string, slot: number): PlayerView => ({ id, name, isAi: false, color: '', species: 'zipwing', money: 1000, worth: 0, plots: 0, ready: false, doneDeveloping: false, condition: null, colonist: null, slot });
const PLAYERS = [player('s1', 'Lena', 0), player('s2', 'Ossa', 1)];

/** Lena farms (1, 0) and (4, 0); Ossa farms (2, 2), runs a plant at (5, 2) and a well at (0, 2), which only the wet drought reaches. */
const OWNED: Record<string, [owner: string, outfit: 'food' | 'energy' | 'water']> = { '1,0': ['s1', 'food'], '4,0': ['s1', 'food'], '2,2': ['s2', 'food'], '5,2': ['s2', 'energy'], '0,2': ['s2', 'water'] };
const tiles: TileView[] = Array.from({ length: W * H }, (_, i) => {
  const x = i % W;
  const y = Math.floor(i / W);
  const [owner, outfit] = OWNED[`${x},${y}`] ?? [null, null];
  return { x, y, terrain: 'plains', peaks: 0, owner, outfit, pollution: 0, filter: false };
});
const lines: ProductionView['lines'] = [
  { x: 1, y: 0, owner: 's1', good: 'food', made: 4, parts: [] },
  { x: 4, y: 0, owner: 's1', good: 'food', made: 2, parts: [] },
  { x: 2, y: 2, owner: 's2', good: 'food', made: 3, parts: [] },
  { x: 5, y: 2, owner: 's2', good: 'energy', made: 2, parts: [] },
  { x: 0, y: 2, owner: 's2', good: 'water', made: 2, parts: [] },
];

type Key = 'drought' | 'pestSwarm' | 'bumperHarvest';
/** An event as the server sends it (RULE-1): its weight and its play length from the engine's own numbers. */
function fired(key: Key, extra: Pick<ProductionEventView, 'title' | 'scope' | 'origin'> & { sign?: ProductionEventView['sign'] }, hits: [x: number, y: number, delta: number][]): ProductionEventView {
  const weight = EVENT_SHOW.weight[key]!;
  return {
    key,
    kind: key === 'drought' ? 'drought' : key === 'pestSwarm' ? 'blight' : 'bounty',
    line: `${extra.title} happens.`,
    sign: 'bad',
    ...extra,
    hits: hits.map(([x, y, delta], order) => ({ x, y, order, delta })),
    phase: 'production',
    weight,
    playMs: EVENT_SHOW.playMs[weight as 'headline' | 'spotlight'],
  };
}
// The drought reaches Lena's (1, 0) and Ossa's (2, 2); the pest swarm starts on Lena's (4, 0).
const drought = fired('drought', { title: 'Drought', scope: 'colony', origin: { x: 0, y: 0 } }, [
  [1, 0, -1],
  [2, 2, -2],
]);
const pests = fired('pestSwarm', { title: 'Pest swarm', scope: 'personal', origin: { x: 4, y: 0 } }, [[4, 0, -1]]);
// A swarm that eats more than (4, 0) made: the plot stops at 0.
const hungry = fired('pestSwarm', { title: 'Pest swarm', scope: 'personal', origin: { x: 4, y: 0 } }, [[4, 0, -3]]);
// The one story the camera flies in to: on Lena's (1, 0).
const bumper = fired('bumperHarvest', { title: 'Bumper harvest', scope: 'personal', origin: { x: 1, y: 0 }, sign: 'good' }, [[1, 0, 2]]);

/** The month as the server builds it: the intro whenever an event fired, and production lengthened past the window (RULE-1). */
function month(events: ProductionEventView[]): ProductionView {
  const introMs = events.length > 0 ? EVENT_SHOW.introMs : 0;
  const lengthMs = PHASES.productionMs + Math.max(0, introMs + events.reduce((n, e) => n + e.playMs, 0) - EVENT_SHOW.productionWindowMs);
  return { lines, events, lengthMs, introMs };
}

// --- What the fixture says, derived from its hits ------------------------------------------------------------------

const ownerAt = (x: number, y: number) => OWNED[`${x},${y}`]?.[0];
const nameOf = (id: string) => PLAYERS.find((p) => p.id === id)!.name;
const signed = (n: number) => `${n < 0 ? '−' : '+'}${Math.abs(n)}`;
const total = (ev: ProductionEventView) => ev.hits.reduce((n, h) => n + h.delta, 0);
const farms = (n: number) => `${n} ${n === 1 ? 'farm' : 'farms'}`;
/** The log's words for one of these all-Food events: its title, its player when personal, its total on its farms. */
const words = (ev: ProductionEventView) => {
  const who = ev.scope === 'personal' ? `${nameOf(ownerAt(ev.origin.x, ev.origin.y)!)}: ` : '';
  return `${ev.title} ${who}${signed(total(ev))} Food on ${farms(ev.hits.length)}`;
};
/** What these events take from one player's plots, when no plot runs out: the sum of their hits there. */
const lossTo = (id: string, events: ProductionEventView[]) => events.flatMap((e) => e.hits).reduce((n, h) => n + (ownerAt(h.x, h.y) === id ? h.delta : 0), 0);
/** A player's chips for one good's change: none when nothing changed. */
const chipsOf = (n: number) => (n === 0 ? [] : [n]);

function view(production: ProductionView, phaseEndsAt: number): MuleView {
  return {
    finished: false,
    month: 3,
    maxMonths: 12,
    phase: 'production',
    phaseEndsAt,
    width: W,
    height: H,
    tiles,
    lit: null,
    players: PLAYERS,
    me: null,
    market: [],
    storeMules: 0,
    mulePrice: 0,
    colonists: 0,
    air: { level: 22, band: 'clean' },
    ship: { arrives: 3, inPort: false, wants: null },
    treasury: { money: 0, salesTax: 0.05 },
    news: [],
    scores: null,
    auction: null,
    listings: [],
    lotSlots: { used: 0, max: 4 },
    landAuction: null,
    production,
    politics: null,
  };
}

/**
 * The TV's production screen when the server's clock says `t` show seconds have passed: the phase ends at a fixed
 * moment, and the server's now is set back from it by the share of the phase still to play. The show's end in
 * seconds is the server's length (HC-3), so `t` maps onto the server's clock without the screen's own arithmetic.
 */
function screen(production: ProductionView, t: number) {
  const phaseEndsAt = 5_000_000;
  const now = phaseEndsAt - production.lengthMs + t * 1000;
  const client = {
    subscribe: () => () => {},
    getState: () => ({ status: 'open', role: 'table', code: 'MULE', seatId: null, view: null, chat: [], emotes: [], toasts: [], clockOffset: 0 }),
    serverNow: () => now,
    intent: () => {},
  } as unknown as TableClient;
  return createElement(ClientProvider, { client, children: createElement(TvProduction, { game: view(production, phaseEndsAt), production }) });
}
const tvAt = (production: ProductionView, t: number) => renderToStaticMarkup(screen(production, t));

/** The markup inside the element carrying this attribute, by balancing its own tag. */
function inside(html: string, attr: string): string {
  const at = html.indexOf(attr);
  if (at < 0) return '';
  const start = html.lastIndexOf('<', at);
  const tagName = /^<(\w+)/.exec(html.slice(start))![1]!;
  const from = html.indexOf('>', at) + 1;
  let depth = 1;
  const tag = new RegExp(`<${tagName}[\\s>]|</${tagName}>`, 'g');
  tag.lastIndex = from;
  for (let m = tag.exec(html); m; m = tag.exec(html)) {
    depth += m[0] === `</${tagName}>` ? -1 : 1;
    if (depth === 0) return html.slice(from, m.index);
  }
  return html.slice(from);
}
/** The opening tag of the element carrying this attribute. */
const openTag = (html: string, attr: string) => {
  const at = html.indexOf(attr);
  return at < 0 ? '' : html.slice(html.lastIndexOf('<', at), html.indexOf('>', at) + 1);
};
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
/** What the map is playing. */
const playing = (html: string) => [...html.matchAll(/data-event="([^"]+)"/g)].map((m) => m[1]);
/** The rail's card for the event playing now, by its key. */
const now = (html: string) => [...html.matchAll(/data-now="([^"]+)"/g)].map((m) => m[1]);
/** The rail's log of what already happened: each entry's key and its words. */
const log = (html: string) => [...html.matchAll(/data-log="([^"]+)"/g)].map((m) => ({ key: m[1], words: text(inside(html.slice(html.lastIndexOf('<', m.index)), 'data-log=')) }));
/** One event's pip in the header: 'next', 'now' or 'done'. */
const pip = (html: string, key: string) => /data-state="(\w+)"/.exec(openTag(html, `data-pip="${key}"`))?.[1];
/** The event chips on one player's slot of the colony bar. */
const chips = (html: string, id: string) => [...inside(html, `data-testid="slot-${id}"`).matchAll(/data-delta="(-?\d+)"/g)].map((m) => Number(m[1]));
/** One plot's bars on the map, from its test id to the next plot's. */
function bars(html: string, x: number, y: number): number {
  const start = html.indexOf(`data-testid="plot-${x}-${y}"`);
  if (start < 0) return 0;
  const next = html.indexOf('data-testid="plot-', start + 1);
  return (html.slice(start, next < 0 ? undefined : next).match(/data-bar="unit"/g) ?? []).length;
}
/** Show seconds from a to b, every `step`. */
const frames = (a: number, b: number, step: number) => Array.from({ length: Math.floor((b - a) / step) }, (_, i) => a + (i + 0.5) * step);

describe("the TV's production screen follows the event that is playing", () => {
  const both = month([drought, pests]);
  // The intro plays 4.8..6.6, the drought (a headline) 6.6..13.6, the pest swarm (a spotlight) 13.6..18.8; the goods fly from 18.8.
  const droughtAt = EVENT_AT + EVENT_SHOW.introMs / 1000;
  const pestsAt = droughtAt + drought.playMs / 1000;
  const windowEnds = pestsAt + pests.playMs / 1000;

  it('B-AC-1: a drought then a pest swarm play in that order, each card naming the player, and the log lists what each did', () => {
    // Mid-drought: the map plays the drought, the rail's card is the drought's (a loss), and nothing is in the log yet.
    const mid = tvAt(both, droughtAt + 4);
    expect(playing(mid)).toEqual(['drought']);
    expect(now(mid)).toEqual(['drought']);
    expect(openTag(mid, 'data-now="drought"')).toContain('border-alert');
    expect(text(inside(mid, 'data-now="drought"'))).toContain('The whole colony');
    expect(log(mid)).toEqual([]);
    // The pips sit in the header (the gallery's headerExtra); the rail opens on the log.
    expect(inside(mid, '<header')).toContain('data-testid="pips"');
    expect(inside(mid, 'data-testid="rail"')).toMatch(/^<div[^>]*data-testid="log"/);
    // The pip of the event playing is lit; the one still to come waits.
    expect([pip(mid, 'drought'), pip(mid, 'pestSwarm')]).toEqual(['now', 'next']);

    // The drought has settled but its segment runs on: it is in the log, and its pip is still the lit one.
    const drySeg = eventSegments(both, EVENT_AT, 'tv')[0]!;
    const settling = tvAt(both, (drySeg.settleAt + drySeg.endAt) / 2);
    expect(playing(settling)).toEqual(['drought']);
    expect(log(settling).map((l) => l.key)).toEqual(['drought']);
    expect([pip(settling, 'drought'), pip(settling, 'pestSwarm')]).toEqual(['now', 'next']);

    // The swarm is announced: its title card names Lena, never her seat id, and the rail's card waits for it to play.
    const announced = tvAt(both, pestsAt + 0.3);
    const card = text(inside(announced, 'data-testid="title-card"'));
    expect(card).toContain(pests.title);
    expect(card).toContain(nameOf('s1'));
    expect(card).not.toContain('s1');
    expect(now(announced)).toEqual([]);

    // Mid-swarm: the swarm is the card; the drought moved to the log with what it did; its pip is ticked, the swarm's not;
    // the swarm is Lena's, so her slot is in the spotlight and Ossa's is not.
    const later = tvAt(both, pestsAt + 3);
    expect(playing(later)).toEqual(['pestSwarm']);
    expect(now(later)).toEqual(['pestSwarm']);
    expect(text(inside(later, 'data-now="pestSwarm"'))).toContain(nameOf('s1'));
    expect(log(later)).toEqual([{ key: 'drought', words: words(drought) }]);
    // The same line as the report's figures read: −1 on (1, 0) and −2 on (2, 2), both farms.
    expect(log(later)[0]!.words).toBe('Drought −3 Food on 2 farms');
    expect([pip(later, 'drought'), pip(later, 'pestSwarm')]).toEqual(['done', 'now']);
    expect(inside(later, 'data-pip="drought"')).toContain('✓');
    expect(inside(later, 'data-pip="pestSwarm"')).not.toContain('✓');
    expect(openTag(later, 'data-testid="slot-s1"')).toContain('shadow-glow');
    expect(openTag(later, 'data-testid="slot-s2"')).not.toContain('shadow-glow');

    // Both have settled, the goods not yet flown: the log keeps both, in fired order, each with the report's figures.
    const settled = tvAt(both, windowEnds - 0.05);
    expect(now(settled)).toEqual([]);
    expect(log(settled)).toEqual([
      { key: 'drought', words: words(drought) },
      { key: 'pestSwarm', words: words(pests) },
    ]);
    // Invariant: no figure the report does not hold: the log's numbers are exactly the two events' totals.
    expect([...text(inside(settled, 'data-testid="log"')).matchAll(/[−+]\d+/g)].map((m) => m[0])).toEqual([signed(total(drought)), signed(total(pests))]);
    // The old one-event card and its line are gone; the goods' line comes only as they fly.
    expect(settled).not.toContain('data-testid="event-card"');
    expect(settled).not.toContain('watch the map');
    expect(settled).not.toContain('The goods fly home');
    expect(tvAt(both, windowEnds + 0.05)).toContain('The goods fly home');
  });

  it('B-AC-1: a drought on farms and a well logs each good’s own figure, on plots, never every hit under the first one’s good, and never a hit that changed nothing', () => {
    // −1 Food on Lena's (1, 0), −1 Water on Ossa's well (0, 2), −2 Food on Ossa's (2, 2): the report holds −3 Food and −1 Water.
    const wet = fired('drought', { title: 'Drought', scope: 'colony', origin: { x: 0, y: 0 } }, [
      [1, 0, -1],
      [0, 2, -1],
      [2, 2, -2],
    ]);
    const settled = (ev: ProductionEventView) => log(tvAt(month([ev]), droughtAt + ev.playMs / 1000 - 0.05));
    expect(settled(wet)).toEqual([{ key: 'drought', words: 'Drought −3 Food, −1 Water on 3 plots' }]);
    // A hit that changed nothing is no loss: it is in no figure and no plot count; with only farms left, they are farms.
    const dryWell = fired('drought', { title: 'Drought', scope: 'colony', origin: { x: 0, y: 0 } }, [
      [1, 0, -1],
      [0, 2, 0],
      [2, 2, -2],
    ]);
    expect(settled(dryWell)).toEqual([{ key: 'drought', words: 'Drought −3 Food on 2 farms' }]);
    const nothing = fired('drought', { title: 'Drought', scope: 'colony', origin: { x: 0, y: 0 } }, [[0, 2, 0]]);
    expect(settled(nothing)).toEqual([{ key: 'drought', words: 'Drought' }]);
  });

  it('B-AC-1: the colony bar’s chips never run ahead of the map, add up to its bars, and stop where a plot runs out', () => {
    // Announced, nothing landed: no chip. As the swarm is announced, only the drought has landed.
    expect(chips(tvAt(both, droughtAt + 0.5), 's1')).toEqual([]);
    const announced = tvAt(both, pestsAt + 0.3);
    expect(chips(announced, 's1')).toEqual(chipsOf(lossTo('s1', [drought])));
    expect(chips(announced, 's2')).toEqual(chipsOf(lossTo('s2', [drought])));
    const settled = tvAt(both, windowEnds - 0.05);
    expect(chips(settled, 's1')).toEqual(chipsOf(lossTo('s1', [drought, pests])));
    expect(chips(settled, 's2')).toEqual(chipsOf(lossTo('s2', [drought, pests])));

    // A swarm that eats 3 from a farm that made 2 takes 2: Lena's chip is the drought's −1 and the swarm's −2.
    const starved = month([drought, hungry]);
    expect(chips(tvAt(starved, windowEnds - 0.05), 's1')).toEqual([-3]);

    // At every moment of the window, each player's chip is the change in their bars on the map.
    for (const m of [both, starved])
      for (const t of frames(EVENT_AT, windowEnds - FLY_STEP, 0.1)) {
        const html = tvAt(m, t);
        for (const { id } of PLAYERS) {
          const onMap = lines.filter((l) => l.owner === id).reduce((n, l) => n + bars(html, l.x, l.y) - l.made, 0);
          expect(
            chips(html, id).reduce((n, d) => n + d, 0),
            `${id} at ${t.toFixed(2)}`,
          ).toBe(onMap);
        }
      }

    // In the very frame each strike lands, its owner's chip takes it, and not a moment before (as T-AC-3's bars do).
    const EPS = 0.01;
    const chipSum = (html: string, id: string) => chips(html, id).reduce((n, d) => n + d, 0);
    for (const m of [both, starved]) {
      const segments = eventSegments(m, EVENT_AT, 'tv');
      for (const l of lines)
        for (const s of plotStrikes(segments, l, false, { width: W, height: H })) {
          const before = chipSum(tvAt(m, s.at - EPS), l.owner);
          // The screen reads `t` back from the server's clock in ms, which can land a hair under `at`: a microsecond on.
          const struck = chipSum(tvAt(m, s.at + 1e-6), l.owner);
          expect(struck - before, `${l.owner} on (${l.x}, ${l.y}) at ${s.at.toFixed(3)}`).toBe(s.after - s.before);
        }
    }
  });

  it('B-AC-1: the rail plays the map’s script: one of title card, card or log entry per moment, the log a prefix of fired order', () => {
    const keys: string[] = both.events.map((e) => e.key);
    for (const t of frames(EVENT_AT, windowEnds + 0.5, 0.05)) {
      const html = tvAt(both, t);
      const [on] = playing(html);
      const logged = log(html).map((l) => l.key);
      const at = `at ${t.toFixed(2)}`;
      if (on === undefined) {
        expect(now(html), at).toEqual([]);
        expect(logged, at).toEqual(t < droughtAt ? [] : keys);
        continue;
      }
      const i = keys.indexOf(on);
      expect(logged.slice(0, i), at).toEqual(keys.slice(0, i));
      expect(logged.length === i || (logged.length === i + 1 && logged[i] === on), at).toBe(true);
      const shown = [html.includes('data-testid="title-card"'), now(html).includes(on), logged.length === i + 1];
      expect(shown.filter(Boolean).length, `${at}: title card, card, log entry ${shown}`).toBe(1);
      expect(now(html).every((k) => k === on), at).toBe(true);
    }
  });

  it('B-AC-1: inside the phase’s intro no story plays yet, and the drought plays from the moment the intro ends', () => {
    // The intro's first moments: its card is up and the map plays nothing.
    const intro = tvAt(both, EVENT_AT + 0.1);
    expect(intro).toContain('data-testid="intro-card"');
    expect(playing(intro)).toEqual([]);
    expect(now(intro)).toEqual([]);
    expect(playing(tvAt(both, droughtAt - 0.1))).toEqual([]);
    // Just past the intro, the drought.
    expect(playing(tvAt(both, droughtAt + 0.05))).toEqual(['drought']);
  });

  it('B-AC-1: a quiet month shows no event card, no log entry, no pips row and no chip', () => {
    const quiet = month([]);
    // Before the card's time there is no log at all.
    expect(tvAt(quiet, 2)).not.toContain('data-testid="log"');
    for (const t of [EVENT_AT + 1, 9]) {
      const html = tvAt(quiet, t);
      expect(playing(html), `at ${t}`).toEqual([]);
      expect(now(html), `at ${t}`).toEqual([]);
      expect(log(html), `at ${t}`).toEqual([]);
      expect(html).not.toContain('data-testid="event-card"');
      // No pips at all: an empty row would push the header's controls aside.
      expect(html).not.toContain('data-testid="pips"');
      expect(chips(html, 's1')).toEqual([]);
      expect(chips(html, 's2')).toEqual([]);
    }
    expect(text(tvAt(quiet, 9))).toContain('A quiet month');
  });
});

describe("HC-6 on the TV: the device's reduced-motion setting reaches the map", () => {
  const mounted = new Set<() => void>();
  afterEach(() => {
    for (const unmount of mounted) unmount();
    mounted.clear();
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  /** The device's setting, and who is listening for it to change. */
  const device = { reduced: false, listeners: new Set<() => void>() };
  /** Mounts the screen in the browser, with the device's prefers-reduced-motion set to `reduced`; null: no matchMedia at all. */
  function mount(production: ProductionView, t: number, reduced: boolean | null): FakeElement {
    device.reduced = reduced === true;
    device.listeners.clear();
    if (reduced === null) delete (window as { matchMedia?: unknown }).matchMedia;
    else
      Object.assign(window, {
        matchMedia: (q: string) => ({
          media: q,
          get matches() {
            return device.reduced && q === '(prefers-reduced-motion: reduce)';
          },
          addEventListener: (_: string, l: () => void) => device.listeners.add(l),
          removeEventListener: (_: string, l: () => void) => device.listeners.delete(l),
        }),
      });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host as unknown as HTMLElement);
    flushSync(() => root.render(screen(production, t)));
    mounted.add(() => {
      root.unmount();
      document.body.removeChild(host);
    });
    return host;
  }
  const byTestId = (host: FakeElement, id: string) => host.findAll('div').find((el) => el.getAttribute('data-testid') === id);
  /** Whether the map's camera has moved: a transform on the map inside its box. */
  const camera = (host: FakeElement) => Boolean(byTestId(host, 'event-map')?.style.transform);

  it('B-AC-1: with the device set to reduced the map box is reduced and the camera never flies in; without it, it does', () => {
    const harvest = month([bumper]);
    const start = EVENT_AT + EVENT_SHOW.introMs / 1000;
    const span = frames(start, start + bumper.playMs / 1000, 0.25);
    const moves = (reduced: boolean) =>
      span.map((t) => {
        const host = mount(harvest, t, reduced);
        expect(byTestId(host, 'event-map-box')?.getAttribute('data-reduced'), `reduced ${reduced} at ${t}`).toBe(String(reduced));
        return camera(host);
      });
    expect(moves(true).some(Boolean)).toBe(false);
    // Positive control: the same frames on a device without the setting fly the camera in.
    expect(moves(false).some(Boolean)).toBe(true);

    // The setting is followed live: switched on while the TV shows the month, the map turns reduced, and back.
    const live = mount(harvest, span[0]!, false);
    const box = () => byTestId(live, 'event-map-box')?.getAttribute('data-reduced');
    expect(box()).toBe('false');
    expect(device.listeners.size).toBeGreaterThan(0);
    device.reduced = true;
    flushSync(() => device.listeners.forEach((l) => l()));
    expect(box()).toBe('true');
    device.reduced = false;
    flushSync(() => device.listeners.forEach((l) => l()));
    expect(box()).toBe('false');

    // A browser with no matchMedia plays the show with motion, and does not break.
    expect(byTestId(mount(harvest, span[0]!, null), 'event-map-box')?.getAttribute('data-reduced')).toBe('false');
  });
});
