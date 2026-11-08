import { ColonyGrounds, GroundsOpener, type ColonyGroundsProps, type GroundsColony, type GroundsManifest, type Light, type OpenerState } from '@mule/ui';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { loadGroundsManifest } from '../../../../../apps/web/src/components/Grounds';
import { centreOf, MASSING } from '../../../../../packages/ui/src/grounds/layout';
import { iso } from '../../../../../packages/ui/src/grounds/projection';
import { hazeColour, hazeOpacity, PLUMES, plume, smokes } from './air';

/**
 * Task 2.2b's mock (spec C4): smoke over a damaged building, a haze by air, drawn over the real grounds. The layer is
 * portalled into ColonyGrounds' own SVG, so it shares the scene's coordinates exactly, as the live layer will.
 * Zero download: SVG gradients only.
 */
const COLONY: GroundsColony = {
  gauges: { happiness: 64, wealth: 2_000 },
  projects: [
    { id: 'park', name: 'Park', stage: 'standing', monthsLeft: null, buildMonths: 1, place: { x: 1, y: 2, w: 1, h: 1 } },
    { id: 'hospital', name: 'Hospital', stage: 'damaged', monthsLeft: null, buildMonths: 2, place: { x: 2, y: 3, w: 1, h: 1 } },
    { id: 'stadium', name: 'Stadium', stage: 'standing', monthsLeft: null, buildMonths: 3, place: { x: 3, y: 2, w: 2, h: 2 } },
    { id: 'observatory', name: 'Observatory', stage: 'damaged', monthsLeft: null, buildMonths: 2, place: { x: 1, y: 1, w: 1, h: 1 } },
  ],
};
/** The smoke's colour: A a light grey, lit by the colony at dusk; B a dark soot. */
const PUFF: Record<'A' | 'B', Record<Light, string>> = { A: { day: '#c4c0b9', dusk: '#8c8781' }, B: { day: '#4b4744', dusk: '#3d3936' } };
const STILL: OpenerState = { kind: 'still', ms: 3_000, baseline: true, playing: false, changes: [] };
type Air = 'clean' | 'smoggy' | 'toxic' | 'collapse';
const AIR: Record<Air, [number, string]> = { clean: [12, 'Clean 12'], smoggy: [42, 'Smoggy 42'], toxic: [68, 'Toxic 68'], collapse: [90, 'Collapse 90'] };

/** The smoke and haze, in scene units, for the grounds' SVG `svg`. */
function AirLayer({ svg, environment, light, variant, seconds }: { svg: SVGSVGElement; environment: number; light: Light; variant: 'A' | 'B'; seconds: number }) {
  const vb = svg.viewBox.baseVal;
  const haze = hazeOpacity(environment);
  const colour = hazeColour(environment, light);
  const style = PLUMES[variant];
  const dusk = light === 'dusk';
  const sources = COLONY.projects.filter((p) => smokes(p.stage) && p.place).map((p) => {
    const { col, row } = centreOf(p.place!);
    // a damaged building is drawn at 0.7 of its height: the smoke leaves its broken top
    const [x, y] = iso(col, row, MASSING[p.id].height * 0.7);
    return { id: p.id, x, y };
  });
  return (
    <g pointerEvents="none" data-testid="air-layer">
      <defs>
        <radialGradient id={`puff-${variant}`}>
          {/* a soft-edged ball with a solid core, so overlapping puffs read as one body of smoke */}
          <stop offset="0" stopColor={PUFF[variant][light]} stopOpacity="1" />
          <stop offset="0.45" stopColor={PUFF[variant][light]} stopOpacity="0.8" />
          <stop offset="1" stopColor={PUFF[variant][light]} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ember">
          <stop offset="0" stopColor="#ff9a4a" stopOpacity="1" />
          <stop offset="1" stopColor="#ff8a3d" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
          {/* thickest at the far edge, thinning toward the camera, as air does over distance */}
          <stop offset="0" stopColor={colour} stopOpacity={haze} />
          <stop offset="1" stopColor={colour} stopOpacity={haze * 0.55} />
        </linearGradient>
      </defs>
      {sources.map((s) => (
        <g key={s.id} data-testid={`smoke-${s.id}`}>
          {plume(seconds, style).map((q, k) => (
            <g key={k}>
              <circle cx={s.x + q.dx} cy={s.y + q.dy} r={q.r} fill={`url(#puff-${variant})`} opacity={q.opacity} />
              {dusk && q.warm > 0 && <circle cx={s.x + q.dx} cy={s.y + q.dy} r={q.r * 0.9} fill="url(#ember)" opacity={q.warm * q.opacity} style={{ mixBlendMode: 'screen' }} />}
            </g>
          ))}
        </g>
      ))}
      {haze > 0 && <rect x={vb.x} y={vb.y} width={vb.width} height={vb.height} fill="url(#haze)" data-testid="haze" />}
    </g>
  );
}

/** Finds the grounds' SVG inside `host` once it is drawn and puts the air layer into it. */
function WithAir({ children, ...air }: { children: ReactNode; environment: number; light: Light; variant: 'A' | 'B'; still: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<SVGSVGElement | null>(null);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const find = () => setSvg(host.current?.querySelector<SVGSVGElement>('svg[data-testid="colony-grounds"]') ?? null);
    find();
    const mo = new MutationObserver(find);
    if (host.current) mo.observe(host.current, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
  useEffect(() => {
    if (air.still) return void setSeconds(0);
    let f = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      setSeconds((now - t0) / 1000);
      f = requestAnimationFrame(tick);
    };
    f = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(f);
  }, [air.still]);
  return (
    <div ref={host} className="relative">
      {children}
      {svg && createPortal(<AirLayer svg={svg} environment={air.environment} light={air.light} variant={air.variant} seconds={seconds} />, svg)}
    </div>
  );
}

function Seg<T extends string>({ label, value, options, set, testid }: { label: string; value: T; options: [T, string][]; set: (v: T) => void; testid: string }) {
  return (
    <span className="seg" role="group" aria-label={label} data-testid={testid}>
      {options.map(([v, words]) => (
        <button key={v} aria-pressed={value === v} onClick={() => set(v)} data-testid={`${testid}-${v}`}>{words}</button>
      ))}
    </span>
  );
}

export function SmokeHaze() {
  const [manifest, setManifest] = useState<GroundsManifest | null>(null);
  const [light, setLight] = useState<Light>('dusk');
  const [screen, setScreen] = useState<'tv' | 'phone'>('tv');
  const [variant, setVariant] = useState<'A' | 'B'>('A');
  const [air, setAir] = useState<Air>('toxic');
  const [still, setStill] = useState(false);
  const [k, setK] = useState(() => Math.min(1, innerWidth / 1280));
  useEffect(() => void loadGroundsManifest().then(setManifest), []);
  useEffect(() => {
    const fit = () => setK(Math.min(1, innerWidth / 1280));
    addEventListener('resize', fit);
    return () => removeEventListener('resize', fit);
  }, []);
  const environment = AIR[air][0];
  const Scene = useMemo(() => (props: Omit<ColonyGroundsProps, 'manifest'>) => <ColonyGrounds {...props} light={light} manifest={manifest} />, [light, manifest]);
  const layer = { environment, light, variant, still };
  return (
    <main className="livewalk" data-testid="air-page">
      <div className="controls">
        <Seg testid="variant" label="Smoke" value={variant} set={setVariant} options={[['A', 'Smoke A: light puffs'], ['B', 'Smoke B: dark column']]} />
        <Seg testid="air" label="Air" value={air} set={setAir} options={(Object.keys(AIR) as Air[]).map((a) => [a, AIR[a][1]])} />
        <Seg testid="light" label="Light" value={light} set={setLight} options={[['day', 'Day'], ['dusk', 'Dusk']]} />
        <Seg testid="screen" label="Screen" value={screen} set={setScreen} options={[['tv', 'TV'], ['phone', 'Phone']]} />
        <span className="seg"><button aria-pressed={still} onClick={() => setStill(!still)} data-testid="still">Reduced motion</button></span>
      </div>
      <div className="frame">
        {screen === 'tv' ? (
          <div className="tvbox" style={{ width: 1280 * k, height: 720 * k }}>
            <div className="tv" style={{ transform: `scale(${k})`, transformOrigin: '0 0' }}>
              <WithAir {...layer}>
                <GroundsOpener opener={STILL} colony={COLONY} month={12} Scene={Scene} />
              </WithAir>
            </div>
          </div>
        ) : (
          <div className="phone">
            <WithAir {...layer}>
              <ColonyGrounds colony={COLONY} size="phone" manifest={manifest} light={light} />
            </WithAir>
          </div>
        )}
      </div>
      <p className="note" data-testid="note">
        The Hospital and the Observatory are damaged: smoke rises from their broken tops. The air is {AIR[air][1]}:{' '}
        {hazeOpacity(environment) === 0 ? 'clean air, no haze.' : `a haze over the grounds at ${Math.round(hazeOpacity(environment) * 100)}% at the far edge, thinning toward the camera.`}
        {still ? ' Reduced motion: the smoke stands still.' : ''} Nothing here is downloaded: SVG gradients only.
      </p>
    </main>
  );
}
