import type { GameState } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MuleGame } from '../../server/src/mule-game';
import { fakeContext, walkers } from '../../server/test/fake-context';
import { droneReport, nextDroneWords, ScanReport } from '../src/phone/plotInfo';

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
    expect(drawn).toContain('ONLY YOU');
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
