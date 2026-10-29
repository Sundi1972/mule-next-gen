import { HoloMap, Mule, SLOT_COLOR, SPECIES, SPECIES_NAME, StoreInterior, WalkBoard, cx, type BoardWalker, type MapTile, type Slot, type Terrain } from '@mule/ui';
import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { mapTiles } from '../../../../../../apps/web/src/game/derive';
import { LaptopFrame, PhoneFrame, SMALL_PHONE, TvFrame, useHash } from '../../harness';
import { InStep, MovingCreature, type MotionVariant } from '../../proposed/CreatureMotion';
import { ARCADE_TILES, ARCADE_VIEW } from '../arcade/fixture';
import { DEFAULT_TUNABLES, mulePrice } from '../arcade/sim';
import { WolfGlyph } from '../arcade/WolfLayer';
import { cycleSeconds, GAIT, motionOf, type Facing, type Motion } from './gait';
import {
  BOARD,
  BOARD_TICK_MS,
  FRAME_MS,
  MAP,
  mapSpeed,
  newBoard,
  newHall,
  newMapScene,
  SEATS,
  stepBoard,
  stepHall,
  stepMap,
  terrainAt,
  wolvesAt,
  WOLVES_LOOP,
  type MapScene,
  type Mover,
  type Seat,
} from './scene';

// --- Route: #section.flag.flag, so every state is a link ------------------------------------------------------------

type Section = 'strip' | 'map' | 'board' | 'store' | 'wolves' | 'bench';
const SECTIONS: { id: Exclude<Section, 'bench'>; title: string }[] = [
  { id: 'strip', title: 'Every species × every motion' },
  { id: 'map', title: 'On the map, at 20 Hz' },
  { id: 'board', title: 'The walk board' },
  { id: 'store', title: 'The store hall' },
  { id: 'wolves', title: 'Wolves: run, bitten, fight' },
];
type FrameKind = 'phone' | 'tv' | 'laptop';
interface Route {
  section: Section;
  variants: MotionVariant[];
  frame: FrameKind;
  reduced: boolean;
  dots: boolean;
  steps: boolean;
  idle: boolean;
  /** The bench without MULEs, to tell the colonists' cost from the MULEs'. */
  nomule: boolean;
}
function parse(hash: string): Route {
  const [s = 'strip', ...flags] = hash.split('.');
  const f = new Set(flags);
  const section = (['strip', 'map', 'board', 'store', 'wolves', 'bench'] as Section[]).includes(s as Section) ? (s as Section) : 'strip';
  const variants: MotionVariant[] = f.has('a') ? ['A'] : f.has('b') ? ['B'] : ['A', 'B'];
  return { section, variants, frame: f.has('tv') ? 'tv' : f.has('laptop') ? 'laptop' : 'phone', reduced: f.has('reduced'), dots: f.has('dots'), steps: f.has('steps'), idle: f.has('idle'), nomule: f.has('nomule') };
}
function format(r: Route): string {
  const flags = [r.variants.length === 1 ? r.variants[0]!.toLowerCase() : null, r.frame === 'phone' ? null : r.frame, r.reduced && 'reduced', r.dots && 'dots', r.steps && 'steps', r.idle && 'idle', r.nomule && 'nomule'].filter(Boolean);
  return [r.section, ...flags].join('.');
}

const VARIANT_NAME: Record<MotionVariant, string> = { A: 'A · bob and waddle', B: 'B · feet' };

// --- Ticking at the wire's rate ---------------------------------------------------------------------------------------

/** A state stepped every `ms` (a DevFrame, an auction tick): the only place positions change. */
function useTicker<S>(init: () => S, step: (s: S, dt: number) => S, ms: number): S {
  const [s, set] = useState(init);
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    const id = setInterval(() => set((v) => stepRef.current(v, ms)), ms);
    return () => clearInterval(id);
  }, [ms]);
  return s;
}

/** Arrow keys and WASD: a direction while held, null when none is. */
function useKeys(on: boolean): { x: number; y: number } | null {
  const [held, setHeld] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (!on) return;
    const KEYS: Record<string, string> = { ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r' };
    const down = (e: KeyboardEvent) => {
      const k = KEYS[e.code];
      if (!k) return;
      e.preventDefault();
      setHeld((h) => (h.has(k) ? h : new Set(h).add(k)));
    };
    const up = (e: KeyboardEvent) => {
      const k = KEYS[e.code];
      if (!k) return;
      setHeld((h) => {
        const n = new Set(h);
        n.delete(k);
        return n;
      });
    };
    const blur = () => setHeld(new Set());
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [on]);
  if (held.size === 0) return null;
  return { x: (held.has('r') ? 1 : 0) - (held.has('l') ? 1 : 0), y: (held.has('d') ? 1 : 0) - (held.has('u') ? 1 : 0) };
}

// --- Small parts ------------------------------------------------------------------------------------------------------

function Seg<T extends string>({ label, value, options, onPick, testid }: { label: string; value: T; options: { id: T; title: string }[]; onPick: (v: T) => void; testid: string }) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={label} data-testid={testid}>
      <span className="label-caps text-ink-3">{label}</span>
      <div className="flex overflow-hidden rounded-control border border-holo-line">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={value === o.id}
            onClick={() => onPick(o.id)}
            className={cx('h-9 px-3 font-mono text-xs font-bold', value === o.id ? 'bg-holo text-on-holo' : 'bg-panel text-ink-2 hover:bg-holo-soft hover:text-ink')}
            data-testid={`${testid}-${o.id}`}
          >
            {o.title}
          </button>
        ))}
      </div>
    </div>
  );
}

function Switch({ label, on, onFlip, testid, hint }: { label: string; on: boolean; onFlip: () => void; testid: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onFlip} className="flex h-9 items-center gap-2 rounded-control border border-holo-line bg-panel px-2.5 text-xs text-ink hover:border-holo" data-testid={testid} title={hint}>
      <span className={cx('relative h-4 w-7 rounded-full transition-colors', on ? 'bg-holo' : 'bg-raised')}>
        <span className={cx('absolute top-0.5 h-3 w-3 rounded-full bg-ink transition-[left]', on ? 'left-3.5' : 'left-0.5')} />
      </span>
      <span className="font-mono font-bold">{label}</span>
    </button>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return <span className="font-mono text-xs text-ink-3">{children}</span>;
}

const PHONE = SMALL_PHONE ? { w: 667, h: 375 } : { w: 844, h: 390 };

/** The chosen device frame, telling its contents their size and density. */
function DeviceFrame({ kind, children }: { kind: FrameKind; children: (w: number, h: number, tv: boolean) => ReactNode }) {
  if (kind === 'tv') return <TvFrame>{children(1280, 720, true)}</TvFrame>;
  if (kind === 'laptop')
    return (
      <LaptopFrame scale={0.6}>
        <div className="h-full w-full bg-table">{children(1440, 900, true)}</div>
      </LaptopFrame>
    );
  return (
    <PhoneFrame>
      <div className="h-full w-full bg-table">{children(PHONE.w, PHONE.h, false)}</div>
    </PhoneFrame>
  );
}

const frameName = (k: FrameKind) => (k === 'tv' ? 'The TV · 1280 × 720 (scaled)' : k === 'laptop' ? 'A laptop · 1440 × 900 (scaled)' : `A phone, sideways · ${PHONE.w} × ${PHONE.h}`);

/** Both variants side by side, or the one picked. */
function Variants({ variants, frame, children }: { variants: MotionVariant[]; frame: FrameKind; children: (v: MotionVariant, w: number, h: number, tv: boolean) => ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-6">
      {variants.map((v) => (
        <div key={v} className="flex min-w-0 flex-col gap-1.5" data-testid={`variant-${v}`}>
          <Caption>
            <span className="font-bold text-ink">{VARIANT_NAME[v]}</span> · {frameName(frame)}
          </Caption>
          <DeviceFrame kind={frame}>{(w, h, tv) => children(v, w, h, tv)}</DeviceFrame>
        </div>
      ))}
    </div>
  );
}

/** A position that glides between frames: the frame sets it, a transform transition interpolates (no layout). */
function Glide({ x, y, ms, z, children, testid, data }: { x: number; y: number; ms: number; z?: number; children: ReactNode; testid?: string; data?: Record<string, string | number | undefined> }) {
  return (
    <div
      className="walk-glide pointer-events-none absolute left-0 top-0"
      style={{ transform: `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`, transition: ms ? `transform ${ms}ms linear` : 'none', zIndex: z }}
      data-testid={testid}
      {...Object.fromEntries(Object.entries(data ?? {}).map(([k, v]) => [`data-${k}`, v]))}
    >
      {children}
    </div>
  );
}

// --- The map scene ----------------------------------------------------------------------------------------------------

const TILES = mapTiles({ ...ARCADE_VIEW, tiles: ARCADE_TILES });
const MemoMap = memo(HoloMap);

interface Gaited {
  seat: Seat;
  m: Mover;
  motion: Motion;
  cycle: number;
  speed: number;
  ground: string;
}
function gaitOfMover(seat: Seat, m: Mover): Gaited {
  const t = terrainAt(m.x, m.y);
  const g = { moving: m.moving, encounter: null, pace: seat.pace, terrain: t.factor, lead: !!m.lead, limp: false };
  return { seat, m, motion: motionOf(g), cycle: cycleSeconds(g), speed: m.moving ? mapSpeed(seat, m) : 0, ground: t.name };
}

/** The map with every colonist and its MULE, in a w × h frame: the map fits, centred. */
function MapView({ scene, seats, variant, w, h, tv, glide, trail }: { scene: MapScene; seats: Seat[]; variant: MotionVariant; w: number; h: number; tv: boolean; glide: boolean; trail?: { x: number; y: number }[] }) {
  const cell = Math.min(w / MAP.w, h / MAP.h);
  const size = Math.round(cell * 0.62);
  const muleSize = Math.round(size * 1.35);
  const off = { x: (w - cell * MAP.w) / 2, y: (h - cell * MAP.h) / 2 };
  const ms = glide ? FRAME_MS : 0;
  return (
    <div className="relative h-full w-full overflow-hidden" data-testid="map-scene" data-variant={variant}>
      <div className="absolute" style={{ left: off.x, top: off.y, width: cell * MAP.w, height: cell * MAP.h }}>
        <MemoMap width={MAP.w} height={MAP.h} tiles={TILES} density={tv ? 'tv' : 'phone'} hideGround className="w-full" />
        <div className="pointer-events-none absolute inset-0" data-testid="walkers">
          {trail?.map((p, i) => (
            <span key={i} className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-holo" style={{ left: p.x * cell, top: p.y * cell, opacity: 0.25 + (0.75 * i) / trail.length }} data-testid="frame-dot" />
          ))}
          {scene.movers.map((m, i) => {
            const g = gaitOfMover(seats[i]!, m);
            const mine = i === 0;
            return (
              <div key={m.id}>
                {m.lead && (
                  <Glide x={m.lead.x * cell} y={m.lead.y * cell} ms={ms} z={Math.round(m.lead.y * 10)} testid={`mule-${m.id}`} data={{ moving: m.moving ? 1 : undefined }}>
                    <div className="-translate-x-1/2 -translate-y-[80%]">
                      <InStep cycle={g.motion === 'idle' ? GAIT.fullCycle : g.cycle}>
                        <Mule size={muleSize} state={m.moving ? 'walk' : 'idle'} good={m.lead.good} owner={g.seat.slot} facing={m.lead.facing} />
                      </InStep>
                    </div>
                  </Glide>
                )}
                <Glide x={m.x * cell} y={m.y * cell} ms={ms} z={Math.round(m.y * 10) + 1} testid={`colonist-${m.id}`} data={{ motion: g.motion, facing: m.facing, cycle: g.cycle.toFixed(2) }}>
                  <div className="flex -translate-x-1/2 -translate-y-[85%] flex-col items-center">
                    <span className="relative block">
                      {mine && <span aria-hidden className="absolute -bottom-[12%] left-1/2 h-[30%] w-[120%] -translate-x-1/2 rounded-full border-2 border-holo shadow-glow" data-testid="me-ring" />}
                      <MovingCreature species={g.seat.species} color={SLOT_COLOR[g.seat.slot]} size={size} variant={variant} motion={g.motion} facing={m.facing} cycle={g.cycle} glow={mine} label={g.seat.name} />
                    </span>
                    {tv && <span className="mt-0.5 whitespace-nowrap rounded-chip bg-map-chip px-1 font-mono text-xs font-bold leading-tight text-ink shadow-chip">{g.seat.name}</span>}
                  </div>
                </Glide>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MapSection({ route }: { route: Route }) {
  const seats = SEATS.slice(0, 5);
  const steer = useKeys(true);
  const steerRef = useRef(steer);
  steerRef.current = steer;
  const [trail, setTrail] = useState<{ x: number; y: number }[]>([]);
  const scene = useTicker(
    () => newMapScene(seats),
    (s, dt) => stepMap(s, seats, dt, { steer: steerRef.current }),
    FRAME_MS,
  );
  const me = scene.movers[0]!;
  useEffect(() => {
    if (route.dots) setTrail((t) => [...t.slice(-11), { x: me.x, y: me.y }]);
  }, [scene, route.dots, me.x, me.y]);
  return (
    <div className="flex flex-col gap-3" data-testid="section-map">
      <p className="max-w-4xl text-sm text-ink-2">
        You are Lena (ringed): <b className="text-ink">arrow keys or WASD</b> to walk; let go and the autopilot takes over. Ossa is hungry and Kai is sick, so they stride visibly slower, and slower again on the mountains and swamp; every MULE steps in time with its colonist. Positions change only on a frame, 20 a second (DevFrame, 50 ms); between frames the browser glides them. Switch <b className="text-ink">Frame dots</b> on to see where each frame put you, and <b className="text-ink">No glide</b> to see the raw 20 Hz steps. The gait itself is CSS from moving, facing and pace: it costs nothing on the wire.
      </p>
      <Variants variants={route.variants} frame={route.frame}>
        {(v, w, h, tv) => <MapView scene={scene} seats={seats} variant={v} w={w} h={h} tv={tv} glide={!route.steps} trail={route.dots ? trail : undefined} />}
      </Variants>
      <Readout scene={scene} seats={seats} />
    </div>
  );
}

/** What drives each colonist's gait, at this frame: every input is already on the wire or on the client. */
function Readout({ scene, seats }: { scene: MapScene; seats: Seat[] }) {
  return (
    <table className="w-fit border-separate border-spacing-x-3 font-mono text-xs text-ink-2" data-testid="gait-readout">
      <thead className="text-ink-3">
        <tr>
          <th className="text-left font-normal">colonist</th>
          <th className="text-left font-normal">pace (wire)</th>
          <th className="text-left font-normal">ground (client map)</th>
          <th className="text-left font-normal">MULE</th>
          <th className="text-right font-normal">tiles/s</th>
          <th className="text-left font-normal">motion</th>
          <th className="text-right font-normal">stride</th>
        </tr>
      </thead>
      <tbody>
        {scene.movers.map((m, i) => {
          const g = gaitOfMover(seats[i]!, m);
          return (
            <tr key={m.id} data-testid={`readout-${m.id}`}>
              <td className="text-ink">
                {g.seat.name} · {SPECIES_NAME[g.seat.species]}
              </td>
              <td>
                {g.seat.pace.toFixed(2)} {g.seat.why}
              </td>
              <td>
                {g.ground} × {terrainAt(m.x, m.y).factor}
              </td>
              <td>{m.lead ? `× ${DEFAULT_TUNABLES.leadPace}` : '—'}</td>
              <td className="text-right">{g.speed.toFixed(2)}</td>
              <td className={g.motion === 'idle' ? 'text-ink-3' : 'text-holo'}>
                {g.motion} {m.facing === 'left' ? '←' : '→'}
              </td>
              <td className="text-right">{g.motion === 'idle' ? `breath ${g.cycle.toFixed(1)}` : g.cycle.toFixed(2)} s</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** The measuring bench: six colonists and six MULEs in a phone frame, nothing else on the page. */
function Bench({ route }: { route: Route }) {
  const scene = useTicker(
    () => {
      const s = newMapScene(SEATS);
      return route.nomule ? { ...s, movers: s.movers.map((m) => ({ ...m, lead: null })) } : s;
    },
    (s, dt) => stepMap(s, SEATS, dt, { allWalk: !route.idle, allIdle: route.idle }),
    FRAME_MS,
  );
  const v = route.variants.length === 1 ? route.variants[0]! : 'A';
  return (
    <div className="bg-table" style={{ width: 844, height: 390 }} data-testid="bench" data-variant={v} data-idle={route.idle || undefined} data-nomule={route.nomule || undefined}>
      <MapView scene={scene} seats={SEATS} variant={v} w={844} h={390} tv={false} glide />
    </div>
  );
}

// --- The strip: every species, every motion ---------------------------------------------------------------------------

const MOTIONS: { id: Motion; title: string; enc: 'chase' | 'fight' | null; moving: boolean; limp: boolean }[] = [
  { id: 'idle', title: 'idle', enc: null, moving: false, limp: false },
  { id: 'walk', title: 'walk', enc: null, moving: true, limp: false },
  { id: 'run', title: 'run (chase)', enc: 'chase', moving: true, limp: false },
  { id: 'fight', title: 'fight', enc: 'fight', moving: false, limp: false },
  { id: 'hurt', title: 'hurt (bitten: a limp)', enc: null, moving: true, limp: true },
];

function StripSection({ route }: { route: Route }) {
  const [pace, setPace] = useState(1);
  const [facing, setFacing] = useState<Facing>('right');
  const [bites, setBites] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const cycleOf = (m: (typeof MOTIONS)[number], lead = false) => cycleSeconds({ moving: m.moving, encounter: m.enc, pace, terrain: 1, lead, limp: m.limp });
  return (
    <div className="flex flex-col gap-4" data-testid="section-strip">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 font-mono text-xs text-ink-2" data-testid="pace-control">
          <span className="label-caps text-ink-3">Pace</span>
          <input type="range" min={0.2} max={1.25} step={0.05} value={pace} onChange={(e) => setPace(Number(e.target.value))} className="w-44 accent-holo" data-testid="pace-slider" aria-label="Pace" />
          <span className="w-40 text-ink" data-testid="pace-value">
            {pace.toFixed(2)} · stride {cycleOf(MOTIONS[1]!).toFixed(2)} s
          </span>
        </label>
        <div className="flex gap-1.5">
          {[
            { p: 1, t: 'fed, plains' },
            { p: 0.55, t: 'hungry' },
            { p: 0.4, t: 'fed, mountains' },
            { p: 0.2, t: 'hungry, mountains' },
          ].map((o) => (
            <button key={o.t} type="button" onClick={() => setPace(o.p)} aria-pressed={Math.abs(pace - o.p) < 0.01} className={cx('h-8 rounded-chip border px-2 font-mono text-[11px]', Math.abs(pace - o.p) < 0.01 ? 'border-holo bg-holo-soft text-ink' : 'border-holo-line text-ink-2 hover:text-ink')} data-testid={`pace-${o.p}`}>
              {o.t} {o.p}
            </button>
          ))}
        </div>
        <Seg label="Facing" value={facing} options={[{ id: 'left', title: '← left' }, { id: 'right', title: 'right →' }]} onPick={setFacing} testid="facing" />
        <button type="button" onClick={() => setBites((b) => b + 1)} className="h-9 rounded-control border border-alert bg-alert-bg px-3 font-mono text-xs font-bold text-alert-ink" data-testid="bite">
          Bite! (flinch)
        </button>
        <button type="button" onClick={() => setStrikes((b) => b + 1)} className="h-9 rounded-control border border-holo-line bg-holo-soft px-3 font-mono text-xs font-bold text-ink" data-testid="strike">
          Strike (your press)
        </button>
      </div>
      <p className="max-w-4xl text-sm text-ink-2">
        The pace slider is the wire's pace times the ground's: the stride takes {GAIT.fullCycle} s at full speed, the MULE's own step, and lengthens as speed falls, so the feet cover the same ground at every pace. Running strides {GAIT.runShare}× as long, a limp {GAIT.limpShare}×; the fight's jab keeps the wolf's lunge rhythm ({GAIT.fightCycle} s). Bite and Strike play the one-off moments on every creature.
      </p>
      <div className="flex flex-wrap items-start gap-8">
        {route.variants.map((v) => (
          <div key={v} className="flex flex-col gap-2 rounded-panel border border-holo-line bg-panel p-4" data-testid={`strip-${v}`}>
            <h3 className="label-caps text-ink">{VARIANT_NAME[v]}</h3>
            <table className="border-separate border-spacing-x-4 border-spacing-y-2">
              <thead>
                <tr>
                  <th />
                  {MOTIONS.map((m) => (
                    <th key={m.id} className="text-center font-mono text-[11px] font-normal text-ink-3">
                      {m.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SPECIES.map((sp, i) => (
                  <tr key={sp}>
                    <th className="pr-2 text-right font-mono text-xs font-normal text-ink-2">{SPECIES_NAME[sp]}</th>
                    {MOTIONS.map((m) => (
                      <td key={m.id} className="h-16 w-16 text-center align-bottom">
                        <MovingCreature species={sp} color={SLOT_COLOR[i as Slot]} size={44} variant={v} motion={m.id} facing={facing} cycle={cycleOf(m)} flinch={m.id === 'fight' || m.id === 'hurt' ? bites : 0} strike={m.id === 'fight' ? strikes : 0} testid={`strip-${v}-${sp}-${m.id}`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <h4 className="label-caps mt-2 text-ink-3">In step with the MULE on its lead (× {DEFAULT_TUNABLES.leadPace})</h4>
            <div className="flex flex-wrap items-end gap-x-5 gap-y-3" data-testid={`instep-${v}`}>
              {SPECIES.map((sp, i) => {
                const c = cycleOf(MOTIONS[1]!, true);
                return (
                  <div key={sp} className={cx('flex items-end gap-1', facing === 'left' && 'flex-row-reverse')}>
                    <InStep cycle={c}>
                      <Mule size={50} state="walk" good="food" owner={i as Slot} facing={facing} />
                    </InStep>
                    <MovingCreature species={sp} color={SLOT_COLOR[i as Slot]} size={36} variant={v} motion="walk" facing={facing} cycle={c} testid={`instep-${v}-${sp}`} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- The walk board ---------------------------------------------------------------------------------------------------

const BOARD_SEATS: Record<string, Seat> = Object.fromEntries(SEATS.map((s) => [s.id, s]));

function BoardSection({ route }: { route: Route }) {
  const board = useTicker(
    () => ({ t: 0, ws: newBoard() }),
    (s, dt) => ({ t: s.t + dt, ws: stepBoard(s.ws, s.t, dt) }),
    BOARD_TICK_MS,
  );
  const walkers: BoardWalker[] = board.ws.map((w) => ({ id: w.id, name: BOARD_SEATS[w.id]!.name, slot: BOARD_SEATS[w.id]!.slot, side: w.side, price: Math.round(w.at), at: w.at }));
  return (
    <div className="flex flex-col gap-3" data-testid="section-board">
      <p className="max-w-4xl text-sm text-ink-2">
        The goods auction's walk: sellers walk down to ask less, buyers walk up to bid more, at the auction's own pace (the board's height in 6 s; the server's 10 Hz tick). A walker walks while its price moves and stands, breathing, while it holds. The board's creatures face right whichever way they walk: up and down have no facing.
      </p>
      <Variants variants={route.variants} frame={route.frame === 'laptop' ? 'tv' : route.frame}>
        {(v, _w, _h, tv) => (
          <div className="flex h-full w-full p-2">
            <WalkBoard
              lo={BOARD.lo}
              hi={BOARD.hi}
              walkers={walkers}
              deals={[]}
              storeBuys={28}
              storeSells={72}
              shipPays={null}
              marks={{ ask: true, bid: true }}
              meId="lena"
              size={tv ? 'tv' : 'phone'}
              className="min-h-0 flex-1"
              wrapCreature={(id) => {
                const w = board.ws.find((b) => b.id === id)!;
                const seat = BOARD_SEATS[id]!;
                const motion: Motion = w.dir === 0 ? 'idle' : 'walk';
                return <MovingCreature species={seat.species} color={SLOT_COLOR[seat.slot]} size={tv ? 64 : 34} variant={v} motion={motion} cycle={motion === 'idle' ? GAIT.idleCycle : GAIT.fullCycle} shadow={false} testid={`board-creature-${id}`} />;
              }}
            />
          </div>
        )}
      </Variants>
    </div>
  );
}

// --- The store hall ---------------------------------------------------------------------------------------------------

const HALL_PACES = [
  { p: 1, t: 'fed' },
  { p: 0.55, t: 'hungry' },
  { p: 0.5, t: 'sick' },
];

function StoreSection({ route }: { route: Route }) {
  const [pace, setPace] = useState(1);
  const paceRef = useRef(pace);
  paceRef.current = pace;
  const hall = useTicker(newHall, (s, dt) => stepHall(s, paceRef.current, dt), FRAME_MS);
  const g = { moving: hall.moving, encounter: null, pace, terrain: 1, lead: !!hall.lead, limp: false };
  const motion = motionOf(g);
  const cycle = cycleSeconds(g);
  const me = SEATS[0]!;
  return (
    <div className="flex flex-col gap-3" data-testid="section-store">
      <div className="flex flex-wrap items-center gap-3">
        <Seg label="Lena is" value={String(pace)} options={HALL_PACES.map((o) => ({ id: String(o.p), title: `${o.t} ${o.p}` }))} onPick={(v) => setPace(Number(v))} testid="hall-pace" />
        <Caption>
          {motion} · stride {cycle.toFixed(2)} s · {hall.lead ? (hall.lead.good ? 'leading a Food MULE' : 'leading a new MULE') : 'no MULE'}
        </Caption>
      </div>
      <p className="max-w-4xl text-sm text-ink-2">Your errand in the hall: in at the left door, a MULE at the corral, Food at the outfitter, out at the right door. Today the colonist only tilts as a whole (store-waddle); here it walks, and the MULE walks behind it in step.</p>
      <Variants variants={route.variants} frame={route.frame}>
        {(v, w, h, tv) => {
          const hallW = Math.min(w, (h * 4) / 3);
          const hallH = (hallW * 3) / 4;
          const cell = hallW / 16;
          const size = Math.round(cell * 0.95);
          return (
            <div className="flex h-full w-full items-center justify-center">
              <div className="relative" style={{ width: hallW, height: hallH }} data-testid="hall">
                <StoreInterior mules={5} mulePrice={mulePrice(DEFAULT_TUNABLES)} pubPayout={120} prices={{ ...DEFAULT_TUNABLES.outfit }} tv={tv} />
                <div className="pointer-events-none absolute inset-0 z-[7]">
                  {hall.lead && (
                    <Glide x={(hall.lead.x / 100) * hallW} y={(hall.lead.y / 100) * hallH} ms={route.steps ? 0 : FRAME_MS} z={Math.round(hall.lead.y)} testid="hall-mule">
                      <div className="-translate-x-1/2 -translate-y-[80%]">
                        <InStep cycle={motion === 'idle' ? GAIT.fullCycle : cycle}>
                          <Mule size={Math.round(size * 1.1)} state={hall.moving ? 'walk' : 'idle'} good={hall.lead.good} owner={me.slot} facing={hall.lead.facing} />
                        </InStep>
                      </div>
                    </Glide>
                  )}
                  <Glide x={(hall.x / 100) * hallW} y={(hall.y / 100) * hallH} ms={route.steps ? 0 : FRAME_MS} z={Math.round(hall.y) + 1} testid="hall-colonist" data={{ motion, facing: hall.facing }}>
                    <div className="-translate-x-1/2 -translate-y-[85%]">
                      <span className="relative block rounded-full ring-2 ring-holo ring-offset-1 ring-offset-table">
                        <MovingCreature species={me.species} color={SLOT_COLOR[me.slot]} size={size} variant={v} motion={motion} facing={hall.facing} cycle={cycle} shadow={false} label={me.name} />
                      </span>
                    </div>
                  </Glide>
                </div>
              </div>
            </div>
          );
        }}
      </Variants>
    </div>
  );
}

// --- Wolves -----------------------------------------------------------------------------------------------------------

/** A strip of forest (and the hills it climbs into): wolves' country, drawn by the same HoloMap as the colony. */
const FOREST_W = 12;
const FOREST_H = 3;
const FOREST: MapTile[] = Array.from({ length: FOREST_W * FOREST_H }, (_, i) => ({ x: i % FOREST_W, y: Math.floor(i / FOREST_W), terrain: (i % FOREST_W > 9 && i >= FOREST_W ? 'hills' : 'forest') as Terrain, owner: null }));

/** The rope's length in the strip, in tiles. */
const ROPE = 0.95;

const PHASES = ['walk', 'choose', 'chase', 'bitten', 'limp', 'fight', 'won'] as const;

function WolvesSection({ route }: { route: Route }) {
  // The clock and the MULE on its rope: it walks only when the rope pulls, so in a turn the colonist passes it.
  const reset = useRef(false);
  const run = useTicker(
    () => ({ t: 0, mule: { x: 0, facing: 'right' as Facing, moving: false } }),
    (s, dt) => {
      const t = reset.current ? 0 : s.t + dt;
      reset.current = false;
      const c = wolvesAt(t).c;
      const d = c.x - s.mule.x;
      const pulled = Math.abs(d) > ROPE;
      const x = pulled ? c.x - Math.sign(d) * ROPE : s.mule.x;
      return { t, mule: { x, facing: pulled ? (d > 0 ? 'right' : 'left') : s.mule.facing, moving: pulled } };
    },
    FRAME_MS,
  );
  const restart = useCallback(() => (reset.current = true), []);
  const f = { ...wolvesAt(run.t), mule: run.mule };
  const g = { moving: f.c.moving, encounter: f.encounter, pace: 1, terrain: DEFAULT_TUNABLES.terrain.forest, lead: true, limp: f.c.limp };
  const cycle = cycleSeconds(g);
  const lena = SEATS[0]!;
  return (
    <div className="flex flex-col gap-3" data-testid="section-wolves">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={restart} className="h-9 rounded-control border border-holo-line bg-holo-soft px-3 font-mono text-xs font-bold text-ink" data-testid="wolves-restart">
          From the start
        </button>
        <ol className="flex flex-wrap gap-1 font-mono text-[11px]" data-testid="wolves-phases">
          {PHASES.map((p) => (
            <li key={p} className={cx('rounded-chip border px-1.5', f.phase === p ? 'border-holo bg-holo-soft text-ink' : 'border-holo-line text-ink-3')} data-testid={`phase-${p}`} {...(f.phase === p ? { 'data-current': true } : {})}>
              {p}
            </li>
          ))}
        </ol>
        <Caption>
          {f.c.motion} · stride {cycle.toFixed(2)} s · on forest × {DEFAULT_TUNABLES.terrain.forest} · the loop repeats every {WOLVES_LOOP / 1000} s
        </Caption>
      </div>
      <Variants variants={route.variants} frame={route.frame}>
        {(v, w, h, tv) => {
          const cols = FOREST_W;
          const cell = Math.min((w - 16) / cols, (h - (tv ? 90 : 50)) / FOREST_H);
          const bandH = cell * FOREST_H;
          const size = Math.round(cell * (tv ? 0.7 : 0.62));
          const ms = route.steps ? 0 : FRAME_MS;
          const y = bandH * 0.62;
          return (
            <div className="flex h-full w-full flex-col items-stretch justify-center gap-2 p-2">
              <div className={cx('self-center rounded-chip bg-map-chip px-2 font-mono font-bold text-ink shadow-chip', tv ? 'text-lg' : 'text-[11px]')} data-testid="wolves-caption" data-phase={f.phase}>
                {f.caption}
              </div>
              <div className="relative self-center" style={{ width: cols * cell, height: bandH }} data-testid="wolves-stage">
                <MemoMap width={FOREST_W} height={FOREST_H} tiles={FOREST} density={tv ? 'tv' : 'phone'} hideGround className="absolute inset-0 w-full" />
                {f.wolves.map((wf, i) => (
                  <Glide key={i} x={wf.x * cell} y={y} ms={ms} z={2} testid={`wolf-${i}`} data={{ pose: wf.pose }}>
                    <div className="-translate-x-1/2 -translate-y-[90%]">
                      <WolfGlyph size={Math.round(size * 1.1)} state={wf.pose} facing={wf.facing} />
                    </div>
                  </Glide>
                ))}
                <Glide x={f.mule.x * cell} y={y - 4} ms={ms} z={1} testid="wolves-mule">
                  <div className="-translate-x-1/2 -translate-y-[80%]">
                    <InStep cycle={f.c.motion === 'idle' || f.c.motion === 'fight' ? GAIT.fullCycle : cycle}>
                      <Mule size={Math.round(size * 1.35)} state={f.mule.moving ? 'walk' : 'idle'} good="food" owner={lena.slot} facing={f.mule.facing} />
                    </InStep>
                  </div>
                </Glide>
                <Glide x={f.c.x * cell} y={y} ms={ms} z={3} testid="wolves-colonist" data={{ motion: f.c.motion, facing: f.c.facing }}>
                  <div className="flex -translate-x-1/2 -translate-y-[85%] flex-col items-center">
                    {f.phase === 'choose' && <span className={cx('mb-1 rounded-chip bg-alert px-1.5 font-mono font-bold text-void', tv ? 'text-base' : 'text-[10px]')}>RUN or FIGHT?</span>}
                    {f.pelts > 0 && <span className={cx('mb-1 rounded-chip bg-ok px-1.5 font-mono font-bold text-void', tv ? 'text-base' : 'text-[10px]')}>+{f.pelts} pelts</span>}
                    <MovingCreature species={lena.species} color={SLOT_COLOR[lena.slot]} size={size} variant={v} motion={f.c.motion} facing={f.c.facing} cycle={cycle} flinch={f.bites} strike={f.strikes} glow label={lena.name} testid="wolves-creature" />
                  </div>
                </Glide>
              </div>
            </div>
          );
        }}
      </Variants>
    </div>
  );
}

// --- The page ---------------------------------------------------------------------------------------------------------

const DECISIONS = [
  'One stride is the MULE’s step (0.5 s) at full speed; it lengthens as speed falls, so pace shows and the feet never skate.',
  'The gait is derived on the client from fields every frame already carries (moving, facing, encounter, pace) and the map’s ground: no wire change.',
  'Positions move only on a 20 Hz frame; a 50 ms transform transition glides between them, so the walk is smooth without per-frame JavaScript.',
  'Facing flips the whole creature (as the MULE’s scale(-1 1)), through a squash so a turn reads; the lean points into travel.',
  'Wolves: running strides quicker with a glance back; the fight bounces and jabs on the wolf’s lunge rhythm; a bite flinches, then a limp until healed.',
  'Reduced motion: no loop at all; facing still flips; moving is a held lean (and in B a held stride).',
];

export function MotionPage() {
  const hash = useHash();
  const route = parse(hash);
  const go = (patch: Partial<Route>) => {
    window.location.hash = format({ ...route, ...patch });
  };
  if (route.section === 'bench')
    return (
      <div {...(route.reduced ? { 'data-reduced': '' } : {})} data-testid="motion-root">
        <Bench route={route} />
      </div>
    );
  const variantValue = route.variants.length === 2 ? 'both' : route.variants[0]!.toLowerCase();
  return (
    <div className="min-h-full bg-table p-6 text-ink" {...(route.reduced ? { 'data-reduced': '' } : {})} data-testid="motion-root" data-section={route.section}>
      <div className="flex flex-wrap items-baseline gap-3">
        <a href="/" className="font-mono text-xs text-holo underline" data-testid="link-index">
          ← all mocks
        </a>
        <h1 className="font-display text-xl font-semibold">Characters in motion</h1>
        <span className="font-mono text-xs text-ink-3">WS6 · for Heiko, 2026-10-29 · two variants, pick one</span>
      </div>
      <ul className="mt-2 flex max-w-5xl flex-col gap-0.5 text-sm text-ink-2" data-testid="decisions">
        {DECISIONS.map((d) => (
          <li key={d}>· {d}</li>
        ))}
      </ul>
      <nav className="mt-4 flex flex-wrap gap-1.5" aria-label="Sections" data-testid="sections">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" aria-current={route.section === s.id ? 'page' : undefined} onClick={() => go({ section: s.id })} className={cx('h-9 rounded-control border px-3 text-sm', route.section === s.id ? 'border-holo bg-holo-soft text-ink' : 'border-holo-line text-ink-2 hover:text-ink')} data-testid={`nav-${s.id}`}>
            {s.title}
          </button>
        ))}
      </nav>
      <div className="mt-3 flex flex-wrap items-center gap-4 rounded-panel border border-holo-line bg-panel p-2.5" data-testid="toolbar">
        <Seg
          label="Variant"
          value={variantValue}
          options={[
            { id: 'both', title: 'A and B' },
            { id: 'a', title: 'A · bob' },
            { id: 'b', title: 'B · feet' },
          ]}
          onPick={(v) => go({ variants: v === 'both' ? ['A', 'B'] : [v.toUpperCase() as MotionVariant] })}
          testid="variant"
        />
        {route.section !== 'strip' && (
          <Seg
            label="Frame"
            value={route.frame}
            options={[
              { id: 'phone', title: `Phone ${PHONE.w}` },
              { id: 'tv', title: 'TV' },
              { id: 'laptop', title: 'Laptop' },
            ]}
            onPick={(frame) => go({ frame })}
            testid="frame"
          />
        )}
        <a href={SMALL_PHONE ? `/motion.html${window.location.hash}` : `/motion.html?phone=667${window.location.hash}`} className="font-mono text-xs text-holo underline" data-testid="link-phone-size">
          {SMALL_PHONE ? 'phone at 844 × 390' : 'phone at 667 × 375'}
        </a>
        <Switch label="Reduced motion" on={route.reduced} onFlip={() => go({ reduced: !route.reduced })} testid="reduced" hint="Forces the prefers-reduced-motion: reduce branch on this page" />
        {route.section === 'map' && <Switch label="Frame dots" on={route.dots} onFlip={() => go({ dots: !route.dots })} testid="dots" />}
        {route.section !== 'strip' && <Switch label="No glide (raw frames)" on={route.steps} onFlip={() => go({ steps: !route.steps })} testid="steps" />}
      </div>
      <div className="mt-5">
        {route.section === 'strip' && <StripSection route={route} />}
        {route.section === 'map' && <MapSection route={route} />}
        {route.section === 'board' && <BoardSection route={route} />}
        {route.section === 'store' && <StoreSection route={route} />}
        {route.section === 'wolves' && <WolvesSection route={route} />}
      </div>
    </div>
  );
}
