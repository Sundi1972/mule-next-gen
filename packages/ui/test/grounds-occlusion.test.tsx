import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ColonyGrounds, type GroundsColony } from '../src/grounds/ColonyGrounds';
import { WalkingScene, type Placed } from '../src/grounds/LiveLayer';
import { hiddenBy, occluderOf, type Occluder } from '../src/grounds/occlusion';
import type { GroundsManifest, PictureStage } from '../src/grounds/pick';
import type { Spot } from '../src/grounds/walks';

/** The shipped manifest, silhouettes and all: whether a colonist is hidden is a question about the real pictures. */
const ART = join(dirname(fileURLToPath(import.meta.url)), '../../../apps/web/public/art/colony');
const manifest = JSON.parse(readFileSync(join(ART, 'manifest.json'), 'utf8')) as GroundsManifest;

/** The occluder for a kind's picture at a stage, centred on (c, r): as ColonyGrounds builds it. */
function occluder(kind: 'hall' | 'hospital', stage: PictureStage, c: number, r: number): Occluder {
  const pictures = manifest.pictures[kind]!;
  return occluderOf(pictures.frame ?? manifest.frame, pictures[stage]!.skyline!, c, r, c + r);
}

/** The town hall and the Hospital standing on the place south of it: the case Heiko saw (8 Nov). */
const HALL = occluder('hall', 'standing', 0, 0);
const HOSPITAL = occluder('hospital', 'standing', 0, 1);
/** On the path along the Hospital's west side, halfway down it: behind the Hospital as the camera sees it. */
const BEHIND: Spot = [-0.5, 1];
/** On the path along its east side, halfway down: in front of it. */
const IN_FRONT: Spot = [0.5, 1];

const building = (id: string, depth: number): Placed => ({ depth, node: <g key={id} data-testid={id} /> });
const SCENE: Placed[] = [building('the-hall', 0), building('the-hospital', 1)];

/** The layer's markup with one colonist standing at `spot`, the buildings in their painter's order. */
function layer(spot: Spot): string {
  const scene: ReactElement = <WalkingScene scene={SCENE} walkers={1} rim={2.85} blocks={[{ x: 2, y: 3, w: 1, h: 1 }]} occluders={[HALL, HOSPITAL]} routes={[[spot, spot]]} />;
  return renderToStaticMarkup(<svg>{scene}</svg>);
}
const at = (html: string, testid: string) => html.indexOf(`data-testid="${testid}"`);

describe('T-AC-13: a colonist behind a building is hidden by it, with a faint outline; one in front draws over it', () => {
  it('T-AC-13: behind the Hospital, the colonist is drawn before it (so its picture hides the figure) and its faint outline after it', () => {
    const html = layer(BEHIND);
    expect(at(html, 'walker')).toBeGreaterThan(-1);
    expect(at(html, 'walker')).toBeLessThan(at(html, 'the-hospital'));
    expect(at(html, 'walker-ghost')).toBeGreaterThan(at(html, 'the-hospital'));
    expect(html).toMatch(/stroke-opacity="0.45"[^>]*data-testid="walker-ghost"/);
  });

  it('T-AC-13 (negative): in front of the Hospital, the colonist is drawn after it and has no outline', () => {
    const html = layer(IN_FRONT);
    expect(at(html, 'walker')).toBeGreaterThan(at(html, 'the-hospital'));
    expect(at(html, 'walker-ghost')).toBe(-1);
  });

  it('T-AC-13 (negative): out on the open paths, behind nothing, there is no outline', () => {
    expect(at(layer([2.5, 2.5]), 'walker-ghost')).toBe(-1);
  });

  it('T-AC-13 (negative): behind a building but above its picture on screen, in plain view, there is no outline (review of #776)', () => {
    // Up the west spoke from the hall: the line toward the camera crosses the hall and the Hospital, but the figure stands
    // higher on screen than either picture reaches (above the Hospital's whole frame at (-2, -0.5)).
    expect(at(layer([-2, -0.5]), 'walker-ghost')).toBe(-1);
    expect(at(layer([-1, -0.5]), 'walker-ghost')).toBe(-1);
  });
});

describe('hiddenBy', () => {
  it('T-AC-13: a colonist is hidden where a picture drawn after it covers its figure, by the picture\'s own silhouette', () => {
    expect(hiddenBy(BEHIND, [HOSPITAL])).toBe(true);
    expect(hiddenBy([0, 0.5], [HOSPITAL])).toBe(true); // its north side, between it and the hall
    expect(hiddenBy(IN_FRONT, [HOSPITAL])).toBe(false); // drawn after it
    expect(hiddenBy([0, 1.5], [HOSPITAL])).toBe(false); // its south side, facing the camera
    expect(hiddenBy([-2.5, 1], [HOSPITAL])).toBe(false); // far off to the side
    expect(hiddenBy([-0.5, -0.5], [HALL])).toBe(true); // the hall's back corner
  });
});

/** The colony in Heiko's case, the Hospital at `stage`, the mood high enough for the most colonists. */
const colony = (stage: 'standing' | 'commissioned'): GroundsColony => ({
  gauges: { happiness: 90, wealth: 2000 },
  projects: [{ id: 'hospital', name: 'Hospital', stage, monthsLeft: stage === 'standing' ? null : 3, buildMonths: 3, place: { x: 2, y: 3, w: 1, h: 1 } }],
});
const ghosts = (html: string) => html.split('data-testid="walker-ghost"').length - 1;

describe('T-AC-13 on the grounds: ColonyGrounds hands the live layer its pictures\' silhouettes', () => {
  it('T-AC-13: with the Hospital standing, a colonist behind it gets its outline; as a flat site, the Hospital hides no one', () => {
    const standing = renderToStaticMarkup(<ColonyGrounds colony={colony('standing')} size="tv" manifest={manifest} light="dusk" />);
    const site = renderToStaticMarkup(<ColonyGrounds colony={colony('commissioned')} size="tv" manifest={manifest} light="dusk" />);
    expect(ghosts(standing)).toBeGreaterThan(ghosts(site));
  });

  it('T-AC-13 (negative): without a manifest the SVG shapes hide the colonists themselves, and no outline is drawn', () => {
    expect(ghosts(renderToStaticMarkup(<ColonyGrounds colony={colony('standing')} size="tv" manifest={null} light="dusk" />))).toBe(0);
  });
});
