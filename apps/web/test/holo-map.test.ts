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
    expect(map).toContain('aria-label="Plains, free, Food 2 of 3"');
    expect(pips(analysed)).toHaveLength(3);
    expect(pips(analysed).filter((p) => p.includes('var(--color-g-food)'))).toHaveLength(2);
    expect(analysed).not.toContain('--color-g-water');
  });

  it('T-AC-3 (pip): a plot without ground, as every plot on the TV, draws no pip and names no dots', () => {
    const tv = render(PIP_TILES.map(({ ground: _, ...t }) => t));
    expect(pips(tv)).toHaveLength(0);
    expect(tv).not.toMatch(/ of 3"/);
    const unanalysed = render(PIP_TILES).split('data-testid="map-plot-1-0"')[1]!;
    expect(pips(unanalysed)).toHaveLength(0);
  });
});
