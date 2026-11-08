/** Which colonists a building hides (spec C4, T-AC-13): pure geometry in place units from the hall, col east, row south. */
import type { GridPlace } from './layout';
import type { Spot } from './walks';

/** How far toward the camera, in places, a building still stands over a colonist: past this its picture is too short. */
const REACH = 3;

/**
 * Whether the ground point `spot` lies behind any of `blocks` as the camera sees it: the camera looks from the south-east,
 * so the line from the spot toward it runs (+1, +1) in (col, row), and the spot is behind a block when that line crosses
 * the block's footprint within REACH. A spot on a block's camera-facing edge is in front of it, not behind.
 */
export function behindAny([c, r]: Spot, blocks: GridPlace[]): boolean {
  return blocks.some(({ x, y, w, h }) => {
    const [c0, c1, r0, r1] = [x - 2.5, x + w - 2.5, y - 2.5, y + h - 2.5];
    const enter = Math.max(c0 - c, r0 - r);
    const leave = Math.min(c1 - c, r1 - r);
    return enter <= leave && leave > 0 && enter <= REACH;
  });
}
