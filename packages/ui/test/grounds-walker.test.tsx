import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ColonyGrounds, type GroundsColony } from '../src/grounds/ColonyGrounds';
import { frameAt, headingOf, WalkingScene, type Placed } from '../src/grounds/LiveLayer';
import { occluderOf } from '../src/grounds/occlusion';
import type { GroundsManifest, WalkerEntry } from '../src/grounds/pick';
import { walkerAt, type Spot } from '../src/grounds/walks';

/** The shipped manifest: the colonists are Heiko's pick, Astronaut A in the player colours (8 Nov). */
const ART = join(dirname(fileURLToPath(import.meta.url)), '../../../apps/web/public/art/colony');
const manifest = JSON.parse(readFileSync(join(ART, 'manifest.json'), 'utf8')) as GroundsManifest;
const walker = manifest.walker as WalkerEntry;
const { width: CW, height: CH } = walker.cell;

const sprite = { entry: walker, light: 'dusk' as const, href: (src: string) => `/art/colony/${src}` };
const hospital = manifest.pictures.hospital!;
const HOSPITAL = occluderOf(hospital.frame ?? manifest.frame, hospital.standing!.skyline!, 0, 1, 1);
const SCENE: Placed[] = [{ depth: 1, node: <g key="h" data-testid="the-hospital" /> }];

/** The layer's markup with colonists on the given routes, drawn from the sheets. */
const layer = (routes: Spot[][], occluders = [HOSPITAL]) =>
  renderToStaticMarkup(<svg><WalkingScene scene={SCENE} walkers={routes.length} rim={2.85} blocks={[]} occluders={occluders} routes={routes} sprite={sprite} /></svg>);
/** Each drawn colonist's crop of its sheet: the viewBox's x and y, in sheet pixels. */
const crops = (html: string, testid = 'walker') =>
  [...html.matchAll(new RegExp(`<svg[^>]*viewBox="(\\d+) (\\d+) ${CW} ${CH}"[^>]*data-testid="${testid}"`, 'g'))].map((m): [number, number] => [Number(m[1]), Number(m[2])]);

describe('T-AC-14: the colonists are Astronaut A, from the walker sheets, in the player colours', () => {
  it('T-AC-14: a colonist is a crop of its sheet whose row is the heading of its route leg (+x, +y, -x, -y top to bottom)', () => {
    // c rising runs down-right on screen (+x); r falling runs up-right (+y).
    const html = layer([[[0, 0], [1, 0]], [[0, 0], [0, -1]], [[0, 0], [-1, 0]], [[0, 0], [0, 1]]].map((r) => r as Spot[]));
    const rows = crops(html).map(([, y]) => y / CH).sort();
    expect(rows).toEqual([0, 1, 2, 3]);
    expect(headingOf([0, 0], [1, 0])).toBe('+x');
    expect(headingOf([0, 0], [0, -1])).toBe('+y');
    expect(headingOf([0, 0], [-1, 0])).toBe('-x');
    expect(headingOf([0, 0], [0, 1])).toBe('-y');
  });

  it('T-AC-14: the column advances with the walk cycle, frame 0 with reduced motion', () => {
    const step = walker.seconds / walker.frames;
    expect(frameAt(0, 0, false, walker)).toBe(0);
    expect(frameAt(0, step * 1.5, false, walker)).toBe(1);
    expect(frameAt(0, walker.seconds + step * 0.5, false, walker)).toBe(0); // round again
    expect(frameAt(3, 7.7, true, walker)).toBe(0);
    // Out of step with each other, so they do not march.
    expect(frameAt(1, 0, false, walker)).not.toBe(frameAt(0, 0, false, walker));
    // At t = 0 the first colonist shows its sheet's first column.
    expect(crops(layer([[[0, 0], [1, 0]]]))[0]![0]).toBe(0);
  });

  it('T-AC-14: each colonist wears the suit of a player colour, the helmet and trims varying from colonist to colonist', () => {
    const html = layer(Array.from({ length: 8 }, () => [[2.5, 2.5], [2.5, 1.5]] as Spot[]));
    const suits = [...html.matchAll(/href="\/art\/colony\/walker\/(p\d)-(\w+)-dusk@800\.webp"/g)];
    expect(new Set(suits.map((m) => m[1]))).toEqual(new Set(['p1', 'p2', 'p3', 'p4']));
    expect(new Set(suits.map((m) => m[2])).size).toBeGreaterThan(1);
  });

  it('T-AC-14: behind a building the outline is the outline sheet\'s same crop, faded on the image itself (never a group opacity)', () => {
    const html = layer([[[-0.5, 1], [-0.5, 2]]]);
    expect(crops(html, 'walker-ghost')).toEqual(crops(html));
    expect(html).toMatch(/data-testid="walker-ghost"[^>]*><image href="\/art\/colony\/walker\/outline@800\.webp"[^>]*opacity="0.45"/);
    expect(html).not.toMatch(/<g[^>]*opacity=/);
  });
});

/** Heiko's case on the grounds, the mood high enough for colonists. */
const COLONY: GroundsColony = {
  gauges: { happiness: 90, wealth: 2000 },
  projects: [{ id: 'hospital', name: 'Hospital', stage: 'standing', monthsLeft: null, buildMonths: 3, place: { x: 2, y: 3, w: 1, h: 1 } }],
};

describe('T-AC-14 on the grounds', () => {
  it('T-AC-14: ColonyGrounds draws the colonists from the sheets of its light, the phone at its own size', () => {
    const tv = renderToStaticMarkup(<ColonyGrounds colony={COLONY} size="tv" manifest={manifest} light="dusk" />);
    const phone = renderToStaticMarkup(<ColonyGrounds colony={COLONY} size="phone" manifest={manifest} light="day" />);
    expect(tv).toMatch(/href="\/art\/colony\/walker\/p\d-\w+-dusk@800\.webp"/);
    expect(phone).toMatch(/href="\/art\/colony\/walker\/p\d-\w+-day@400\.webp"/);
    expect(phone).not.toMatch(/walker\/[^"]*@800/);
  });

  it('T-AC-14 (negative): with no walker entry in the manifest, the colonists are today\'s SVG figures, never blank', () => {
    const { walker: _gone, ...without } = manifest;
    const html = renderToStaticMarkup(<ColonyGrounds colony={COLONY} size="tv" manifest={without} light="dusk" />);
    expect(html).toMatch(/<g[^>]*data-testid="walker"/);
    expect(html).not.toMatch(/walker\/p\d/);
  });

  it('T-AC-14: the colonists walk at an easy walking pace, 1.3 m a second (Heiko)', () => {
    const [c] = walkerAt(0, 1, [[0, 0], [10, 0]]);
    expect(c * 12).toBeCloseTo(1.3, 3);
  });
});
