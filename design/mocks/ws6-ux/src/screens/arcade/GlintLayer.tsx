import { cx, GoodIcon } from '@mule/ui';
import { compass, glintCentre, plotLabel } from './glint';
import type { Colonist, World } from './sim';

/**
 * DS-GAP: @mule/ui has no sparkle for a moment on the map (its special-field badges are standing features, not a
 * countdown). Drawn here from the Crystite good's colour token and GoodIcon: a star that twinkles, a ring that empties
 * as its seconds run out. To move into packages/ui beside the map's other marks.
 */
export function GlintOnMap({ world, cell }: { world: World; cell: number }) {
  const g = world.glint;
  if (!g) return null;
  const total = g.until - g.since;
  const left = Math.max(0, g.until - world.t);
  const share = left / total;
  const size = cell * 0.95;
  const r = 15;
  const ring = 2 * Math.PI * r;
  return (
    <div
      className="pointer-events-none absolute z-[6] flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
      style={{ left: `${((g.x + 0.5) / world.width) * 100}%`, top: `${((g.y + 0.5) / world.height) * 100}%`, width: size, height: size }}
      data-testid="glint"
      data-x={g.x}
      data-y={g.y}
      data-left={(left / 1000).toFixed(2)}
    >
      <svg viewBox="0 0 36 36" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
        <circle cx={18} cy={18} r={r} fill="color-mix(in srgb, var(--color-g-crystite) 18%, transparent)" stroke="var(--color-map-chip)" strokeWidth={3.5} />
        <circle cx={18} cy={18} r={r} fill="none" stroke="var(--color-g-crystite)" strokeWidth={3.5} strokeLinecap="round" strokeDasharray={`${ring * share} ${ring}`} data-testid="glint-ring" />
      </svg>
      <span className="relative grid place-items-center">
        <span aria-hidden className="absolute size-[140%] animate-[twinkle_0.6s_ease-in-out_infinite_alternate] rounded-[20%] bg-g-crystite/40 shadow-glow" />
        <GoodIcon good="crystite" size={Math.round(size * 0.5)} />
      </span>
    </div>
  );
}

/** On the TV: every colonist on the map turns toward the glint, a small arrow at its shoulder; racers draw a line. */
export function GlintSightlines({ world }: { world: World }) {
  const g = world.glint;
  if (!g) return null;
  const c = glintCentre(g);
  return (
    <svg className="pointer-events-none absolute inset-0 z-[6] h-full w-full" viewBox={`0 0 ${world.width} ${world.height}`} preserveAspectRatio="none" aria-hidden data-testid="glint-sightlines">
      {world.colonists
        .filter((x) => x.space === 'map' && !x.done && g.racers.includes(x.id))
        .map((x) => (
          <line key={x.id} x1={x.x} y1={x.y} x2={c.x} y2={c.y} stroke="var(--color-g-crystite)" strokeWidth={2} strokeDasharray="6 5" vectorEffect="non-scaling-stroke" opacity={0.85} />
        ))}
    </svg>
  );
}

/** The arrow at a colonist's shoulder that points at the glint: everyone turns to look. */
export function GlintTurn({ world, c, size }: { world: World; c: Colonist; size: number }) {
  const g = world.glint;
  if (!g || c.space !== 'map' || c.done) return null;
  const t = glintCentre(g);
  const deg = (Math.atan2(t.y - c.y, t.x - c.x) * 180) / Math.PI;
  return (
    <span
      aria-hidden
      className="absolute left-1/2 top-1/2 z-10"
      style={{ transform: `translate(-50%, -50%) rotate(${deg}deg) translateX(${size * 0.75}px)` }}
      data-testid={`glint-turn-${c.id}`}
    >
      <svg viewBox="0 0 10 10" width={Math.max(8, size * 0.35)} height={Math.max(8, size * 0.35)}>
        <path d="M1 1 L9 5 L1 9 Z" fill="var(--color-g-crystite)" stroke="var(--color-void)" strokeWidth={0.8} />
      </svg>
    </span>
  );
}

/**
 * Variant A's pointer: when the glint is off the camera, an arrow at the stage's edge on the line from you to it, with
 * how far, which way and how long: "GLINT · 5 tiles E · 6 s".
 */
export function GlintPointer({ world, me, cell, off, width, height }: { world: World; me: Colonist; cell: number; off: { x: number; y: number }; width: number; height: number }) {
  const g = world.glint;
  if (!g || me.space !== 'map') return null;
  const t = glintCentre(g);
  const gx = t.x * cell - off.x;
  const gy = t.y * cell - off.y;
  const inset = 26;
  if (gx >= 0 && gy >= 0 && gx <= width && gy <= height) return null;
  const mx = me.x * cell - off.x;
  const my = me.y * cell - off.y;
  const dx = gx - mx;
  const dy = gy - my;
  // Where the line from you to the glint leaves the stage, kept a little inside the edge.
  const k = Math.min(dx > 0 ? (width - inset - mx) / dx : dx < 0 ? (inset - mx) / dx : Infinity, dy > 0 ? (height - inset - my) / dy : dy < 0 ? (inset - my) / dy : Infinity);
  const px = mx + dx * k;
  const py = my + dy * k;
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const tiles = Math.round(Math.hypot(t.x - me.x, t.y - me.y));
  const secs = Math.ceil(Math.max(0, g.until - world.t) / 1000);
  const below = py < height / 2;
  return (
    <div className="pointer-events-none absolute z-20" style={{ left: px, top: py }} data-testid="glint-pointer" data-angle={deg.toFixed(1)} data-tiles={tiles}>
      <span className="absolute" style={{ transform: `translate(-50%, -50%) rotate(${deg}deg)` }}>
        <svg viewBox="0 0 20 20" width={26} height={26} aria-hidden>
          <path d="M3 3 L18 10 L3 17 L7 10 Z" fill="var(--color-g-crystite)" stroke="var(--color-void)" strokeWidth={1.2} />
        </svg>
      </span>
      <span
        className={cx(
          'absolute whitespace-nowrap rounded-chip border border-g-crystite bg-panel/95 px-1.5 font-mono text-[11px] font-bold leading-5 text-ink shadow-chip',
          below ? 'top-4' : 'bottom-4',
          px > width / 2 ? 'right-0' : 'left-0',
        )}
        data-testid="glint-pointer-label"
      >
        GLINT · {tiles} tiles {compass(t.x - me.x, t.y - me.y)} · {secs} s
      </span>
    </div>
  );
}

/** Inside the store you cannot see the map: a strip says a glint is lit outside, where and for how long. */
export function GlintStrip({ world, me }: { world: World; me: Colonist }) {
  const g = world.glint;
  if (!g || me.space !== 'hall') return null;
  const secs = Math.ceil(Math.max(0, g.until - world.t) / 1000);
  const door = g.x < world.store.x + 0.5 ? 'left' : 'right';
  return (
    <span className="pointer-events-none absolute inset-x-2 top-2 z-20 truncate rounded-chip border border-g-crystite bg-panel/95 px-2 py-0.5 text-center font-mono text-xs font-bold text-ink shadow-chip" data-testid="glint-strip">
      GLINT outside at {plotLabel(g)} · the {door} door · {secs} s
    </span>
  );
}
