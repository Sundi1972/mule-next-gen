import type { ProductionEventView, ProductionView } from '@mule/protocol';
import { harvest, landed, ProductionMap, showTime, type MapTile, type ShowEventKey } from '@mule/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

const W = 6;
const H = 3;
const tiles: MapTile[] = Array.from({ length: W * H }, (_, i) => ({ x: i % W, y: Math.floor(i / W), terrain: 'plains', owner: null }));
/** The production show's event window opens 4.8 s in, and a quiet month flies its goods at 9.6 and ends at 15. */
const EVENT_AT = 4.8;
const QUIET_FLY = 9.6;
const QUIET_END = 15;
const FLIGHT = 0.9;
const FLY_STEP = 0.09;

function fired(key: ShowEventKey, playMs: number, hits: [x: number, y: number, delta: number][]): ProductionEventView {
  return {
    key,
    kind: 'storm',
    title: key,
    line: `${key} happens.`,
    sign: 'bad',
    scope: 'colony',
    origin: { x: 0, y: 0 },
    from: 'w',
    hits: hits.map(([x, y, delta], order) => ({ x, y, order, delta })),
    phase: 'production',
    weight: 'headline',
    playMs,
  };
}

/** The server's production length for these events at phaseScale 1 (RULE-1, sent by the server, never computed by the client). */
const lengthOf = (events: ProductionEventView[]) => 15_000 + Math.max(0, events.reduce((n, e) => n + e.playMs, 0) - 4_800);

const render = (production: ProductionView, t: number) =>
  renderToStaticMarkup(createElement(ProductionMap, { width: W, height: H, tiles, production, t, slots: { lena: 0, ossa: 1 }, tv: true }));

function plot(html: string, x: number, y: number): string {
  const start = html.indexOf(`data-testid="plot-${x}-${y}"`);
  if (start < 0) return '';
  const next = html.indexOf('data-testid="plot-', start + 1);
  return html.slice(start, next < 0 ? undefined : next);
}
const bars = (html: string) => (html.match(/data-bar="unit"/g) ?? []).length;
const playing = (html: string) => [...html.matchAll(/data-event="([^"]+)"/g)].map((m) => m[1]);
/** Show seconds from a to b, every `step`. */
const frames = (a: number, b: number, step = 0.1) => Array.from({ length: Math.floor((b - a) / step) }, (_, i) => a + (i + 0.5) * step);

describe('the production show plays every event of the month', () => {
  // RULE-2's example on the Food plot (1, 0): it makes 1, a drought takes 1, then acid rain takes 0 → 1, 0, 0; flies 0.
  // (2, 2) makes 1, loses 2 to the drought (never below 0), then gains 1 from the acid rain: worked on what the drought left.
  // (4, 0) is reached by no event.
  const drought = fired('drought', 3000, [
    [1, 0, -1],
    [2, 2, -2],
  ]);
  const acid = fired('acidRain', 3000, [
    [1, 0, 0],
    [2, 2, 1],
  ]);
  const month: ProductionView = {
    lines: [
      { x: 1, y: 0, owner: 'lena', good: 'food', made: 1, parts: [] },
      { x: 4, y: 0, owner: 'lena', good: 'water', made: 2, parts: [] },
      { x: 2, y: 2, owner: 'ossa', good: 'energy', made: 1, parts: [] },
    ],
    events: [drought, acid],
    lengthMs: lengthOf([drought, acid]),
  };
  // The drought plays 4.8..7.8, the acid rain 7.8..10.8; the goods fly from 10.8.
  const droughtEnds = EVENT_AT + 3;
  const windowEnds = EVENT_AT + 6;

  it("T-AC-3: a plot's bars add every event's delta in fired order, never below 0, and that is what flies home", () => {
    const before = render(month, EVENT_AT - 0.1);
    expect([bars(plot(before, 1, 0)), bars(plot(before, 2, 2)), bars(plot(before, 4, 0))]).toEqual([1, 1, 2]);

    const afterDrought = render(month, droughtEnds - 0.05);
    expect(bars(plot(afterDrought, 1, 0))).toBe(0);
    expect(bars(plot(afterDrought, 2, 2))).toBe(0);

    const afterAll = render(month, windowEnds - 0.05);
    expect(bars(plot(afterAll, 1, 0))).toBe(0);
    expect(bars(plot(afterAll, 2, 2))).toBe(1);
    // Negative: a plot no event reached keeps what it made.
    expect(bars(plot(afterAll, 4, 0))).toBe(2);

    // What the screens read: the Food plot flies 0, the untouched Water plot its 2, Ossa's Energy the 1 the acid rain left.
    expect(harvest(month, 'lena')).toEqual({ water: 2 });
    expect(harvest(month, 'ossa')).toEqual({ energy: 1 });
  });

  it('T-AC-4: inside each event’s segment the map plays that event, in fired order, and the goods fly only after the last', () => {
    const keys: ShowEventKey[] = ['dustStorm', 'drought', 'acidRain', 'solarFlare', 'cometPass', 'flood', 'volcanicAsh', 'pestSwarm', 'wildfire', 'bumperHarvest'];
    const events = keys.map((k) => fired(k, 4000, [[1, 0, -1]]));
    const all: ProductionView = { lines: month.lines, events, lengthMs: lengthOf(events) };
    // The first segment opens on the phase's intro card (no event yet); every later one plays from its first moment.
    expect(playing(render(all, EVENT_AT + 0.05))).toEqual([]);
    keys.forEach((k, i) => {
      const at = [EVENT_AT + 4 * i + 2, EVENT_AT + 4 * (i + 1) - 0.05, ...(i > 0 ? [EVENT_AT + 4 * i + 0.05] : [])];
      for (const t of at) expect(playing(render(all, t)), `${k} at ${t}`).toEqual([k]);
    });
    const end = EVENT_AT + 40;
    expect(playing(render(all, end + 0.05))).toEqual([]);

    // The show clock stretches over the server's length: the window ends at 44.8 of 50.2 show seconds.
    const start = 1_000_000;
    expect(showTime(start + all.lengthMs, start + all.lengthMs * (end / (QUIET_END + 40 - 4.8)), all.lengthMs, all.events)).toBeCloseTo(end, 9);
    expect(showTime(start + all.lengthMs, start + all.lengthMs, all.lengthMs, all.events)).toBeCloseTo(QUIET_END + 40 - 4.8, 9);

    // Nothing has landed while the events play: the untouched Water plot (second in reading order) lands one step and
    // one flight after the window, never before.
    expect(landed(all, end - 0.05, 'lena')).toEqual({});
    expect(landed(all, end + FLY_STEP + FLIGHT - 0.01, 'lena')).toEqual({});
    expect(landed(all, end + FLY_STEP + FLIGHT + 0.01, 'lena')).toEqual({ water: 2 });
  });

  it('T-AC-4: each wave-1 key plays its own story inside its segment, and no other key’s', () => {
    const OWN: Record<ShowEventKey, RegExp> = {
      dustStorm: /data-testid="front-dustStorm"/,
      drought: /data-testid="front-drought"/,
      acidRain: /data-testid="front-acidRain"/,
      solarFlare: /data-testid="front-solarFlare"/,
      cometPass: /data-testid="comet"/,
      flood: /data-testid="flood-1-0"/,
      volcanicAsh: /data-testid="ash-1-0"/,
      pestSwarm: /data-testid="swarm-1-0"/,
      wildfire: /data-testid="fire-1-0"/,
      bumperHarvest: /data-testid="bumper-stamp"/,
    };
    const keys = Object.keys(OWN) as ShowEventKey[];
    for (const k of keys) {
      const ev = fired(k, 4000, [[1, 0, -1]]);
      const one: ProductionView = { lines: month.lines, events: [ev], lengthMs: lengthOf([ev]) };
      const shown = frames(EVENT_AT, EVENT_AT + 4).map((t) => render(one, t));
      expect(
        shown.some((html) => OWN[k].test(html)),
        `${k} draws its own story`,
      ).toBe(true);
      for (const other of keys.filter((o) => o !== k)) expect(shown.some((html) => OWN[other].test(html)), `${k} draws ${other}'s story`).toBe(false);
    }
  });

  it("T-AC-4: a quiet month's timeline is unchanged: the goods fly at 9.6 and the show ends at 15", () => {
    const quiet: ProductionView = { lines: month.lines, events: [], lengthMs: 15_000 };
    const start = 1_000_000;
    expect(showTime(start + 15_000, start + 15_000, 15_000, [])).toBe(QUIET_END);
    expect(showTime(start + 15_000, start + 15_000 * (QUIET_FLY / QUIET_END), 15_000, [])).toBeCloseTo(QUIET_FLY, 9);
    expect(landed(quiet, QUIET_FLY + FLIGHT - 0.01, 'lena')).toEqual({});
    expect(landed(quiet, QUIET_FLY + FLIGHT + 0.01, 'lena')).toEqual({ food: 1 });
    expect(playing(render(quiet, 7))).toEqual([]);
  });
});
