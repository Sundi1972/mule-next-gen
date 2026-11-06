/**
 * The grounds' live layer (spec C4): what changes over the still pictures, drawn cheaply on any phone. Grafted from the
 * approved scaffold, design/mocks/colony-grounds/src/look/Living.tsx: its lit glow pass and its colonists, placed here on
 * the grounds' paths instead of one picture's frame.
 */
import { useEffect, useState } from 'react';
import { useEventReducedMotion } from '../events/motion';
import { iso, W } from './projection';

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

/** A place is 12 m across (ART-DIRECTION §2), so one metre is this many scene units. */
const METRE = W / 12;
/** The scaffold's colonists walk their paths at about 2.9 m/s (3.3 m of path in 0.4 of a 2.86 s lap). */
const PACE = 2.9 * METRE;
/** Each colonist starts this far round the walk behind the one before (the scaffold's spacing). */
const SPACING = 0.29;
/** The scaffold's pixels per metre: the figure below is its drawing, scaled to the grounds. */
const SCAFFOLD_METRE = 1600 / 21;
const COLOURS = ['var(--color-p1)', 'var(--color-p2)', 'var(--color-p3)', 'var(--color-p4)'];

/** The four path spokes out from the hall, in place units: north, east, south, west (col runs east, row south). */
const SPOKES: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/** Where spoke k's path, the gap half a place to its side, meets the ring of paths round the hall: a corner of it. */
const cornerOf = (k: number): [number, number] => {
  const [dc, dr] = SPOKES[k]!;
  return [(dc - dr) / 2, (dr + dc) / 2];
};

/**
 * Colonist i's walk as the scaffold has it: in along one spoke's path from the rim, round the hall, out along another.
 * The paths are the gaps between places, so a colonist never walks through a building's place.
 */
function routeOf(i: number, rim: number): [number, number][] {
  const a = i % 4;
  const b = (i + 1 + (i % 2)) % 4;
  const out = (k: number): [number, number] => {
    const [c, r] = cornerOf(k);
    const [dc, dr] = SPOKES[k]!;
    const reach = rim - 0.5;
    return [c + dc * reach, r + dr * reach];
  };
  const round: [number, number][] = [];
  for (let k = a; k !== b; k = (k + 1) % 4) round.push(cornerOf(k));
  return [out(a), ...round, cornerOf(b), out(b)];
}

/** The point `along` place units down a route; past its end, the walk starts again at the rim. */
function pointOn(route: [number, number][], along: number): [number, number] {
  const legs = route.slice(1).map((p, k) => Math.hypot(p[0] - route[k]![0], p[1] - route[k]![1]));
  let d = along % legs.reduce((s, l) => s + l, 0);
  for (let k = 0; k < legs.length; k++) {
    if (d <= legs[k]!) {
      const t = legs[k]! === 0 ? 0 : d / legs[k]!;
      const [p, q] = [route[k]!, route[k + 1]!];
      return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    }
    d -= legs[k]!;
  }
  return route[route.length - 1]!;
}

/** One colonist at `seconds` into the walk: the scaffold's figure, 1.5 m tall in a coat of a player's colour. */
function Colonist({ i, seconds, rim }: { i: number; seconds: number; rim: number }) {
  const route = routeOf(i, rim);
  const length = route.slice(1).reduce((s, p, k) => s + Math.hypot(p[0] - route[k]![0], p[1] - route[k]![1]), 0);
  const [c, r] = pointOn(route, (seconds * PACE) / W + SPACING * i * length);
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
export function Walkers({ count, rim }: { count: number; rim: number }) {
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
        <Colonist key={i} i={i} seconds={reduced ? 0 : seconds} rim={rim} />
      ))}
    </g>
  );
}
