import { document, FakeElement } from './fake-dom';
import { ColonyGrounds, type GroundsColony } from '@mule/ui';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The grounds' smoke on the page's frame clock (spec RULE-8, T-AC-15), mounted in the fake DOM: what a server render
 * can't show, because there the clock never runs. WS10's file (PM ruling, 8 Nov); the frame stub is colony-landing's.
 */

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const doc = document as unknown as { createElementNS?: (ns: string, tag: string) => FakeElement };
  doc.createElementNS ??= (_ns, tag) => document.createElement(tag);
});

let frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;
let device = { reduced: false };

beforeEach(() => {
  frames = new Map();
  nextFrame = 1;
  device = { reduced: false };
  Object.assign(window, {
    matchMedia: (q: string) => ({ media: q, matches: device.reduced && q === '(prefers-reduced-motion: reduce)', addEventListener() {}, removeEventListener() {} }),
  });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.set(nextFrame, cb);
    return nextFrame++;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});

let host: FakeElement;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  delete (window as { matchMedia?: unknown }).matchMedia;
  vi.unstubAllGlobals();
});

/** Runs every frame asked for, at `ms` on the page's frame clock. */
function frame(ms: number) {
  const due = [...frames.values()];
  frames.clear();
  act(() => due.forEach((cb) => cb(ms)));
}

/** A general strike nobody has paid: no colonist walks (RULE-3), so only the smoke can keep the clock running. */
const struck = (hospital: 'damaged' | 'standing'): GroundsColony => ({
  gauges: { happiness: 72, wealth: 2_000, environment: 0 },
  projects: [{ id: 'hospital', name: 'Hospital', stage: hospital, buildMonths: 2, monthsLeft: null, place: { x: 2, y: 3, w: 1, h: 1 } }],
  strike: { paid: false },
});

function show(colony: GroundsColony) {
  if (!root) {
    host = document.createElement('div');
    root = createRoot(host as unknown as Element);
  }
  act(() => root!.render(createElement(ColonyGrounds, { colony, size: 'phone', manifest: null, light: 'dusk' })));
}

function all(node: FakeElement, testid: string, out: FakeElement[] = []): FakeElement[] {
  if (node.getAttribute('data-testid') === testid) out.push(node);
  for (const c of node.childNodes) if (c instanceof FakeElement) all(c, testid, out);
  return out;
}

/** Where each puff of the smoke is drawn: its centre, as the page has it now. */
const puffs = () => all(host, 'puff').map((p) => `${p.getAttribute('cx')},${p.getAttribute('cy')}`);

describe('T-AC-15: the smoke on the page clock', () => {
  it('T-AC-15: in a strike nobody walks, yet a damaged building smokes and its plume moves from frame to frame', () => {
    show(struck('damaged'));
    expect(all(host, 'walker')).toHaveLength(0);
    const start = puffs();
    expect(start.length).toBeGreaterThan(0);
    expect(frames.size).toBe(1);
    frame(0);
    frame(1_500);
    expect(puffs()).toHaveLength(start.length);
    expect(puffs()).not.toEqual(start);
  });

  it('T-AC-15: with reduced motion the plume stands still: no frame is asked for and it does not move', () => {
    device.reduced = true;
    show(struck('damaged'));
    const start = puffs();
    expect(start.length).toBeGreaterThan(0);
    expect(frames.size).toBe(0);
    frame(1_500);
    expect(puffs()).toEqual(start);
  });

  it('regression (#819 review): once the clock has stopped, smoke that comes back starts its drift again, not where the last plume had got to', () => {
    show(struck('damaged'));
    const start = puffs();
    frame(0);
    frame(1_500);
    expect(puffs()).not.toEqual(start);
    // Repaired: nothing smokes, nobody walks, the clock stops. Damaged again: the new plume starts as the first did.
    show(struck('standing'));
    expect(puffs()).toHaveLength(0);
    show(struck('damaged'));
    expect(puffs()).toEqual(start);
  });
});
