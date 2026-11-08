import { POLLUTION } from '@mule/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ColonyGrounds, type GroundsColony, type GroundsProject } from '../src/grounds/ColonyGrounds';
import { centreOf } from '../src/grounds/layout';
import { AirPicture } from '../src/grounds/LiveLayer';
import { iso, W } from '../src/grounds/projection';

const SMOGGY = POLLUTION.bands.find((b) => b.name === 'smoggy')!.from;
const HOSPITAL_PLACE = { x: 2, y: 3, w: 1, h: 1 };

/** A month-12 colony at the given air, its Hospital (place 2) at `hospital`. */
const colony = (environment: number | undefined, hospital: GroundsProject['stage'] = 'standing'): GroundsColony => ({
  gauges: { happiness: 72, wealth: 2_000, environment },
  projects: [
    { id: 'park', name: 'Park', stage: 'standing', buildMonths: 1, monthsLeft: null, place: { x: 1, y: 2, w: 1, h: 1 } },
    { id: 'hospital', name: 'Hospital', stage: hospital, buildMonths: 2, monthsLeft: null, place: HOSPITAL_PLACE },
    { id: 'stadium', name: 'Stadium', stage: 'closed', buildMonths: 3, monthsLeft: null, place: { x: 3, y: 2, w: 2, h: 2 } },
  ],
});
const grounds = (c: GroundsColony, light: 'day' | 'dusk' = 'day') => renderToStaticMarkup(<ColonyGrounds colony={c} size="tv" manifest={null} light={light} />);
/** The haze's opacity at the far edge, as drawn; null when no haze is drawn. */
const haze = (html: string) => {
  if (!html.includes('data-testid="haze"')) return null;
  return Number(/data-testid="haze-far"[^>]*stop-opacity="([\d.]+)"|stop-opacity="([\d.]+)"[^>]*data-testid="haze-far"/.exec(html)!.slice(1).find(Boolean));
};
const smokeIds = (html: string) => [...html.matchAll(/data-testid="smoke-(\d+)"/g)].map((m) => Number(m[1]));
/** Each puff of the plume: centre and radius, in scene units. */
const puffs = (html: string) =>
  [...html.matchAll(/<circle cx="([-\d.e]+)" cy="([-\d.e]+)" r="([\d.e]+)"[^>]*data-testid="puff"/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]), r: Number(m[3]) }));

describe('T-AC-15: smoke over a damaged building, a haze by the air (RULE-7, RULE-8)', () => {
  it('T-AC-15: a clean colony draws no haze, up to the edge of Smoggy and with no air reading', () => {
    for (const air of [0, 12, SMOGGY - 1, undefined]) expect(haze(grounds(colony(air))), `air ${air}`).toBeNull();
    for (const air of [0, 12]) expect(haze(grounds(colony(air), 'dusk')), `air ${air} at dusk`).toBeNull();
  });

  it("T-AC-15: from Smoggy the haze thickens with the gauge, RULE-7's examples", () => {
    const drawn = [SMOGGY, 65, 100].map((air) => haze(grounds(colony(air))));
    expect(drawn[0]).toBeCloseTo(0.18, 3);
    expect(drawn[1]).toBeCloseTo(0.415, 3);
    expect(drawn[2]).toBeCloseTo(0.65, 3);
    expect(haze(grounds(colony(250)))).toBeCloseTo(0.65, 3);
  });

  it('T-AC-15: the haze is drawn under the place chips, so a plot stays readable', () => {
    const html = grounds(colony(90));
    expect(html.indexOf('data-testid="haze"')).toBeLessThan(html.indexOf('data-testid="callout-1"'));
  });

  it('T-AC-15: only a damaged place smokes, its plume rising from the top of its picture', () => {
    expect(smokeIds(grounds(colony(40, 'standing')))).toEqual([]);
    expect(smokeIds(grounds(colony(40, 'closed')))).toEqual([]);
    const html = grounds(colony(40, 'damaged'));
    expect(smokeIds(html)).toEqual([2]);
    // The plume starts over the Hospital and rises: its smallest puff sits on the place's centre line, above the ground.
    const { col, row } = centreOf(HOSPITAL_PLACE);
    const [x, y] = iso(col, row);
    const base = puffs(html).sort((a, b) => a.r - b.r)[0]!;
    expect(Math.abs(base.x - x)).toBeLessThan(W / 4);
    expect(base.y).toBeLessThan(y);
  });

  it('T-AC-15: the plume moves with time, and with reduced motion stands still', () => {
    const at = (seconds: number, reduced: boolean) =>
      renderToStaticMarkup(<svg><AirPicture view={{ x: 0, y: 0, w: 100, h: 100 }} environment={0} light="dusk" smoke={[{ n: 2, x: 0, y: 0 }]} seconds={seconds} reduced={reduced} /></svg>);
    expect(at(2.5, false)).not.toBe(at(0, false));
    expect(at(2.5, true)).toBe(at(0, false));
    expect(at(7, true)).toBe(at(0, false));
  });

  it('T-AC-12, T-AC-15: during the lean-in a damaged building in front of the named place fades its smoke with it; one level with the place keeps its smoke whole', () => {
    // The visibility spike's worst case (as grounds-opener-fade): the new site at (1,2), the Stadium on the block in front
    // of it, the Hospital level with it.
    const SITE = { x: 1, y: 2, w: 1, h: 1 };
    const c: GroundsColony = {
      gauges: { happiness: 72, wealth: 2_000, environment: 40 },
      projects: [
        { id: 'stadium', name: 'Stadium', stage: 'damaged', monthsLeft: null, buildMonths: 3, place: { x: 1, y: 3, w: 2, h: 2 } },
        { id: 'hospital', name: 'Hospital', stage: 'damaged', monthsLeft: null, buildMonths: 2, place: { x: 2, y: 1, w: 1, h: 1 } },
        { id: 'observatory', name: 'Observatory', stage: 'commissioned', monthsLeft: null, buildMonths: 2, place: SITE },
      ],
    };
    /** Each puff's drawn opacity in place n's plume (the ember over it included), at `lean`. */
    const plumeOf = (lean: number, n: number) => {
      const html = renderToStaticMarkup(<ColonyGrounds colony={c} size="tv" manifest={null} light="dusk" chips={false} framing={{ aspect: 16 / 9, leanOn: [SITE], lean }} />);
      const g = new RegExp(`data-testid="smoke-${n}">(.*?)</g></g>(?=<g data-testid="smoke-|<rect|</g>)`).exec(html)![1]!;
      return [...g.matchAll(/<circle[^>]*opacity="([\d.e-]+)"/g)].map((m) => Number(m[1]));
    };
    const [still, leant] = [plumeOf(0, 1), plumeOf(1, 1)];
    expect(leant.length).toBe(still.length);
    leant.forEach((o, k) => expect(o).toBeCloseTo(still[k]! / 3, 3));
    expect(plumeOf(1, 2)).toEqual(plumeOf(0, 2));
  });
});

