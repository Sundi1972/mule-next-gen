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

describe('B-AC-9 (WS6 ruling and PM ruling, 7 Nov): the map rendered at a measured plot size', () => {
  /** A 4×3 map: plot 1-0 analysed (Water 2 of 3), plot 1-1 selected under it, plot 2-1 selected under nothing. */
  const tiles: MapTile[] = Array.from({ length: 12 }, (_, i) => ({ x: i % 4, y: Math.floor(i / 4), terrain: 'plains', owner: null, ...(i === 1 ? { ground: { water: 2 } } : {}) }));

  /** The map mounted at `plot` px plots once its commits have settled; unmounted after `read`. */
  async function at<T>(plot: number, selected: { x: number; y: number }, read: (map: FakeElement) => T): Promise<T> {
    layout.width = plot * 4;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host as unknown as HTMLElement);
    let commits = 0;
    root.render(createElement(Profiler, { id: 'map', onRender: () => commits++ }, createElement(HoloMap, { width: 4, height: 3, tiles, selected })));
    for (let seen = -1; seen !== commits; ) {
      seen = commits;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    try {
      return read(host);
    } finally {
      root.unmount();
      document.body.removeChild(host);
      layout.width = MAP_PX;
    }
  }
  const byId = (map: FakeElement, id: string) => map.findAll('span').concat(map.findAll('button'), map.findAll('div')).find((e) => e.getAttribute('data-testid') === id);
  const chipOf = (map: FakeElement) => {
    const chip = byId(map, 'map-dots-1-0')!;
    return { classes: chip.getAttribute('class') ?? '', icons: chip.findAll('svg').length, dots: chip.findAll('span').filter((s) => /\bsize-\[3px\]/.test(s.getAttribute('class') ?? '')), label: byId(map, 'map-plot-1-0')?.getAttribute('aria-label') };
  };

  it('under 16 px the chip drops its icon and keeps three 3 px dots, lit in the good’s colour, at 1 px by 2 px padding; the label still names the good', async () => {
    const chip = await at(12.8, { x: 1, y: 1 }, chipOf);
    expect(chip.icons).toBe(0);
    expect(chip.dots).toHaveLength(3);
    expect(chip.dots.map((d) => d.style.background)).toEqual(['var(--color-g-water)', 'var(--color-g-water)', 'var(--color-map-grid)']);
    expect(chip.classes).toMatch(/\bpx-px py-\[2px\]/);
    expect(chip.label).toBe('Plains, free, Water 2 of 3');
  });

  it('at 16 px the chip is unchanged: the good’s icon over the dots, 3 px by 2 px padding; the label names the good', async () => {
    const chip = await at(16, { x: 1, y: 1 }, chipOf);
    expect(chip.icons).toBe(1);
    expect(chip.dots).toHaveLength(3);
    expect(chip.classes).toMatch(/\bpx-\[3px\] py-\[2px\]/);
    expect(chip.label).toBe('Plains, free, Water 2 of 3');
  });

  it('under dots the glow’s box comes in to 0.4 px out on a 12.8 px plot; under no dots it stays 8% out', async () => {
    const glow = (map: FakeElement) => {
      const g = byId(map, 'selected-glow')!;
      return { classes: g.getAttribute('class') ?? '', inset: g.style.inset, shadow: g.style.boxShadow };
    };
    const under = await at(12.8, { x: 1, y: 1 }, glow);
    expect(under.classes).not.toMatch(/-inset-\[8%\]/);
    expect(parseFloat(under.inset ?? '')).toBeCloseTo(-0.4, 6);
    expect(under.shadow).toBe('0 0 12px 4px var(--color-holo)');
    const free = await at(12.8, { x: 2, y: 1 }, glow);
    expect(free.classes).toMatch(/-inset-\[8%\]/);
    expect(free.inset).toBeFalsy();
  });
});
