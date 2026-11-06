/** The colony's grounds drawn from its view: the hall and each project's picture at its place (spec C2). */
import type { ObjectKind } from '../components/ObjectGlyph';
import { useState, type ReactNode } from 'react';
import { cx } from '../components/tokens';
import { builtOf, HallShape, Lamp, PlaceShape, Tree } from './fallback';
import { centreOf, edgeDecoration, extentOf, MASSING, type EdgeProp, type GridPlace } from './layout';
import { pick, type Frame, type GroundsManifest, type Light, type PictureKind, type PlaceState } from './pick';
import { iso, poly, square, W } from './projection';

export type { Frame, GroundsManifest, Light, PictureStage } from './pick';

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
  className?: string;
}

export const ART_BASE = '/art/colony/';

/** The manifest names the largest size; a phone takes the smallest (HC-2). */
function hrefOf(src: string, { sizes }: GroundsManifest, size: ColonyGroundsProps['size']): string {
  if (sizes.length === 0) return ART_BASE + src;
  const width = size === 'phone' ? Math.min(...sizes) : Math.max(...sizes);
  return ART_BASE + src.replace(/@\d+(\.\w+)$/, `@${width}$1`);
}

/** A picture placed so its frame's centre pixel sits on the place's centre, one place `frame.place` px wide. */
function Picture({ c, r, href, frame, testid, fallback }: { c: number; r: number; href: string; frame: Frame; testid: string; fallback: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  const [x, y] = iso(c, r);
  const k = W / frame.place;
  return <image href={href} x={x - frame.centre[0] * k} y={y - frame.centre[1] * k} width={frame.width * k} height={frame.height * k} data-testid={testid} onError={() => setFailed(true)} />;
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

/**
 * The grounds as one SVG, back to front (painter's order): the land and plaza sized to the rings in use, the far edge's
 * trees, the hall and the places by col + row so nearer buildings cover farther ones, the near edge, then the callouts.
 */
export function ColonyGrounds({ colony, size, manifest, light = 'day', className }: ColonyGroundsProps) {
  const placed = colony.projects.flatMap((p, i) => (p.place ? [{ p, n: i + 1, block: p.place, ...centreOf(p.place) }] : []));
  const R = extentOf(placed.map((q) => q.block));
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
  const vb = { x: -(land + 0.1) * W, y: -(land * W) / 2 - 1.15 * W, w: 2 * (land + 0.1) * W, h: land * W + 1.3 * W };

  const drawn = (kind: PictureKind, place: PlaceState, c: number, r: number, testid: string, fallback: ReactNode) => {
    const picked = pick(kind, place, light, manifest);
    if (picked.shows === 'shape' || !manifest) return fallback;
    const frame = manifest.pictures[kind]?.frame ?? manifest.frame;
    const href = hrefOf(picked.src, manifest, size);
    // Keyed by its picture, so a load that failed for one stage never keeps the next stage's picture on the fallback.
    return <Picture key={href} c={c} r={r} href={href} frame={frame} testid={testid} fallback={fallback} />;
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
      {scene.map(({ n, p, block, col: c, row: r }) => {
        if (!p || !block) return <g key="hall">{drawn('hall', HALL_PLACE, 0, 0, 'picture-hall', <HallShape mood={mood} />)}</g>;
        return (
          <g key={n} data-testid={`place-${n}`} data-stage={p.stage}>
            {drawn(p.id, p, c, r, `picture-${n}`, <PlaceShape id={p.id} place={p} c={c} r={r} span={Math.min(block.w, block.h)} mood={mood} testid={`shape-${n}`} />)}
          </g>
        );
      })}
      <g pointerEvents="none">{edge.filter((d) => d.col + d.row >= 0).map((d, i) => prop(d, `f${i}`))}</g>
      {placed.sort(inBack).map(({ n, p, col, row }) => (
        <Callout key={`c${n}`} n={n} p={p} c={col} r={row} words={size === 'tv'} />
      ))}
    </svg>
  );
}
