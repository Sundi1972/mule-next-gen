import { DEV_WALK } from '@mule/engine';
import { Button, ConditionTag, cx, GoodIcon, HoloMap, Mule, MuleIcon, PlayerMark, StoreInterior, TERRAIN_NAME, waddleSeconds, type Condition, type PaceRule } from '@mule/ui';
import { memo, useMemo, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { mapTiles } from '../../../../../../apps/web/src/game/derive';
import { ARCADE_VIEW, ME } from './fixture';
import { useArcade, useTunables, useWorld } from './loop';
import { HALL, looseOf, mulePrice, paceOf, pubPayout, reachOf, ROOMS, speedOf, type Colonist, type Reach, type Space, type Tunables, type World } from './sim';
import { GlintOnMap, GlintPointer, GlintSightlines, GlintStrip, GlintTurn } from './GlintLayer';
import { WolfCallout, WolfMarks, WolvesOnMap } from './WolfLayer';

/** The DS's condition, from the sim's pace: what the colonist tags and the pace lines read. */
export function conditionOf(c: Colonist, tun: Tunables): Condition {
  const p = paceOf(c, tun);
  return { foodShare: p.foodShare, sick: !!tun.seats[c.id]?.sick, sickBecause: tun.seats[c.id]?.sick ? 'chance' : null, conditionPace: p.condition };
}
export const ruleOf = (tun: Tunables): PaceRule => ({ hungerPaceMin: tun.hungerPaceMin, sickPace: tun.sickPace, hungerLevels: DEV_WALK.hungerLevels });
export const meOf = (w: World) => w.colonists.find((c) => c.id === ME)!;
export const secondsLeft = (w: World, tun: Tunables) => Math.max(0, tun.devSeconds - w.t / 1000);

type Density = 'phone' | 'tv' | 'wide';

// --- Colonists and their MULEs, at free positions --------------------------------------------------

/**
 * Every colonist in one space, at its exact position, over a map or the hall. Not HoloMap's `avatars`: those ease over
 * 700 ms between plots, which turns live steering into a lag, so the walkers are drawn here from the same DS parts
 * (PlayerMark, Mule, ConditionTag).
 */
function Walkers({ world, space, cell, density, names, own }: { world: World; space: Space; cell: number; density: Density; names: boolean; own: boolean }) {
  const tun = useTunables();
  const rule = ruleOf(tun);
  const W = space === 'map' ? world.width : HALL.w;
  const H = space === 'map' ? world.height : HALL.h;
  const here = world.colonists.filter((c) => c.space === space && !(c.done && space === 'map'));
  const size = Math.round(cell * (space === 'map' ? 0.62 : 0.95));
  const muleSize = Math.round(size * (space === 'map' ? 1.35 : 1.1));
  const at = (x: number, y: number) => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });
  return (
    <div className="pointer-events-none absolute inset-0 z-[7]" data-testid={`walkers-${space}`}>
      {[...here]
        .sort((a, b) => a.y - b.y)
        .map((c) => {
          const mine = c.id === ME;
          const pace = speedOf(world, c, tun);
          return (
            <div key={c.id}>
              {c.mule && (
                <div className="absolute -translate-x-1/2 -translate-y-[80%]" style={at(c.mule.x, c.mule.y)} data-testid={`mule-${c.id}`} data-good={c.mule.good ?? 'empty'}>
                  <Mule size={muleSize} state={c.moving ? 'walk' : 'idle'} good={c.mule.good} owner={c.slot} facing={c.mule.facing} />
                </div>
              )}
              <div
                className="absolute flex -translate-x-1/2 -translate-y-[85%] flex-col items-center"
                style={at(c.x, c.y)}
                data-testid={`colonist-${c.id}`}
                data-x={c.x.toFixed(3)}
                data-y={c.y.toFixed(3)}
                data-t={world.t.toFixed(0)}
                data-space={c.space}
                data-moving={c.moving || undefined}
                data-done={c.done || undefined}
                data-speed={pace.perSecond.toFixed(4)}
                data-encounter={c.encounter?.kind}
                data-bitten={c.bitten || undefined}
                data-pelts={c.pelts}
              >
                <WolfCallout world={world} c={c} tun={tun} density={density} mine={mine && own} />
                <span
                  className={cx('relative block rounded-full', mine && 'ring-2 ring-holo ring-offset-1 ring-offset-table', c.moving && 'animate-[store-waddle_0.36s_ease-in-out_infinite]')}
                  style={c.moving ? { animationDuration: `${waddleSeconds(Math.max(0.1, pace.ground * pace.pace.total))}s` } : undefined}
                >
                  <PlayerMark slot={c.slot} species={c.species} size={size} glow={mine} label={c.name} className="block" />
                  {names && <GlintTurn world={world} c={c} size={size} />}
                  <ConditionTag id={c.id} condition={conditionOf(c, tun)} rule={rule} size={density} />
                </span>
                {names && (
                  <span className={cx('mt-0.5 whitespace-nowrap rounded-chip bg-map-chip px-1 font-mono font-bold leading-tight text-ink shadow-chip', density === 'tv' ? 'text-xs' : 'text-[9px]')}>{c.name}</span>
                )}
                <WolfMarks c={c} density={density} />
              </div>
            </div>
          );
        })}
    </div>
  );
}

// --- The map --------------------------------------------------------------------------------------

const MemoMap = memo(HoloMap);

/** Pointer handling for a stage: hold to walk toward the spot, click the highlighted thing to act. ⌥ stays the review loop's. */
function usePointer(space: Space, layer: React.RefObject<HTMLDivElement | null>, hits: (p: { x: number; y: number }) => boolean, interactive: boolean) {
  const arcade = useArcade();
  const toWorld = (e: ReactPointerEvent) => {
    const r = layer.current!.getBoundingClientRect();
    const w = space === 'map' ? arcade.world.width : HALL.w;
    const h = space === 'map' ? arcade.world.height : HALL.h;
    return { x: ((e.clientX - r.left) / r.width) * w, y: ((e.clientY - r.top) / r.height) * h };
  };
  if (!interactive) return {};
  return {
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.altKey || e.button !== 0) return;
      const p = toWorld(e);
      if (hits(p)) {
        arcade.press();
        return;
      }
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      arcade.controls.mouse = { ...p, space };
    },
    onPointerMove: (e: ReactPointerEvent) => {
      if (arcade.controls.mouse) arcade.controls.mouse = { ...toWorld(e), space };
    },
    onPointerUp: () => (arcade.controls.mouse = null),
    onPointerCancel: () => (arcade.controls.mouse = null),
  };
}

function reachHits(world: World, reach: Reach, p: { x: number; y: number }, space: Space): boolean {
  const t = reach.target;
  if (!reach.enabled || !t || t.space !== space) return false;
  if ('tile' in t) return Math.floor(p.x) === t.tile.x && Math.floor(p.y) === t.tile.y;
  if ('door' in t) return Math.floor(p.x) === world.store.x && Math.floor(p.y) === world.store.y;
  if ('mule' in t) return Math.hypot(p.x - t.mule.x, p.y - t.mule.y) < 0.6;
  const r = ROOMS[t.room];
  const q = { x: (p.x / HALL.w) * 100, y: (p.y / HALL.h) * 100 };
  return q.x >= r.x0 && q.x <= r.x1 && q.y >= r.y0 && q.y <= r.y1;
}

/**
 * The colony map as a stage, drawn by the approved HoloMap. `across` plots fit the width: the camera then follows your
 * colonist (variant A); without it the whole map shows (variant B, the TV and the laptop).
 */
export function MapStage({ width, height, across, density, interactive = false, names = false, ringed = false, testid = 'map-stage' }: { width: number; height?: number; across?: number; density: Density; interactive?: boolean; names?: boolean; ringed?: boolean; testid?: string }) {
  const world = useWorld();
  const tun = useTunables();
  const me = meOf(world);
  const reach = reachOf(world, me, tun);
  const tiles = useMemo(() => mapTiles({ ...ARCADE_VIEW, tiles: world.tiles }), [world.tiles]);
  const cell = width / (across ?? world.width);
  const mapW = cell * world.width;
  const mapH = cell * world.height;
  const viewH = height ?? mapH;
  const follow = across !== undefined && me.space === 'map';
  const clamp = (v: number, lo: number, hi: number) => (hi < lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
  const off = follow ? { x: clamp(me.x * cell - width / 2, 0, mapW - width), y: clamp(me.y * cell - viewH / 2, 0, mapH - viewH) } : { x: 0, y: (mapH - viewH) / 2 };
  const layer = useRef<HTMLDivElement>(null);
  // Only your own screen lights what your button acts on; the TV is everyone's.
  const selected = interactive && reach.enabled && reach.target && 'tile' in reach.target ? reach.target.tile : null;
  const door = interactive && reach.enabled && reach.target && 'door' in reach.target ? reach.target.door : null;
  const ptr = usePointer('map', layer, (p) => reachHits(world, reach, p, 'map'), interactive);
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <div className={cx('relative overflow-hidden rounded-panel', interactive && 'cursor-crosshair touch-none')} style={{ width, height: viewH }} data-testid={testid} data-camera={follow ? 'follow' : 'whole'} {...ptr}>
      <div ref={layer} className="absolute left-0 top-0" style={{ width: mapW, height: mapH, transform: `translate(${-off.x}px, ${-off.y}px)` }}>
        <MemoMap width={world.width} height={world.height} tiles={tiles} density={density === 'wide' ? 'tv' : density} hideGround selected={selected} className="w-full" />
        {/* The store's two doors, on its left and right faces: the only way in. */}
        {(['L', 'R'] as const).map((side) => (
          <span
            key={side}
            className={cx('pointer-events-none absolute z-[6] rounded-chip', door === side ? 'bg-holo shadow-glow animate-[store-beckon_1.6s_ease-in-out_infinite]' : 'bg-holo/70 shadow-chip')}
            style={{ left: pct(world.store.x + (side === 'L' ? -0.05 : 0.95), world.width), top: pct(world.store.y + 0.25, world.height), width: pct(0.1, world.width), height: pct(0.5, world.height) }}
            data-testid={`store-door-${side}`}
            {...(door === side ? { 'data-next': true } : {})}
          />
        ))}
        {ringed && me.space === 'map' && !me.done && (
          // Variant B's ring: on the whole map your colonist is small, so it is circled.
          <span
            aria-hidden
            className="pointer-events-none absolute z-[6] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-holo shadow-glow"
            style={{ left: pct(me.x, world.width), top: pct(me.y - 0.25, world.height), width: cell * 1.3, height: cell * 1.3 }}
            data-testid="me-ring"
          />
        )}
        <GlintOnMap world={world} cell={cell} />
        {names && <GlintSightlines world={world} />}
        {/* Wolves first: a colonist's callout (run or fight?) draws over its pack. */}
        <WolvesOnMap world={world} cell={cell} />
        <Walkers world={world} space="map" cell={cell} density={density} names={names} own={interactive} />
      </div>
      {follow && interactive && <GlintPointer world={world} me={me} cell={cell} off={off} width={width} height={viewH} />}
    </div>
  );
}

// --- The store hall ---------------------------------------------------------------------------------

const OPEN = ['corral', 'pub', 'food', 'energy', 'smithore', 'crystite'] as const;
const LOCKS = { water: 'closed', rareEarth: 'closed', works: 'closed', greenBelt: 'closed' };
const SHORT: Partial<Record<Reach['kind'], string>> = { buy: 'BUY', outfit: 'OUTFIT', pub: 'PUB', leave: 'LEAVE' };

/** The store hall as a stage: the approved StoreInterior at 4:3, everyone inside walking over it. */
/** `store` sizes the hall's own type apart from the walkers: the TV's narrow side panel needs the phone's to fit. */
export function HallStage({ width, density, store = density, interactive = false, names = false, testid = 'hall-stage' }: { width: number; density: Density; store?: Density; interactive?: boolean; names?: boolean; testid?: string }) {
  const world = useWorld();
  const tun = useTunables();
  const me = meOf(world);
  const reach = reachOf(world, me, tun);
  const height = (width * HALL.h) / HALL.w;
  const layer = useRef<HTMLDivElement>(null);
  const ptr = usePointer('hall', layer, (p) => reachHits(world, reach, p, 'hall'), interactive);
  const lit = interactive && reach.enabled && reach.target?.space === 'hall' && me.space === 'hall' ? reach.target.room : null;
  const box = lit ? ROOMS[lit] : null;
  return (
    <div ref={layer} className={cx('relative', interactive && 'cursor-crosshair touch-none')} style={{ width, height }} data-testid={testid} {...ptr}>
      <StoreInterior
        mules={world.storeMules}
        mulePrice={mulePrice(tun)}
        pubPayout={pubPayout(world, tun)}
        prices={{ ...tun.outfit }}
        open={[...OPEN]}
        locks={LOCKS}
        tv={store === 'tv'}
        wide={store === 'wide'}
      />
      {box && (
        <span
          className="pointer-events-none absolute z-[6] rounded-panel border-2 border-holo animate-[store-beckon_1.6s_ease-in-out_infinite]"
          style={{ left: `${box.x0}%`, top: `${box.y0}%`, width: `${box.x1 - box.x0}%`, height: `${box.y1 - box.y0}%` }}
          data-testid="hall-lit"
          data-room={lit}
        >
          <span className="absolute left-1/2 top-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-holo px-1.5 font-mono text-[10px] font-bold leading-4 text-on-holo shadow-glow">{SHORT[reach.kind] ?? 'GO'}</span>
        </span>
      )}
      <Walkers world={world} space="hall" cell={width / HALL.w} density={density} names={names} own={interactive} />
    </div>
  );
}

/** Where you are, drawn big: the map (camera or whole) on the map, the hall inside the store. */
export function YourStage({ width, height, across, density, ringed }: { width: number; height: number; across?: number; density: Density; ringed?: boolean }) {
  const world = useWorld();
  const me = meOf(world);
  const hallW = Math.min(width, (height * HALL.w) / HALL.h);
  return (
    <div className="relative flex items-center justify-center overflow-hidden rounded-panel" style={{ width, height }} data-testid="your-stage" data-space={me.space} data-sim-ms={world.t.toFixed(0)}>
      {me.space === 'hall' ? (
        <>
          <HallStage width={hallW} density={density} interactive />
          <GlintStrip world={world} me={me} />
        </>
      ) : (
        <MapStage width={width} height={height} {...(across !== undefined ? { across } : {})} density={density} interactive ringed={ringed} />
      )}
    </div>
  );
}

// --- Controls ---------------------------------------------------------------------------------------

/** The one action button: it always says what it does right now, and is dim when nothing is in reach. */
export function ActionButton({ size = 'xl', compact = false, className, hint }: { size?: 'lg' | 'xl'; compact?: boolean; className?: string; hint?: ReactNode }) {
  const arcade = useArcade();
  const world = useWorld();
  const tun = useTunables();
  const r = reachOf(world, meOf(world), tun);
  const label = `${r.verb}${r.detail ? ` · ${r.detail}` : ''}`;
  return (
    <Button
      variant={r.enabled ? 'holo' : 'outline'}
      size={size}
      disabled={!r.enabled}
      aria-label={label}
      // Pointer-down, not click: an arcade button acts on the press, and keeps the keyboard focus on the game.
      onPointerDown={(e) => {
        e.preventDefault();
        if (!e.altKey) arcade.press();
      }}
      onClick={(e) => e.detail === 0 && arcade.press()}
      className={cx('h-auto! min-h-20 w-full flex-col gap-0! px-3! py-2', className)}
      data-testid="action-button"
      data-kind={r.kind}
      data-enabled={r.enabled}
    >
      <span className={cx('block max-w-full truncate font-display font-bold leading-tight', compact ? 'text-lg' : 'text-xl')} data-testid="action-verb">
        {r.verb}
      </span>
      {(r.detail || hint) && (
        <span className="block max-w-full truncate font-mono text-sm font-semibold leading-tight opacity-80" data-testid="action-detail">
          {r.detail ?? hint}
        </span>
      )}
    </Button>
  );
}

const STICK = 128;
const KNOB = 56;

/** A thumb joystick: drag anywhere on the pad; the further from the centre, the faster (up to full speed). */
export function Joystick() {
  const arcade = useArcade();
  const knob = useRef<HTMLSpanElement>(null);
  const pad = useRef<HTMLDivElement>(null);
  const set = (e: ReactPointerEvent | null) => {
    if (!e) {
      arcade.controls.stick = null;
      if (knob.current) knob.current.style.transform = 'translate(-50%, -50%)';
      return;
    }
    const r = pad.current!.getBoundingClientRect();
    // The knob's centre travels to where its edge meets the pad's rim.
    const reach = r.width / 2 - KNOB / 2;
    let x = (e.clientX - (r.left + r.width / 2)) / reach;
    let y = (e.clientY - (r.top + r.height / 2)) / reach;
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    arcade.controls.stick = { x, y };
    if (knob.current) knob.current.style.transform = `translate(calc(-50% + ${(x * reach * STICK) / r.width}px), calc(-50% + ${(y * reach * STICK) / r.width}px))`;
  };
  return (
    <div
      ref={pad}
      className="relative shrink-0 touch-none select-none rounded-full border-2 border-holo-line bg-holo-soft shadow-map"
      style={{ width: STICK, height: STICK }}
      onPointerDown={(e) => {
        if (e.altKey) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        set(e);
      }}
      onPointerMove={(e) => arcade.controls.stick && set(e)}
      onPointerUp={() => set(null)}
      onPointerCancel={() => set(null)}
      role="slider"
      aria-label="Joystick: drag to walk"
      aria-valuenow={0}
      data-testid="joystick"
    >
      {/* The four directions, faint. */}
      {['top-1.5 left-1/2 -translate-x-1/2', 'bottom-1.5 left-1/2 -translate-x-1/2 rotate-180', 'left-1.5 top-1/2 -translate-y-1/2 -rotate-90', 'right-1.5 top-1/2 -translate-y-1/2 rotate-90'].map((p) => (
        <span key={p} aria-hidden className={cx('absolute font-mono text-xs text-holo/60', p)}>
          ▲
        </span>
      ))}
      <span ref={knob} className="absolute left-1/2 top-1/2 rounded-full border-2 border-holo bg-panel shadow-glow" style={{ width: KNOB, height: KNOB, transform: 'translate(-50%, -50%)' }} data-testid="joystick-knob" />
    </div>
  );
}

// --- Status -----------------------------------------------------------------------------------------

/** The land underfoot and what it does to your speed: terrain you can feel, said in words. */
export function GroundChip({ className }: { className?: string }) {
  const world = useWorld();
  const tun = useTunables();
  const me = meOf(world);
  const s = speedOf(world, me, tun);
  const k = s.ground * s.lead * s.bitten;
  const share = Math.round(k * 100);
  const name = `${s.terrain ? TERRAIN_NAME[s.terrain] : 'Store floor'}${s.bitten < 1 ? ', bitten' : ''}`;
  const slow = k < 0.99;
  return (
    <span className={cx('inline-flex min-w-0 items-center gap-1.5 rounded-chip border px-2 py-0.5 text-sm', slow ? 'border-warn/60 text-warn' : 'border-holo-faint text-ink-2', className)} data-testid="ground-chip" data-ground={s.ground} data-bitten={s.bitten < 1 || undefined}>
      <span className="truncate font-semibold">{name}</span>
      <span data-num className="font-mono text-xs">
        {slow ? `${share}% speed` : 'full speed'}
      </span>
    </span>
  );
}

/** Your MULE on its lead: none, empty, or fitted for a good. */
export function LeadChip({ className }: { className?: string }) {
  const world = useWorld();
  const me = meOf(world);
  const m = me.mule;
  const bolted = !m && looseOf(world, me.id);
  return (
    <span className={cx('inline-flex min-w-0 items-center gap-1.5 rounded-chip border px-2 py-0.5 text-sm', bolted ? 'border-alert text-alert' : 'border-holo-faint text-ink-2', className)} data-testid="lead-chip" data-lead={m ? (m.good ?? 'empty') : bolted ? 'bolted' : 'none'}>
      <MuleIcon size={16} className={m ? 'text-holo' : bolted ? 'text-alert' : 'text-ink-3'} />
      <span className="truncate">{bolted ? 'MULE bolted!' : !m ? 'No MULE' : m.good ? 'MULE on lead' : 'Empty MULE'}</span>
      {m?.good && <GoodIcon good={m.good} size={14} />}
    </span>
  );
}

export function Money({ className }: { className?: string }) {
  const world = useWorld();
  const me = meOf(world);
  return (
    <span className={cx('flex items-center gap-2', className)}>
      {me.crystite > 0 && (
        // The glint's prize: Crystite carried, shown beside the money.
        <span data-num className="inline-flex items-center gap-0.5 rounded-chip border border-g-crystite px-1 font-mono text-sm font-bold text-ink" data-testid="crystite" data-units={me.crystite}>
          <GoodIcon good="crystite" size={14} />
          {me.crystite}
        </span>
      )}
      <span data-num className="font-mono font-bold text-ink" data-testid="money">
        {me.money} cr
      </span>
    </span>
  );
}

/** The turn is over: for you (the pub) or for everyone (the clock). Play again restarts the seed. */
export function OverCard({ className }: { className?: string }) {
  const arcade = useArcade();
  const world = useWorld();
  const tun = useTunables();
  const me = meOf(world);
  if (!world.over && !me.done) return null;
  return (
    <div className={cx('pointer-events-auto absolute inset-x-3 top-3 z-20 flex flex-col gap-2 rounded-panel border border-holo bg-panel/95 p-3 shadow-glow', className)} data-testid="over-card">
      <span className="font-display text-lg font-semibold">{world.over ? 'Development over' : 'In the pub: your turn is over'}</span>
      <span className="text-sm text-ink-2">
        {me.installs > 0 ? `You installed ${me.installs} MULE${me.installs > 1 ? 's' : ''}.` : 'No MULE went in this turn.'} {world.over ? '' : `The others still walk (${Math.ceil(secondsLeft(world, tun))} s).`}
      </span>
      <Button size="md" variant="outline" onPointerDown={(e) => e.preventDefault()} onClick={() => arcade.restart()} data-testid="play-again">
        Play again
      </Button>
    </div>
  );
}
