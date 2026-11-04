import { COLONY_SELLER } from '@mule/engine';
import type { ColonyProjectView, MuleView, TileView } from '@mule/protocol';
import { HoloMap, type MapTile } from '@mule/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { mapTiles } from '../src/game/derive';

/**
 * C33: the colony's objects stand on their plots, on every map. Every map takes its plots from mapTiles and draws them
 * with HoloMap (ProductionMap and the events map wrap it), so these two seams are every map.
 *
 * The contract is ColonyView (G-5 spec §3, frozen at WS7's wave 2): projects[].plot is a tile index, set when C30 wins
 * the site and never cleared, and C30 makes the plot the colony's (owner COLONY_SELLER).
 */
type Project = Pick<ColonyProjectView, 'id' | 'name' | 'stage' | 'buildMonths' | 'monthsLeft' | 'plot'>;
const objectOf = (t: MapTile | undefined) => t?.object;

const W = 4;
const H = 2;
const tile = (i: number, extra: Partial<TileView> = {}): TileView => ({ x: i % W, y: Math.floor(i / W), terrain: 'plains', peaks: 0, owner: null, outfit: null, pollution: 0, filter: false, ...extra });

/** A 4×2 map: a player's plot at 0, the colony's sited plots at 2, 5 and 6, the rest free. */
function view(projects: Project[]): MuleView {
  const colonyPlots = new Set(projects.flatMap((p) => (p.plot === null ? [] : [p.plot])));
  return {
    width: W,
    height: H,
    players: [{ id: 'heiko', slot: 0, species: 'humanoid' }],
    tiles: Array.from({ length: W * H }, (_, i) => tile(i, i === 0 ? { owner: 'heiko', outfit: 'food' } : colonyPlots.has(i) ? { owner: COLONY_SELLER } : {})),
    colony: { projects },
  } as unknown as MuleView;
}

const PROJECTS: Project[] = [
  { id: 'park', name: 'Park', stage: 'commissioned', buildMonths: 1, monthsLeft: null, plot: 2 },
  { id: 'stadium', name: 'Stadium', stage: 'building', buildMonths: 3, monthsLeft: 2, plot: 5 },
  { id: 'spaceport', name: 'Spaceport upgrade', stage: 'damaged', buildMonths: 3, monthsLeft: null, plot: 6 },
  { id: 'hospital', name: 'Hospital', stage: 'standing', buildMonths: 2, monthsLeft: null, plot: null },
];

describe('C33: mapTiles puts each sited object on its plot', () => {
  const tiles = mapTiles(view(PROJECTS));
  const at = (i: number) => tiles.find((t) => t.x === i % W && t.y === Math.floor(i / W));

  it('reads the plot as a tile index over the map width, at the project stage', () => {
    expect(objectOf(at(2))).toEqual({ kind: 'park', name: 'Park', stage: 'commissioned', buildMonths: 1 });
    expect(objectOf(at(6))).toEqual({ kind: 'spaceport', name: 'Spaceport upgrade', stage: 'damaged', buildMonths: 3 });
  });

  it('counts a building site in months built: build months less the months left', () => {
    expect(objectOf(at(5))).toEqual({ kind: 'stadium', name: 'Stadium', stage: 'building', built: 1, buildMonths: 3 });
  });

  it("draws the colony's plot as nobody's: no player slot, and an object instead", () => {
    for (const i of [2, 5, 6]) expect(at(i)?.owner).toBeNull();
    expect(at(0)?.owner).toBe(0);
  });

  it('puts nothing on a plot without a project, and nothing anywhere for an object that needs no plot', () => {
    expect(tiles.filter((t) => objectOf(t)).map((t) => t.y * W + t.x)).toEqual([2, 5, 6]);
  });

  it('draws no object with politics off, when the view has no colony', () => {
    const off = { ...view([]), colony: null } as unknown as MuleView;
    expect(mapTiles(off).some((t) => objectOf(t))).toBe(false);
  });
});

describe('C33: HoloMap draws the object on its plot', () => {
  const tiles = mapTiles(view(PROJECTS));
  const html = renderToStaticMarkup(createElement(HoloMap, { width: W, height: H, tiles }));
  /** The opening tag of the element carrying this data-testid. */
  const tag = (testid: string) => html.match(new RegExp(`<[a-z]+[^>]*data-testid="${testid}"[^>]*>`))?.[0];

  it('marks each object plot with its kind and stage, and no other plot', () => {
    expect(tag('plot-object-2-0')).toContain('data-kind="park"');
    expect(tag('plot-object-2-0')).toContain('data-stage="commissioned"');
    expect(tag('plot-object-1-1')).toContain('data-stage="building"');
    expect(tag('plot-object-2-1')).toContain('data-stage="damaged"');
    expect(html.match(/data-testid="plot-object-/g)).toHaveLength(3);
  });

  it("names the object in the plot's own label, in the build site's words, never as a free plot", () => {
    expect(html).toContain('aria-label="Plains, Park, site reserved: not building yet"');
    expect(html).toContain('aria-label="Plains, Stadium, building: 1 of 3 months"');
    expect(html).toContain('aria-label="Plains, Spaceport upgrade, damaged: counts 0"');
    expect(html).toContain('aria-label="Plains, owned by player 1, Food"');
  });

  it("draws no player's tab on the colony's plot", () => {
    expect(tag('owner-0-0')).toBeDefined();
    for (const at of ['2-0', '1-1', '2-1']) expect(tag(`owner-${at}`)).toBeUndefined();
  });
});
