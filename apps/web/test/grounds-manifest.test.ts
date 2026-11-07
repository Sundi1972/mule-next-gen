import type { GroundsColony } from '@mule/ui';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const MANIFEST_URL = '/art/colony/manifest.json';
const shipped = JSON.parse(readFileSync(new URL('../public/art/colony/manifest.json', import.meta.url), 'utf8')) as Record<string, unknown>;

/** The renderer's two plates (design/art/colony/plate.py), as the manifest carries them beside the pictures. */
const PLATE = {
  '3': { day: 'plate/3-day@800.webp', dusk: 'plate/3-dusk@800.webp', glow: 'plate/3-glow@800.webp', frame: { width: 6144, height: 3456, hall: [3072, 2074] } },
  '5': { day: 'plate/5-day@800.webp', dusk: 'plate/5-dusk@800.webp', glow: null, frame: { width: 8960, height: 5040, hall: [4480, 2640] } },
};

const COLONY: GroundsColony = {
  gauges: { happiness: 72, wealth: 0 },
  projects: [{ id: 'park', name: 'Park', stage: 'standing', buildMonths: 1, monthsLeft: null, place: { x: 3, y: 2, w: 1, h: 1 } }],
};

/** A fresh loader, its manifest served as `body`: the module caches the first load for the whole app. */
async function load(body: unknown) {
  vi.resetModules();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === MANIFEST_URL ? new Response(JSON.stringify(body)) : new Response('', { status: 404 }))));
  const fresh = await import('../src/components/Grounds');
  const manifest = await fresh.loadGroundsManifest();
  return { manifest, html: renderToStaticMarkup(createElement(fresh.Grounds, { colony: COLONY, size: 'tv' })) };
}

type Plate = Record<string, Record<string, unknown> & { frame: Record<string, unknown> }>;

/** The shipped manifest with a plate whose one part is spoiled. */
function withPlate(spoil: (plate: Plate) => void = () => {}) {
  const plate = structuredClone(PLATE) as Plate;
  spoil(plate);
  return { ...structuredClone(shipped), plate };
}

describe('the grounds loader and the plate (AM-7, Task 4.3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('T-AC-10: a valid plate is kept with the pictures, and the grounds draw it', async () => {
    const { manifest, html } = await load(withPlate());
    expect(manifest?.plate).toEqual(PLATE);
    expect(manifest?.pictures).toEqual(shipped.pictures);
    expect(html).toContain('href="/art/colony/plate/3-day@800.webp"');
  });

  it.each<[string, (p: Plate) => void]>([
    ['the plate is a string', (p) => void Object.assign(p, { '3': 'plate/3.webp' })],
    ['plate "3" has no day picture', (p) => void delete p['3']!.day],
    ['plate "5" has a numeric dusk', (p) => void (p['5']!.dusk = 5)],
    ['plate "3" has no frame', (p) => void delete (p['3'] as Record<string, unknown>).frame],
    ["plate \"3\"'s frame has no number for its width", (p) => void (p['3']!.frame.width = 'wide')],
    ['the hall pixel is one number', (p) => void (p['5']!.frame.hall = [4480])],
    ['plate "5" is missing', (p) => void delete p['5']],
    ['a plate key is no extent', (p) => void (p['7'] = p['5']!)],
  ])('T-AC-10: when %s, the plate is dropped, the pictures are kept and the grounds draw their SVG ground', async (_, spoil) => {
    const { manifest, html } = await load(withPlate(spoil));
    expect(manifest).not.toBeNull();
    expect(manifest?.plate).toBeUndefined();
    expect(manifest?.pictures).toEqual(shipped.pictures);
    expect(html).toContain('href="/art/colony/park/standing-day@800.webp"');
    expect(html).not.toContain('/art/colony/plate/');
    expect(html).toContain('data-testid="paving"');
  });

  it('T-AC-10: a plate that is not an object at all is dropped on its own', async () => {
    const { manifest } = await load({ ...structuredClone(shipped), plate: 'plate.webp' });
    expect(manifest).not.toBeNull();
    expect(manifest?.plate).toBeUndefined();
  });

  it('HC-3: an unknown kind-level key under pictures still nulls the whole manifest, plate and all', async () => {
    const spoilt = withPlate() as Record<string, unknown> & { pictures: Record<string, Record<string, unknown>> };
    spoilt.pictures.park!.plate = PLATE['3'].frame;
    const { manifest, html } = await load(spoilt);
    expect(manifest).toBeNull();
    expect(html).not.toContain('<image');
  });
});
