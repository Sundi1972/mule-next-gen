/**
 * The grounds' live layer (spec C4): what changes over the still pictures, drawn cheaply on any phone. Grafted from the
 * approved scaffold, design/mocks/colony-grounds/src/look/Living.tsx: its lit glow pass and its colonists, placed here on
 * the grounds' paths instead of one picture's frame.
 */
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useEventReducedMotion } from '../events/motion';
import type { GridPlace } from './layout';
import { hiddenBy, type Occluder } from './occlusion';
import type { Heading, Light, WalkerEntry } from './pick';
import { iso } from './projection';
import { METRE, walkerOn, walkRoute, type Spot } from './walks';

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

/**
 * One colonist standing at `spot`, `seconds` into the walk: the scaffold's figure, 1.5 m tall in a player's colour. As a
 * `ghost` it is the same figure in a faint light outline, drawn over the buildings where one of them hides the colonist.
 */
function Colonist({ i, spot, seconds, ghost = false }: { i: number; spot: [number, number]; seconds: number; ghost?: boolean }) {
  const [fx, fy] = iso(spot[0], spot[1]);
  // The scaffold's drawing, in its own pixels with the feet at the origin.
  const z = (m: number) => -m * Math.cos(Math.PI / 6) * SCAFFOLD_METRE;
  const step = Math.sin(seconds * 9 + i * 1.7) * 3;
  const at = `translate(${fx.toFixed(1)} ${fy.toFixed(1)}) scale(${(METRE / SCAFFOLD_METRE).toFixed(4)})`;
  if (ghost) {
    return (
      <g transform={at} pointerEvents="none" fill="none" stroke="#f4efe6" strokeWidth={2} strokeOpacity={GHOST} data-testid="walker-ghost">
        <line x1={-2.5} y1={0} x2={-2.5 + step} y2={z(0.75)} strokeLinecap="round" />
        <line x1={2.5} y1={0} x2={2.5 - step} y2={z(0.75)} strokeLinecap="round" />
        <rect x={-6} y={z(1.3)} width={12} height={z(0.7) - z(1.3)} rx={5} />
        <circle cx={0} cy={z(1.42)} r={6} />
      </g>
    );
  }
  return (
    <g transform={at} pointerEvents="none" data-testid="walker">
      <ellipse cx={8} cy={2} rx={12} ry={4.5} fill="#000" opacity={0.3} />
      <line x1={-2.5} y1={0} x2={-2.5 + step} y2={z(0.75)} stroke="#2a2f3a" strokeWidth={4.5} strokeLinecap="round" />
      <line x1={2.5} y1={0} x2={2.5 - step} y2={z(0.75)} stroke="#2a2f3a" strokeWidth={4.5} strokeLinecap="round" />
      <rect x={-6} y={z(1.3)} width={12} height={z(0.7) - z(1.3)} rx={5} fill={COLOURS[i % 4]} />
      <circle cx={0} cy={z(1.42)} r={6} fill="#e9c9a8" stroke="#3a2a20" strokeWidth={1} />
    </g>
  );
}

/** How strongly a hidden colonist's outline shows over the building in front of it: faint, so the building reads first. */
const GHOST = 0.45;

/** The colonists' sheets, how to reach a file, and the light: from the manifest's `walker` entry (spec §3). */
export interface WalkerSprite {
  entry: WalkerEntry;
  light: Light;
  href: (src: string) => string;
}

/** The heading of a leg from `p` to `q`: its larger move along the grid decides. */
export function headingOf(p: Spot, q: Spot): Heading {
  const [dc, dr] = [q[0] - p[0], q[1] - p[1]];
  if (Math.abs(dc) >= Math.abs(dr)) return dc >= 0 ? '+x' : '-x';
  return dr < 0 ? '+y' : '-y';
}

/** How far out of step one colonist's walk cycle is from the one before, as a share of the cycle. */
const STEP_OFFSET = 0.37;

/** Which frame of the walk cycle colonist i shows `seconds` in: the first with reduced motion, the walk standing still. */
export function frameAt(i: number, seconds: number, reduced: boolean, { frames, seconds: cycle }: WalkerEntry): number {
  if (reduced) return 0;
  return Math.floor((seconds / cycle + i * STEP_OFFSET) * frames + 1e-9) % frames;
}

/** Colonist i's sheet: its suit one of the player colours in turn, its helmet and trims the next of its suit's variants. */
function sheetOf(i: number, { entry }: WalkerSprite): { day: string; dusk: string } | undefined {
  const suit = `p${(i % 4) + 1}-`;
  const variants = Object.keys(entry.sheets).filter((k) => k.startsWith(suit)).sort();
  return variants.length ? entry.sheets[variants[Math.floor(i / 4) % variants.length]!] : undefined;
}

/**
 * One colonist from its sheet: the cell for its heading and frame, cropped by a nested viewBox, its feet on `spot`. As a
 * `ghost`, the same crop of the outline sheet, faded on the image itself (a group opacity would isolate the blends).
 */
function Sprite({ spot, href, heading, frame, entry, ghost, onError }: { spot: Spot; href: string; heading: Heading; frame: number; entry: WalkerEntry; ghost: boolean; onError: () => void }) {
  const [fx, fy] = iso(spot[0], spot[1]);
  const { width: cw, height: ch, feet } = entry.cell;
  const k = METRE / entry.px_per_m;
  const row = Math.max(0, entry.headings.indexOf(heading));
  return (
    <svg
      x={(fx - feet[0] * k).toFixed(1)}
      y={(fy - feet[1] * k).toFixed(1)}
      width={(cw * k).toFixed(2)}
      height={(ch * k).toFixed(2)}
      viewBox={`${frame * cw} ${row * ch} ${cw} ${ch}`}
      overflow="hidden"
      pointerEvents="none"
      data-testid={ghost ? 'walker-ghost' : 'walker'}
    >
      <image href={href} width={cw * entry.frames} height={ch * entry.headings.length} preserveAspectRatio="none" opacity={ghost ? GHOST : undefined} onError={onError} />
    </svg>
  );
}

/** A colonist from its sheet where the manifest has one, else today's SVG figure (never blank; a sheet that fails falls back too). */
function Walker({ i, spot, leg, seconds, reduced, sprite, ghost = false }: { i: number; spot: Spot; leg: [Spot, Spot]; seconds: number; reduced: boolean; sprite?: WalkerSprite; ghost?: boolean }) {
  const [failed, setFailed] = useState(false);
  const sheet = sprite && sheetOf(i, sprite);
  if (!sprite || !sheet || failed) return <Colonist i={i} spot={spot} seconds={seconds} ghost={ghost} />;
  const href = sprite.href(ghost ? sprite.entry.outline : sheet[sprite.light]);
  return <Sprite spot={spot} href={href} heading={headingOf(...leg)} frame={frameAt(i, seconds, reduced, sprite.entry)} entry={sprite.entry} ghost={ghost} onError={() => setFailed(true)} />;
}

/** Something on the grounds drawn in painter's order: its element and its depth from the camera, col + row. */
export interface Placed {
  depth: number;
  node: ReactElement;
}

/**
 * The buildings, back to front, with the colonists walking among them: each colonist is drawn just before the first
 * building deeper than it stands, so a nearer building hides a colonist on a path behind it. The colonists walk from the
 * edge of the land at `rim` (place units from the hall) round the places in use (`blocks`). With reduced motion, and
 * before the page runs, they stand still where the walk starts.
 *
 * The clock lives here, not in ColonyGrounds: each tick re-renders only this, and the buildings' elements arrive
 * unchanged, so React leaves them alone.
 */
export function WalkingScene({
  scene,
  walkers,
  rim,
  blocks,
  occluders = [],
  routes: given,
  sprite,
}: {
  scene: Placed[];
  walkers: number;
  rim: number;
  blocks: GridPlace[];
  /** The pictures drawn among the colonists, with their silhouettes: a colonist one of them covers gets its outline drawn over them all. */
  occluders?: Occluder[];
  /** Each colonist's route, in place of the walk round the hall (a mock or a test places a colonist exactly). */
  routes?: Spot[][];
  /** The colonists' walk sheets; without them the colonists are SVG figures. */
  sprite?: WalkerSprite;
}) {
  const reduced = useEventReducedMotion();
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    // Where the frame clock is missing (or half-stubbed) the walkers stand still rather than throw on unmount.
    if (reduced || walkers === 0 || typeof requestAnimationFrame !== 'function' || typeof cancelAnimationFrame !== 'function') return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setSeconds((now - start) / 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced, walkers]);
  const routes = useMemo(() => given ?? Array.from({ length: walkers }, (_, i) => walkRoute(i, rim, blocks)), [given, walkers, rim, blocks]);
  const t = reduced ? 0 : seconds;
  const people = routes.map((route, i) => {
    const { spot, leg } = walkerOn(i, t, route);
    const hidden = hiddenBy(spot, occluders);
    const walker = (ghost: boolean) => <Walker key={`${ghost ? 'ghost' : 'walker'}-${i}`} i={i} spot={spot} leg={leg} seconds={t} reduced={reduced} sprite={sprite} ghost={ghost} />;
    return { depth: spot[0] + spot[1], node: walker(false), ghost: hidden ? walker(true) : null };
  }).sort((a, b) => a.depth - b.depth);
  const drawn: ReactElement[] = [];
  let next = 0;
  for (const item of scene) {
    while (next < people.length && people[next]!.depth < item.depth) drawn.push(people[next++]!.node);
    drawn.push(item.node);
  }
  while (next < people.length) drawn.push(people[next++]!.node);
  // Over every building: a hidden colonist's outline, so the eye can follow it behind them.
  for (const p of people) if (p.ghost) drawn.push(p.ghost);
  return <>{drawn}</>;
}

