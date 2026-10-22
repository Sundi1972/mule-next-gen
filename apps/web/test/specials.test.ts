import { MAP } from '@mule/engine';
import type { MuleView, TileView } from '@mule/protocol';
import { HoloMap, type MapTile } from '@mule/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SpecialLine } from '../src/components/SpecialLine';
import { mapTiles, specialLine } from '../src/game/derive';

const FX = MAP.specialEffect;
const tile = (x: number, y: number, extra: Partial<TileView> = {}): TileView => ({ x, y, terrain: 'mountains', peaks: 0, owner: null, outfit: null, pollution: 0, filter: false, ...extra });

/** A 3×2 map: a cavern inside, a geyser on the right edge, ruins on the bottom-right corner, the rest plain. */
const TILES: MapTile[] = [
  { x: 0, y: 0, terrain: 'mountains', owner: null, special: { kind: 'crystalCavern' } },
  { x: 1, y: 0, terrain: 'plains', owner: null },
  { x: 2, y: 0, terrain: 'tundra', owner: null, special: { kind: 'geyser' } },
  { x: 0, y: 1, terrain: 'plains', owner: 0, ground: { food: 3 } },
  { x: 1, y: 1, terrain: 'plains', owner: null },
  { x: 2, y: 1, terrain: 'forest', owner: null, special: { kind: 'ruins', salvage: 'electronics' } },
];
const map = (props: Partial<Parameters<typeof HoloMap>[0]> = {}) => renderToStaticMarkup(createElement(HoloMap, { width: 3, height: 2, tiles: TILES, ...props }));
/** The opening tag of the element carrying this data-testid. */
const tag = (html: string, testid: string) => html.match(new RegExp(`<[a-z]+[^>]*data-testid="${testid}"[^>]*>`))?.[0];
/** The opening tag right after the glyph's: the badge itself. */
const badge = (html: string, testid: string) => html.slice(html.indexOf(`data-testid="${testid}"`)).match(/>(<span[^>]*>)/)?.[1];

describe('B-AC-9: the special-field badge on the map (variant A)', () => {
  it('draws a glyph, with its kind, on each special plot and none on a plain plot', () => {
    const html = map();
    expect(tag(html, 'special-glyph-0-0')).toContain('data-kind="crystalCavern"');
    expect(tag(html, 'special-glyph-2-0')).toContain('data-kind="geyser"');
    expect(tag(html, 'special-glyph-2-1')).toContain('data-kind="ruins"');
    expect(html.match(/data-testid="special-glyph-/g)).toHaveLength(3);
    expect(tag(html, 'special-glyph-1-0')).toBeUndefined();
  });

  it("is aria-hidden and takes no taps; the plot's own label names the kind", () => {
    const html = map({ onTile: () => {} });
    const glyph = tag(html, 'special-glyph-0-0')!;
    expect(glyph).toContain('aria-hidden="true"');
    expect(glyph).toContain('pointer-events-none');
    expect(html).toContain('aria-label="Mountains, Crystal cavern, free"');
    expect(html).toContain('aria-label="Forest, Ruins, Electronics salvage, free"');
    expect(html).toContain('aria-label="Plains, free"');
  });

  it('shows on the TV with hideGround: a special field is public', () => {
    const html = map({ density: 'tv', hideGround: true });
    expect(html.match(/data-testid="special-glyph-/g)).toHaveLength(3);
  });

  it("has the mock's sizes per density, hangs a quarter over the corner, and stays inside on the map's edges", () => {
    const phone = map();
    expect(badge(phone, 'special-glyph-0-0')).toMatch(/right:-3.75px;bottom:-3.75px;width:15px;height:15px/);
    expect(badge(phone, 'special-glyph-2-0')).toMatch(/right:2px;bottom:-3.75px/);
    expect(badge(phone, 'special-glyph-2-1')).toMatch(/right:2px;bottom:2px/);
    const tv = map({ density: 'tv' });
    expect(badge(tv, 'special-glyph-0-0')).toMatch(/right:-5.25px;bottom:-5.25px;width:21px;height:21px/);
  });

  it('colours each kind with its --color-s token', () => {
    const html = map();
    expect(html).toContain('stroke="var(--color-s-crystalCavern)"');
    expect(html).toContain('color:var(--color-s-geyser)');
  });
});

describe("B-AC-9: the phone's plot card says what a special field does", () => {
  it("passes the view's special field through to the map, and nothing for a plain plot", () => {
    const view = { tiles: [tile(0, 0, { special: { kind: 'ruins', salvage: 'alloy' } }), tile(1, 0)], players: [] } as unknown as MuleView;
    const [ruin, plain] = mapTiles(view);
    expect(ruin!.special).toEqual({ kind: 'ruins', salvage: 'alloy' });
    expect(plain).not.toHaveProperty('special');
  });

  it("says each kind's effect with the engine's numbers", () => {
    expect(specialLine({ kind: 'geyser' })).toBe(`Geyser: +${FX.geyser} Water or Energy.`);
    expect(specialLine({ kind: 'oasis' })).toBe(`Oasis: +${FX.oasis} Food.`);
    expect(specialLine({ kind: 'crystalCavern' })).toBe(`Crystal cavern: +${FX.crystalCavern} Crystite when mined. ${Math.round(FX.collapseChance * 100)}% a month it caves in.`);
    expect(specialLine({ kind: 'relic' })).toBe(`Alien relic: +${FX.relic} to every working plot touching it, anyone's.`);
    expect(specialLine({ kind: 'ruins', salvage: 'electronics' })).toBe(`Ruins: the first owner salvages ${FX.salvage.electronics} Electronics, once.`);
    expect(specialLine({ kind: 'ruins' })).toBe(`Ruins: pays its first owner ${FX.salvage.alloy} Alloy or ${FX.salvage.electronics} Electronics, once, then is gone.`);
  });

  it('draws the line with its kind and the badge, and nothing for a plain plot', () => {
    const html = renderToStaticMarkup(createElement(SpecialLine, { special: { kind: 'oasis' } }));
    expect(html).toMatch(/^<p[^>]*data-testid="special-line"[^>]*data-kind="oasis"/);
    expect(html).toContain('<strong class="font-semibold">Oasis:</strong>');
    expect(html).toContain('width:15px;height:15px');
    expect(renderToStaticMarkup(createElement(SpecialLine, { special: undefined }))).toBe('');
  });
});
