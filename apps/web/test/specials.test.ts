import { COLONY_SELLER, EVENTS, MAP } from '@mule/engine';
import type { ListingView, MuleView, TileView } from '@mule/protocol';
import { HoloMap, type MapSpecial, type MapTile } from '@mule/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SpecialLine } from '../src/components/SpecialLine';
import { LotCard } from '../src/components/AuctionParts';
import { mapTiles } from '../src/game/derive';

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

  it("draws the owner's mark above every badge, so a neighbour's overhang never covers it", () => {
    const html = map();
    // The mark's layer is the one its holder, the owner's tab, takes: the opening tag right before the mark's.
    const holder = html.match(/(<[a-z]+[^>]*>)<span role="img" data-slot="0"/)?.[1] ?? '';
    expect(holder).toContain('data-testid="owner-0-1"');
    const z = (tagHtml: string) => Number(tagHtml.match(/z-\[(\d+)\]/)?.[1] ?? 0);
    expect(z(holder)).toBeGreaterThan(z(tag(html, 'special-glyph-0-0')!));
  });

  it('keeps its layers inside the map: the root isolates, so a badge never paints over what sits on top of the map', () => {
    expect(map()).toMatch(/^<div class="[^"]*\bisolate\b/);
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

  it("says what each kind does, in the rendered line, with the engine's numbers", () => {
    const text = (special: MapSpecial) => renderToStaticMarkup(createElement(SpecialLine, { special })).replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'");
    expect(text({ kind: 'geyser' })).toBe(`Geyser: +${FX.geyser} Water or Energy.`);
    expect(text({ kind: 'oasis' })).toBe(`Oasis: +${FX.oasis} Food.`);
    expect(text({ kind: 'crystalCavern' })).toBe(`Crystal cavern: +${FX.crystalCavern} Crystite when mined. Each month it's mined, a ${Math.round(EVENTS.colony.cavernCollapse.phases.production * 100)}% chance it caves in.`);
    expect(text({ kind: 'relic' })).toBe(`Alien relic: +${FX.relic} to every working plot touching it, anyone's.`);
    expect(text({ kind: 'ruins', salvage: 'alloy' })).toBe(`Ruins: the first owner salvages ${FX.salvage.alloy} Alloy, once.`);
    expect(text({ kind: 'ruins', salvage: 'electronics' })).toBe(`Ruins: the first owner salvages ${FX.salvage.electronics} Electronics, once.`);
    expect(text({ kind: 'ruins' })).toBe(`Ruins: pays its first owner ${FX.salvage.alloy} Alloy or ${FX.salvage.electronics} Electronics, once, then is gone.`);
  });

  it("the land auction's lot card says what a plot lot's special field does, first under its name", () => {
    const view = { width: 2, height: 1, tiles: [tile(0, 0, { special: { kind: 'oasis' } }), tile(1, 0)], players: [] } as unknown as MuleView;
    const lot = (x: number, kind: 'plot' | 'mule' = 'plot'): ListingView =>
      ({ id: 'l1', seller: COLONY_SELLER, item: kind === 'plot' ? { kind, x, y: 0 } : { kind, x, y: 0, outfit: 'food' }, minimum: 100, unsold: 'keep', storePays: 0 }) as ListingView;
    const card = (l: ListingView, compact = false) => renderToStaticMarkup(createElement(LotCard, { view, lot: l, compact }));
    const oasis = card(lot(0));
    expect(oasis).toMatch(/data-testid="special-line" data-kind="oasis"/);
    expect(oasis.indexOf('data-testid="special-line"')).toBeGreaterThan(oasis.indexOf('data-testid="lot-name"'));
    expect(oasis.indexOf('data-testid="special-line"')).toBeLessThan(oasis.indexOf('data-testid="terrain-hint"'));
    expect(card(lot(1))).not.toContain('special-line');
    expect(card(lot(1))).toContain('data-testid="terrain-hint"');
    expect(card(lot(0), true)).not.toContain('special-line');
  });

  it('draws the line with its kind and the badge, and nothing for a plain plot', () => {
    const html = renderToStaticMarkup(createElement(SpecialLine, { special: { kind: 'oasis' } }));
    expect(html).toMatch(/^<p[^>]*data-testid="special-line"[^>]*data-kind="oasis"/);
    expect(html).toContain('<strong class="font-semibold">Oasis:</strong>');
    expect(html).toContain('width:15px;height:15px');
    expect(renderToStaticMarkup(createElement(SpecialLine, { special: undefined }))).toBe('');
  });
});

describe('B-AC-11: a meteor crater shows its approved badge and says what it is', () => {
  /** The crater's icon as Heiko approved it in the map gallery. */
  const APPROVED_PATH = 'M4 14a6 6 0 1 0 12 0a6 6 0 1 0-12 0z M9 14a1 1 0 1 0 2 0a1 1 0 1 0-2 0z M13.5 10.5 21 3 M16.5 11.5 20.5 7.5 M12.5 7.5 16.5 3.5';
  const crater = (owner: MapTile['owner']): MapTile[] => [
    { x: 0, y: 0, terrain: 'mountains', owner, special: { kind: 'meteorCrater' } },
    { x: 1, y: 0, terrain: 'mountains', owner: null, special: { kind: 'crystalCavern' } },
  ];

  it('B-AC-11: the map draws the crater badge, with its kind, its icon and its colour, at phone and TV density', () => {
    for (const density of ['phone', 'tv'] as const) {
      const html = renderToStaticMarkup(createElement(HoloMap, { width: 2, height: 1, tiles: crater(2), density }));
      expect(tag(html, 'special-glyph-0-0'), density).toContain('data-kind="meteorCrater"');
      const glyph = html.slice(html.indexOf('data-testid="special-glyph-0-0"'), html.indexOf('data-testid="special-glyph-1-0"'));
      expect(glyph, density).toContain(`d="${APPROVED_PATH}"`);
      expect(glyph, density).toContain('stroke="var(--color-s-meteorCrater)"');
      expect(html, density).toContain('aria-label="Mountains, Meteor crater, ');
    }
  });

  it("B-AC-11: the plot card's line names the crater and gives the engine's rating", () => {
    const html = renderToStaticMarkup(createElement(SpecialLine, { special: { kind: 'meteorCrater' } }));
    expect(html).toMatch(/^<p[^>]*data-testid="special-line"[^>]*data-kind="meteorCrater"/);
    expect(html.replace(/<[^>]+>/g, '')).toBe(
      `Meteor crater: Crystite rated ${MAP.meteorCrater.crystite}, the top of the scale. Left by a meteor; what stood here was destroyed.`,
    );
  });
});
