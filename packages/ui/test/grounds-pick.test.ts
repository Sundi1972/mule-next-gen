import { describe, expect, it } from 'vitest';
import { pick, type GroundsManifest, type PictureStage } from '../src/grounds/pick';

/** Every kind the rows touch, with every stage it can reach, as the art task publishes them. */
function manifestOf(kinds: Record<string, PictureStage[]>): GroundsManifest {
  const pictures: GroundsManifest['pictures'] = {};
  for (const [kind, stages] of Object.entries(kinds)) {
    pictures[kind] = Object.fromEntries(stages.map((s) => [s, { day: `${kind}/${s}-day@800.webp`, dusk: `${kind}/${s}-dusk@800.webp`, glow: null }]));
  }
  return { frame: { width: 1600, height: 1600, place: 1293, centre: [800, 1000] }, pictures, sizes: [800, 400] };
}

const ALL: PictureStage[] = ['site', 'build1', 'build2', 'standing', 'closed', 'damaged'];
const MANIFEST = manifestOf({ park: ALL, hospital: ALL, stadium: ALL, spaceport: ALL });

describe('RULE-1 · which picture a place shows', () => {
  it('T-AC-1: RULE-1 row 1 — no manifest entry: the SVG shape for the kind and stage', () => {
    const park = { stage: 'standing', monthsLeft: null, buildMonths: 1 } as const;
    expect(pick('park', park, 'day', null)).toEqual({ shows: 'shape', stage: 'standing' });
    expect(pick('park', park, 'day', manifestOf({ hospital: ALL }))).toEqual({ shows: 'shape', stage: 'standing' });
    expect(pick('park', park, 'day', manifestOf({ park: ['site'] }))).toEqual({ shows: 'shape', stage: 'standing' });
  });

  it('T-AC-1: RULE-1 row 2 — commissioned shows the site, never the standing building', () => {
    expect(pick('spaceport', { stage: 'commissioned', monthsLeft: null, buildMonths: 3 }, 'day', MANIFEST)).toEqual({ shows: 'picture', stage: 'site', src: 'spaceport/site-day@800.webp' });
  });

  it('T-AC-1: RULE-1 row 3 — a 1- or 2-month build shows build1 to the end', () => {
    expect(pick('park', { stage: 'building', monthsLeft: 1, buildMonths: 1 }, 'day', MANIFEST)).toEqual({ shows: 'picture', stage: 'build1', src: 'park/build1-day@800.webp' });
    expect(pick('hospital', { stage: 'building', monthsLeft: 1, buildMonths: 2 }, 'day', MANIFEST)).toMatchObject({ stage: 'build1' });
  });

  it('T-AC-1: RULE-1 row 4 — a 3-month build in its first half shows build1 (Stadium, 3 of 3 left)', () => {
    expect(pick('stadium', { stage: 'building', monthsLeft: 3, buildMonths: 3 }, 'day', MANIFEST)).toEqual({ shows: 'picture', stage: 'build1', src: 'stadium/build1-day@800.webp' });
  });

  it('T-AC-1: RULE-1 row 5 — a 3-month build in its second half shows build2 (Stadium, 1 of 3 left)', () => {
    expect(pick('stadium', { stage: 'building', monthsLeft: 1, buildMonths: 3 }, 'day', MANIFEST)).toEqual({ shows: 'picture', stage: 'build2', src: 'stadium/build2-day@800.webp' });
  });

  it("T-AC-1: RULE-1 row 6 — otherwise the stage's own picture (Hospital closed)", () => {
    expect(pick('hospital', { stage: 'closed', monthsLeft: null, buildMonths: 2 }, 'day', MANIFEST)).toEqual({ shows: 'picture', stage: 'closed', src: 'hospital/closed-day@800.webp' });
    expect(pick('hospital', { stage: 'damaged', monthsLeft: null, buildMonths: 2 }, 'day', MANIFEST)).toMatchObject({ stage: 'damaged' });
    expect(pick('hospital', { stage: 'standing', monthsLeft: null, buildMonths: 2 }, 'day', MANIFEST)).toMatchObject({ stage: 'standing' });
  });

  it('T-AC-1: RULE-1 unknown — building with no months left on the wire shows build1', () => {
    expect(pick('stadium', { stage: 'building', monthsLeft: null, buildMonths: 3 }, 'day', MANIFEST)).toMatchObject({ stage: 'build1' });
  });

  it('T-AC-1: RULE-1 light — dusk shows the dusk picture', () => {
    expect(pick('hospital', { stage: 'closed', monthsLeft: null, buildMonths: 2 }, 'dusk', MANIFEST)).toEqual({ shows: 'picture', stage: 'closed', src: 'hospital/closed-dusk@800.webp' });
  });
});
