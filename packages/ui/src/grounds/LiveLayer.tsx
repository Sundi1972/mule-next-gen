/**
 * The grounds' live layer (spec C4): what changes over the still pictures, drawn cheaply on any phone. Grafted from the
 * approved scaffold, design/mocks/colony-grounds/src/look/Living.tsx: its lit glow pass and its colonists, placed here on
 * the grounds' paths instead of one picture's frame.
 */
import { useEffect, useState } from 'react';
import { useEventReducedMotion } from '../events/motion';
import type { GridPlace } from './layout';
import { iso } from './projection';
import { METRE, walkerAt, walkRoute } from './walks';

export interface PictureBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A building's glow pass laid over its picture. It adds light (screen), as the look page's "lit" view does; a glow
 * file that fails to load simply leaves the picture unlit.
 */
export function Glow({ href, opacity, box, testid }: { href: string; opacity: number; box: PictureBox; testid: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <image href={href} {...box} opacity={opacity} style={{ mixBlendMode: 'screen' }} pointerEvents="none" data-testid={testid} onError={() => setFailed(true)} />;
}

/** The scaffold's pixels per metre: the figure below is its drawing, scaled to the grounds. */
const SCAFFOLD_METRE = 1600 / 21;
const COLOURS = ['var(--color-p1)', 'var(--color-p2)', 'var(--color-p3)', 'var(--color-p4)'];

/** One colonist at `seconds` into the walk: the scaffold's figure, 1.5 m tall in a coat of a player's colour. */
function Colonist({ i, seconds, rim, blocks }: { i: number; seconds: number; rim: number; blocks: GridPlace[] }) {
  const [c, r] = walkerAt(i, seconds, walkRoute(i, rim, blocks));
  const [fx, fy] = iso(c, r);
  // The scaffold's drawing, in its own pixels with the feet at the origin.
  const z = (m: number) => -m * Math.cos(Math.PI / 6) * SCAFFOLD_METRE;
  const step = Math.sin(seconds * 9 + i * 1.7) * 3;
  return (
    <g transform={`translate(${fx.toFixed(1)} ${fy.toFixed(1)}) scale(${(METRE / SCAFFOLD_METRE).toFixed(4)})`} data-testid="walker">
      <ellipse cx={8} cy={2} rx={12} ry={4.5} fill="#000" opacity={0.3} />
      <line x1={-2.5} y1={0} x2={-2.5 + step} y2={z(0.75)} stroke="#2a2f3a" strokeWidth={4.5} strokeLinecap="round" />
      <line x1={2.5} y1={0} x2={2.5 - step} y2={z(0.75)} stroke="#2a2f3a" strokeWidth={4.5} strokeLinecap="round" />
      <rect x={-6} y={z(1.3)} width={12} height={z(0.7) - z(1.3)} rx={5} fill={COLOURS[i % 4]} />
      <circle cx={0} cy={z(1.42)} r={6} fill="#e9c9a8" stroke="#3a2a20" strokeWidth={1} />
    </g>
  );
}

/**
 * The colonists out on the paths, walking from the edge of the land at `rim` (place units from the hall). With reduced
 * motion, and before the page runs, they stand still where the walk starts.
 */
export function Walkers({ count, rim, blocks }: { count: number; rim: number; blocks: GridPlace[] }) {
  const reduced = useEventReducedMotion();
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (reduced || count === 0) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setSeconds((now - start) / 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced, count]);
  return (
    <g pointerEvents="none" data-testid="walkers">
      {Array.from({ length: count }, (_, i) => (
        <Colonist key={i} i={i} seconds={reduced ? 0 : seconds} rim={rim} blocks={blocks} />
      ))}
    </g>
  );
}
