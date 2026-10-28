import { useEffect, useState } from 'react';
import { requestLandscape } from '../terrain/landscape-painter';
import { landscapePxPerTile } from '../terrain/resolution';
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

/**
 * The painted land under the map. Painted once per map and theme, at the largest size this device can show the
 * map, off the main thread where the browser allows; CSS scales it to the map's box, so every screen of a game
 * shows the same picture at once. Until the first arrives the map shows its base colour; on a new map or theme
 * the old picture stays until the new one replaces it.
 */
export function Landscape({ width, height, terrain, theme, seed = 7, className }: LandscapeProps) {
  /** The picture on screen, and the call that lets the cache release it. */
  const [shown, setShown] = useState<{ url: string; letGo(): void } | null>(null);
  // Callers build the terrain afresh on every render; the same map must not ask again.
  const map = terrain.join(',');

  useEffect(() => {
    const { screen, innerWidth, innerHeight, devicePixelRatio } = window;
    // A browser that reports no screen size has the window's to go on.
    const known = screen.width > 0 && screen.height > 0;
    const pxPerTile = landscapePxPerTile(
      { width, height },
      { width: known ? screen.width : innerWidth, height: known ? screen.height : innerHeight, dpr: devicePixelRatio },
    );
    let onScreen = false;
    const stop = requestLandscape({ width, height, pxPerTile, theme, seed, terrain }, (url) => {
      onScreen = true;
      setShown({ url, letGo: () => stop() });
    });
    // A picture still painting is dropped; one on screen is let go only once its successor is drawn, below.
    return () => {
      if (!onScreen) stop();
    };
  }, [width, height, theme, seed, map]);

  // Runs after the next picture is in the DOM, or on unmount.
  useEffect(() => () => shown?.letGo(), [shown]);

  return (
    <div aria-hidden className={className}>
      {shown && <img src={shown.url} alt="" className="block h-full w-full animate-[fade-in_400ms_ease-out]" draggable={false} />}
    </div>
  );
}
