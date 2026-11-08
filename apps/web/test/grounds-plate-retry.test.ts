import { document, FakeElement } from './fake-dom';
import { ColonyGrounds, type GroundsColony, type GroundsManifest, type Light } from '@mule/ui';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

/*
 * The grounds mounted in a fake DOM, for what a server render can't show: what the plate does after its picture fails
 * to load. A failure calls the onError React gave the element; the fake DOM dispatches no events.
 */

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const doc = document as unknown as { createElementNS?: (ns: string, tag: string) => FakeElement };
  doc.createElementNS ??= (_ns, tag) => document.createElement(tag);
});

const ENTRY = { day: 'd@800.webp', dusk: 'k@800.webp', glow: null };
const MANIFEST: GroundsManifest = {
  frame: { width: 1600, height: 1600, place: 1293, centre: [800, 1000] },
  sizes: [800],
  pictures: { hall: { standing: ENTRY } },
  plate: {
    '3': { day: 'plate/3-day@800.webp', dusk: 'plate/3-dusk@800.webp', glow: null, frame: { width: 6144, height: 3456, hall: [3072, 2074] } },
    '5': { day: 'plate/5-day@800.webp', dusk: 'plate/5-dusk@800.webp', glow: null, frame: { width: 8960, height: 5040, hall: [4480, 2640] } },
  },
};
/** The hall alone, and nobody out walking, so no animation frame is asked for. */
const COLONY: GroundsColony = { gauges: { happiness: 0, wealth: 0 }, projects: [] };

let host: FakeElement;
let root: Root | null = null;

function show(light: Light) {
  act(() => root!.render(createElement(ColonyGrounds, { colony: COLONY, size: 'tv', manifest: MANIFEST, light })));
}

function byTestid(node: FakeElement, testid: string): FakeElement | undefined {
  if (node.getAttribute('data-testid') === testid) return node;
  for (const c of node.childNodes) {
    const found = c instanceof FakeElement ? byTestid(c, testid) : undefined;
    if (found) return found;
  }
  return undefined;
}

const plateHref = () => byTestid(host, 'plate')?.getAttribute('href') ?? null;

function failPlate() {
  const el = byTestid(host, 'plate')!;
  const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'))!;
  act(() => (el as unknown as Record<string, { onError: () => void }>)[key]!.onError());
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

describe('the plate after its picture fails (HC-3, T-AC-10)', () => {
  it('T-AC-10: a plate picture that failed once is never asked for again in this mount, whatever the light does', () => {
    host = document.createElement('div') as unknown as FakeElement;
    root = createRoot(host as never);

    show('day');
    expect(plateHref()).toBe('/art/colony/plate/3-day@800.webp');
    failPlate();
    expect(plateHref(), 'the failed day plate gives way to the SVG ground').toBeNull();
    expect(byTestid(host, 'paving')).toBeDefined();

    show('dusk');
    expect(plateHref(), 'the dusk plate has not failed yet').toBe('/art/colony/plate/3-dusk@800.webp');
    failPlate();
    expect(plateHref()).toBeNull();

    show('day');
    expect(plateHref(), 'the day plate is not asked for again').toBeNull();
    show('dusk');
    expect(plateHref(), 'nor the dusk plate').toBeNull();
    expect(byTestid(host, 'paving')).toBeDefined();
  });
});
