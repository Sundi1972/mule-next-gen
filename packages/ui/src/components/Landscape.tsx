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
 * shows the same picture at once. Until it arrives the map shows its base colour.
 */
export function Landscape({ width, height, terrain, theme, seed = 7, className }: LandscapeProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const { screen, innerWidth, innerHeight, devicePixelRatio } = window;
    // A browser that reports no screen size has the window's to go on.
    const known = screen.width > 0 && screen.height > 0;
    const pxPerTile = landscapePxPerTile(
      { width, height },
      { width: known ? screen.width : innerWidth, height: known ? screen.height : innerHeight, dpr: devicePixelRatio },
    );
    return requestLandscape({ width, height, pxPerTile, theme, seed, terrain }, setUrl);
  }, [width, height, theme, seed, terrain]);

  return (
    <div aria-hidden className={className}>
      {url && <img src={url} alt="" className="block h-full w-full animate-[fade-in_400ms_ease-out]" draggable={false} />}
    </div>
  );
}
