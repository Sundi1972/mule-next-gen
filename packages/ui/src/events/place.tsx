import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../components/tokens';
import { useShow } from './frame';
import type { ShowSize } from './types';

/** Placing things on the show's map, in the map's own space: shared by the stories and the roll call. */

export type P = { x: number; y: number };

/** Something centred on a point in tiles (fractions between tiles), `w` tiles wide. */
export function At({ p, w, children, style, className, testId }: { p: P; w: number; children: ReactNode; style?: CSSProperties; className?: string; testId?: string }) {
  const { grid } = useShow();
  return (
    <div className={cx('absolute', className)} data-testid={testId} style={{ left: `${((p.x + 0.5) / grid.width) * 100}%`, top: `${((p.y + 0.5) / grid.height) * 100}%`, width: `${(w / grid.width) * 100}%`, transform: 'translate(-50%, -50%)', ...style }}>
      {children}
    </div>
  );
}

/**
 * Small words on the map, sized in the map's own width so the camera's zoom makes them readable: the gallery's TV
 * map was 820 px wide (its phone map 540 px, at two thirds the size), so n px there is n / 8.2 cqw at both sizes.
 */
export const px = (_size: ShowSize, n: number) => `${n / 8.2}cqw`;
