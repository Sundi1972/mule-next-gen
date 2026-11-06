import { HoloMap, type MapTile } from '@mule/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

/**
 * A 4×3 map seen by player 1: their plot at 0-1 carries a flag over an installed good; player 2's selected plot at 1-1
 * carries every other mark (haze, tint, tab, disc with its +N, flag, special glyph); player 2's 2-1 carries ground pips,
 * which only a plot with nothing installed shows.
 */
const TILES: MapTile[] = [
  { x: 0, y: 0, terrain: 'plains', owner: null },
  { x: 1, y: 0, terrain: 'plains', owner: null },
  { x: 2, y: 0, terrain: 'plains', owner: null },
  { x: 3, y: 0, terrain: 'plains', owner: null },
  { x: 0, y: 1, terrain: 'plains', owner: 0, good: 'food', flag: 'sale' },
  { x: 1, y: 1, terrain: 'plains', owner: 1, good: 'energy', output: 3, flag: 'sabotage', pollution: 2, special: { kind: 'oasis' } },
  { x: 2, y: 1, terrain: 'plains', owner: 1, ground: { food: 3 } },
  { x: 3, y: 1, terrain: 'plains', owner: null },
  { x: 0, y: 2, terrain: 'plains', owner: null },
  { x: 1, y: 2, terrain: 'plains', owner: null },
  { x: 2, y: 2, terrain: 'plains', owner: null },
  { x: 3, y: 2, terrain: 'plains', owner: null },
];
const html = renderToStaticMarkup(createElement(HoloMap, { width: 4, height: 3, tiles: TILES, focusSlot: 0, selected: { x: 1, y: 1 }, showOutput: true }));

/** One plot's markup: from its opening tag to the next plot's. */
function plot(at: string): string {
  const start = html.indexOf(`data-testid="map-plot-${at}"`);
  const next = html.indexOf('data-testid="map-plot-', start + 1);
  return html.slice(html.lastIndexOf('<', start), next < 0 ? undefined : html.lastIndexOf('<', next));
}
/** The opening tag of the first element in `markup` that `pattern` matches inside its tag. */
const tag = (markup: string, pattern: RegExp) => markup.match(new RegExp(`<[a-z]+[^>]*${pattern.source}[^>]*>`))?.[0] ?? '';
/** The opening tag of the element whose text is `text`. */
const tagOfText = (markup: string, text: string) => markup.match(new RegExp(`(<[a-z]+[^>]*>)${text}<`))?.[1] ?? '';
const z = (opening: string) => Number(opening.match(/\bz-\[(\d+)\]/)?.[1] ?? 0);
const FADE = /\bopacity-45\b/;

describe('B-AC-9 (WS4, plot look A): the layers WS6 ruled', () => {
  it('draws a flag above the owner’s tab and the disc: a z at least the tab’s, after it in paint order', () => {
    const own = plot('0-1');
    const tab = tag(own, /data-testid="owner-0-1"/);
    const flag = tagOfText(own, 'SALE');
    expect(tab).not.toBe('');
    expect(flag).not.toBe('');
    expect(z(flag)).toBeGreaterThanOrEqual(z(tab));
    expect(z(flag)).toBeGreaterThan(z(tag(own, /data-testid="installed-0-1"/)));
    expect(own.indexOf(flag)).toBeGreaterThan(own.indexOf(tab));
  });

  it('fades every mark of another player’s plot, never the plot itself or its selection', () => {
    const theirs = plot('1-1');
    const marks = {
      tile: tag(theirs, /data-testid="map-plot-1-1"/),
      haze: tag(theirs, /style="background:radial-gradient/),
      tint: tag(theirs, /style="box-shadow:inset/),
      tab: tag(theirs, /data-testid="owner-1-1"/),
      disc: tag(theirs, /data-testid="installed-1-1"/),
      flag: tagOfText(theirs, 'OFF'),
      glyph: tag(theirs, /data-testid="special-glyph-1-1"/),
      pips: tag(plot('2-1'), /class="[^"]*\brounded-control\b/),
      glow: tag(theirs, /\banimate-pulse\b/),
      ring: tag(theirs, /data-testid="selected-ring"/),
      pin: tag(theirs, /data-testid="selected-pin"/),
    };
    for (const [name, opening] of Object.entries(marks)) expect(opening, `${name} is drawn`).not.toBe('');
    // The +N rides on the disc, so the disc's fade carries it.
    expect(theirs.slice(theirs.indexOf(marks.disc))).toMatch(/^<span[^>]*>(<svg.*?<\/svg>)<span data-num/);
    for (const name of ['haze', 'tint', 'tab', 'disc', 'flag', 'glyph', 'pips'] as const) expect(marks[name], `the ${name} fades`).toMatch(FADE);
    for (const name of ['tile', 'glow', 'ring', 'pin'] as const) expect(marks[name], `the ${name} does not fade`).not.toMatch(/\bopacity-/);
  });
});

describe('T-AC-3 (pip): an analysed plot draws its best good on 3 dots', () => {
  /** A 2×1 map: an analysed free plot whose Water and Food tie at 2 dots, and an unanalysed one. */
  const PIP_TILES: MapTile[] = [
    { x: 0, y: 0, terrain: 'plains', owner: null, ground: { water: 2, food: 2, crystite: 1 } },
    { x: 1, y: 0, terrain: 'plains', owner: null },
  ];
  const render = (tiles: MapTile[]) => renderToStaticMarkup(createElement(HoloMap, { width: 2, height: 1, tiles }));
  const pips = (markup: string) => markup.match(/<span class="rounded-full size-\[3px\]" style="background:[^"]*"><\/span>/g) ?? [];

  it('T-AC-3 (pip): the tie goes to Food, drawn as 3 pips with 2 lit and labelled "Food 2 of 3"', () => {
    const map = render(PIP_TILES);
    const analysed = map.slice(map.indexOf('data-testid="map-plot-0-0"'), map.indexOf('data-testid="map-plot-1-0"'));
    expect(map).toContain('aria-label="Plains, free, Food 2 of 3, Crystite here"');
    expect(pips(analysed)).toHaveLength(3);
    expect(pips(analysed).filter((p) => p.includes('var(--color-g-food)'))).toHaveLength(2);
    expect(analysed).not.toContain('--color-g-water');
  });

  it('T-AC-3 (pip): the chip sits at the foot of the plot, centred, as the mock draws it', () => {
    const chip = tag(render(PIP_TILES), /class="[^"]*\brounded-control\b/);
    expect(chip).toMatch(/\babsolute\b/);
    expect(chip).toMatch(/\bbottom-\[8%\]/);
    expect(chip).toMatch(/\bleft-1\/2\b/);
    expect(chip).toMatch(/ -translate-x-1\/2\b/);
  });

  it('T-AC-3 (pip): a plot without ground, as every plot on the TV, draws no pip and names no dots', () => {
    const tv = render(PIP_TILES.map(({ ground: _, ...t }) => t));
    expect(pips(tv)).toHaveLength(0);
    expect(tv).not.toMatch(/ of 3"/);
    const unanalysed = render(PIP_TILES).split('data-testid="map-plot-1-0"')[1]!;
    expect(pips(unanalysed)).toHaveLength(0);
  });

  it('T-AC-3 (pip): the TV names a second good only when it has a dot; a barren plot still shows its best at 0', () => {
    const tv = (ground: MapTile['ground']) =>
      renderToStaticMarkup(createElement(HoloMap, { width: 1, height: 1, density: 'tv', tiles: [{ x: 0, y: 0, terrain: 'plains', owner: null, ground }] }));
    expect(tv({ food: 2, crystite: 0 })).toContain('aria-label="Plains, free, Food 2 of 3"');
    expect(tv({ food: 2, crystite: 0 })).not.toContain('Crystite');
    expect(tv({ food: 2, water: 1 })).toContain('aria-label="Plains, free, Food 2 of 3, Water 1 of 3"');
    expect(tv({ food: 0, water: 0 })).toContain('aria-label="Plains, free, Food 0 of 3"');
  });
});

describe('T-AC-3 (gem): Crystite and Rare earth found on a plot', () => {
  /** A 5×1 map: free with Crystite; player 1's with both; player 2's with a MULE and Rare earth; free with neither; free with both. */
  const GEM_TILES: MapTile[] = [
    { x: 0, y: 0, terrain: 'plains', owner: null, ground: { crystite: 2, food: 3 } },
    { x: 1, y: 0, terrain: 'plains', owner: 0, ground: { crystite: 1, rareEarth: 2 } },
    { x: 2, y: 0, terrain: 'plains', owner: 1, good: 'energy', ground: { rareEarth: 1, food: 3 } },
    { x: 3, y: 0, terrain: 'plains', owner: null, ground: { crystite: 0, rareEarth: 0, food: 2 } },
    { x: 4, y: 0, terrain: 'plains', owner: null, ground: { crystite: 3, rareEarth: 3 } },
  ];
  const render = (tiles: MapTile[], hideGround = false) => renderToStaticMarkup(createElement(HoloMap, { width: 5, height: 1, tiles, hideGround }));
  const plotOf = (markup: string, x: number) => markup.slice(markup.indexOf(`data-testid="map-plot-${x}-0"`), x < 4 ? markup.indexOf(`data-testid="map-plot-${x + 1}-0"`) : undefined);
  const gem = (markup: string, good: string) => tag(markup, new RegExp(`data-testid="gem-${good}"`));
  const row = (markup: string, x: number) => tag(markup, new RegExp(`data-testid="map-gem-${x}-0"`));
  const width = (opening: string) => opening.match(/width:(\d+)%/)?.[1];

  it('T-AC-3 (gem): a tile with ground and Crystite or Rare earth at 1 or more draws its gem(s), right of the owner’s tab on an owned plot, at left 4% on a free one; with a MULE the gem stays and the pip hides; a tile without ground (the TV) draws none', () => {
    const map = render(GEM_TILES);

    const free = plotOf(map, 0);
    expect(row(free, 0)).toMatch(/\bleft-\[4%\]/);
    expect(row(free, 0)).toMatch(/\btop-\[4%\]/);
    expect(gem(free, 'crystite')).toMatch(/background:var\(--color-g-crystite\)/);
    expect(width(gem(free, 'crystite'))).toBe('40');
    expect(gem(free, 'rareEarth')).toBe('');

    const ownedPair = plotOf(map, 1);
    expect(row(ownedPair, 1)).toMatch(/\bleft-\[54%\]/);
    expect(width(gem(ownedPair, 'crystite'))).toBe('30');
    expect(width(gem(ownedPair, 'rareEarth'))).toBe('30');
    expect(gem(ownedPair, 'rareEarth')).toMatch(/margin-left:-15%/);

    const withMule = plotOf(map, 2);
    expect(tag(withMule, /data-testid="installed-2-0"/)).not.toBe('');
    expect(width(gem(withMule, 'rareEarth'))).toBe('40');
    expect(row(withMule, 2)).toMatch(/\bleft-\[54%\]/);
    expect(withMule).not.toMatch(/size-\[3px\]/);

    const barren = plotOf(map, 3);
    expect(barren).not.toMatch(/data-testid="(map-)?gem-/);

    const freePair = plotOf(map, 4);
    expect(row(freePair, 4)).toMatch(/\bleft-\[4%\]/);
    expect(width(gem(freePair, 'crystite'))).toBe('40');
    expect(width(gem(freePair, 'rareEarth'))).toBe('40');
    expect(gem(freePair, 'rareEarth')).toMatch(/margin-left:-20%/);

    const tv = render(GEM_TILES.map(({ ground: _, ...t }) => t));
    expect(tv).not.toMatch(/data-testid="(map-)?gem-/);
    expect(render(GEM_TILES, true)).not.toMatch(/data-testid="(map-)?gem-/);
  });

  it('T-AC-3 (gem): a colony building’s plot shows the building, not its ground: no gem and no pip', () => {
    const park = { kind: 'park', name: 'Park', stage: 'standing', buildMonths: 1 } as const;
    const map = render([{ x: 0, y: 0, terrain: 'plains', owner: null, ground: { crystite: 2, food: 3 }, object: park }]);
    expect(map).toContain('data-testid="plot-object-0-0"');
    expect(map).not.toMatch(/data-testid="(map-)?gem-/);
    expect(map).not.toMatch(/\brounded-control\b/);
  });

  it('T-AC-3 (gem): the plot’s label names its gems, "Crystite here", and none without ground or under hideGround', () => {
    const label = (markup: string, x: number) => tag(markup, new RegExp(`data-testid="map-plot-${x}-0"`)).match(/aria-label="([^"]*)"/)?.[1] ?? '';
    const map = render(GEM_TILES);
    expect(label(map, 0)).toBe('Plains, free, Food 3 of 3, Crystite here');
    expect(label(map, 1)).toMatch(/, Crystite here, Rare earth here$/);
    expect(label(map, 3)).not.toMatch(/ here\b/);
    expect(render(GEM_TILES.map(({ ground: _, ...t }) => t))).not.toMatch(/ here"/);
    expect(render(GEM_TILES, true)).not.toMatch(/ here"/);
  });

  it('T-AC-3 (gem): a gem carries no title, which a pointer-events-none mark never shows', () => {
    const map = render(GEM_TILES);
    for (const good of ['crystite', 'rareEarth']) {
      expect(gem(map, good)).not.toBe('');
      expect(gem(map, good)).not.toMatch(/\btitle=/);
    }
  });
});
