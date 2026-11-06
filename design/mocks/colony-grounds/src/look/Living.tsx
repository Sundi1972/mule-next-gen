import { Button } from '@mule/ui';
import { useEffect, useRef, useState } from 'react';

/**
 * The "living layer": a pre-rendered picture stays still, and the page draws what changes over it, live and cheap on
 * any phone. Everything is placed through the render camera: orthographic, 2:1 isometric from the south-east, 21 m
 * across 1600 px, its centre ray on the place's centre (park.py).
 */
const S = 1600 / 21;
const px = (x: number, y: number, z = 0): [number, number] => [
  800 + ((x + y) / Math.SQRT2) * S,
  600 + ((x - y) / Math.SQRT2) * 0.5 * S - z * Math.cos(Math.PI / 6) * S,
];

const LAMPS: [number, number][] = [[2.2, 2.2], [-2.2, 2.2], [2.2, -2.2], [-2.2, -2.2]];
const COLOURS = ['var(--color-p1)', 'var(--color-p2)', 'var(--color-p3)', 'var(--color-p4)'];

/** A walk: in along one path spoke, half round the plaza, out along another. Metres, on the ground. */
function walkAt(i: number, t: number): [number, number] {
  const spokes: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const a = spokes[i % 4]!;
  const b = spokes[(i + 1 + (i % 2)) % 4]!;
  const phase = (t * 0.035 + i * 0.29) % 1;
  // Paths run from the rim (5.2 m out) to the plaza's edge (1.9 m), then round the plaza.
  if (phase < 0.4) {
    const d = 5.2 - (phase / 0.4) * 3.3;
    return [a[0] * d + a[1] * 0.25, a[1] * d - a[0] * 0.25];
  }
  if (phase < 0.6) {
    const from = Math.atan2(a[1], a[0]);
    let to = Math.atan2(b[1], b[0]);
    if (to < from) to += Math.PI * 2;
    const ang = from + ((phase - 0.4) / 0.2) * (to - from);
    return [Math.cos(ang) * 1.9, Math.sin(ang) * 1.9];
  }
  const d = 1.9 + ((phase - 0.6) / 0.4) * 3.3;
  return [b[0] * d - b[1] * 0.25, b[1] * d + b[0] * 0.25];
}

function Colonist({ i, t }: { i: number; t: number }) {
  const [x, y] = walkAt(i, t);
  const [fx, fy] = px(x, y);
  // 1.5 m tall: legs to the hip, a coat in the player's colour to the shoulder, a head.
  const z = (m: number) => px(x, y, m)[1];
  const step = Math.sin(t * 0.9 + i * 1.7) * 3;
  return (
    <g>
      <ellipse cx={fx + 8} cy={fy + 2} rx={12} ry={4.5} fill="#000" opacity={0.3} />
      <line x1={fx - 2.5} y1={fy} x2={fx - 2.5 + step} y2={z(0.75)} stroke="#2a2f3a" strokeWidth={4.5} strokeLinecap="round" />
      <line x1={fx + 2.5} y1={fy} x2={fx + 2.5 - step} y2={z(0.75)} stroke="#2a2f3a" strokeWidth={4.5} strokeLinecap="round" />
      <rect x={fx - 6} y={z(1.3)} width={12} height={z(0.7) - z(1.3)} rx={5} fill={COLOURS[i % 4]} />
      <circle cx={fx} cy={z(1.42)} r={6} fill="#e9c9a8" stroke="#3a2a20" strokeWidth={1} />
    </g>
  );
}

export function Living({ day, dusk }: { day: string; dusk: string }) {
  const [evening, setEvening] = useState(0.15);
  const [wealth, setWealth] = useState(60);
  const [mood, setMood] = useState(70);
  const [rain, setRain] = useState(false);
  const [move, setMove] = useState(false);
  const [t, setT] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      setT((now - start) / 100);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, []);
  // The month-end move: dusk falls, the camera leans in on the Park, its lamps come on one by one, then back out.
  useEffect(() => {
    if (!move) return;
    setEvening(0.15);
    const steps = [setTimeout(() => setEvening(0.9), 600), setTimeout(() => setMove(false), 5200)];
    return () => steps.forEach(clearTimeout);
  }, [move]);
  const lit = Math.min(4, Math.ceil(wealth / 25));
  const walkers = Math.round((mood / 100) * 8);
  return (
    <div className="flex flex-col gap-3" data-testid="living">
      <div className="relative overflow-hidden rounded-panel border border-holo-line" style={{ background: 'radial-gradient(circle at 50% 40%, #1a2a3a, #070b12 70%)' }}>
        <div
          className="relative transition-transform ease-in-out"
          style={{ transform: move ? 'scale(1.55) translate(0, 4%)' : 'none', transitionDuration: '2200ms', aspectRatio: '4 / 3' }}
        >
          <img src={day} alt="The Park by day (Blender render)" className="absolute inset-0 h-full w-full" />
          <img src={dusk} alt="The Park at dusk (Blender render)" className="absolute inset-0 h-full w-full transition-opacity duration-1000" style={{ opacity: evening }} />
          <svg viewBox="0 0 1600 1200" className="absolute inset-0 h-full w-full" aria-hidden>
            <defs>
              <radialGradient id="glow">
                <stop offset="0" stopColor="#ffd9a0" stopOpacity={0.95} />
                <stop offset="0.25" stopColor="#ffb45a" stopOpacity={0.45} />
                <stop offset="1" stopColor="#ff9a3a" stopOpacity={0} />
              </radialGradient>
              <radialGradient id="pool">
                <stop offset="0" stopColor="#ffc277" stopOpacity={0.35} />
                <stop offset="1" stopColor="#ffc277" stopOpacity={0} />
              </radialGradient>
            </defs>
            {/* A lamp lit by the colony's wealth only shows once the light falls. */}
            {LAMPS.map(([x, y], i) => {
              const on = i < lit;
              const [gx, gy] = px(x, y, 2.45);
              const [fx, fy] = px(x, y);
              const k = on ? Math.max(0, evening - 0.25) / 0.75 : 0;
              return (
                <g key={i} opacity={k} style={{ transition: `opacity 700ms ease ${move ? 1400 + i * 450 : 0}ms` }}>
                  <ellipse cx={fx} cy={fy} rx={150} ry={75} fill="url(#pool)" />
                  <circle cx={gx} cy={gy} r={60 + Math.sin(t * 0.7 + i) * 2} fill="url(#glow)" />
                </g>
              );
            })}
            {Array.from({ length: rain ? 0 : walkers }, (_, i) => <Colonist key={i} i={i} t={t} />)}
            {rain &&
              Array.from({ length: 140 }, (_, i) => {
                const x = (i * 137) % 1600;
                const y = ((i * 89 + t * 38) % 1300) - 100;
                return <line key={i} x1={x} y1={y} x2={x - 10} y2={y + 34} stroke="#a9c6e8" strokeWidth={2} opacity={0.45} />;
              })}
            {rain && <rect width={1600} height={1200} fill="#20303f" opacity={0.25} />}
          </svg>
        </div>
        {move && (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 text-center font-display text-3xl font-bold text-ink drop-shadow-lg">
            Month 12 · the Park's lamps come on
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm text-ink-2 md:grid-cols-4" data-testid="living-controls">
        <label className="flex flex-col gap-1">
          <span className="label-caps">Time of day</span>
          <input type="range" min={0} max={1} step={0.01} value={evening} onChange={(e) => setEvening(+e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-caps">Colony wealth · {lit} of 4 lamps</span>
          <input type="range" min={0} max={100} value={wealth} onChange={(e) => setWealth(+e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-caps">Mood · {walkers} colonists out</span>
          <input type="range" min={0} max={100} value={mood} onChange={(e) => setMood(+e.target.value)} />
        </label>
        <div className="flex items-end gap-2">
          <Button size="md" variant={rain ? 'holo' : 'outline'} onClick={() => setRain(!rain)} data-testid="rain">
            Rain
          </Button>
          <Button size="md" variant="holo" onClick={() => setMove(true)} disabled={move} data-testid="month-end">
            Play the month end
          </Button>
        </div>
      </div>
    </div>
  );
}
