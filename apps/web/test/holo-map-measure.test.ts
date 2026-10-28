import { document, FakeElement, layout } from './fake-dom';
import { HoloMap, type MapTile } from '@mule/ui';
import { createElement, Profiler, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** A 4×2 map, 200 px wide: a 50 px plot, so the owner's tab is 23 px; from the 30 px fallback it would be 14. */
const W = 4;
const TILES: MapTile[] = Array.from({ length: W * 2 }, (_, i) => ({ x: i % W, y: Math.floor(i / W), terrain: 'plains', owner: i === 1 ? 0 : null }));
const MAP_PX = 200;
const TAB_PX = Math.round((MAP_PX / W) * 0.46);

/** The observers the map makes, counted on top of fake-dom's. */
const Base = globalThis.ResizeObserver;
const observers = { made: 0, disconnected: 0 };
class Counted extends Base {
  constructor(callback: ResizeObserverCallback) {
    super(callback);
    observers.made++;
  }
  override disconnect() {
    observers.disconnected++;
    super.disconnect();
  }
}

const hadMutationObserver = 'MutationObserver' in globalThis;

beforeAll(() => {
  globalThis.ResizeObserver = Counted;
  // fake-dom lays nothing out, draws no SVG and has no theme: every element is as wide as the layout says, an SVG
  // element is a plain one, and the theme is the default with nothing to watch.
  Object.defineProperty(FakeElement.prototype, 'clientWidth', { configurable: true, get: () => layout.width });
  Object.assign(document, { createElementNS: (_ns: string, tag: string) => document.createElement(tag) });
  Object.assign(document.documentElement, { dataset: {} });
  if (!hadMutationObserver) Object.assign(globalThis, { MutationObserver: class { observe() {} disconnect() {} } });
  layout.width = MAP_PX;
});

afterAll(() => {
  globalThis.ResizeObserver = Base;
  delete (FakeElement.prototype as { clientWidth?: number }).clientWidth;
  if (!hadMutationObserver) delete (globalThis as { MutationObserver?: unknown }).MutationObserver;
});

describe('B-AC-9 (WS4, plot look A): the plot size is measured before the first paint', () => {
  it('paints the first tab at the measured size, under StrictMode, and leaves no observer behind on unmount', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host as unknown as HTMLElement);
    const tab = () => host.findAll('span').find((s) => s.getAttribute('data-testid') === 'owner-1-0');
    const commits: { phase: string; tab: string }[] = [];
    const onRender = (_id: string, phase: string) => commits.push({ phase, tab: tab()?.style.width ?? 'none' });
    // Mounted at the default priority, as a screen change is. React commits the updates a commit's layout phase schedules
    // before the browser paints, and the Profiler calls them nested updates; what the passive effects schedule comes
    // after the paint. So the first frame is the mount's commit and the nested updates right after it.
    root.render(createElement(StrictMode, null, createElement(Profiler, { id: 'map', onRender }, createElement(HoloMap, { width: W, height: 2, tiles: TILES }))));
    for (let seen = -1; seen !== commits.length; ) {
      seen = commits.length;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const later = commits.findIndex((c, i) => i > 0 && c.phase !== 'nested-update');
    const firstFrame = commits[(later < 0 ? commits.length : later) - 1];
    expect(commits[0]?.phase, 'the map mounts').toBe('mount');
    expect(firstFrame?.tab, `the first frame's tab is ${TAB_PX} px, from the map's width, not the fallback's 14; commits ${JSON.stringify(commits)}`).toBe(`${TAB_PX}px`);

    expect(observers.made, 'the map watches its size').toBeGreaterThan(0);
    root.unmount();
    document.body.removeChild(host);
    expect(observers.made - observers.disconnected, `every observer is disconnected on unmount (made ${observers.made}, disconnected ${observers.disconnected})`).toBe(0);
  });
});
