import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ColonyGrounds, type GroundsColony, type GroundsManifest, type PictureStage } from '../src/index';

const FRAME: GroundsManifest['frame'] = { width: 1600, height: 1600, place: 1293, centre: [800, 1000] };
const ALL: PictureStage[] = ['site', 'build1', 'build2', 'standing', 'closed', 'damaged'];

function manifestOf(kinds: Record<string, PictureStage[]>): GroundsManifest {
  const pictures: GroundsManifest['pictures'] = {};
  for (const [kind, stages] of Object.entries(kinds)) {
    pictures[kind] = Object.fromEntries(stages.map((s) => [s, { day: `${kind}/${s}-day@800.webp`, dusk: `${kind}/${s}-dusk@800.webp`, glow: null }]));
  }
  return { frame: FRAME, pictures, sizes: [800, 400] };
}

const MANIFEST = manifestOf({ hall: ['standing'], park: ALL, hospital: ALL, stadium: ALL, spaceport: ALL });

/** Month 12 (spec B-AC-1): a Park standing, a Hospital closed, a Stadium with 1 of 3 months left, a Spaceport just commissioned. */
const MONTH_12: GroundsColony = {
  gauges: { happiness: 72 },
  projects: [
    { id: 'park', name: 'Park', stage: 'standing', buildMonths: 1, monthsLeft: null, slot: 0 },
    { id: 'hospital', name: 'Hospital', stage: 'closed', buildMonths: 2, monthsLeft: null, slot: 1 },
    { id: 'stadium', name: 'Stadium', stage: 'building', buildMonths: 3, monthsLeft: 1, slot: 2 },
    { id: 'spaceport', name: 'Spaceport upgrade', stage: 'commissioned', buildMonths: 3, monthsLeft: null, slot: 3 },
  ],
};

/**
 * Each place's centre in the scene: a place is 120 units wide in a 2:1 projection, the hall at the origin, and the
 * growth order puts slots 0–3 at (col, row) (1,0), (0,1), (1,1), (-1,0).
 */
const PLACE_CENTRE: Record<string, [number, number]> = { hall: [0, 0], 1: [60, 30], 2: [-60, 30], 3: [0, 60], 4: [-60, -30] };
const PLACE_WIDTH = 120;

const grounds = (props: Partial<Parameters<typeof ColonyGrounds>[0]> = {}) => renderToStaticMarkup(<ColonyGrounds colony={MONTH_12} size="tv" manifest={MANIFEST} {...props} />);

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

/** The picture's box in scene units, and the scene point its frame's centre pixel lands on. */
function placed(tag: string, frame: GroundsManifest['frame']) {
  const [x, y, width, height] = ['x', 'y', 'width', 'height'].map((a) => Number(attrOf(tag, a)));
  const k = width! / frame.width;
  return { width: width!, height: height!, anchor: [x! + frame.centre[0] * k, y! + frame.centre[1] * k] as [number, number] };
}

function expectAt(tag: string, place: string, frame = FRAME) {
  const { width, height, anchor } = placed(tag, frame);
  const k = PLACE_WIDTH / frame.place;
  expect(width).toBeCloseTo(frame.width * k, 3);
  expect(height).toBeCloseTo(frame.height * k, 3);
  expect(anchor[0]).toBeCloseTo(PLACE_CENTRE[place]![0], 3);
  expect(anchor[1]).toBeCloseTo(PLACE_CENTRE[place]![1], 3);
}

/** The words over a place: its number, then its stage chip if it has one. */
function calloutText(html: string, n: number): string {
  const m = html.match(new RegExp(`<foreignObject[^>]*data-testid="callout-${n}"[^>]*>(.*?)</foreignObject>`));
  expect(m, `callout-${n}`).not.toBeNull();
  return m![1]!.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

describe('ColonyGrounds · the colony drawn from its view', () => {
  it("B-AC-1: month-12 colony shows each stage's picture at its slot", () => {
    const html = grounds();

    const park = tagWith(html, 'data-testid="picture-1"');
    expect(attrOf(park, 'href')).toBe('/art/colony/park/standing-day@800.webp');
    expectAt(park, '1');
    expect(calloutText(html, 1)).toBe('1');

    const hospital = tagWith(html, 'data-testid="picture-2"');
    expect(attrOf(hospital, 'href')).toBe('/art/colony/hospital/closed-day@800.webp');
    expectAt(hospital, '2');
    expect(calloutText(html, 2)).toBe('2 SHUT');

    const stadium = tagWith(html, 'data-testid="picture-3"');
    expect(attrOf(stadium, 'href')).toBe('/art/colony/stadium/build2-day@800.webp');
    expectAt(stadium, '3');
    expect(calloutText(html, 3)).toBe('3 2/3');

    const hall = tagWith(html, 'data-testid="picture-hall"');
    expect(attrOf(hall, 'href')).toBe('/art/colony/hall/standing-day@800.webp');
    expectAt(hall, 'hall');

    expect(tagsWith(html, 'data-testid="shape-[^"]*"'), 'no fallback shapes with a full manifest').toHaveLength(0);
  });

  it('B-AC-1 negative: a commissioned project shows its site, never the standing building', () => {
    const html = grounds();
    const spaceport = tagWith(html, 'data-testid="picture-4"');
    expect(attrOf(spaceport, 'href')).toBe('/art/colony/spaceport/site-day@800.webp');
    expectAt(spaceport, '4');
    expect(calloutText(html, 4)).toBe('4 SITE');
    expect(html).not.toContain('spaceport/standing');
  });

  it("B-AC-1 (AM-1): a kind with its own tall frame sits at its slot by its own centre", () => {
    const tall: GroundsManifest['frame'] = { width: 1600, height: 3200, place: 1293, centre: [800, 2600] };
    const manifest = manifestOf({ hall: ['standing'], park: ALL, hospital: ALL, stadium: ALL, spaceport: ALL });
    manifest.pictures.spaceport = { ...manifest.pictures.spaceport, frame: tall };
    const html = grounds({ manifest });
    expectAt(tagWith(html, 'data-testid="picture-4"'), '4', tall);
    expectAt(tagWith(html, 'data-testid="picture-1"'), '1');
  });

  it('B-AC-1: at dusk each place shows its dusk picture', () => {
    const html = grounds({ light: 'dusk' });
    expect(attrOf(tagWith(html, 'data-testid="picture-1"'), 'href')).toBe('/art/colony/park/standing-dusk@800.webp');
  });

  it('B-AC-1: the grounds are as big as the highest slot needs, with the next free place outlined', () => {
    const html = grounds();
    expect(attrOf(tagWith(html, 'data-testid="colony-grounds"'), 'data-extent')).toBe('1');
    expect(tagsWith(html, 'data-testid="next-place"')).toHaveLength(1);
    const far = { ...MONTH_12, projects: [{ id: 'park' as const, name: 'Park', stage: 'standing' as const, buildMonths: 1, monthsLeft: null, slot: 8 }] };
    expect(attrOf(tagWith(grounds({ colony: far }), 'data-testid="colony-grounds"'), 'data-extent')).toBe('2');
  });

  it('B-AC-4: a missing picture falls back to the SVG shape', () => {
    const html = grounds({ manifest: manifestOf({ hall: ['standing'], park: ALL, stadium: ALL, spaceport: ALL }) });
    expect(tagsWith(html, 'data-testid="picture-2"'), 'no hospital picture').toHaveLength(0);
    const shape = tagWith(html, 'data-testid="shape-2"');
    expect(attrOf(shape, 'data-stage')).toBe('closed');
    expect(html.match(/data-testid="shape-2"[^>]*>(.*?)<\/g>/)?.[1], 'the shape draws something').toMatch(/<polygon /);
    expect(calloutText(html, 2)).toBe('2 SHUT');
    expect(tagsWith(html, 'data-testid="picture-1"'), 'the others keep their pictures').toHaveLength(1);
  });

  it('B-AC-4: no manifest at all draws every place, the hall too, as its shape', () => {
    const html = grounds({ manifest: null });
    expect(tagsWith(html, '<image')).toHaveLength(0);
    for (const n of ['hall', '1', '2', '3', '4']) expect(tagsWith(html, `data-testid="shape-${n}"`), `shape-${n}`).toHaveLength(1);
    expect(tagsWith(html, 'data-testid="scaffold"'), 'the stadium is shown being built').toHaveLength(1);
    expect(tagsWith(html, 'data-testid="site"'), 'the spaceport is shown as a site').toHaveLength(1);
  });

  it('HC-2: a phone gets the 400 px pictures', () => {
    const html = grounds({ size: 'phone' });
    expect(attrOf(tagWith(html, 'data-testid="picture-1"'), 'href')).toBe('/art/colony/park/standing-day@400.webp');
  });
});
