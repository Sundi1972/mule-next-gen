import { EVENT_SHOW, PHASES } from '@mule/engine';
import type { ProductionEventView, ProductionView } from '@mule/protocol';
import { eventHitAt, eventSegments, fillAt, flyAt, harvest, landed, landing, ProductionMap, showEnd, showTime, type MapTile, type ShowEventKey, type ShowMode } from '@mule/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

const W = 6;
const H = 3;
const GRID = { width: W, height: H };
const tiles: MapTile[] = Array.from({ length: W * H }, (_, i) => ({ x: i % W, y: Math.floor(i / W), terrain: 'plains', owner: null }));
/** The production show's event window opens 4.8 s in, and a quiet month flies its goods at 9.6 and ends at 15. */
const EVENT_AT = 4.8;
const QUIET_FLY = 9.6;
const QUIET_END = 15;
/** The phase's intro, as the server sends it whenever an event fired: it plays before the first event's segment. */
const INTRO = 1.8;
const FLIGHT = 0.9;
const FLY_STEP = 0.09;

function fired(key: ProductionEventView['key'], playMs: number, hits: [x: number, y: number, delta: number][]): ProductionEventView {
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

/** The server's intro for these events: the engine's own number when any fired, none in a quiet month. */
const introOf = (events: ProductionEventView[]) => (events.length > 0 ? EVENT_SHOW.introMs : 0);
/** The server's production length for these events at phaseScale 1 (RULE-1), from the engine's own numbers. */
const lengthOf = (events: ProductionEventView[]) =>
  PHASES.productionMs + Math.max(0, introOf(events) + events.reduce((n, e) => n + e.playMs, 0) - EVENT_SHOW.productionWindowMs);
/** A month's view as the server builds it from its lines and events. */
const viewOf = (lines: ProductionView['lines'], events: ProductionEventView[]): ProductionView => ({ lines, events, lengthMs: lengthOf(events), introMs: introOf(events) });

const render = (production: ProductionView, t: number, { mode, reduced = false, tv = true }: { mode?: ShowMode; reduced?: boolean; tv?: boolean } = {}) =>
  renderToStaticMarkup(createElement(ProductionMap, { width: W, height: H, tiles, production, t, slots: { lena: 0, ossa: 1 }, tv, reduced, ...(mode ? { mode } : {}) }));

function plot(html: string, x: number, y: number): string {
  const start = html.indexOf(`data-testid="plot-${x}-${y}"`);
  if (start < 0) return '';
  const next = html.indexOf('data-testid="plot-', start + 1);
  return html.slice(start, next < 0 ? undefined : next);
}
/** The markup inside the div carrying this test id, by balancing its divs. */
function inside(html: string, testid: string): string {
  const open = html.indexOf(`data-testid="${testid}"`);
  if (open < 0) return '';
  const from = html.indexOf('>', open) + 1;
  let depth = 1;
  const tag = /<div[\s>]|<\/div>/g;
  tag.lastIndex = from;
  for (let m = tag.exec(html); m; m = tag.exec(html)) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) return html.slice(from, m.index);
  }
  return html.slice(from);
}
const bars = (html: string) => (html.match(/data-bar="unit"/g) ?? []).length;
const lostBars = (html: string) => (html.match(/data-bar="lost"/g) ?? []).length;
const playing = (html: string) => [...html.matchAll(/data-event="([^"]+)"/g)].map((m) => m[1]);
/** The events' chips on one plot, in the order they are drawn. */
const chips = (html: string, x: number, y: number) => [...html.matchAll(new RegExp(`data-testid="mark-${x}-${y}"[^]*?data-delta="(-?\\d+)"`, 'g'))].map((m) => Number(m[1]));
const camera = (html: string) => /<div[^>]*style="[^"]*transform[^"]*"[^>]*data-testid="event-map"/.test(html);
/** The camera shaken: the map's transform translates again after its zoom. */
const jolted = (html: string) => /<div[^>]*style="[^"]*scale\([^)]*\) translate\([^"]*"[^>]*data-testid="event-map"/.test(html);
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
  const month = viewOf(
    [
      { x: 1, y: 0, owner: 'lena', good: 'food', made: 1, parts: [] },
      { x: 4, y: 0, owner: 'lena', good: 'water', made: 2, parts: [] },
      { x: 2, y: 2, owner: 'ossa', good: 'energy', made: 1, parts: [] },
    ],
    [drought, acid],
  );
  // The intro plays 4.8..6.6, the drought 6.6..9.6, the acid rain 9.6..12.6; the goods fly from 12.6.
  const droughtEnds = EVENT_AT + INTRO + 3;
  const windowEnds = EVENT_AT + INTRO + 6;

  it("T-AC-3: a plot's bars add every event's delta in fired order, never below 0, and that is what flies home", () => {
    const before = render(month, EVENT_AT - 0.1);
    expect([bars(plot(before, 1, 0)), bars(plot(before, 2, 2)), bars(plot(before, 4, 0))]).toEqual([1, 1, 2]);

    const afterDrought = render(month, droughtEnds - 0.05);
    expect(bars(plot(afterDrought, 1, 0))).toBe(0);
    expect(bars(plot(afterDrought, 2, 2))).toBe(0);

    const afterAll = render(month, windowEnds - 0.05);
    expect(bars(plot(afterAll, 1, 0))).toBe(0);
    expect(bars(plot(afterAll, 2, 2))).toBe(1);
    // Each event's own chip carries its figure, in fired order; a 0 draws none. Negative: a plot no event reached keeps
    // what it made, and no chip.
    expect(chips(afterAll, 2, 2)).toEqual([-2, 1]);
    expect(chips(afterAll, 1, 0)).toEqual([-1]);
    expect(bars(plot(afterAll, 4, 0))).toBe(2);
    expect(chips(afterAll, 4, 0)).toEqual([]);

    // What the screens read: the Food plot flies 0, the untouched Water plot its 2, Ossa's Energy the 1 the acid rain left.
    expect(harvest(month, 'lena')).toEqual({ water: 2 });
    expect(harvest(month, 'ossa')).toEqual({ energy: 1 });
  });

  it.each([
    { mode: 'tv' as const, reduced: false },
    { mode: 'solo' as const, reduced: false },
    { mode: 'tv' as const, reduced: true },
    { mode: 'solo' as const, reduced: true },
  ])('T-AC-3: the bars change in the very frame the event lands and its chip appears ($mode, reduced $reduced)', ({ mode, reduced }) => {
    const seg = eventSegments(month, EVENT_AT, mode)[0]!;
    const at = eventHitAt(seg, drought, drought.hits[0]!, reduced, GRID);
    const just = render(month, at - 0.02, { mode, reduced });
    expect(bars(plot(just, 1, 0))).toBe(1);
    expect(chips(just, 1, 0)).toEqual([]);
    const struck = render(month, at + 0.02, { mode, reduced });
    expect(bars(plot(struck, 1, 0))).toBe(0);
    expect(chips(struck, 1, 0)).toEqual([-1]);
    // HC-6: the unit it took falls away in grey, never with reduced motion.
    expect(lostBars(plot(struck, 1, 0))).toBe(reduced ? 0 : 1);
  });

  it('T-AC-4: inside each event’s segment the map plays that event, in fired order, and the goods fly only after the last', () => {
    const keys: ProductionEventView['key'][] = ['dustStorm', 'drought', 'acidRain', 'solarFlare', 'cometPass', 'flood', 'volcanicAsh', 'pestSwarm', 'wildfire', 'bumperHarvest'];
    const events = keys.map((k) => fired(k, 4000, [[1, 0, -1]]));
    const all = viewOf(month.lines, events);
    // The phase's intro card plays in its own slot (no event yet); then every segment plays from its first moment.
    const first = EVENT_AT + INTRO;
    for (const t of [EVENT_AT + 0.05, first - 0.05]) expect(playing(render(all, t)), `intro at ${t}`).toEqual([]);
    keys.forEach((k, i) => {
      const at = [first + 4 * i + 0.05, first + 4 * i + 2, first + 4 * (i + 1) - 0.05];
      for (const t of at) expect(playing(render(all, t)), `${k} at ${t}`).toEqual([k]);
    });
    const end = first + 40;
    expect(playing(render(all, end + 0.05))).toEqual([]);

    // The client's timeline is the server's length, intro included: no length of its own (HC-3).
    expect(showEnd(all) * 1000).toBeCloseTo(all.lengthMs, 6);
    // The window W = max(4.8, (introMs + Σ playMs) / 1000), and the goods fly when it closes.
    expect(flyAt(0, all)).toBeCloseTo(EVENT_AT + (all.introMs + 40_000) / 1000, 9);
    const start = 1_000_000;
    expect(showTime(start + all.lengthMs, start + all.lengthMs * (end / showEnd(all)), all.lengthMs, all)).toBeCloseTo(end, 9);
    expect(showTime(start + all.lengthMs, start + all.lengthMs, all.lengthMs, all)).toBeCloseTo(all.lengthMs / 1000, 9);

    // Nothing has landed while the events play: the untouched Water plot (second in reading order) lands one step and
    // one flight after the window, never before, and its landing lights up then, not at a quiet month's time.
    expect(landed(all, end - 0.05, 'lena')).toEqual({});
    expect(landed(all, end + FLY_STEP + FLIGHT - 0.01, 'lena')).toEqual({});
    expect(landed(all, end + FLY_STEP + FLIGHT + 0.01, 'lena')).toEqual({ water: 2 });
    expect(landing(all, end + FLY_STEP + FLIGHT + 0.01, 'lena')).toBe(true);
    expect(landing(all, QUIET_FLY + FLIGHT + 0.01, 'lena')).toBe(false);
    // The rendered bars fly on the same timeline: still at rest as the window closes, gone one step and one flight later.
    expect(plot(render(all, end - 0.05), 4, 0)).not.toMatch(/opacity-0|transition:transform/);
    expect(plot(render(all, end + FLY_STEP + FLIGHT + 0.01), 4, 0)).toContain('opacity-0');

    // While events play the bars sit in the map's frame (under the stories, with the camera); just before they fly they
    // leave it, already grown, so leaving does not grow them again.
    expect(inside(render(all, EVENT_AT + 6), 'event-map')).toContain('data-testid="plot-1-0"');
    // They leave no earlier than 0.2 s before the goods fly.
    expect(inside(render(all, flyAt(0, all) - 0.2 - 0.05), 'event-map')).toContain('data-testid="plot-1-0"');
    const handed = render(all, flyAt(0, all) - 0.1);
    expect(inside(handed, 'event-map')).not.toContain('data-testid="plot-');
    expect(plot(handed, 4, 0)).toContain('data-bar="unit"');
    expect(plot(handed, 4, 0)).not.toContain('show-bar-in');
    expect(plot(render(all, fillAt(1) + 0.1), 4, 0)).toContain('show-bar-in');

    // HC-6: the camera flies in to the bumper harvest's plot, never with reduced motion.
    const bumper = frames(first + 36, end);
    expect(bumper.some((t) => camera(render(all, t)))).toBe(true);
    expect(bumper.some((t) => camera(render(all, t, { reduced: true })))).toBe(false);
  });

  it('T-AC-4: each key plays its own story inside its segment, and no other key’s', () => {
    // Every key production fires; sickness is development's, and its roll call is events-overlay's and the UI's roll-call test.
    const OWN: Record<Exclude<ShowEventKey, 'sickness'>, RegExp> = {
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
      cavernCollapse: /data-testid="cave-in-1-0"/,
    };
    const keys = Object.keys(OWN) as (keyof typeof OWN)[];
    for (const k of keys) {
      const ev = fired(k, 4000, [[1, 0, -1]]);
      const one = viewOf(month.lines, [ev]);
      const shown = frames(EVENT_AT + INTRO, EVENT_AT + INTRO + 4).map((t) => render(one, t));
      expect(
        shown.some((html) => OWN[k].test(html)),
        `${k} draws its own story`,
      ).toBe(true);
      for (const other of keys.filter((o) => o !== k)) expect(shown.some((html) => OWN[other].test(html)), `${k} draws ${other}'s story`).toBe(false);
    }

    // The cavern collapse's story: the cavern rumbles and cracks, rocks fall in, the camera jolts, dust rises.
    const caveIn = viewOf(month.lines, [fired('cavernCollapse', 4000, [[1, 0, 0]])]);
    const story = frames(EVENT_AT + INTRO, EVENT_AT + INTRO + 4, 0.05);
    const moving = story.map((t) => render(caveIn, t));
    expect(moving.some((html) => html.includes('data-testid="cave-in-rock"')), 'rocks fall in').toBe(true);
    expect(moving.some((html) => html.includes('data-testid="cave-in-dust"')), 'dust rises').toBe(true);
    expect(moving.some((html) => jolted(html)), 'the camera jolts').toBe(true);
    // HC-6: with reduced motion no rumble, no falling rocks, no jolt and no camera; the dust still shows where it caved in.
    const still = story.map((t) => render(caveIn, t, { reduced: true }));
    expect(still.some((html) => html.includes('data-testid="cave-in-1-0"')), 'reduced: no rumbling cavern').toBe(false);
    expect(still.some((html) => html.includes('data-testid="cave-in-rock"')), 'reduced: no falling rocks').toBe(false);
    expect(still.some((html) => camera(html)), 'reduced: no camera, no jolt').toBe(false);
    expect(still.some((html) => html.includes('data-testid="cave-in-dust"')), 'reduced: the dust shows').toBe(true);
  });

  it("T-AC-4: a quiet month's timeline is unchanged: the goods fly at 9.6 and the show ends at 15", () => {
    const quiet = viewOf(month.lines, []);
    const start = 1_000_000;
    expect(quiet.introMs).toBe(0);
    expect(showEnd(quiet) * 1000).toBe(quiet.lengthMs);
    expect(showTime(start + 15_000, start + 15_000, 15_000, quiet)).toBe(QUIET_END);
    expect(showTime(start + 15_000, start + 15_000 * (QUIET_FLY / QUIET_END), 15_000, quiet)).toBeCloseTo(QUIET_FLY, 9);
    expect(landed(quiet, QUIET_FLY + FLIGHT - 0.01, 'lena')).toEqual({});
    expect(landed(quiet, QUIET_FLY + FLIGHT + 0.01, 'lena')).toEqual({ food: 1 });
    expect(playing(render(quiet, 7))).toEqual([]);
    // No event ever frames the bars.
    expect(inside(render(quiet, 7), 'event-map')).not.toContain('data-testid="plot-');

    // A month whose events play shorter than the window keeps a quiet month's timeline.
    // With its intro, 1.8 + 2.5 s fits inside the 4.8 s window.
    const short = fired('drought', 2500, [[2, 2, -1]]);
    const brief = viewOf(month.lines, [short]);
    expect(brief.lengthMs).toBe(15_000);
    expect(showEnd(brief)).toBe(QUIET_END);
    expect(landed(brief, QUIET_FLY + FLY_STEP + FLIGHT - 0.01, 'lena')).toEqual({ food: 1 });
    expect(landed(brief, QUIET_FLY + FLY_STEP + FLIGHT + 0.01, 'lena')).toEqual({ food: 1, water: 2 });
  });

  it("T-AC-4: ProductionMap plays at the TV's pace unless told otherwise", () => {
    // The drought's motion: the same frames with no mode as with 'tv', and different from a phone alone's.
    const t = frames(EVENT_AT + INTRO, EVENT_AT + INTRO + 3, 0.25);
    const html = (mode?: ShowMode) => t.map((at) => render(month, at, mode ? { mode } : {})).join('');
    expect(html()).toBe(html('tv'));
    expect(html()).not.toBe(html('solo'));
  });

  it('T-AC-4: on the phone a 0-delta hit on a plot with reasons does not hide its reasons; a real loss does', () => {
    const lines: ProductionView['lines'] = [
      { x: 1, y: 0, owner: 'lena', good: 'food', made: 2, parts: [{ why: 'cluster', delta: 1 }] },
      { x: 4, y: 0, owner: 'lena', good: 'water', made: 2, parts: [{ why: 'cluster', delta: 1 }] },
    ];
    const rain = viewOf(lines, [fired('acidRain', 3000, [[1, 0, 0], [4, 0, -1]])]);
    const after = render(rain, EVENT_AT + INTRO + 3 - 0.05, { tv: false });
    expect(plot(after, 1, 0)).toContain('data-badge="reason"');
    expect(plot(after, 4, 0)).not.toContain('data-badge="reason"');
  });
});
