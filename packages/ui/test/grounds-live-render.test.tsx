import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ColonyGrounds, type GroundsColony, type GroundsManifest, type PictureStage } from '../src/index';
import type { GridPlace } from '../src/grounds/layout';
import { walkerAt, walkRoute } from '../src/grounds/walks';

const FRAME: GroundsManifest['frame'] = { width: 1600, height: 1600, place: 1293, centre: [800, 1000] };
const ALL: PictureStage[] = ['site', 'build1', 'build2', 'standing', 'closed', 'damaged'];

/** Every stage has a glow picture, closed too, so a dark closed building is the rule's doing and not a missing file. */
function manifestOf(kinds: Record<string, PictureStage[]>): GroundsManifest {
  const pictures: GroundsManifest['pictures'] = {};
  for (const [kind, stages] of Object.entries(kinds)) {
    pictures[kind] = Object.fromEntries(stages.map((s) => [s, { day: `${kind}/${s}-day@800.webp`, dusk: `${kind}/${s}-dusk@800.webp`, glow: `${kind}/${s}-glow@800.webp` }]));
  }
  return { frame: FRAME, pictures, sizes: [800, 400] };
}

const MANIFEST = manifestOf({ hall: ['standing'], park: ALL, hospital: ALL, stadium: ALL, spaceport: ALL, observatory: ALL });

/** Month 12 (spec B-AC-1): a Park standing, a Hospital closed, a Stadium with 1 of 3 months left, a Spaceport just commissioned. */
const MONTH_12: GroundsColony = {
  gauges: { happiness: 72, wealth: 0 },
  projects: [
    { id: 'park', name: 'Park', stage: 'standing', buildMonths: 1, monthsLeft: null, place: { x: 3, y: 2, w: 1, h: 1 } },
    { id: 'hospital', name: 'Hospital', stage: 'closed', buildMonths: 2, monthsLeft: null, place: { x: 2, y: 3, w: 1, h: 1 } },
    { id: 'stadium', name: 'Stadium', stage: 'building', buildMonths: 3, monthsLeft: 1, place: { x: 3, y: 3, w: 1, h: 1 } },
    { id: 'spaceport', name: 'Spaceport upgrade', stage: 'commissioned', buildMonths: 3, monthsLeft: null, place: { x: 1, y: 2, w: 1, h: 1 } },
  ],
};

const atWealth = (wealth: number): GroundsColony => ({ ...MONTH_12, gauges: { ...MONTH_12.gauges, wealth } });

/** Five buildings standing round the hall (spec B-AC-3's negative: happiness 72 → 9 walkers). */
const FIVE_STANDING: GroundsColony = {
  gauges: { happiness: 72, wealth: 2000 },
  projects: (
    [
      ['park', { x: 3, y: 2 }],
      ['hospital', { x: 2, y: 3 }],
      ['stadium', { x: 3, y: 3 }],
      ['spaceport', { x: 1, y: 2 }],
      ['observatory', { x: 2, y: 1 }],
    ] as const
  ).map(([id, at]) => ({ id, name: id, stage: 'standing' as const, buildMonths: 1, monthsLeft: null, place: { ...at, w: 1, h: 1 } })),
};

/**
 * RULE-32b's example: the Spaceport's 2×2 at (2,0) and the Stadium's at (3,2), whose centre lines are the gaps a 1×1
 * colony walks; three 1×1 places round them. Happiness 100 with five standing: 12 walkers.
 */
const BLOCKS: [GroundsColony['projects'][number]['id'], GridPlace][] = [
  ['spaceport', { x: 2, y: 0, w: 2, h: 2 }],
  ['stadium', { x: 3, y: 2, w: 2, h: 2 }],
  ['park', { x: 1, y: 1, w: 1, h: 1 }],
  ['hospital', { x: 1, y: 3, w: 1, h: 1 }],
  ['observatory', { x: 2, y: 4, w: 1, h: 1 }],
];
const LARGE: GroundsColony = {
  gauges: { happiness: 100, wealth: 2000 },
  projects: BLOCKS.map(([id, place]) => ({ id, name: id, stage: 'standing' as const, buildMonths: 1, monthsLeft: null, place })),
};
/** LARGE reaches ring 2, so its paths run out to the land's edge path, 0.85 of a place past it. */
const LARGE_RIM = 2 + 0.85;

/** Whether a spot, in place units from the hall, lies inside a block's footprint, its edges (the paths) excluded. */
function inside([c, r]: [number, number], { x, y, w, h }: GridPlace, margin = 1e-9): boolean {
  return c > x - 2.5 + margin && c < x + w - 2.5 - margin && r > y - 2.5 + margin && r < y + h - 2.5 - margin;
}

/** Each walker's spot on the ground, read back from where the SVG draws its feet (the projection's inverse). */
function walkerSpots(html: string): [number, number][] {
  return [...html.matchAll(/<g transform="translate\(([-\d.]+) ([-\d.]+)\)[^"]*" data-testid="walker"/g)].map((m) => {
    const [x, y] = [Number(m[1]), Number(m[2])];
    const [cMinusR, cPlusR] = [(2 * x) / 120, (4 * y) / 120];
    return [(cPlusR + cMinusR) / 2, (cPlusR - cMinusR) / 2];
  });
}

const grounds = (props: Partial<Parameters<typeof ColonyGrounds>[0]> = {}) => renderToStaticMarkup(<ColonyGrounds colony={MONTH_12} size="tv" manifest={MANIFEST} light="dusk" {...props} />);

function tagsWith(html: string, attr: string): string[] {
  return html.match(new RegExp(`<[a-zA-Z]+[^>]*\\s${attr}[^>]*>`, 'g')) ?? [];
}

function tagWith(html: string, attr: string): string {
  const tags = tagsWith(html, attr);
  expect(tags, `one element with ${attr}`).toHaveLength(1);
  return tags[0]!;
}

function attrOf(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
}

/** The glow picture's opacity over a place, as drawn. */
const glowOf = (html: string, place: string) => Number(attrOf(tagWith(html, `data-testid="glow-${place}"`), 'opacity'));

const walkersIn = (html: string) => tagsWith(html, 'data-testid="walker"');

describe('ColonyGrounds · the live layer', () => {
  it('B-AC-2: lights dim to full by wealth; closed stays dark; none by day', () => {
    const poor = grounds({ colony: atWealth(0) });
    const middling = grounds({ colony: atWealth(2000) });
    const rich = grounds({ colony: atWealth(4000) });

    // The standing Park and the hall: dim, brighter, full.
    for (const place of ['1', 'hall']) {
      expect(glowOf(poor, place), `${place} poor`).toBeCloseTo(0.25, 6);
      expect(glowOf(middling, place), `${place} middling`).toBeCloseTo(0.625, 6);
      expect(glowOf(rich, place), `${place} rich`).toBeCloseTo(1, 6);
    }
    // The glow is the Park's own glow picture, laid exactly over its picture.
    const glow = tagWith(rich, 'data-testid="glow-1"');
    const picture = tagWith(rich, 'data-testid="picture-1"');
    expect(attrOf(glow, 'href')).toBe('/art/colony/park/standing-glow@800.webp');
    for (const a of ['x', 'y', 'width', 'height']) expect(attrOf(glow, a), a).toBe(attrOf(picture, a));
    // Work lights on the Stadium being built, a few lamps on the Spaceport's site.
    expect(glowOf(rich, '3')).toBeCloseTo(0.5, 6);
    expect(glowOf(rich, '4')).toBeCloseTo(0.3, 6);
    // The closed Hospital stays dark, however rich the colony.
    for (const html of [poor, rich]) expect(tagsWith(html, 'data-testid="glow-2"'), 'no glow over the closed Hospital').toHaveLength(0);
  });

  it('B-AC-2 negative: by day no glow shows, however rich the colony', () => {
    const html = grounds({ colony: atWealth(4000), light: 'day' });
    expect(tagsWith(html, 'data-testid="glow-[^"]*"')).toHaveLength(0);
    expect(html).not.toContain('-glow@');
  });

  it('B-AC-3: a strike empties the paths', () => {
    const html = grounds({ colony: { ...FIVE_STANDING, strike: { paid: false } } });
    expect(walkersIn(html)).toHaveLength(0);
  });

  it('B-AC-3 negative: happiness 72, five standing, no strike → 9 colonists walk; a strike the fund paid is over', () => {
    expect(walkersIn(grounds({ colony: { ...FIVE_STANDING, strike: null } }))).toHaveLength(9);
    expect(walkersIn(grounds({ colony: { ...FIVE_STANDING, strike: { paid: true } } }))).toHaveLength(9);
  });

  it('B-AC-3: colonists walk only the paths between places, never across a footprint, 2×2 blocks included', () => {
    const blocks = BLOCKS.map(([, place]) => place);
    // As drawn: every walker's feet on a path, read back from the SVG.
    const drawn = walkerSpots(grounds({ colony: LARGE }));
    expect(drawn).toHaveLength(12);
    for (const spot of drawn) for (const b of blocks) expect(inside(spot, b, 0.01), `walker at ${spot} inside ${JSON.stringify(b)}`).toBe(false);
    // And all the way round each walk, not just the frame the page opens on.
    for (let i = 0; i < 14; i++) {
      const route = walkRoute(i, LARGE_RIM, blocks);
      for (let seconds = 0; seconds < 60; seconds += 0.25) {
        const spot = walkerAt(i, seconds, route);
        for (const b of blocks) expect(inside(spot, b), `walker ${i} at ${seconds}s, ${spot}, inside ${JSON.stringify(b)}`).toBe(false);
      }
    }
  });

  it('B-AC-3: a colonist behind a building is drawn before it, and one in front after it (painter\'s order)', () => {
    const html = grounds({ colony: LARGE });
    // Depth from the camera in the south-east is col + row: the hall's is 0, a block's is its centre's.
    const buildings = [
      { at: html.indexOf('data-testid="picture-hall"'), depth: 0 },
      ...BLOCKS.map(([, { x, y, w, h }], k) => ({ at: html.indexOf(`data-testid="picture-${k + 1}"`), depth: x + (w - 1) / 2 - 2 + (y + (h - 1) / 2 - 2) })),
    ];
    for (const b of buildings) expect(b.at, 'every building drawn as a picture').toBeGreaterThan(-1);
    const walkers = [...html.matchAll(/data-testid="walker"/g)].map((m) => m.index!);
    const spots = walkerSpots(html);
    expect(walkers).toHaveLength(12);

    let behind = 0;
    let before = 0;
    walkers.forEach((at, i) => {
      const depth = spots[i]![0] + spots[i]![1];
      for (const b of buildings) {
        if (depth < b.depth - 0.01) {
          behind++;
          expect(at, `walker ${i} (depth ${depth}) behind a building at depth ${b.depth}`).toBeLessThan(b.at);
        } else if (depth > b.depth + 0.01) {
          before++;
          expect(at, `walker ${i} (depth ${depth}) in front of a building at depth ${b.depth}`).toBeGreaterThan(b.at);
        }
      }
    });
    expect(behind, 'some walker is behind some building').toBeGreaterThan(0);
    expect(before, 'some walker is in front of some building').toBeGreaterThan(0);
  });
});
