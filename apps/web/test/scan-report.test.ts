import type { GameState } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { dotsOf } from '@mule/ui';
import { describe, expect, it } from 'vitest';
import { MuleGame } from '../../server/src/mule-game';
import { fakeContext, walkers } from '../../server/test/fake-context';
import { bestWords } from '../src/phone/arcade/plots';
import { bestLine, droneReport, MyPlotsList, nextDroneWords, PlotRow, ScanReport } from '../src/phone/plotInfo';

/**
 * The Drone report is drawn from the view (the seat's droneOrder and its tiles' ground), never from the tap on Scan, so
 * a phone that rejoins mid-planning shows the same report. Month 1 on the real server, seed 7: Lena (s1), Ossa (s2).
 */
const LENA = 's1';
const OSSA = 's2';

function scanned() {
  const fake = fakeContext({ table: walkers });
  const game = new MuleGame(fake.ctx, 7);
  game.start(walkers);
  const state = (game as unknown as { state: GameState }).state;
  const before = game.viewFor(LENA);
  const plots = state.tiles.filter((t) => t.owner === null && t.terrain !== 'store').slice(-2).map((t) => ({ x: t.x, y: t.y }));
  game.handle(LENA, { type: 'drone', plots });
  return { game, fake, plots, before };
}

const html = (view: MuleView) => renderToStaticMarkup(createElement(ScanReport, { tiles: droneReport(view)!, next: nextDroneWords(view) }));

describe("the Drone report is the view's: droneOrder plus the tiles' ground", () => {
  it("after Scan, the sender's view gives the report both plots, in the order picked, each with its ground", () => {
    const { game, plots } = scanned();
    const report = droneReport(game.viewFor(LENA));
    expect(report?.map((t) => ({ x: t.x, y: t.y }))).toEqual(plots);
    for (const t of report!) expect(t.ground, `${t.x},${t.y}`).toBeDefined();
  });

  it('a rejoin mid-planning shows the same report: a later view, sent fresh over the wire, draws it identically', () => {
    const { game, fake, plots } = scanned();
    const atScan = game.viewFor(LENA);
    fake.advance(1_000);
    const rejoined = JSON.parse(JSON.stringify(game.viewFor(LENA))) as MuleView;
    expect(rejoined.phase).toBe('planning');
    expect(droneReport(rejoined)).toEqual(droneReport(atScan));
    const drawn = html(rejoined);
    expect(drawn).toBe(html(atScan));
    expect(drawn).toContain('data-testid="scan-report"');
    for (const p of plots) expect(drawn).toContain(`data-testid="report-${p.x}-${p.y}"`);
    expect(drawn).toContain('best for ');
    expect(drawn).toContain('Only you');
  });

  it('(negative) there is no report before Scan, for another seat, or for the TV', () => {
    const { game, before } = scanned();
    expect(droneReport(before)).toBeNull();
    expect(droneReport(game.viewFor(OSSA))).toBeNull();
    expect(droneReport(game.viewFor(null))).toBeNull();
  });

  it("(negative) while the view lacks a scanned plot's ground there is no report yet", () => {
    const { game, plots } = scanned();
    const view = game.viewFor(LENA);
    const last = plots.at(-1)!;
    const partial = { ...view, tiles: view.tiles.map((t) => (t.x === last.x && t.y === last.y ? { ...t, ground: undefined } : t)) };
    expect(droneReport(partial)).toBeNull();
  });
});

describe('C2: "best for" never names a good the plot draws no dot for', () => {
  const POOR = { food: -2, water: -1, energy: -2, smithore: 0, crystite: 0, rareEarth: 0 };

  it('a plot whose best good draws 0 dots is "nothing worth working", in the report and in the one-line summary', () => {
    expect(bestWords(dotsOf(POOR))).toBe('nothing worth working');
    expect(bestLine(POOR)).toBe('nothing worth working');
    const report = renderToStaticMarkup(createElement(ScanReport, { tiles: [{ x: 0, y: 0, terrain: 'desert', peaks: 0, owner: null, outfit: null, pollution: 0, filter: false, ground: POOR }], next: 'Next drone: month 3.' }));
    expect(report).toContain('nothing worth working');
    expect(report).not.toContain('best for');
  });

  it('one dot is enough to name it: water 0 is 1 dot, "best for Water"', () => {
    expect(bestWords(dotsOf({ ...POOR, water: 0 }))).toBe('best for Water');
    expect(bestLine({ ...POOR, crystite: 2 })).toBe('best for Crystite');
  });
});

describe("My plots' list, shared by planning and the walking screen", () => {
  const PLOT = { x: 0, y: 0, terrain: 'plains', peaks: 0, owner: 's1', outfit: null, pollution: 0, filter: false } as const;
  const list = (props: Partial<Parameters<typeof MyPlotsList>[0]>) => renderToStaticMarkup(createElement(MyPlotsList, { tiles: [], note: 'the clock keeps running', ...props })).replaceAll('<!-- -->', '');

  it('says "My plots · n" with its note, then a row per plot', () => {
    const html = list({ tiles: [PLOT, { ...PLOT, x: 1 }] });
    expect(html.replace(/<[^>]+>/g, '')).toContain('My plots · 2the clock keeps running');
    expect(html).toContain('data-testid="plot-row-0-0"');
    expect(html).toContain('data-testid="plot-row-1-0"');
  });

  it('with no plots says how to get a first', () => {
    expect(list({})).toContain('No plots yet: claim one in the land grant.');
  });

  it('a row with nothing to pick is no toggle; with onPick it is a button saying whether it is picked', () => {
    const still = renderToStaticMarkup(createElement(PlotRow, { t: PLOT }));
    expect(still).toMatch(/^<div[^>]*data-testid="plot-row-0-0"/);
    expect(still).not.toContain('aria-pressed');
    const picked = renderToStaticMarkup(createElement(PlotRow, { t: PLOT, selected: true, onPick: () => {} }));
    expect(picked).toMatch(/^<button[^>]*aria-pressed="true"/);
  });
});
