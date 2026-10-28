import { device, document, fakeWorker, installWorker, layout, paintedCanvases, removeWorker, type FakeElement, type WorkerAnswer } from './fake-dom';
import type { Terrain } from '@mule/ui';
import { createElement, Fragment, type ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const W = 13;
const H = 7;
/** A small colony: plains, a river down column 6, a ridge of mountains and the store in the middle. */
const TERRAIN: Terrain[] = Array.from({ length: W * H }, (_, i) => {
  const x = i % W;
  const y = Math.floor(i / W);
  if (x === 6 && y === 3) return 'store';
  if (x === 6) return 'river';
  if (y === 1 && x > 8) return 'mountains';
  return 'plains';
});

/** A 3×2 swatch of one terrain, like the holo-table's terrain cards. */
const swatch = (seed: number, terrain: Terrain = 'plains') => ({ width: 3, height: 2, terrain: new Array<Terrain>(6).fill(terrain), seed });

type Props = { width: number; height: number; terrain: Terrain[]; seed: number; theme?: 'light' | 'dark' };

/** Each test loads the UI afresh, as a page does: nothing painted yet, no worker made. */
let Landscape: typeof import('@mule/ui').Landscape;

beforeEach(async () => {
  vi.resetModules();
  ({ Landscape } = await import('@mule/ui'));
  paintedCanvases.length = 0;
  performance.clearMarks('landscape-paint');
  // A small screen with an even smaller window, so pictures are cheap to paint here.
  device.screen = { width: 192, height: 128 };
  device.window = { width: 96, height: 64 };
  device.devicePixelRatio = 1;
});

/** Screens still mounted, unmounted after each test so a failed one can't paint into the next. */
const mounted = new Set<{ unmount(): void }>();

afterEach(() => {
  for (const screen of mounted) screen.unmount();
  if (document.hidden) document.setHidden(false);
  removeWorker();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const land = ({ theme = 'light', ...map }: Props) => createElement(Landscape, { ...map, theme });

/**
 * Mounts the maps on one screen. Each render commits at once, effects included, as React does for a tap.
 * `render(maps, remount)` renders again; with `remount` every map is a new element, as on a phase change.
 */
function mount(...maps: Props[]) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host as unknown as HTMLElement);
  let generation = 0;
  const render = (list: Props[], remount = false) => {
    if (remount) generation++;
    flushSync(() => root.render(createElement(Fragment, null, ...list.map((m, i) => createElement(Fragment, { key: `${generation}-${i}` }, land(m))))));
  };
  render(maps);
  const screen = {
    host,
    render,
    srcs: () => host.findAll('img').map((img: FakeElement) => img.getAttribute('src')),
    unmount() {
      mounted.delete(screen);
      root.unmount();
      document.body.removeChild(host);
    },
  };
  mounted.add(screen);
  return screen;
}

/** Waits until `host` shows `n` pictures, and returns their sources. */
async function pictures(host: FakeElement, n: number): Promise<(string | null)[]> {
  return vi.waitFor(
    () => {
      const srcs = host.findAll('img').map((img) => img.getAttribute('src'));
      if (srcs.length < n) throw new Error(`${srcs.length} of ${n} pictures so far`);
      return srcs;
    },
    { timeout: 10_000, interval: 5 },
  );
}

/** Shows one map until its picture arrives, then leaves. */
async function show(map: Props): Promise<string | null> {
  const screen = mount(map);
  const [src] = await pictures(screen.host, 1);
  screen.unmount();
  return src ?? null;
}

describe('the landscape on a phase change', () => {
  it('FM-FREEZE-1: a map laid out 955 px wide and then 992 px wide on the same device is painted once, at the device resolution, and shown both times', async () => {
    // A small screen held sideways: 284×160 CSS px at 2×. The map fits it at min(284 / 13, 160 / 7) = 21.8 px a plot,
    // 43.7 device px, rounded up to the step of 32: 64 px a plot, an 832×448 picture. The browser window is smaller,
    // 200×110, and must not count: it would give 15.4 px a plot, 32 at 2×. Kept small: CI paints it on a slow core.
    device.screen = { width: 284, height: 160 };
    device.window = { width: 200, height: 110 };
    device.devicePixelRatio = 2;
    const map = { width: W, height: H, terrain: TERRAIN, seed: 93 };

    // The hub draws the map 955 px wide; the land grant, 992 px.
    layout.width = 955;
    const hub = await show(map);
    layout.width = 992;
    const grant = await show(map);

    expect(paintedCanvases).toEqual([{ width: 13 * 64, height: 7 * 64 }]);
    // Encoded off this thread where the browser can, into the same blob-URL cache as the worker's pictures.
    expect(hub).toMatch(/^blob:/);
    expect(grant).toBe(hub);
    // The counter the browser checks reads the same paint.
    expect(performance.getEntriesByName('landscape-paint')).toHaveLength(1);
    // As long as `pictures` waits: this proves which picture is painted, not how fast.
  }, 10_000);

  it('FM-FREEZE-1: a screen that leaves before its picture arrives costs no paint', async () => {
    const gone = mount({ ...swatch(1), width: 4 });
    gone.unmount();
    // The queue paints in order asked, so once this later map shows, the gone screen's turn has passed.
    await show(swatch(2));

    // 3×2 on the 192×128 screen: 64 px a plot.
    expect(paintedCanvases).toEqual([{ width: 192, height: 128 }]);
  });

  it('FM-FREEZE-1: two maps of one colony on one screen share one paint and one picture; the night theme paints its own', async () => {
    const screen = mount(swatch(3), swatch(3));
    const [a, b] = await pictures(screen.host, 2);
    screen.unmount();

    expect(paintedCanvases).toHaveLength(1);
    expect(a).toBeTruthy();
    expect(b).toBe(a);

    const night = await show({ ...swatch(3), theme: 'dark' });
    expect(paintedCanvases).toHaveLength(2);
    expect(night).not.toBe(a);
  });

  it('FM-FREEZE-2: five maps on a screen that re-renders, is remounted, or switches theme keep a picture on screen: no repaint, and none revoked while shown', async () => {
    const maps = [1, 2, 3, 4, 5].map((seed) => swatch(seed));
    const screen = mount(...maps);
    const before = await pictures(screen.host, 5);
    expect(paintedCanvases).toHaveLength(5);

    // The holo-table's terrain cards re-render as the slider moves: equal terrain in new arrays.
    screen.render(maps.map((m) => ({ ...m, terrain: [...m.terrain] })));
    // A phase change remounts them: every old effect is cleaned up before any new one runs.
    screen.render(maps, true);
    await show(swatch(6));

    expect(paintedCanvases).toHaveLength(6);
    expect(screen.srcs()).toEqual(before);

    // Switched to the night theme, each map shows its day picture until its night one arrives, then switches.
    const revoked: string[] = [];
    const revokedWhileShown: string[] = [];
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => {
      revoked.push(url);
      if (screen.srcs().includes(url)) revokedWhileShown.push(url);
    });
    screen.render(maps.map((m) => ({ ...m, theme: 'dark' })));
    await Promise.resolve();
    expect(screen.srcs()).toEqual(before);
    expect(revoked).toEqual([]);

    const night = await vi.waitFor(
      () => {
        const srcs = screen.srcs();
        if (srcs.some((src) => before.includes(src))) throw new Error('night pictures still painting');
        return srcs;
      },
      { timeout: 10_000, interval: 5 },
    );
    expect(night).toHaveLength(5);
    expect(paintedCanvases).toHaveLength(11);
    expect(revokedWhileShown).toEqual([]);
    // With more than 3 pictures cached, every day picture went, once it was off screen.
    expect([...revoked].sort()).toEqual([...before].sort());
    screen.unmount();
  });
});

describe('the landscape painted in a worker', () => {
  it('FM-FREEZE-1: a map re-rendered dark while its light picture is painting shows the dark picture, never the light one', async () => {
    installWorker(['held', 'held']);
    const made: string[] = [];
    const createObjectURL = URL.createObjectURL.bind(URL);
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      const url = createObjectURL(blob as Blob);
      made.push(url);
      return url;
    });
    const screen = mount(swatch(11));
    await vi.waitFor(() => expect(fakeWorker.jobs).toHaveLength(1), { interval: 5 });

    screen.render([{ ...swatch(11), theme: 'dark' }]);
    fakeWorker.release();
    // The light picture is in, and the dark one sent, 16 ms later: long after any render the light one caused.
    await vi.waitFor(() => expect(fakeWorker.jobs).toHaveLength(2), { interval: 5 });
    expect(made).toHaveLength(1);
    expect(screen.srcs()).toEqual([]);

    fakeWorker.release();
    expect(await pictures(screen.host, 1)).toEqual([made[1]]);
    screen.unmount();
  });

  it('FM-FREEZE-2: of five maps shown in turn, the two oldest pictures are revoked, never the one on screen', async () => {
    installWorker();
    const revoked: string[] = [];
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => void revoked.push(url));

    const shown = [];
    for (const seed of [1, 2, 3, 4]) shown.push(await show(swatch(seed)));
    const onScreen = mount(swatch(5));
    shown.push((await pictures(onScreen.host, 1))[0]);

    expect(fakeWorker.jobs).toHaveLength(5);
    expect(paintedCanvases).toHaveLength(0);
    expect(shown.every((src) => src?.startsWith('blob:'))).toBe(true);
    expect(revoked).toEqual([shown[0], shown[1]]);
    onScreen.unmount();
  });

  const BOTH_HERE = [{ width: 256, height: 128 }, { width: 192, height: 128 }];
  // Two maps in turn: what the worker answers the first (and whether the page has OffscreenCanvas), how many jobs
  // the worker is sent, and which pictures are then painted on this thread.
  const FAILURES: [string, WorkerAnswer[], boolean, number, { width: number; height: number }[]][] = [
    ['a job the worker fails is painted on this thread, and the next picture comes from the worker again', ['fail'], true, 2, [{ width: 256, height: 128 }]],
    ['a worker with no 2D OffscreenCanvas is given up, and both pictures are painted on this thread', ['incapable'], true, 1, BOTH_HERE],
    ['a worker that crashes is given up, and both pictures are painted on this thread', ['crash'], true, 1, BOTH_HERE],
    ['a page with workers but no OffscreenCanvas sends the worker nothing and paints both on this thread', [], false, 0, BOTH_HERE],
  ];

  it.each(FAILURES)('FM-FREEZE-3: %s', async (_label, answers, offscreen, posted, paintedHere) => {
    installWorker(answers, { offscreen });
    const first = await show({ ...swatch(7), width: 4 });
    const second = await show(swatch(8));

    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(fakeWorker.jobs).toHaveLength(posted);
    expect(paintedCanvases).toEqual(paintedHere);
  });

  it('FM-FREEZE-3: a worker that never answers is given up after 30 s; the picture is painted on this thread, and so is the next', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    installWorker(['silent']);
    const screen = mount({ ...swatch(9), width: 4 });
    await vi.waitFor(() => expect(fakeWorker.jobs).toHaveLength(1), { interval: 5 });

    // A slow paint is not a hung worker: nothing is painted twice before the 30 s are up.
    await vi.advanceTimersByTimeAsync(29_900);
    expect(paintedCanvases).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(200);
    expect(paintedCanvases).toEqual([{ width: 256, height: 128 }]);
    await pictures(screen.host, 1);
    screen.unmount();

    const next = mount(swatch(10));
    await pictures(next.host, 1);
    expect(fakeWorker.jobs).toHaveLength(1);
    expect(paintedCanvases).toHaveLength(2);
    next.unmount();
  });

  it("FM-FREEZE-3: a page hidden for 60 s while the worker paints keeps its worker, and the worker's picture shows", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    installWorker(['held']);
    const screen = mount({ ...swatch(12), width: 4 });
    await vi.waitFor(() => expect(fakeWorker.jobs).toHaveLength(1), { interval: 5 });

    // The phone is locked mid-paint for a minute; 10 s after it comes back, the worker answers.
    document.setHidden(true);
    await vi.advanceTimersByTimeAsync(60_000);
    document.setHidden(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(paintedCanvases).toHaveLength(0);
    fakeWorker.release();
    expect(await pictures(screen.host, 1)).toEqual([expect.stringMatching(/^blob:/)]);
    screen.unmount();

    const next = mount(swatch(13));
    await pictures(next.host, 1);
    expect(fakeWorker.jobs).toHaveLength(2);
    expect(paintedCanvases).toHaveLength(0);
    next.unmount();
  });

  it('FM-FREEZE-3: a worker that crashes between pictures is given up at once: the next picture is painted on this thread, not 30 s later', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    installWorker();
    await show(swatch(14));
    fakeWorker.current?.crash();

    const next = mount({ ...swatch(15), width: 4 });
    await vi.advanceTimersByTimeAsync(100);
    expect(paintedCanvases).toEqual([{ width: 256, height: 128 }]);
    expect(fakeWorker.jobs).toHaveLength(1);
    await pictures(next.host, 1);
    next.unmount();
  });
});
