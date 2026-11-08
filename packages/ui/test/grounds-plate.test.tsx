import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ColonyGrounds, type GroundsColony, type GroundsManifest, type PictureStage } from '../src/index';
import { glowOpacity } from '../src/grounds/live';

const FRAME: GroundsManifest['frame'] = { width: 1600, height: 1600, place: 1293, centre: [800, 1000] };
const ALL: PictureStage[] = ['site', 'build1', 'build2', 'standing', 'closed', 'damaged'];
/** Scene units per picture pixel: a place is 120 units wide on screen and `FRAME.place` px in every picture. */
const K = 120 / FRAME.place;

/** The renderer's plates (design/art/colony/plate.py): the hall's ring and the whole 5×5, in the shared camera. */
const PLATE = {
  '3': { day: 'plate/3-day@800.webp', dusk: 'plate/3-dusk@800.webp', glow: 'plate/3-glow@800.webp', frame: { width: 6144, height: 3456, hall: [3072, 2074] as [number, number] } },
  '5': { day: 'plate/5-day@800.webp', dusk: 'plate/5-dusk@800.webp', glow: 'plate/5-glow@800.webp', frame: { width: 8960, height: 5040, hall: [4480, 2640] as [number, number] } },
};

const PICTURES: GroundsManifest['pictures'] = Object.fromEntries(
  ['hall', 'park', 'hospital', 'stadium', 'spaceport'].map((kind) => [kind, Object.fromEntries(ALL.map((s) => [s, { day: `${kind}/${s}-day@800.webp`, dusk: `${kind}/${s}-dusk@800.webp`, glow: `${kind}/${s}-glow@800.webp` }]))]),
);
const WITHOUT_PLATE: GroundsManifest = { frame: FRAME, pictures: PICTURES, sizes: [800, 400] };
const WITH_PLATE = { ...WITHOUT_PLATE, plate: PLATE } as GroundsManifest;

/** Every place in the hall's ring: a Park standing east, a Hospital closed south, a Stadium building, a Spaceport site. */
const RING_1: GroundsColony = {
  gauges: { happiness: 72, wealth: 2_000 },
  projects: [
    { id: 'park', name: 'Park', stage: 'standing', buildMonths: 1, monthsLeft: null, place: { x: 3, y: 2, w: 1, h: 1 } },
    { id: 'hospital', name: 'Hospital', stage: 'closed', buildMonths: 2, monthsLeft: null, place: { x: 2, y: 3, w: 1, h: 1 } },
    { id: 'stadium', name: 'Stadium', stage: 'building', buildMonths: 3, monthsLeft: 1, place: { x: 3, y: 3, w: 1, h: 1 } },
    { id: 'spaceport', name: 'Spaceport upgrade', stage: 'commissioned', buildMonths: 3, monthsLeft: null, place: { x: 1, y: 2, w: 1, h: 1 } },
  ],
};
/** The Park moved out to ring 2, so the grounds draw the whole grid. */
const RING_2: GroundsColony = { ...RING_1, projects: [{ ...RING_1.projects[0]!, place: { x: 4, y: 2, w: 1, h: 1 } }, ...RING_1.projects.slice(1)] };

const grounds = (props: Partial<Parameters<typeof ColonyGrounds>[0]> = {}) => renderToStaticMarkup(<ColonyGrounds colony={RING_1} size="tv" manifest={WITH_PLATE} {...props} />);

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

const count = (html: string, pattern: RegExp) => html.match(pattern)?.length ?? 0;
const boxOf = (tag: string) => Object.fromEntries(['x', 'y', 'width', 'height'].map((a) => [a, Number(attrOf(tag, a))])) as { x: number; y: number; width: number; height: number };
const viewBoxOf = (html: string) => {
  const [x, y, w, h] = attrOf(tagWith(html, 'data-testid="colony-grounds"'), 'viewBox')!.split(' ').map(Number);
  return { x: x!, y: y!, w: w!, h: h! };
};
/** The svg's children, as the tags that open them, in the order they are drawn. */
const firstDrawn = (html: string) => html.replace(/^<svg[^>]*>/, '').match(/^<[a-zA-Z]+[^>]*>/)?.[0] ?? '';

/** Where a plate's picture belongs: its hall pixel on the hall's centre, the scene's origin, at the pictures' scale. */
function expectPlateAt(tag: string, plate: (typeof PLATE)['3']) {
  const box = boxOf(tag);
  expect(box.x).toBeCloseTo(-plate.frame.hall[0] * K, 3);
  expect(box.y).toBeCloseTo(-plate.frame.hall[1] * K, 3);
  expect(box.width).toBeCloseTo(plate.frame.width * K, 3);
  expect(box.height).toBeCloseTo(plate.frame.height * K, 3);
}

describe('ColonyGrounds · the base plate under the buildings (AM-7, Task 4.3)', () => {
  it('T-AC-10: with a plate the plate image is drawn first, at the hall pixel', () => {
    const html = grounds();
    const plate = tagWith(html, 'data-testid="plate"');
    expect(firstDrawn(html)).toBe(plate);
    expect(attrOf(plate, 'href')).toBe('/art/colony/plate/3-day@800.webp');
    expectPlateAt(plate, PLATE['3']);
    expect(html.indexOf(plate), 'the hall draws over the plate').toBeLessThan(html.indexOf('data-testid="picture-hall"'));
  });

  it('T-AC-10: with a plate no SVG ground or trees are drawn', () => {
    const html = grounds();
    expect(tagsWith(html, 'data-testid="paving"'), 'no paving').toHaveLength(0);
    expect(count(html, /<polygon[\s>]/g), 'no ground polygons and no cone trees').toBe(0);
    expect(count(html, /<polyline[\s>]/g), 'no ground paths').toBe(0);
    // Each colonist has one circle, its head (and a hidden one's outline another); an edge lamp would add two more.
    expect(count(html, /<circle[\s>]/g), 'no edge lamps').toBe(tagsWith(html, 'data-testid="walker"').length + tagsWith(html, 'data-testid="walker-ghost"').length);
    for (const n of ['hall', '1', '2', '3', '4']) expect(tagsWith(html, `data-testid="picture-${n}"`), `picture-${n}`).toHaveLength(1);
  });

  it("T-AC-10: at dusk the plate shows its dusk picture with its glow over it, lit like the buildings'", () => {
    const html = grounds({ light: 'dusk' });
    const plate = tagWith(html, 'data-testid="plate"');
    expect(attrOf(plate, 'href')).toBe('/art/colony/plate/3-dusk@800.webp');
    const glow = tagWith(html, 'data-testid="glow-plate"');
    expect(attrOf(glow, 'href')).toBe('/art/colony/plate/3-glow@800.webp');
    expect(Number(attrOf(glow, 'opacity'))).toBeCloseTo(glowOpacity({ light: 'dusk', stage: 'standing', wealth: 2_000 }), 6);
    expect(boxOf(glow)).toEqual(boxOf(plate));
    expect(html.indexOf(glow), 'the plate is lit before any building draws over it').toBeLessThan(html.indexOf('data-testid="picture-hall"'));
    expect(tagsWith(grounds(), 'data-testid="glow-plate"'), 'no glow by day').toHaveLength(0);
  });

  it('T-AC-10 (RULE-4): a colony within the hall\'s ring draws plate "3"; a place at ring 2 draws plate "5"', () => {
    expect(attrOf(tagWith(grounds(), 'data-testid="plate"'), 'href')).toBe('/art/colony/plate/3-day@800.webp');
    expect(attrOf(tagWith(grounds({ colony: { ...RING_1, projects: [] } }), 'data-testid="plate"'), 'href'), 'the hall alone').toBe('/art/colony/plate/3-day@800.webp');
    const far = tagWith(grounds({ colony: RING_2 }), 'data-testid="plate"');
    expect(attrOf(far, 'href')).toBe('/art/colony/plate/5-day@800.webp');
    expectPlateAt(far, PLATE['5']);
  });

  it('T-AC-10 (HC-2): a phone gets the 400 px plate', () => {
    expect(attrOf(tagWith(grounds({ size: 'phone' }), 'data-testid="plate"'), 'href')).toBe('/art/colony/plate/3-day@400.webp');
  });

  it('T-AC-10: a full-screen canvas of any shape gets a view at its aspect, inside the plate', () => {
    const plate = boxOf(tagWith(grounds(), 'data-testid="plate"'));
    for (const aspect of [16 / 9, 4 / 3, 21 / 9]) {
      const vb = viewBoxOf(grounds({ framing: { aspect } }));
      expect(vb.w / vb.h, `aspect ${aspect}`).toBeCloseTo(aspect, 6);
      expect(vb.x).toBeGreaterThanOrEqual(plate.x - 1e-6);
      expect(vb.y).toBeGreaterThanOrEqual(plate.y - 1e-6);
      expect(vb.x + vb.w).toBeLessThanOrEqual(plate.x + plate.width + 1e-6);
      expect(vb.y + vb.h).toBeLessThanOrEqual(plate.y + plate.height + 1e-6);
    }
    const leaned = viewBoxOf(grounds({ framing: { aspect: 16 / 9, leanOn: [{ x: 3, y: 3, w: 1, h: 1 }], lean: 1 } }));
    expect(leaned.w).toBeLessThan(plate.width);
    expect(leaned.x).toBeGreaterThanOrEqual(plate.x - 1e-6);
    expect(leaned.y + leaned.h).toBeLessThanOrEqual(plate.y + plate.height + 1e-6);
  });

  it("HC-3: without a plate the grounds draw today's shapes", () => {
    const html = grounds({ manifest: WITHOUT_PLATE });
    expect(tagsWith(html, 'data-testid="plate"'), 'no plate').toHaveLength(0);
    expect(firstDrawn(html)).toBe('<polygon points="0.0,-126.0 252.0,0.0 0.0,126.0 -252.0,0.0" fill="var(--color-map-base)" stroke="var(--color-holo-line)">');
    expect(tagsWith(html, 'data-testid="paving"'), 'the plaza paving').toHaveLength(1);
    // Ring 1 is crossed by two grid lines each way; one building standing plants three edge props, two trees and a lamp.
    expect(count(html, /<polyline[\s>]/g), 'the ground paths').toBe(4);
    expect(count(html, /fill="var\(--color-ok\)" stroke-width="1" opacity="0.85"/g), 'the edge trees').toBe(2);
    expect(viewBoxOf(html)).toEqual({ x: -2.2 * 120, y: (-2.1 * 120) / 2 - 1.15 * 120, w: 2 * 2.2 * 120, h: 2.1 * 120 + 1.3 * 120 });
  });

  it('AM-7: a 2400-wide frame positions the same as a 1600 one at the same centre', () => {
    const wide = { ...FRAME, width: 2400 };
    const manifest = { ...WITH_PLATE, pictures: { ...PICTURES, park: { ...PICTURES.park, frame: wide } } } as GroundsManifest;
    const narrow = boxOf(tagWith(grounds(), 'data-testid="picture-1"'));
    const flush = boxOf(tagWith(grounds({ manifest }), 'data-testid="picture-1"'));
    expect(flush.x).toBeCloseTo(narrow.x, 6);
    expect(flush.y).toBeCloseTo(narrow.y, 6);
    expect(flush.height).toBeCloseTo(narrow.height, 6);
    expect(flush.width).toBeCloseTo(2400 * K, 6);
  });
});
