import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ColonyGrounds, type GroundsColony } from '../src/grounds/ColonyGrounds';
import type { GroundsManifest } from '../src/grounds/pick';
import { iso, W } from '../src/grounds/projection';

/** The shipped manifest: its 5 × 5 plate lights a head-less pool at every inner crossing, and its `lamp` stands there. */
const ART = join(dirname(fileURLToPath(import.meta.url)), '../../../apps/web/public/art/colony');
const manifest = JSON.parse(readFileSync(join(ART, 'manifest.json'), 'utf8')) as GroundsManifest;

/** Month 12 on the 5 × 5: the Stadium's 2 × 2 at (3,2) covers the crossing at its middle. */
const COLONY: GroundsColony = {
  gauges: { happiness: 72, wealth: 2_000 },
  projects: [
    { id: 'park', name: 'Park', stage: 'standing', buildMonths: 1, monthsLeft: null, place: { x: 1, y: 2, w: 1, h: 1 } },
    { id: 'hospital', name: 'Hospital', stage: 'standing', buildMonths: 2, monthsLeft: null, place: { x: 2, y: 3, w: 1, h: 1 } },
    { id: 'stadium', name: 'Stadium', stage: 'standing', buildMonths: 3, monthsLeft: null, place: { x: 3, y: 2, w: 2, h: 2 } },
    { id: 'spaceport', name: 'Spaceport', stage: 'building', buildMonths: 3, monthsLeft: 1, place: { x: 2, y: 0, w: 2, h: 2 } },
  ],
};
const grounds = (light: 'day' | 'dusk', m: GroundsManifest = manifest, colony: GroundsColony = COLONY, size: 'tv' | 'phone' = 'tv') =>
  renderToStaticMarkup(<ColonyGrounds colony={colony} size={size} manifest={m} light={light} />);
/** Each lamp drawn: its crossing (from its testid) and where its picture's foot lands, in scene units. */
const lamps = (html: string) =>
  [...html.matchAll(/<image[^>]*data-testid="lamp-(-?[\d.]+)_(-?[\d.]+)"[^>]*>/g)].map((m) => {
    const attr = (a: string) => Number(new RegExp(`${a}="([-\\d.e]+)"`).exec(m[0])![1]);
    return { c: Number(m[1]), r: Number(m[2]), x: attr('x'), y: attr('y'), width: attr('width'), height: attr('height'), at: m.index! };
  });

describe('T-AC-16: a lamp stands at every inner crossing of the grounds, where the plate lights its pool', () => {
  it('T-AC-16: on the 5 × 5 every inner crossing has a lamp, except the one a 2 × 2 building stands over', () => {
    const drawn = lamps(grounds('day'));
    const crossings = [-1.5, -0.5, 0.5, 1.5].flatMap((c) => [-1.5, -0.5, 0.5, 1.5].map((r) => `${c},${r}`));
    // the Stadium's 2 × 2 spans col 0.5..2.5, row -0.5..1.5; the Spaceport's col -0.5..1.5, row -2.5..-0.5
    const covered = ['1.5,0.5', '0.5,-1.5'];
    expect(drawn.map((l) => `${l.c},${l.r}`).sort()).toEqual(crossings.filter((k) => !covered.includes(k)).sort());
  });

  it("T-AC-16: a lamp's foot stands on its crossing, at the buildings' scale", () => {
    const lamp = manifest.lamp!;
    // the buildings' scale: one place of the frame (frame.place px) is W scene units
    const k = W / manifest.frame.place;
    const drawn = lamps(grounds('day'));
    expect(drawn.length).toBeGreaterThan(0);
    for (const l of drawn) {
      const [x, y] = iso(l.c, l.r);
      expect(l.width).toBeCloseTo(lamp.cell.width * k, 1);
      expect(l.height).toBeCloseTo(lamp.cell.height * k, 1);
      expect(l.x + lamp.cell.feet[0] * k).toBeCloseTo(x, 1);
      expect(l.y + lamp.cell.feet[1] * k).toBeCloseTo(y, 1);
    }
  });

  it('T-AC-16: a lamp is drawn after the place behind its crossing and before the place in front of it', () => {
    const html = grounds('dusk');
    const at = (testid: string) => {
      const i = html.indexOf(`data-testid="${testid}"`);
      expect(i, testid).toBeGreaterThanOrEqual(0);
      return i;
    };
    const lamp = (c: number, r: number) => lamps(html).find((l) => l.c === c && l.r === r)!.at;
    // the crossing (-0.5, 0.5): the Park (place 1, col -1 row 0) behind it, the Hospital (place 2, col 0 row 1) in front
    expect(lamp(-0.5, 0.5)).toBeGreaterThan(at('place-1'));
    expect(lamp(-0.5, 0.5)).toBeLessThan(at('place-2'));
    // the crossing (-0.5, -0.5) is behind the hall
    expect(lamp(-0.5, -0.5)).toBeLessThan(at('picture-hall'));
    // (-0.5, 0.5) is level with the hall (col + row 0), beside it: drawn after it, as a level neighbour is
    expect(lamp(-0.5, 0.5)).toBeGreaterThan(at('picture-hall'));
  });

  it('T-AC-16: at dusk each lamp has its glow, lit by wealth as the plate is; by day none', () => {
    const dusk = grounds('dusk');
    const glows = [...dusk.matchAll(/data-testid="lamp-glow-(-?[\d.]+)_(-?[\d.]+)"/g)];
    expect(glows).toHaveLength(lamps(dusk).length);
    const plate = /data-testid="glow-plate"[^>]*opacity="([\d.]+)"|opacity="([\d.]+)"[^>]*data-testid="glow-plate"/.exec(dusk)!;
    const glow = /<image[^>]*data-testid="lamp-glow-0.5_0.5"[^>]*>/.exec(dusk)![0];
    expect(Number(/opacity="([\d.]+)"/.exec(glow)![1])).toBeCloseTo(Number(plate[1] ?? plate[2]), 3);
    expect(grounds('day')).not.toContain('lamp-glow-');
    expect(grounds('day')).toContain('/art/colony/lamp/day@800.webp');
    expect(dusk).toContain('/art/colony/lamp/dusk@800.webp');
  });

  it('T-AC-16: with only the hall, the 3 × 3 plate is drawn and a lamp stands at each of its four pools', () => {
    const hall: GroundsColony = { gauges: { happiness: 72, wealth: 2_000 }, projects: [] };
    const drawn = lamps(grounds('dusk', manifest, hall));
    expect(drawn.map((l) => `${l.c},${l.r}`).sort()).toEqual(['-0.5,-0.5', '-0.5,0.5', '0.5,-0.5', '0.5,0.5']);
  });

  it("T-AC-16: the phone draws the lamp's small pictures", () => {
    const html = grounds('dusk', manifest, COLONY, 'phone');
    expect(lamps(html).length).toBeGreaterThan(0);
    expect(html).toContain('/art/colony/lamp/dusk@400.webp');
    expect(html).toContain('/art/colony/lamp/glow@400.webp');
    expect(html).not.toContain('/art/colony/lamp/dusk@800.webp');
  });

  it('T-AC-16: with no plate the inner crossings have no pools, so no lamp either', () => {
    const { plate: _, ...noPlate } = manifest;
    expect(noPlate.lamp).toBeDefined();
    expect(lamps(grounds('dusk', noPlate))).toHaveLength(0);
  });

  it('T-AC-16: with no lamp in the manifest, no lamp is drawn', () => {
    const { lamp: _, ...without } = manifest;
    expect(lamps(grounds('dusk', without))).toHaveLength(0);
  });
});
