import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ColonyGrounds, type GroundsColony, type GroundsManifest, type PictureStage } from '../src/index';
import { inFrontOf } from '../src/grounds/framing';

const FRAME: GroundsManifest['frame'] = { width: 1600, height: 1600, place: 1293, centre: [800, 1000] };
const ALL: PictureStage[] = ['site', 'build1', 'build2', 'standing', 'closed', 'damaged'];
const MANIFEST: GroundsManifest = {
  frame: FRAME,
  pictures: Object.fromEntries(
    ['hall', 'park', 'hospital', 'observatory', 'stadium', 'spaceport'].map((kind) => [
      kind,
      Object.fromEntries(ALL.map((s) => [s, { day: `${kind}/${s}-day@800.webp`, dusk: `${kind}/${s}-dusk@800.webp`, glow: s === 'closed' ? null : `${kind}/${s}-glow@800.webp` }])),
    ]),
  ),
  sizes: [800, 400],
};

/**
 * The visibility spike's worst case (design/mocks/colony-grounds/spike.html): the Observatory's new site at (1,2), left of
 * the hall, with the Stadium on the block in front of it. The Hospital at (2,1) stands level with it, behind the hall;
 * the Park at (3,1) stands off to the right.
 */
const SITE = { x: 1, y: 2, w: 1, h: 1 };
const COLONY: GroundsColony = {
  gauges: { happiness: 72, wealth: 2_000 },
  projects: [
    { id: 'stadium', name: 'Stadium', stage: 'standing', monthsLeft: null, buildMonths: 3, place: { x: 1, y: 3, w: 2, h: 2 } },
    { id: 'hospital', name: 'Hospital', stage: 'standing', monthsLeft: null, buildMonths: 2, place: { x: 2, y: 1, w: 1, h: 1 } },
    { id: 'park', name: 'Park', stage: 'standing', monthsLeft: null, buildMonths: 1, place: { x: 3, y: 1, w: 1, h: 1 } },
    { id: 'observatory', name: 'Observatory', stage: 'commissioned', monthsLeft: null, buildMonths: 2, place: SITE },
  ],
};

/** The glow's own opacity at dusk for a standing building at the fixture's wealth (RULE-2: 0.25 + 0.75 × 2 000 / 4 000). */
const GLOW = 0.625;

function markup(lean: number, leanOn = [SITE]): string {
  return renderToStaticMarkup(<ColonyGrounds colony={COLONY} size="tv" manifest={MANIFEST} light="dusk" chips={false} framing={{ aspect: 16 / 9, leanOn, lean }} />);
}

/** The opacity each picture and glow image is drawn at, by testid (picture-1, glow-1, …, picture-hall), 1 where none is set. */
function opacities(lean: number, leanOn = [SITE]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of markup(lean, leanOn).matchAll(/<image([^>]*data-testid="((?:picture|glow)-(?:\d+|hall))"[^>]*)>/g)) {
    const o = /opacity="([\d.]+)"/.exec(m[1]!);
    out[m[2]!] = o ? Number(o[1]) : 1;
  }
  return out;
}

describe('T-AC-12: during the lean-in, the buildings in front of the place the caption names fade to a third', () => {
  it('T-AC-12: at full lean the Stadium and the hall in front of the new site are at 1/3; the site itself, the Hospital level with it and the Park off to the side are not', () => {
    const o = opacities(1);
    expect(o['picture-1']).toBeCloseTo(1 / 3, 2); // the Stadium, on the block in front
    expect(o['glow-1']).toBeCloseTo(GLOW / 3, 2); // …its lights fade with it
    expect(o['picture-hall']).toBeCloseTo(1 / 3, 2); // the hall, nearer and across the site's right half
    expect(o['glow-hall']).toBeCloseTo(GLOW / 3, 2);
    expect(o['picture-2']).toBe(1); // the Hospital: level with the site, not in front of it
    expect(o['glow-2']).toBeCloseTo(GLOW, 3);
    expect(o['picture-3']).toBe(1); // the Park: nearer, but nowhere across the site on screen
    expect(o['picture-4']).toBe(1); // the site the caption names
  });

  it('T-AC-12: the fade is on each image, never on a group round a screen-blended glow (a group would paint the glow\'s black as a dark box over the site)', () => {
    expect(markup(1)).not.toMatch(/<g[^>]*\sopacity=/);
  });

  it('T-AC-12: the fade follows the lean — halfway in, the Stadium is at 2/3', () => {
    expect(opacities(0.5)['picture-1']).toBeCloseTo(2 / 3, 2);
  });

  it('T-AC-12 (negative): before the lean-in starts, and on a view that leans on nothing, nothing fades', () => {
    for (const o of [opacities(0), opacities(1, [])]) {
      expect(o['picture-1']).toBe(1);
      expect(o['picture-hall']).toBe(1);
      expect(o['glow-1']).toBeCloseTo(GLOW, 3);
    }
  });
});

describe('inFrontOf', () => {
  it('T-AC-12: a nearer block whose footprint crosses the target on screen is in front; a level one or one off to the side is not', () => {
    const hall = { x: 2, y: 2, w: 1, h: 1 };
    expect(inFrontOf({ x: 1, y: 3, w: 2, h: 2 }, [SITE])).toBe(true);
    expect(inFrontOf(hall, [SITE])).toBe(true);
    expect(inFrontOf({ x: 2, y: 1, w: 1, h: 1 }, [SITE])).toBe(false);
    expect(inFrontOf({ x: 3, y: 1, w: 1, h: 1 }, [SITE])).toBe(false);
    expect(inFrontOf(SITE, [SITE])).toBe(false);
  });
});
