import type { Terrain } from '../components/tokens';
import type { LandscapeInput, LandscapeTheme } from './landscape';

/** One landscape to paint: what `renderLandscape` needs, with the terrain as a plain array a worker can be sent. */
export interface LandscapeJob {
  width: number;
  height: number;
  pxPerTile: number;
  theme: LandscapeTheme;
  seed: number;
  /** Row by row, `width` to a row. */
  terrain: (Terrain | undefined)[];
}

/** What the page sends the landscape worker, and what comes back; `incapable` when the worker can never paint. */
export type PainterRequest = { id: number; job: LandscapeJob };
export type PainterReply = { id: number; blob: Blob } | { id: number; error: string; incapable: boolean };

export function landscapeInput(job: LandscapeJob): LandscapeInput {
  return { ...job, terrainAt: (x, y) => job.terrain[y * job.width + x] };
}
