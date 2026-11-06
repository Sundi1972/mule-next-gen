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
    { id: 'park', name: 'Park', stage: 'standing', buildMonths: 1, monthsLeft: null, place: { x: 3, y: 2, w: 1, h: 1 } },
    { id: 'hospital', name: 'Hospital', stage: 'closed', buildMonths: 2, monthsLeft: null, place: { x: 2, y: 3, w: 1, h: 1 } },
    { id: 'stadium', name: 'Stadium', stage: 'building', buildMonths: 3, monthsLeft: 1, place: { x: 3, y: 3, w: 1, h: 1 } },
    { id: 'spaceport', name: 'Spaceport upgrade', stage: 'commissioned', buildMonths: 3, monthsLeft: null, place: { x: 1, y: 2, w: 1, h: 1 } },
  ],
};

/**
 * Each project's centre in the scene: a grounds cell is 120 units wide in a 2:1 projection, the hall's cell (2,2) at the
 * origin, x running down-right and y down-left on screen (the camera looks from the south-east).
 */
const PLACE_CENTRE: Record<string, [number, number]> = { hall: [0, 0], 1: [60, 30], 2: [-60, 30], 3: [0, 60], 4: [-60, -30] };
const PLACE_WIDTH = 120;
/** A 2×2 block anchored at (3,2) covers cells (3..4, 2..3): its centre is 1.5 cells east and 0.5 south of the hall. */
const BLOCK = { x: 3, y: 2, w: 2, h: 2 };
const BLOCK_CENTRE: [number, number] = [(1.5 - 0.5) * 60, (1.5 + 0.5) * 30];

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

function expectAt(tag: string, place: string | [number, number], frame = FRAME) {
  const { width, height, anchor } = placed(tag, frame);
  const centre = typeof place === 'string' ? PLACE_CENTRE[place]! : place;
  const k = PLACE_WIDTH / frame.place;
  expect(width).toBeCloseTo(frame.width * k, 3);
  expect(height).toBeCloseTo(frame.height * k, 3);
  expect(anchor[0]).toBeCloseTo(centre[0], 3);
  expect(anchor[1]).toBeCloseTo(centre[1], 3);
}

/** The scale and offset of a `matrix(s 0 0 s tx ty)` transform on a tag; none is the identity. */
function scaleOf(tag: string): { s: number; tx: number; ty: number } {
  const m = attrOf(tag, 'transform')?.match(/^matrix\(([-\d.e]+) 0 0 \1 ([-\d.e]+) ([-\d.e]+)\)$/);
  return m ? { s: Number(m[1]), tx: Number(m[2]), ty: Number(m[3]) } : { s: 1, tx: 0, ty: 0 };
}

/** The staked site's corners as drawn on screen, after the shape's own transform. */
function siteCorners(html: string, shapeId: string): [number, number][] {
  const shape = tagWith(html, `data-testid="${shapeId}"`);
  const { s, tx, ty } = scaleOf(shape);
  const after = html.slice(html.indexOf(shape));
  const points = attrOf(after.match(/<polygon[^>]*>/)![0], 'points')!;
  return points.split(' ').map((p) => p.split(',').map(Number) as [number, number]).map(([x, y]) => [s * x + tx, s * y + ty]);
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

  it("B-AC-1 (AM-1): a kind with its own tall frame sits at its place by its own centre", () => {
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

  it('B-AC-1: the grounds are as big as the places in use need (RULE-4)', () => {
    const html = grounds();
    expect(attrOf(tagWith(html, 'data-testid="colony-grounds"'), 'data-extent')).toBe('1');
    const far = { ...MONTH_12, projects: [{ id: 'park' as const, name: 'Park', stage: 'standing' as const, buildMonths: 1, monthsLeft: null, place: { x: 4, y: 2, w: 1, h: 1 } }] };
    expect(attrOf(tagWith(grounds({ colony: far }), 'data-testid="colony-grounds"'), 'data-extent')).toBe('2');
    expect(attrOf(tagWith(grounds({ colony: { ...MONTH_12, projects: [] } }), 'data-testid="colony-grounds"'), 'data-extent')).toBe('0');
  });

  it('B-AC-1 (AM-18): a 2×2 footprint sits at its block\'s centre and widens the scene to the ring it reaches', () => {
    const stadium = { id: 'stadium' as const, name: 'Stadium', stage: 'standing' as const, buildMonths: 3, monthsLeft: null, place: BLOCK };
    const html = grounds({ colony: { gauges: { happiness: 72 }, projects: [stadium] } });
    expectAt(tagWith(html, 'data-testid="picture-1"'), BLOCK_CENTRE);
    expect(attrOf(tagWith(html, 'data-testid="colony-grounds"'), 'data-extent')).toBe('2');
  });

  it('B-AC-1: a project with no place yet is not drawn on the grounds', () => {
    const html = grounds({ colony: { gauges: { happiness: 72 }, projects: [{ ...MONTH_12.projects[0]!, place: null }] } });
    expect(tagsWith(html, 'data-testid="picture-1"')).toHaveLength(0);
    expect(tagsWith(html, 'data-testid="callout-1"')).toHaveLength(0);
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

  it('B-AC-4: a 2×2 kind with no picture falls back to a shape the size of its footprint', () => {
    const site = (place: typeof BLOCK) => ({ id: 'stadium' as const, name: 'Stadium', stage: 'commissioned' as const, buildMonths: 3, monthsLeft: null, place });
    const one = siteCorners(grounds({ manifest: null, colony: { gauges: { happiness: 72 }, projects: [site({ x: 3, y: 2, w: 1, h: 1 })] } }), 'shape-1');
    const four = siteCorners(grounds({ manifest: null, colony: { gauges: { happiness: 72 }, projects: [site(BLOCK)] } }), 'shape-1');
    const span = (pts: [number, number][]) => Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]));
    const mid = (pts: [number, number][]) => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
    expect(span(four)).toBeCloseTo(2 * span(one), 3);
    expect(mid(four)[0]).toBeCloseTo(BLOCK_CENTRE[0], 3);
    expect(mid(four)[1]).toBeCloseTo(BLOCK_CENTRE[1], 3);
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
