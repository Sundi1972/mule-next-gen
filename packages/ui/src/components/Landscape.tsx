import { useEffect, useRef, useState } from 'react';
import { renderLandscape } from '../terrain/landscape';
import type { Theme } from './theme';
import type { Terrain } from './tokens';

export interface LandscapeProps {
  width: number;
  height: number;
  terrain: (Terrain | undefined)[];
  theme: Theme;
  seed?: number;
  className?: string;
}

const cache = new Map<string, string>();

/**
 * The painted land under the map. Renders once per map, size and theme at the screen's
 * full pixel density, then keeps the picture so later screens show it at once.
 */
export function Landscape({ width, height, terrain, theme, seed = 7, className }: LandscapeProps) {
  const box = useRef<HTMLDivElement>(null);
  const [cssWidth, setCssWidth] = useState(0);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      // Re-render only when the size changes by a noticeable step.
      const w = Math.round((e?.contentRect.width ?? 0) / 40) * 40;
      setCssWidth((prev) => (prev === w ? prev : w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!cssWidth) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const pxPerTile = Math.max(24, Math.min(180, Math.round((cssWidth * dpr) / width)));
    const key = `${width}x${height}:${seed}:${theme}:${pxPerTile}:${terrain.join(',')}`;
    const hit = cache.get(key);
    if (hit) {
      setUrl(hit);
      return;
    }
    let cancelled = false;
    // Let the screen paint first; the land fades in a moment later.
    const id = window.setTimeout(() => {
      const img = renderLandscape({ width, height, pxPerTile, theme, seed, terrainAt: (x, y) => terrain[y * width + x] });
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext('2d')?.putImageData(img, 0, 0);
      const data = canvas.toDataURL('image/png');
      cache.set(key, data);
      if (!cancelled) setUrl(data);
    }, 16);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [cssWidth, width, height, theme, seed, terrain]);

  return (
    <div ref={box} aria-hidden className={className}>
      {url && <img src={url} alt="" className="block h-full w-full animate-[fade-in_400ms_ease-out]" draggable={false} />}
    </div>
  );
}
