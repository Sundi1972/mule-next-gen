/** The SVG shapes a place shows when it has no picture (HC-3), in the approved mock's lit-diorama look. */
import type { ObjectKind } from '../components/ObjectGlyph';
import type { ReactNode } from 'react';
import { MASSING } from './layout';
import type { PlaceState } from './pick';
import { iso, poly, square, W, type Pt } from './projection';

/** A box: its top and the two faces the viewer sees, the near-left one lighter than the near-right. */
function Box({ c, r, size, height, z = 0, body, dim = false }: { c: number; r: number; size: number; height: number; z?: number; body: string; dim?: boolean }) {
  const h = size / 2;
  const left: Pt[] = [iso(c - h, r + h, z), iso(c + h, r + h, z), iso(c + h, r + h, z + height), iso(c - h, r + h, z + height)];
  const right: Pt[] = [iso(c + h, r + h, z), iso(c + h, r - h, z), iso(c + h, r - h, z + height), iso(c + h, r + h, z + height)];
  return (
    <g opacity={dim ? 0.42 : 1}>
      <polygon points={poly(left)} fill={body} />
      <polygon points={poly(left)} fill="var(--color-void)" opacity={0.22} />
      <polygon points={poly(right)} fill={body} />
      <polygon points={poly(right)} fill="var(--color-void)" opacity={0.42} />
      <polygon points={poly(square(c, r, h, z + height))} fill={body} />
    </g>
  );
}

/** A row of windows along the near faces of a box: the colony's prosperity reads from its lights. */
function Windows({ c, r, size, height, rows, lit }: { c: number; r: number; size: number; height: number; rows: number; lit: boolean }) {
  const h = size / 2;
  const out: ReactNode[] = [];
  for (let k = 0; k < rows; k++) {
    const z = ((k + 0.55) / (rows + 0.3)) * height;
    for (let i = 0; i < 3; i++) {
      const t = -h + ((i + 0.5) / 3) * size;
      const [lx, ly] = iso(c + t, r + h, z);
      const [rx, ry] = iso(c + h, r - t, z);
      for (const [x, y, side] of [[lx, ly, 'l'], [rx, ry, 'r']] as const)
        out.push(<rect key={`${k}-${i}-${side}`} x={x - 3} y={y - 5} width={6} height={7} rx={1} fill={lit ? 'var(--color-warn)' : 'var(--color-void)'} opacity={lit ? 0.9 : 0.5} />);
    }
  }
  return <g>{out}</g>;
}

export function Tree({ c, r, s = 1 }: { c: number; r: number; s?: number }) {
  const [x, y] = iso(c, r);
  return (
    <g>
      <rect x={x - 1.5} y={y - 10 * s} width={3} height={10 * s} fill="var(--color-ink-3)" />
      <polygon points={poly([[x, y - 34 * s], [x + 11 * s, y - 8 * s], [x - 11 * s, y - 8 * s]])} fill="var(--color-ok)" strokeWidth={1} opacity={0.85} />
    </g>
  );
}

export function Lamp({ c, r, on }: { c: number; r: number; on: boolean }) {
  const [x, y] = iso(c, r);
  return (
    <g>
      <rect x={x - 1} y={y - 26} width={2} height={26} fill="var(--color-ink-3)" />
      <circle cx={x} cy={y - 28} r={on ? 6 : 3} fill="var(--color-warn)" opacity={on ? 0.35 : 0.2} />
      <circle cx={x} cy={y - 28} r={2.5} fill={on ? 'var(--color-warn)' : 'var(--color-ink-3)'} />
    </g>
  );
}

/** The town hall at the centre; its windows light at mood ≥ 40 and its flag goes up at mood ≥ 50. */
export function HallShape({ mood }: { mood: number }) {
  const m = MASSING.hall;
  const [tx, ty] = iso(0, 0, m.height);
  const peak: Pt = [tx, ty - 26];
  const roof = square(0, 0, m.footprint / 2, m.height);
  return (
    <g data-testid="shape-hall">
      <Box c={0} r={0} size={m.footprint} height={m.height} body="var(--color-t-store)" />
      <Windows c={0} r={0} size={m.footprint} height={m.height} rows={2} lit={mood >= 40} />
      <polygon points={poly([roof[2]!, roof[1]!, peak])} fill="var(--color-holo)" opacity={0.55} />
      <polygon points={poly([roof[3]!, roof[2]!, peak])} fill="var(--color-holo)" opacity={0.8} />
      <rect x={peak[0] - 0.8} y={peak[1] - 22} width={1.6} height={22} fill="var(--color-ink-2)" />
      {mood >= 50 && <polygon points={poly([[peak[0] + 0.8, peak[1] - 22], [peak[0] + 16, peak[1] - 17], [peak[0] + 0.8, peak[1] - 12]])} fill="var(--color-holo)" />}
    </g>
  );
}

const ROOF: Record<ObjectKind, string> = {
  park: 'var(--color-ok)',
  hospital: 'var(--color-g-medicine)',
  observatory: 'var(--color-g-crystite)',
  stadium: 'var(--color-g-alloy)',
  spaceport: 'var(--color-g-electronics)',
};

/** The planned building's outline, dashed. */
function Ghost({ id, c, r }: { id: ObjectKind; c: number; r: number }) {
  const m = MASSING[id];
  const top = square(c, r, m.footprint / 2, m.height);
  return (
    <g opacity={0.5} strokeDasharray="4 4">
      <polygon points={poly(top)} fill="none" stroke="var(--color-holo)" strokeWidth={1.2} />
      {square(c, r, m.footprint / 2).map((p, i) => (
        <line key={i} x1={p[0]} y1={p[1]} x2={top[i]![0]} y2={top[i]![1]} stroke="var(--color-holo)" strokeWidth={1} />
      ))}
    </g>
  );
}

/** One building in its kind's shape; `frac` < 1 draws it part-built. */
function Building({ id, c, r, frac = 1, lit = true, dim = false }: { id: ObjectKind; c: number; r: number; frac?: number; lit?: boolean; dim?: boolean }) {
  const m = MASSING[id];
  const height = m.height * frac;
  const body = 'var(--color-raised)';
  const opacity = dim ? 0.42 : 1;
  switch (id) {
    case 'park':
      return (
        <g opacity={opacity}>
          <polygon points={poly(square(c, r, m.footprint / 2, 0.02))} fill="var(--color-t-forest)" />
          <ellipse cx={iso(c + 0.12, r + 0.12)[0]} cy={iso(c + 0.12, r + 0.12)[1]} rx={16} ry={8} fill="var(--color-t-lake)" stroke="var(--color-holo)" strokeWidth={0.8} />
          {frac >= 1 && [[-0.25, -0.2], [0.22, -0.28], [-0.28, 0.2], [0.3, 0.25]].map(([dc, dr], i) => <Tree key={i} c={c + dc!} r={r + dr!} s={0.8} />)}
        </g>
      );
    case 'stadium': {
      const [x, y] = iso(c, r, height);
      const [bx, by] = iso(c, r);
      const rx = (m.footprint * W) / 2;
      const bowl = `M${bx - rx},${by} L${x - rx},${y} A${rx},${rx / 2} 0 0 0 ${x + rx},${y} L${bx + rx},${by} A${rx},${rx / 2} 0 0 1 ${bx - rx},${by}Z`;
      return (
        <g opacity={opacity}>
          <path d={bowl} fill={body} strokeWidth={1.2} />
          <path d={bowl} fill="var(--color-void)" opacity={0.3} />
          <ellipse cx={x} cy={y} rx={rx} ry={rx / 2} fill={ROOF.stadium} opacity={0.8} strokeWidth={1.2} />
          <ellipse cx={x} cy={y} rx={rx * 0.62} ry={rx * 0.31} fill="var(--color-ok)" opacity={frac >= 1 ? 0.7 : 0.15} />
          {frac >= 1 && lit && [-0.8, 0.8].map((k) => <circle key={k} cx={x + k * rx} cy={y - 18} r={4} fill="var(--color-warn)" />)}
        </g>
      );
    }
    case 'observatory': {
      const [x, y] = iso(c, r, height);
      const rx = (m.footprint * W) / 2.4;
      return (
        <g opacity={opacity}>
          <Box c={c} r={r} size={m.footprint} height={height} body={body} />
          {frac >= 1 && (
            <>
              <path d={`M${x - rx},${y} A${rx},${rx} 0 0 1 ${x + rx},${y}Z`} fill={ROOF.observatory} opacity={0.9} />
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
      const [bx, by] = iso(c + 0.24, r - 0.24, m.height + 0.06);
      return (
        <g opacity={opacity}>
          <Box c={c} r={r} size={m.footprint} height={0.06} body={body} />
          <ellipse cx={x} cy={y} rx={22} ry={11} fill="none" stroke={ROOF.spaceport} strokeWidth={2} />
          <Box c={c + 0.24} r={r - 0.24} size={0.18} height={m.height * frac} z={0.06} body={body} />
          {frac >= 1 && (
            <>
              <path d={`M${x},${y - tall - 22} C${x + 9},${y - tall} ${x + 9},${y - 14} ${x + 7},${y - 6} L${x - 7},${y - 6} C${x - 9},${y - 14} ${x - 9},${y - tall} ${x},${y - tall - 22}Z`} fill="var(--color-ink)" stroke={ROOF.spaceport} strokeWidth={1.4} />
              {lit && <circle cx={bx} cy={by} r={4} fill="var(--color-alert)" />}
            </>
          )}
        </g>
      );
    }
    case 'hospital': {
      const [x, y] = iso(c, r, height);
      return (
        <g opacity={opacity}>
          <Box c={c} r={r} size={m.footprint} height={height} body={body} />
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
function Scaffold({ c, r, id }: { c: number; r: number; id: ObjectKind }) {
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

/** A site waiting for its money and goods: stakes, a rope and a sign. */
function Site({ c, r, id }: { c: number; r: number; id: ObjectKind }) {
  const corners = square(c, r, MASSING[id].footprint / 2);
  return (
    <g data-testid="site">
      <polygon points={poly(corners)} fill="var(--color-t-desert)" stroke="var(--color-holo)" strokeWidth={1.4} strokeDasharray="6 4" />
      {corners.map(([x, y], i) => (
        <rect key={i} x={x - 1.5} y={y - 12} width={3} height={12} fill="var(--color-holo)" />
      ))}
    </g>
  );
}

/** Months built so far: a building with no months left on the wire counts as just begun. */
export const builtOf = ({ stage, monthsLeft, buildMonths }: PlaceState) => (stage === 'building' ? buildMonths - (monthsLeft ?? buildMonths) : 0);

/** A place's building drawn in its kind's shape at its stage. Smoke over a damaged one belongs to the live layer. */
export function PlaceShape({ id, place, c, r, mood, testid }: { id: ObjectKind; place: PlaceState; c: number; r: number; mood: number; testid: string }) {
  let shape: ReactNode;
  switch (place.stage) {
    case 'commissioned':
      shape = (
        <>
          <Site c={c} r={r} id={id} />
          <Ghost id={id} c={c} r={r} />
        </>
      );
      break;
    case 'building':
      shape = (
        <>
          <Ghost id={id} c={c} r={r} />
          <Building id={id} c={c} r={r} frac={Math.max(0.2, builtOf(place) / place.buildMonths)} lit={false} />
          <Scaffold c={c} r={r} id={id} />
        </>
      );
      break;
    case 'standing':
      shape = <Building id={id} c={c} r={r} lit={mood >= 40} />;
      break;
    case 'closed':
      shape = <Building id={id} c={c} r={r} lit={false} dim />;
      break;
    case 'damaged':
      shape = <Building id={id} c={c} r={r} lit={false} frac={0.7} />;
      break;
  }
  return (
    <g data-testid={testid} data-stage={place.stage}>
      {shape}
    </g>
  );
}
