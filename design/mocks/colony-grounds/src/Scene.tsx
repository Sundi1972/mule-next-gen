import { PRESTIGE, type PrestigeId } from '@mule/engine';
import { cx } from '@mule/ui';
import type { ReactNode } from 'react';
import { NAME, type GroundsObject } from './fixture';
import { edgeDecoration, extentOf, MASSING, PLACES, type Richness } from './layout';

/**
 * The colony grounds as an isometric 2.5D scene (SVG). Everything is placed from layout.ts in grid units and projected
 * here; the 3D build (react-three-fiber) reads the same layout and massing and swaps these shapes for models.
 * Every colour is a theme token (var(--color-…)); faces are shaded by laying the void colour over them at an opacity.
 */
export type Look = 'holo' | 'diorama';
type Pt = [number, number];

const W = 120; // a slot's width on screen (2:1 isometric); one height unit is one slot's side
const U = W;
const iso = (c: number, r: number, z = 0): Pt => [((c - r) * W) / 2, ((c + r) * W) / 4 - z * U * 0.82];
const poly = (pts: Pt[]) => pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

/** The square footprint's corners at height z, centred on (c, r), half-side h. Order: back, right, front, left. */
const square = (c: number, r: number, h: number, z = 0): Pt[] => [iso(c - h, r - h, z), iso(c + h, r - h, z), iso(c + h, r + h, z), iso(c - h, r + h, z)];

/** A box: its top and the two faces the viewer sees, the near-left one lighter than the near-right. */
function Box({ c, r, size, height, z = 0, body, edge, dim = false, testid }: { c: number; r: number; size: number; height: number; z?: number; body: string; edge?: string; dim?: boolean; testid?: string }) {
  const h = size / 2;
  const left: Pt[] = [iso(c - h, r + h, z), iso(c + h, r + h, z), iso(c + h, r + h, z + height), iso(c - h, r + h, z + height)];
  const right: Pt[] = [iso(c + h, r + h, z), iso(c + h, r - h, z), iso(c + h, r - h, z + height), iso(c + h, r + h, z + height)];
  const top = square(c, r, h, z + height);
  const stroke = edge ? { stroke: edge, strokeWidth: 1.2, strokeLinejoin: 'round' as const } : {};
  return (
    <g opacity={dim ? 0.42 : 1} data-testid={testid}>
      <polygon points={poly(left)} fill={body} {...stroke} />
      <polygon points={poly(left)} fill="var(--color-void)" opacity={0.22} />
      <polygon points={poly(right)} fill={body} {...stroke} />
      <polygon points={poly(right)} fill="var(--color-void)" opacity={0.42} />
      <polygon points={poly(top)} fill={body} {...stroke} />
    </g>
  );
}

/** A row of lit windows along the near faces of a box: the colony's prosperity reads from its lights. */
function Windows({ c, r, size, height, rows, lit }: { c: number; r: number; size: number; height: number; rows: number; lit: boolean }) {
  const h = size / 2;
  const out: ReactNode[] = [];
  for (let k = 0; k < rows; k++) {
    const z = ((k + 0.55) / (rows + 0.3)) * height;
    for (let i = 0; i < 3; i++) {
      const t = -h + ((i + 0.5) / 3) * size;
      const [lx, ly] = iso(c + t, r + h, z);
      const [rx, ry] = iso(c + h, r - t, z);
      for (const [x, y, k2] of [[lx, ly, 'l'], [rx, ry, 'r']] as const)
        out.push(<rect key={`${k}-${i}-${k2}`} x={x - 3} y={y - 5} width={6} height={7} rx={1} fill={lit ? 'var(--color-warn)' : 'var(--color-void)'} opacity={lit ? 0.9 : 0.5} />);
    }
  }
  return <g>{out}</g>;
}

function Tree({ c, r, look, s = 1 }: { c: number; r: number; look: Look; s?: number }) {
  const [x, y] = iso(c, r);
  return (
    <g>
      <rect x={x - 1.5} y={y - 10 * s} width={3} height={10 * s} fill="var(--color-ink-3)" />
      <polygon points={poly([[x, y - 34 * s], [x + 11 * s, y - 8 * s], [x - 11 * s, y - 8 * s]])} fill={look === 'holo' ? 'var(--color-t-forest)' : 'var(--color-ok)'} stroke={look === 'holo' ? 'var(--color-ok)' : undefined} strokeWidth={1} opacity={look === 'holo' ? 1 : 0.85} />
    </g>
  );
}

function Lamp({ c, r, on }: { c: number; r: number; on: boolean }) {
  const [x, y] = iso(c, r);
  return (
    <g>
      <rect x={x - 1} y={y - 26} width={2} height={26} fill="var(--color-ink-3)" />
      <circle cx={x} cy={y - 28} r={on ? 6 : 3} fill="var(--color-warn)" opacity={on ? 0.35 : 0.2} />
      <circle cx={x} cy={y - 28} r={2.5} fill={on ? 'var(--color-warn)' : 'var(--color-ink-3)'} />
    </g>
  );
}

/** The town hall, in the middle: always there, a little grander as the colony prospers (its flag goes up at mood ≥ 50). */
function Hall({ look, rich }: { look: Look; rich: Richness }) {
  const m = MASSING.hall;
  const c = 0;
  const r = 0;
  const body = look === 'holo' ? 'var(--color-raised)' : 'var(--color-t-store)';
  const edge = look === 'holo' ? 'var(--color-holo)' : undefined;
  const [tx, ty] = iso(c, r, m.height);
  const peak: Pt = [tx, ty - 26];
  const roof = square(c, r, m.footprint / 2, m.height);
  return (
    <g data-testid="scene-hall">
      <Box c={c} r={r} size={m.footprint} height={m.height} body={body} {...(edge ? { edge } : {})} />
      <Windows c={c} r={r} size={m.footprint} height={m.height} rows={2} lit={rich.mood >= 40} />
      <polygon points={poly([roof[2]!, roof[1]!, peak])} fill="var(--color-holo)" opacity={0.55} />
      <polygon points={poly([roof[3]!, roof[2]!, peak])} fill="var(--color-holo)" opacity={0.8} />
      <rect x={peak[0] - 0.8} y={peak[1] - 22} width={1.6} height={22} fill="var(--color-ink-2)" />
      {rich.mood >= 50 && <polygon points={poly([[peak[0] + 0.8, peak[1] - 22], [peak[0] + 16, peak[1] - 17], [peak[0] + 0.8, peak[1] - 12]])} fill="var(--color-holo)" />}
    </g>
  );
}

const ROOF: Record<PrestigeId, string> = {
  park: 'var(--color-ok)',
  hospital: 'var(--color-g-medicine)',
  observatory: 'var(--color-g-crystite)',
  stadium: 'var(--color-g-alloy)',
  spaceport: 'var(--color-g-electronics)',
};

/** One building at full height, in its kind's shape; `frac` < 1 draws it part-built, `ghost` as the planned outline. */
function Building({ id, c, r, look, frac = 1, ghost = false, lit = true, dim = false }: { id: PrestigeId; c: number; r: number; look: Look; frac?: number; ghost?: boolean; lit?: boolean; dim?: boolean }) {
  const m = MASSING[id];
  const height = m.height * frac;
  const holo = look === 'holo';
  const body = ghost ? 'none' : holo ? 'var(--color-panel)' : 'var(--color-raised)';
  const edge = ghost ? 'var(--color-holo)' : holo ? ROOF[id] : undefined;
  const boxEdge = edge ? { edge } : {};
  if (ghost)
    return (
      <g opacity={0.5} strokeDasharray="4 4">
        <polygon points={poly(square(c, r, m.footprint / 2, m.height))} fill="none" stroke="var(--color-holo)" strokeWidth={1.2} />
        {square(c, r, m.footprint / 2).map((p, i) => {
          const q = square(c, r, m.footprint / 2, m.height)[i]!;
          return <line key={i} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke="var(--color-holo)" strokeWidth={1} />;
        })}
      </g>
    );
  switch (id) {
    case 'park':
      return (
        <g opacity={dim ? 0.42 : 1}>
          <polygon points={poly(square(c, r, m.footprint / 2, 0.02))} fill={holo ? 'var(--color-t-plains)' : 'var(--color-t-forest)'} stroke={holo ? 'var(--color-ok)' : undefined} />
          <ellipse cx={iso(c + 0.12, r + 0.12)[0]} cy={iso(c + 0.12, r + 0.12)[1]} rx={16} ry={8} fill="var(--color-t-lake)" stroke="var(--color-holo)" strokeWidth={0.8} />
          {frac >= 1 && [[-0.25, -0.2], [0.22, -0.28], [-0.28, 0.2], [0.3, 0.25]].map(([dc, dr], i) => <Tree key={i} c={c + dc!} r={r + dr!} look={look} s={0.8} />)}
        </g>
      );
    case 'stadium': {
      const [x, y] = iso(c, r, height);
      const [bx, by] = iso(c, r);
      const rx = (m.footprint * W) / 2;
      return (
        <g opacity={dim ? 0.42 : 1}>
          <path d={`M${bx - rx},${by} L${x - rx},${y} A${rx},${rx / 2} 0 0 0 ${x + rx},${y} L${bx + rx},${by} A${rx},${rx / 2} 0 0 1 ${bx - rx},${by}Z`} fill={holo ? 'var(--color-panel)' : 'var(--color-raised)'} stroke={edge} strokeWidth={1.2} />
          <path d={`M${bx - rx},${by} L${x - rx},${y} A${rx},${rx / 2} 0 0 0 ${x + rx},${y} L${bx + rx},${by} A${rx},${rx / 2} 0 0 1 ${bx - rx},${by}Z`} fill="var(--color-void)" opacity={0.3} />
          <ellipse cx={x} cy={y} rx={rx} ry={rx / 2} fill={ROOF.stadium} opacity={holo ? 0.35 : 0.8} stroke={edge} strokeWidth={1.2} />
          <ellipse cx={x} cy={y} rx={rx * 0.62} ry={rx * 0.31} fill="var(--color-ok)" opacity={frac >= 1 ? 0.7 : 0.15} />
          {frac >= 1 && lit && [-0.8, 0.8].map((k) => <circle key={k} cx={x + k * rx} cy={y - 18} r={4} fill="var(--color-warn)" />)}
        </g>
      );
    }
    case 'observatory': {
      const [x, y] = iso(c, r, height);
      const rx = (m.footprint * W) / 2.4;
      return (
        <g opacity={dim ? 0.42 : 1}>
          <Box c={c} r={r} size={m.footprint} height={height} body={body} {...boxEdge} />
          {frac >= 1 && (
            <>
              <path d={`M${x - rx},${y} A${rx},${rx} 0 0 1 ${x + rx},${y}Z`} fill={ROOF.observatory} opacity={holo ? 0.55 : 0.9} stroke={edge} />
              <line x1={x} y1={y - rx * 0.6} x2={x + rx * 0.9} y2={y - rx * 1.25} stroke="var(--color-ink)" strokeWidth={3} strokeLinecap="round" />
            </>
          )}
          <Windows c={c} r={r} size={m.footprint} height={height} rows={1} lit={lit && frac >= 1} />
        </g>
      );
    }
    case 'spaceport': {
      const [x, y] = iso(c - 0.12, r + 0.12, 0.06);
      const tall = 64 * frac;
      return (
        <g opacity={dim ? 0.42 : 1}>
          <Box c={c} r={r} size={m.footprint} height={0.06} body={body} {...boxEdge} />
          <ellipse cx={x} cy={y} rx={22} ry={11} fill="none" stroke={ROOF.spaceport} strokeWidth={2} />
          <Box c={c + 0.24} r={r - 0.24} size={0.18} height={m.height * frac} z={0.06} body={body} {...boxEdge} />
          {frac >= 1 && (
            <>
              <path d={`M${x},${y - tall - 22} C${x + 9},${y - tall} ${x + 9},${y - 14} ${x + 7},${y - 6} L${x - 7},${y - 6} C${x - 9},${y - 14} ${x - 9},${y - tall} ${x},${y - tall - 22}Z`} fill={holo ? 'var(--color-panel)' : 'var(--color-ink)'} stroke={ROOF.spaceport} strokeWidth={1.4} />
              {lit && <circle cx={iso(c + 0.24, r - 0.24, m.height + 0.06)[0]} cy={iso(c + 0.24, r - 0.24, m.height + 0.06)[1]} r={4} fill="var(--color-alert)" />}
            </>
          )}
        </g>
      );
    }
    case 'hospital': {
      const [x, y] = iso(c, r, height);
      return (
        <g opacity={dim ? 0.42 : 1}>
          <Box c={c} r={r} size={m.footprint} height={height} body={body} {...boxEdge} />
          <Windows c={c} r={r} size={m.footprint} height={height} rows={Math.max(1, Math.round(3 * frac))} lit={lit && frac >= 1} />
          {frac >= 1 && (
            <g fill={ROOF.hospital}>
              <rect x={x - 3} y={y - 9} width={6} height={18} rx={1} />
              <rect x={x - 9} y={y - 3} width={18} height={6} rx={1} />
            </g>
          )}
        </g>
      );
    }
  }
}

/** Scaffolding and a crane over a part-built site: the colony at work. */
function Scaffold({ c, r, id }: { c: number; r: number; id: PrestigeId }) {
  const m = MASSING[id];
  const h = m.footprint / 2 + 0.04;
  const top = Math.max(m.height, 0.3);
  const pole = (cc: number, rr: number, k: number) => {
    const [x1, y1] = iso(cc, rr);
    const [x2, y2] = iso(cc, rr, top);
    return <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-warn)" strokeWidth={1.5} />;
  };
  const [cx, cy] = iso(c - h, r - h, top + 0.5);
  const [bx, by] = iso(c - h, r - h);
  return (
    <g data-testid="scaffold">
      {pole(c - h, r + h, 0)}
      {pole(c + h, r + h, 1)}
      {pole(c + h, r - h, 2)}
      {[0.33, 0.66].map((f) => (
        <polyline key={f} points={poly([iso(c - h, r + h, top * f), iso(c + h, r + h, top * f), iso(c + h, r - h, top * f)])} fill="none" stroke="var(--color-warn)" strokeWidth={1} />
      ))}
      <line x1={bx} y1={by} x2={cx} y2={cy} stroke="var(--color-warn)" strokeWidth={2.5} />
      <line x1={cx - 10} y1={cy} x2={cx + 46} y2={cy} stroke="var(--color-warn)" strokeWidth={2.5} />
      <line x1={cx + 40} y1={cy} x2={cx + 40} y2={cy + 24} stroke="var(--color-ink-3)" strokeWidth={1} />
    </g>
  );
}

/** Smoke over a damaged building. */
function Smoke({ c, r, id }: { c: number; r: number; id: PrestigeId }) {
  const [x, y] = iso(c, r, MASSING[id].height);
  return (
    <g fill="var(--color-ink-3)" pointerEvents="none" data-testid="smoke">
      <circle cx={x + 4} cy={y - 14} r={9} opacity={0.5} />
      <circle cx={x + 14} cy={y - 30} r={12} opacity={0.35} />
      <circle cx={x + 26} cy={y - 50} r={15} opacity={0.2} />
    </g>
  );
}

/** Where the next building will go: a faint dashed outline on the paving, so the order of growth is legible. */
function NextPlace({ c, r }: { c: number; r: number }) {
  const [x, y] = iso(c, r);
  return (
    <g data-testid="next-place" aria-label="The next building goes here" pointerEvents="none">
      <polygon points={poly(square(c, r, 0.4))} fill="none" stroke="var(--color-holo-line)" strokeWidth={1.2} strokeDasharray="5 5" />
      <text x={x} y={y + 5} textAnchor="middle" className="fill-ink-3 font-mono text-[12px]">
        next
      </text>
    </g>
  );
}

/** A site waiting for its money and goods: stakes, a rope and a sign. */
function Site({ c, r, id }: { c: number; r: number; id: PrestigeId }) {
  const h = MASSING[id].footprint / 2;
  const corners = square(c, r, h);
  return (
    <g data-testid="site">
      <polygon points={poly(corners)} fill="var(--color-t-desert)" stroke="var(--color-holo)" strokeWidth={1.4} strokeDasharray="6 4" />
      {corners.map(([x, y], i) => (
        <rect key={i} x={x - 1.5} y={y - 12} width={3} height={12} fill="var(--color-holo)" />
      ))}
    </g>
  );
}

/** The callout over a slot: the name and its stage in words (TV), or the slot's chip (phone). */
function Callout({ slot, o, c, r, words }: { slot: number; o: GroundsObject; c: number; r: number; words: boolean }) {
  // Just above what is drawn, so a near slot's label never rides up over the buildings behind it.
  const m = MASSING[o.id];
  const drawn = o.stage === 'commissioned' ? 0.1 : o.stage === 'building' ? Math.max(0.2, (o.built ?? 0) / PRESTIGE[o.id].buildMonths) * m.height : o.stage === 'damaged' ? 0.7 * m.height : o.id === 'park' ? 0.28 : m.height;
  const top = drawn + 0.22;
  const [x, y] = iso(c, r, top);
  const chip = o.stage === 'commissioned' ? 'SITE' : o.stage === 'building' ? `${o.built ?? 0}/${PRESTIGE[o.id].buildMonths}` : o.stage === 'closed' ? 'SHUT' : o.stage === 'damaged' ? 'HIT' : null;
  const chipTone = o.stage === 'building' ? 'bg-warn text-void' : o.stage === 'closed' || o.stage === 'damaged' ? 'bg-alert text-white' : 'bg-holo text-on-holo';
  const width = 80;
  return (
    <foreignObject x={x - width / 2} y={y - 22} width={width} height={22} className="overflow-visible" data-testid={`callout-${slot}`}>
      <div className="flex justify-center">
        <span className={cx('flex flex-col items-center rounded-control border border-holo-line bg-panel/90 px-2 py-0.5 text-center shadow-chip', !words && 'flex-row gap-1 px-1 py-0')}>
          <span className="flex items-center gap-1">
            <span className={cx('font-mono font-bold leading-tight text-ink', words ? 'text-[12px]' : 'text-[10px]')} aria-label={NAME[o.id]}>{slot}</span>
            {chip && <span className={cx('rounded-chip px-1 font-mono font-bold leading-tight', words ? 'text-[11px]' : 'text-[10px]', chipTone)}>{chip}</span>}
          </span>
        </span>
      </div>
    </foreignObject>
  );
}

/**
 * The scene. Back to front (painter's order): the land and the plaza sized to the buildings, the far edge's trees, then
 * the places by row+col so nearer buildings cover farther ones, the near edge, then the labels on top.
 */
export function Scene({
  objects,
  rich,
  look,
  words,
  fresh = null,
  className,
}: {
  objects: GroundsObject[];
  rich: Richness;
  look: Look;
  /** Over each building its number and stage chip (names and words are in the legend beside); true sizes them for the TV. */
  words: boolean;
  /** A building that changed this month (its place index), ringed. */
  fresh?: number | null;
  className?: string;
}) {
  const at = new Map(objects.map((o) => [o.slot, o]));
  const R = extentOf(objects.length);
  const places = PLACES.filter((p) => Math.max(Math.abs(p.col), Math.abs(p.row)) <= R);
  const next = objects.length < PLACES.length ? PLACES[objects.length] : undefined;
  const cells = [{ index: -1, col: 0, row: 0 }, ...places].sort((a, b) => a.row + a.col - (b.row + b.col));
  const paved = Math.min(1, rich.standing / 3);
  const walkers = Math.round((rich.mood / 100) * Math.min(14, 2 + rich.standing * 2));
  const land = R + 1.1;
  const ground = square(0, 0, land);
  const plaza = square(0, 0, R + 0.55);
  // Bare until something stands: each building standing plants three more along the edge.
  const edge = edgeDecoration(R + 0.85).slice(0, Math.min(4 * (2 * R + 2), rich.standing * 3));
  const tree = (d: { col: number; row: number; kind: 'tree' | 'lamp' }, k: string) =>
    d.kind === 'tree' ? <Tree key={k} c={d.col} r={d.row} look={look} /> : <Lamp key={k} c={d.col} r={d.row} on={rich.mood >= 50} />;
  // Only as big as the buildings need: a lone hall is drawn close, two rings sprawl.
  const vb = { x: -(land + 0.1) * W, y: -(land * W) / 2 - 1.15 * W, w: 2 * (land + 0.1) * W, h: land * W + 1.3 * W };
  return (
    <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className={cx('block w-full', className)} role="img" aria-label={`The colony grounds: the town hall and ${objects.length} buildings`} data-testid={`scene-${look}`} data-standing={rich.standing} data-extent={R}>
      <polygon points={poly(ground)} fill="var(--color-map-base)" stroke="var(--color-holo-line)" />
      <polygon points={poly(ground)} fill="var(--color-t-desert)" />
      <polygon points={poly(ground)} fill="var(--color-t-plains)" opacity={0.3 + paved * 0.7} />
      <polygon points={poly(plaza)} fill={look === 'holo' ? 'var(--color-raised)' : 'var(--color-t-desert)'} stroke="var(--color-holo-line)" strokeWidth={1.2} />
      <polygon points={poly(plaza)} fill="var(--color-t-store)" opacity={paved} data-testid="paving" />
      {paved > 0 &&
        Array.from({ length: 2 * R }, (_, k) => k - R + 0.5).flatMap((k) => [
          <polyline key={`gc${k}`} points={poly([iso(k, -R - 0.55), iso(k, R + 0.55)])} stroke="var(--color-holo-line)" strokeWidth={1} opacity={paved} />,
          <polyline key={`gr${k}`} points={poly([iso(-R - 0.55, k), iso(R + 0.55, k)])} stroke="var(--color-holo-line)" strokeWidth={1} opacity={paved} />,
        ])}
      {edge.filter((d) => d.col + d.row < 0).map((d, i) => tree(d, `b${i}`))}
      {next && Math.max(Math.abs(next.col), Math.abs(next.row)) <= Math.max(R, 1) && R > 0 && <NextPlace c={next.col} r={next.row} />}
      {cells.map(({ index, col: c, row: r }) => {
        if (index === -1) return <Hall key="hall" look={look} rich={rich} />;
        const o = at.get(index);
        if (!o) return null;
        const months = PRESTIGE[o.id].buildMonths;
        return (
          <g key={index} data-testid={`scene-place-${index + 1}`} data-stage={o.stage}>
            {fresh === index && <polygon points={poly(square(c, r, 0.5))} fill="var(--color-holo-soft)" stroke="var(--color-holo)" strokeWidth={3} className="animate-pulse" />}
            {o.stage === 'commissioned' && (
              <>
                <Site c={c} r={r} id={o.id} />
                <Building id={o.id} c={c} r={r} look={look} ghost />
              </>
            )}
            {o.stage === 'building' && (
              <>
                <Building id={o.id} c={c} r={r} look={look} ghost />
                <Building id={o.id} c={c} r={r} look={look} frac={Math.max(0.2, (o.built ?? 0) / months)} lit={false} />
                <Scaffold c={c} r={r} id={o.id} />
              </>
            )}
            {o.stage === 'standing' && <Building id={o.id} c={c} r={r} look={look} lit={rich.mood >= 40} />}
            {o.stage === 'closed' && <Building id={o.id} c={c} r={r} look={look} lit={false} dim />}
            {o.stage === 'damaged' && (
              <>
                <Building id={o.id} c={c} r={r} look={look} lit={false} frac={0.7} />
                <Smoke c={c} r={r} id={o.id} />
              </>
            )}
          </g>
        );
      })}
      {Array.from({ length: walkers }, (_, i) => {
        const span = 2 * R + 0.8;
        const [x, y] = iso(-R - 0.4 + ((i * 0.37 * span) % span), -R - 0.4 + ((i * 0.61 * span) % span));
        return <circle key={`w${i}`} cx={x} cy={y - 4} r={3} fill={['var(--color-p1)', 'var(--color-p2)', 'var(--color-p3)', 'var(--color-p4)'][i % 4]} pointerEvents="none" data-testid="colonist" />;
      })}
      <g pointerEvents="none">{edge.filter((d) => d.col + d.row >= 0).map((d, i) => tree(d, `f${i}`))}</g>
      {rich.air > 0 && <polygon points={poly(ground)} fill="var(--color-ink-3)" opacity={Math.min(0.45, rich.air / 200)} pointerEvents="none" data-testid="haze" />}
      {cells.map(({ index, col, row }) => {
        const o = index >= 0 ? at.get(index) : undefined;
        return o ? <Callout key={`c${index}`} slot={index + 1} o={o} c={col} r={row} words={words} /> : null;
      })}
    </svg>
  );
}
