/** The colony's grounds drawn from its view: the hall and each project's picture at its place (spec C2). */
import type { ObjectKind } from '../components/ObjectGlyph';
import { useId, useState, type ReactNode } from 'react';
import { cx } from '../components/tokens';
import { builtOf, HallShape, Lamp, PlaceShape, Tree } from './fallback';
import { frontOpacity, leaning, shortOfPlate, topOf, viewOf, type Box, type Framing } from './framing';
import { Glow, WalkingScene, type PictureBox } from './LiveLayer';
import { occluderOf } from './occlusion';
import { glowOpacity, walkersOut } from './live';
import { centreOf, edgeDecoration, extentOf, MASSING, type EdgeProp, type GridPlace } from './layout';
import { pick, type Frame, type GroundsManifest, type Light, type PictureKind, type PlaceState, type PlateEntry } from './pick';
import { iso, poly, square, W } from './projection';

export type { Frame, GroundsManifest, Light, PictureStage, PlateEntry, PlateExtent, PlateFrame } from './pick';
export type { Framing } from './framing';
export { GroundsOpener, useGroundsOpener, type OpenerState } from './GroundsOpener';

/** One project as `@mule/protocol`'s ColonyProjectView carries it; `place` arrives with spec AM-18 (null: none yet). */
export interface GroundsProject extends PlaceState {
  id: ObjectKind;
  name: string;
  place?: GridPlace | null;
}

/** The part of `@mule/protocol`'s ColonyView the grounds read (HC-1: read only). */
export interface GroundsColony {
  gauges: { happiness: number | null; wealth: number };
  projects: GroundsProject[];
  /** This month's general strike; once the fund has paid it, the strikers are back at work (G-5 RULE-26). */
  strike?: { paid: boolean } | null;
}

export interface ColonyGroundsProps {
  colony: GroundsColony;
  size: 'tv' | 'phone';
  /** The art manifest; null draws every place as its SVG shape. */
  manifest: GroundsManifest | null;
  /** Dusk at the month end and in the upkeep phase, day otherwise (RULE-1). */
  light?: Light;
  /** A full-screen camera on the built area; without it the scene frames the occupied extent at its plate's aspect, or without a plate the whole land. */
  framing?: Framing;
  /** The place numbers and stage chips over each place; off on the TV opener (AM-7 v). */
  chips?: boolean;
  className?: string;
}

export const ART_BASE = '/art/colony/';

/** The manifest names the largest size; a phone takes the smallest (HC-2). */
function hrefOf(src: string, { sizes }: GroundsManifest, size: ColonyGroundsProps['size']): string {
  if (sizes.length === 0) return ART_BASE + src;
  const width = size === 'phone' ? Math.min(...sizes) : Math.max(...sizes);
  return ART_BASE + src.replace(/@\d+(\.\w+)$/, `@${width}$1`);
}

/** A lit picture's glow pass (RULE-2): its file and how strongly it shows. */
interface Lit {
  href: string;
  opacity: number;
  testid: string;
}

/**
 * A picture placed so its frame's centre pixel sits on the place's centre, one place `frame.place` px wide, with its
 * glow pass straight over it so nearer buildings still cover a farther one's light. A failed picture takes its glow
 * with it: the fallback shape is never lit.
 */
/**
 * One building's picture and its glow. `fade` (below 1 while the opener leans in on a place behind it) goes on each image,
 * never on a group around them: a group's opacity isolates it, and the glow's screen blend would then paint its black
 * as a dark box over the place the fade is there to show.
 */
function Picture({ c, r, href, frame, testid, fallback, lit, fade }: { c: number; r: number; href: string; frame: Frame; testid: string; fallback: ReactNode; lit: Lit | null; fade?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fade === undefined ? fallback : <g opacity={fade}>{fallback}</g>}</>;
  const [x, y] = iso(c, r);
  const k = W / frame.place;
  const box = { x: x - frame.centre[0] * k, y: y - frame.centre[1] * k, width: frame.width * k, height: frame.height * k };
  return (
    <>
      <image href={href} {...box} opacity={fade} data-testid={testid} onError={() => setFailed(true)} />
      {lit && <Glow key={lit.href} href={lit.href} opacity={fade === undefined ? lit.opacity : lit.opacity * fade} box={box} testid={lit.testid} />}
    </>
  );
}

/** The place's number and its stage chip, over the place; `words` sizes it for the TV. */
function Callout({ n, p, c, r, words }: { n: number; p: GroundsProject; c: number; r: number; words: boolean }) {
  const m = MASSING[p.id];
  const built = builtOf(p);
  // Just above what is drawn, so a near place's label never rides up over the buildings behind it.
  const drawn = p.stage === 'commissioned' ? 0.1 : p.stage === 'building' ? Math.max(0.2, built / p.buildMonths) * m.height : p.stage === 'damaged' ? 0.7 * m.height : p.id === 'park' ? 0.28 : m.height;
  const [x, y] = iso(c, r, drawn + 0.22);
  const chip = p.stage === 'commissioned' ? 'SITE' : p.stage === 'building' ? `${built}/${p.buildMonths}` : p.stage === 'closed' ? 'SHUT' : p.stage === 'damaged' ? 'HIT' : null;
  const chipTone = p.stage === 'building' ? 'bg-warn text-void' : p.stage === 'closed' || p.stage === 'damaged' ? 'bg-alert text-white' : 'bg-holo text-on-holo';
  const width = 80;
  return (
    <foreignObject x={x - width / 2} y={y - 22} width={width} height={22} className="overflow-visible" data-testid={`callout-${n}`}>
      <div className="flex justify-center">
        <span className={cx('flex flex-col items-center rounded-control border border-holo-line bg-panel/90 px-2 py-0.5 text-center shadow-chip', !words && 'flex-row gap-1 px-1 py-0')}>
          <span className="flex items-center gap-1">
            <span className={cx('font-mono font-bold leading-tight text-ink', words ? 'text-[12px]' : 'text-[10px]')} aria-label={p.name}>
              {n}
            </span>
            {chip && <span className={cx('rounded-chip px-1 font-mono font-bold leading-tight', words ? 'text-[11px]' : 'text-[10px]', chipTone)}>{chip}</span>}
          </span>
        </span>
      </div>
    </foreignObject>
  );
}

const HALL_PLACE: PlaceState = { stage: 'standing', monthsLeft: null, buildMonths: 1 };
const HALL_BLOCK: GridPlace = { x: 2, y: 2, w: 1, h: 1 };

/** The ground fading from halfway out to the page background at the view's corners; the buildings stand on it untouched. */
function Vignette({ view }: { view: Box }) {
  const id = `grounds-vignette-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <>
      <defs>
        <radialGradient id={id} cx="0.5" cy="0.5" r="0.75">
          <stop offset="0" stopColor="var(--color-table)" stopOpacity={0} />
          <stop offset="0.5" stopColor="var(--color-table)" stopOpacity={0} />
          <stop offset="1" stopColor="var(--color-table)" stopOpacity={1} />
        </radialGradient>
      </defs>
      <rect x={view.x} y={view.y} width={view.w} height={view.h} fill={`url(#${id})`} pointerEvents="none" data-testid="grounds-vignette" />
    </>
  );
}

/** A plate placed so its hall pixel sits on the hall's centre, at the pictures' scale (`frame.place` px a place). */
function plateBox({ frame }: PlateEntry, { place }: Frame): PictureBox {
  const [x, y] = iso(0, 0);
  const k = W / place;
  return { x: x - frame.hall[0] * k, y: y - frame.hall[1] * k, width: frame.width * k, height: frame.height * k };
}

/**
 * The grounds as one SVG, back to front (painter's order): the base plate for the rings in use (AM-7), or without one
 * the SVG land and plaza and the far edge's trees; the hall and the places by col + row so nearer buildings cover
 * farther ones (each with its glow at dusk), with the colonists on the paths sorted in among them; without a plate the
 * near edge; then the callouts.
 */
export function ColonyGrounds({ colony, size, manifest, light = 'day', framing, chips = true, className }: ColonyGroundsProps) {
  const placed = colony.projects.flatMap((p, i) => (p.place ? [{ p, n: i + 1, block: p.place, ...centreOf(p.place) }] : []));
  const R = extentOf(placed.map((q) => q.block));
  const [failedPlates, setFailedPlates] = useState<ReadonlySet<string>>(() => new Set());
  const entry = manifest?.plate?.[R <= 1 ? '3' : '5'];
  const named = manifest && entry ? { href: hrefOf(entry[light], manifest, size), glow: entry.glow && hrefOf(entry.glow, manifest, size), box: plateBox(entry, manifest.frame) } : null;
  // A plate that fails to load leaves the grounds as they are without one, never blank (HC-3).
  const plate = named && !failedPlates.has(named.href) ? named : null;
  const inBack = (a: { col: number; row: number }, b: { col: number; row: number }) => a.col + a.row - (b.col + b.row);
  const scene = [{ n: 0, col: 0, row: 0, p: undefined as GroundsProject | undefined, block: undefined as GridPlace | undefined }, ...placed].sort(inBack);
  const mood = colony.gauges.happiness ?? 0;
  const standing = colony.projects.filter((p) => p.stage === 'standing').length;
  const paved = Math.min(1, standing / 3);
  const land = R + 1.1;
  const ground = square(0, 0, land);
  const plaza = square(0, 0, R + 0.55);
  // Bare until something stands: each building standing plants three more along the edge.
  const edge = edgeDecoration(R + 0.85).slice(0, Math.min(4 * (2 * R + 2), standing * 3));
  const prop = (d: EdgeProp, k: string) => (d.kind === 'tree' ? <Tree key={k} c={d.col} r={d.row} /> : <Lamp key={k} c={d.col} r={d.row} on={mood >= 50} />);
  const plateArea = plate && { x: plate.box.x, y: plate.box.y, w: plate.box.width, h: plate.box.height };
  const tops = scene.map(({ p, col, row }) => topOf(p?.id ?? 'hall', col, row, manifest));
  const blocks = [HALL_BLOCK, ...placed.map((q) => q.block)];
  // Without a canvas (the phone's card) the view takes the plate's shape, so the card's height never changes with the colony.
  const aspect = framing?.aspect ?? (plateArea && plateArea.w / plateArea.h);
  const view = aspect ? viewOf(aspect, R, blocks, tops, plateArea) : { x: -(land + 0.1) * W, y: -(land * W) / 2 - 1.15 * W, w: 2 * (land + 0.1) * W, h: land * W + 1.3 * W };
  const vb = framing ? leaning(view, framing) : view;
  // The plate's lamps light as a standing building's do (RULE-2).
  const plateGlow = glowOpacity({ light, stage: 'standing', wealth: colony.gauges.wealth });

  // During the lean-in, a building standing in front of a place the caption names fades, so the place shows through.
  const fade = (block: GridPlace) => {
    const o = frontOpacity(block, framing);
    return o < 1 ? Number(o.toFixed(3)) : undefined;
  };

  // Each picture with its silhouette: a colonist it covers is hidden by it, with an outline over it (T-AC-13). The SVG
  // shapes (no manifest) need none: drawn in the same order, they hide the colonists behind them as they are.
  const occluders = manifest
    ? scene.flatMap(({ p, col: c, row: r }) => {
        const kind: PictureKind = p?.id ?? 'hall';
        const picked = pick(kind, p ?? HALL_PLACE, light, manifest);
        const skyline = picked.shows === 'picture' ? manifest.pictures[kind]?.[picked.stage]?.skyline : undefined;
        return skyline ? [occluderOf(manifest.pictures[kind]?.frame ?? manifest.frame, skyline, c, r, c + r)] : [];
      })
    : [];

  const walkers = walkersOut({ happiness: mood, standing, strike: !!colony.strike && !colony.strike.paid });

  const drawn = (kind: PictureKind, place: PlaceState, c: number, r: number, id: string, fallback: ReactNode, fade?: number) => {
    const picked = pick(kind, place, light, manifest);
    // The SVG shapes hold no blended layer, so their group can take the fade whole.
    if (picked.shows === 'shape' || !manifest) return fade === undefined ? fallback : <g opacity={fade}>{fallback}</g>;
    const frame = manifest.pictures[kind]?.frame ?? manifest.frame;
    const href = hrefOf(picked.src, manifest, size);
    const glow = manifest.pictures[kind]?.[picked.stage]?.glow;
    const opacity = glowOpacity({ light, stage: place.stage, wealth: colony.gauges.wealth });
    const lit = glow && opacity > 0 ? { href: hrefOf(glow, manifest, size), opacity, testid: `glow-${id}` } : null;
    // Keyed by its picture, so a load that failed for one stage never keeps the next stage's picture on the fallback.
    return <Picture key={href} c={c} r={r} href={href} frame={frame} testid={`picture-${id}`} fallback={fallback} lit={lit} fade={fade} />;
  };

  return (
    <svg
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      className={cx('block w-full', className)}
      role="img"
      aria-label={`The colony grounds: the town hall and ${placed.length} buildings`}
      data-testid="colony-grounds"
      data-extent={R}
    >
      {plate ? (
        <>
          <image href={plate.href} {...plate.box} data-testid="plate" onError={() => setFailedPlates((failed) => new Set(failed).add(plate.href))} />
          {plate.glow && plateGlow > 0 && <Glow key={plate.glow} href={plate.glow} opacity={plateGlow} box={plate.box} testid="glow-plate" />}
          {/* On the view before the lean-in, so leaning in moves closer into the pool. */}
          {shortOfPlate(view, plateArea) && <Vignette view={view} />}
        </>
      ) : (
        <>
          <polygon points={poly(ground)} fill="var(--color-map-base)" stroke="var(--color-holo-line)" />
          <polygon points={poly(ground)} fill="var(--color-t-desert)" />
          <polygon points={poly(ground)} fill="var(--color-t-plains)" opacity={0.3 + paved * 0.7} />
          <polygon points={poly(plaza)} fill="var(--color-t-desert)" stroke="var(--color-holo-line)" strokeWidth={1.2} />
          <polygon points={poly(plaza)} fill="var(--color-t-store)" opacity={paved} data-testid="paving" />
          {paved > 0 &&
            Array.from({ length: 2 * R }, (_, k) => k - R + 0.5).flatMap((k) => [
              <polyline key={`gc${k}`} points={poly([iso(k, -R - 0.55), iso(k, R + 0.55)])} stroke="var(--color-holo-line)" strokeWidth={1} opacity={paved} />,
              <polyline key={`gr${k}`} points={poly([iso(-R - 0.55, k), iso(R + 0.55, k)])} stroke="var(--color-holo-line)" strokeWidth={1} opacity={paved} />,
            ])}
          {edge.filter((d) => d.col + d.row < 0).map((d, i) => prop(d, `b${i}`))}
        </>
      )}
      <WalkingScene
        scene={scene.map(({ n, p, block, col: c, row: r }) => ({
          depth: c + r,
          node:
            !p || !block ? (
              <g key="hall">{drawn('hall', HALL_PLACE, 0, 0, 'hall', <HallShape mood={mood} />, fade(HALL_BLOCK))}</g>
            ) : (
              <g key={n} data-testid={`place-${n}`} data-stage={p.stage}>
                {drawn(p.id, p, c, r, String(n), <PlaceShape id={p.id} place={p} c={c} r={r} span={Math.min(block.w, block.h)} mood={mood} testid={`shape-${n}`} />, fade(block))}
              </g>
            ),
        }))}
        walkers={walkers}
        rim={R + 0.85}
        blocks={placed.map((q) => q.block)}
        occluders={occluders}
      />
      {!plate && <g pointerEvents="none">{edge.filter((d) => d.col + d.row >= 0).map((d, i) => prop(d, `f${i}`))}</g>}
      {chips &&
        placed.sort(inBack).map(({ n, p, col, row }) => (
          <Callout key={`c${n}`} n={n} p={p} c={col} r={row} words={size === 'tv'} />
        ))}
    </svg>
  );
}
