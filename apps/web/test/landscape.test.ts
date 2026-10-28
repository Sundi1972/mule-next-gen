import { device, document, layout, paintedCanvases } from './fake-dom';
import { Landscape, type Terrain } from '@mule/ui';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

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

/** Mounts the map's landscape laid out `width` CSS px wide, waits for its picture, unmounts it and returns the picture. */
async function showAt(width: number): Promise<string | null> {
  layout.width = width;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host as unknown as HTMLElement);
  root.render(createElement(Landscape, { width: W, height: H, terrain: TERRAIN, theme: 'light', seed: 93 }));
  const src = await vi.waitFor(
    () => {
      const img = host.findAll('img')[0];
      if (!img) throw new Error('the landscape has no picture yet');
      return img.getAttribute('src');
    },
    { timeout: 10_000, interval: 5 },
  );
  root.unmount();
  document.body.removeChild(host);
  return src;
}

describe('the landscape on a phase change', () => {
  it('FM-FREEZE-1: a map laid out 955 px wide and then 992 px wide on the same device is painted once, at the device resolution, and shown both times', async () => {
    // An iPhone SE held sideways: 568×320 CSS px at 2×. The map fits it at min(568 / 13, 320 / 7) = 43.7 px a plot,
    // 87.4 device px, rounded up to the step of 32: 96 px a plot, a 1248×672 picture.
    device.screen.width = 568;
    device.screen.height = 320;
    device.devicePixelRatio = 2;
    performance.clearMarks('landscape-paint');

    // The hub draws the map 955 px wide; the land grant, 992 px.
    const hub = await showAt(955);
    const grant = await showAt(992);

    expect(paintedCanvases).toEqual([{ width: 13 * 96, height: 7 * 96 }]);
    expect(hub).toBeTruthy();
    expect(grant).toBe(hub);
    // The counter the browser checks reads the same paint.
    expect(performance.getEntriesByName('landscape-paint')).toHaveLength(1);
  });
});
