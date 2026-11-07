import { HoloMap, RING_INSIDE_PLOT, selectionGlow, selectionRing, smallDots, smallStrip, specialBadgeBox, type MapTile } from '@mule/ui';
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

  it('T-AC-3 (pip): the chip sits in the middle of its plot, not at its foot (a right-column special plot’s steps left), and takes no taps', () => {
    const right = renderToStaticMarkup(createElement(HoloMap, { width: 2, height: 1, tiles: [{ x: 0, y: 0, terrain: 'plains', owner: null }, { x: 1, y: 0, terrain: 'plains', owner: null, ground: { food: 3 }, special: { kind: 'oasis' } }] }));
    const centred = tag(render(PIP_TILES), /class="[^"]*\brounded-control\b/);
    const stepped = tag(right, /class="[^"]*\brounded-control\b/);
    for (const chip of [centred, stepped]) {
      expect(chip).toMatch(/\brelative\b/);
      expect(chip).not.toMatch(/\babsolute\b|\bbottom-\[|style="bottom/);
      expect(chip).toMatch(/\bpointer-events-none\b/);
    }
    expect(centred).not.toMatch(/style=/);
    expect(stepped).toMatch(/style="left:-/);
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
    const label = tag(map, /data-testid="map-plot-0-0"/).match(/aria-label="([^"]*)"/)?.[1] ?? '';
    expect(label).toContain('Food 3 of 3');
    expect(label).toContain('Crystite here');
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

describe('B-AC-9 (WS4, plot look A): no mark hides the dots of the plot above a selection', () => {
  /** A 3×3 map with plot 1-1 selected; `above` is what plot 1-0 holds, `below` what plot 1-1 holds. */
  const render = (above: Partial<MapTile>, selected = { x: 1, y: 1 }, hideGround = false, below: Partial<MapTile> = {}) => {
    const tiles: MapTile[] = [];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) tiles.push({ x, y, terrain: 'plains', owner: null, ...(x === 1 && y === 0 ? above : {}), ...(x === 1 && y === 1 ? below : {}) });
    return renderToStaticMarkup(createElement(HoloMap, { width: 3, height: 3, tiles, selected, hideGround }));
  };
  const pin = (markup: string) => tag(markup, /data-testid="selected-pin"/);
  const ring = (markup: string) => tag(markup, /data-testid="selected-ring"/);

  it('draws no pin under a plot showing its dots: the ring, outside the plot as ever, marks it alone', () => {
    const map = render({ ground: { food: 2 } });
    expect(pin(map)).toBe('');
    expect(ring(map)).toMatch(/-inset-\[6%\]/);
  });

  it('draws the pin as ever otherwise: no ground above, a MULE above, the ground hidden, the top row with no dots below', () => {
    for (const [why, map, side] of [
      ['no ground above', render({}), /\bbottom-full mb-1\b/],
      ['a MULE above', render({ ground: { food: 2 }, good: 'food' }), /\bbottom-full mb-1\b/],
      ['the ground hidden', render({ ground: { food: 2 } }, undefined, true), /\bbottom-full mb-1\b/],
      ['the top row, no ground below', render({ ground: { food: 2 } }, { x: 1, y: 0 }), /\btop-full mt-1\b/],
    ] as const) expect(pin(map), why).toMatch(side);
  });

  it('on the top row, where the pin hangs below, draws no pin over a plot below showing its dots: the inside ring marks it alone', () => {
    const map = render({}, { x: 1, y: 0 }, false, { ground: { food: 2 } });
    expect(pin(map)).toBe('');
    expect(ring(map)).toMatch(/\binset-0\b/);
  });
});

describe('B-AC-9 (WS4, plot look A): the selected ring’s outer reach stops under the dots of the plot above', () => {
  /** How far the ring paints out of its plot: its box's reach (6% of the plot when not capped), its band and its void edge. */
  const reach = (plot: number) => {
    const r = selectionRing(plot, 'phone');
    return (r.inset ?? plot * 0.06) + r.band + r.edge;
  };
  /** The phone chip's dot row ends P/2 − 6.5 px over the plot's foot; the ring stops half a pixel under that. */
  const room = (plot: number) => plot / 2 - 6.5 - 0.5;

  it('on the phone’s 24 and 25 px plots, comes in and thins to stop half a pixel under the dots (under 24 px it is drawn inside: SA-1372)', () => {
    expect(selectionRing(24, 'phone')).toEqual({ inset: 0, band: 3, edge: 2, inside: false });
    expect(selectionRing(25, 'phone')).toEqual({ inset: 0.5, band: 3, edge: 2, inside: false });
    for (const plot of [24, 25]) expect(reach(plot)).toBeLessThanOrEqual(room(plot));
  });

  it('from a 30 px plot, and on the TV, is drawn as ever: 6% out, a ninth of the plot thick, a 2 px (TV 3 px) void edge', () => {
    expect(selectionRing(30, 'phone')).toEqual({ inset: null, band: 3, edge: 2, inside: false });
    expect(reach(30)).toBeLessThanOrEqual(room(30));
    expect(selectionRing(20, 'tv')).toEqual({ inset: null, band: 2, edge: 3, inside: false });
    const map = renderToStaticMarkup(createElement(HoloMap, { width: 3, height: 3, tiles: [{ x: 1, y: 1, terrain: 'plains', owner: null }], selected: { x: 1, y: 1 } }));
    expect(tag(map, /data-testid="selected-ring"/)).toMatch(/-inset-\[6%\]/);
  });
});

describe('B-AC-9 (WS4, plot look A; PM ruling, 7 Nov): under dots the selection’s glow stops at half strength under the dots above', () => {
  /** The glow is at half strength on its spread edge, 4 px outside its box: the box's reach out plus 4. */
  const halfReach = (plot: number) => (selectionGlow(plot, 'phone') ?? plot * 0.08) + 4;
  const room = (plot: number) => plot / 2 - 6.5 - 0.5;

  it('on the 24 px and 25 px plots its box comes in so that edge stops within the ring’s room (under 24 px it is drawn inside: SA-1372)', () => {
    expect(selectionGlow(24, 'phone')).toBeCloseTo(1, 6);
    expect(selectionGlow(25, 'phone')).toBeCloseTo(1.5, 6);
    for (const plot of [24, 25]) expect(halfReach(plot)).toBeLessThanOrEqual(room(plot) + 1e-9);
  });

  it('where 8% of the plot already stops short (from 30 px), and on the TV, is not capped: 8% out, a 12 px blur, a 4 px spread', () => {
    expect(selectionGlow(30, 'phone')).toBeNull();
    expect(selectionGlow(12.8, 'tv')).toBeNull();
    const map = renderToStaticMarkup(createElement(HoloMap, { width: 3, height: 3, tiles: [{ x: 1, y: 0, terrain: 'plains', owner: null, ground: { food: 2 } }, { x: 1, y: 1, terrain: 'plains', owner: null }], selected: { x: 1, y: 1 } }));
    const glow = tag(map, /data-testid="selected-glow"/);
    expect(glow).toMatch(/-inset-\[8%\]/);
    expect(glow).toMatch(/box-shadow:0 0 12px 4px var\(--color-holo\)/);
    expect(glow).not.toMatch(/\binset:/);
  });
});

describe('B-AC-9 (WS6 ruling, 7 Nov): the phone’s small dots chip', () => {
  it('is drawn on a phone plot under 16 px, never at 16 px and over, never on the TV', () => {
    expect(smallDots(12.8, 'phone')).toBe(true);
    expect(smallDots(15.9, 'phone')).toBe(true);
    expect(smallDots(16, 'phone')).toBe(false);
    expect(smallDots(25, 'phone')).toBe(false);
    expect(smallDots(12.8, 'tv')).toBe(false);
  });

  it('at 16 px and over keeps its good’s icon over the three dots, 3 px padding, and the plot’s label names the good', () => {
    const map = renderToStaticMarkup(createElement(HoloMap, { width: 1, height: 1, tiles: [{ x: 0, y: 0, terrain: 'plains', owner: null, ground: { water: 2 } }] }));
    const chip = map.slice(map.indexOf('data-testid="map-dots-0-0"'));
    expect(tag(map, /data-testid="map-dots-0-0"/)).toMatch(/\bpx-\[3px\] py-\[2px\]/);
    expect(chip).toMatch(/^[^>]*><span[^>]*><svg/);
    expect(chip.match(/size-\[3px\]/g)).toHaveLength(3);
    expect(map).toContain('aria-label="Plains, free, Water 2 of 3"');
  });
});

describe('B-AC-9 (MG-2): the special badge is sized with the plot, so it hides none of the plot’s dots', () => {
  it('on a phone takes 36% of the plot, at most 15 px; the TV’s stays 21 px', () => {
    expect(specialBadgeBox(25, 'phone')).toBe(9);
    expect(specialBadgeBox(30, 'phone')).toBe(11);
    expect(specialBadgeBox(60, 'phone')).toBe(15);
    expect(specialBadgeBox(37, 'tv')).toBe(21);
  });

  it('in the map’s right column steps a special plot’s dots left by the badge’s hang and edge inset (2.75 + 2 px on a 30 px plot); a plain right-column plot’s stay put', () => {
    const tiles: MapTile[] = [
      { x: 2, y: 0, terrain: 'plains', owner: null, ground: { food: 3 }, special: { kind: 'oasis' } },
      { x: 2, y: 1, terrain: 'plains', owner: null, ground: { food: 3 } },
      { x: 1, y: 1, terrain: 'plains', owner: null, ground: { food: 3 }, special: { kind: 'oasis' } },
    ];
    const map = renderToStaticMarkup(createElement(HoloMap, { width: 3, height: 3, tiles }));
    const chip = (at: string) => tag(map, new RegExp(`data-testid="map-dots-${at}"`));
    expect(chip('2-0')).toMatch(/style="left:-4.75px"/);
    expect(chip('2-1')).not.toMatch(/style=/);
    expect(chip('1-1')).not.toMatch(/style=/);
  });

  it('draws the map’s badge at that size, hung by a quarter of it (the server render’s plot is 30 px)', () => {
    const map = renderToStaticMarkup(createElement(HoloMap, { width: 3, height: 3, tiles: [{ x: 1, y: 1, terrain: 'plains', owner: null, special: { kind: 'oasis' } }] }));
    const badge = map.match(/data-testid="special-glyph-1-1"[^>]*><span[^>]*style="([^"]*)"/)?.[1] ?? '';
    expect(badge).toMatch(/right:-2.75px;bottom:-2.75px;width:11px;height:11px/);
  });
});

describe('SA-1372 (WS6 ruling, 7 Nov): on a phone plot under 16 px that shows its dots, no mark meets the chip', () => {
  /** The small chip: 7 px tall (2 px padding, 3 px dots), half a pixel over the plot's foot; its dots at 3 px. */
  const chipTop = (plot: number) => plot - 0.5 - 7;

  it('lays the tab, the gem and the badge in a strip above the chip, each at least 3 px, the strip ending 1 px over the chip', () => {
    for (const plot of [12.8, 13.5, 15, 15.9]) {
      const s = smallStrip(plot, { tab: true, gems: 1, badge: true });
      expect(s, `${plot} px`).toMatchObject({ tab: true, gems: 1, badge: true });
      expect(s.size).toBeGreaterThanOrEqual(3);
      expect(s.top + s.size).toBeLessThanOrEqual(chipTop(plot) - 1 + 1e-9);
      // Three marks and the 1 px between each, inside the plot's half-pixel edges.
      expect(3 * s.size + 2).toBeLessThanOrEqual(plot - 1 + 1e-9);
    }
  });

  it('when they do not all fit at 3 px, drops the badge first, then the gem; the tab always stays', () => {
    const two = smallStrip(12.8, { tab: true, gems: 2, badge: true });
    expect(two).toMatchObject({ tab: true, gems: 2, badge: false });
    expect(two.size).toBeGreaterThanOrEqual(3);
    expect(2.5 * two.size + 1).toBeLessThanOrEqual(12.8 - 1 + 1e-9);
    const tight = smallStrip(9, { tab: true, gems: 2, badge: true });
    expect(tight).toMatchObject({ tab: true, gems: 0, badge: false });
    expect(smallStrip(12.8, { tab: false, gems: 0, badge: true })).toMatchObject({ tab: false, gems: 0, badge: true });
  });

  it('draws the chip at the plot’s foot only under 16 px; from 16 px it stays centred (ruling X)', () => {
    const at = (plot: number) => smallDots(plot, 'phone');
    expect(at(12.8)).toBe(true);
    expect(at(16)).toBe(false);
  });
});

describe('SA-1372 (WS6 ruling, 7 Nov): the selection ring never covers a neighbour’s dots', () => {
  /** The phone chip's three dots, 3 px with 1 px between, centred in the plot: their row's gap to the plot's side. */
  const sideGap = (plot: number) => (plot - 11) / 2;
  /** Outside its plot the ring paints 6% of the plot out, its band and its 2 px void edge; the glow is at half strength 8% plus 4 px out. */
  const ringReach = (plot: number) => plot * 0.06 + Math.max(2, Math.round(plot / 9)) + 2;
  const glowReach = (plot: number) => plot * 0.08 + 4;

  it(`is drawn inside its plot under ${RING_INSIDE_PLOT} px on a phone, the size measured where a ring or glow outside would reach a side neighbour’s dots`, () => {
    expect(RING_INSIDE_PLOT).toBe(24);
    for (const plot of [12.8, 15, 16, 19, 20, 23.9]) expect(selectionRing(plot, 'phone').inside, `${plot} px`).toBe(true);
    for (let plot = RING_INSIDE_PLOT; plot <= 60; plot += 0.05) {
      expect(selectionRing(plot, 'phone').inside, `${plot} px`).toBe(false);
      expect(ringReach(plot), `ring at ${plot} px`).toBeLessThanOrEqual(sideGap(plot) + 1e-9);
      expect(glowReach(plot), `glow at ${plot} px`).toBeLessThanOrEqual(sideGap(plot) + 1e-9);
    }
    // Just under it, a ring outside would reach them: the threshold is the measurement, not a choice.
    expect(ringReach(23.8)).toBeGreaterThan(sideGap(23.8));
    expect(selectionRing(20, 'tv').inside).toBe(false);
  });
});
