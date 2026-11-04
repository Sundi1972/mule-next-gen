import { boxOf, DEV_WALK, HALL, HALL_BAYS, type HallPlace, type HallRect } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { cx, fanOut, HoloMap, LiveWalkers, SLOT_COLOR, StoreInterior, type CreatureWrap, type Shop } from '@mule/ui';
import { createContext, memo, useContext, useMemo, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { speakerAt } from '../../chat/Chat';
import { mapTiles, plotName } from '../../game/derive';
import { useArcade, useLive } from './live';
import { suits } from './plots';
import type { ArcadeColonist, ArcadeSeat, Target } from './seat';

/**
 * The arcade's stages, grafted from the mock's views.tsx and GuideLayer.tsx (d30ae057) onto the view and the frames:
 * the colony map drawn by the approved HoloMap and the store's hall by the approved StoreInterior, every colonist over
 * them in the live layer (C13), and on your own screen the ring on your next step and the light on what your button
 * acts on. The TV draws the same stages with no seat of its own.
 */

type Density = 'phone' | 'tv' | 'wide';

const SeatCtx = createContext<ArcadeSeat | null>(null);
export const SeatProvider = SeatCtx.Provider;

/** The phone's or the laptop's seat; null on the TV. */
export const useSeat = (): ArcadeSeat | null => useContext(SeatCtx);

/** What every stage draws: the view and everyone's colonist, with or without a seat of its own. */
export interface StageData {
  view: MuleView;
  colonists: ArcadeColonist[];
}

const pct = (v: number, of: number) => `${(v / of) * 100}%`;
/** A box on the hall's plan, in % of the hall, as the stage's own overlays place it. */
const inHall = (r: HallRect) => ({ left: pct(r.x0, HALL.w), top: pct(r.y0, HALL.h), width: pct(r.x1 - r.x0, HALL.w), height: pct(r.y1 - r.y0, HALL.h) });

const MemoMap = memo(HoloMap);

/** Pointer handling for a stage: hold to walk toward the spot, click the lit thing to act. ⌥ is left alone. */
function usePointer(space: 'map' | 'hall', layer: RefObject<HTMLDivElement | null>, cols: number, rows: number, hits: (p: { x: number; y: number }) => boolean, interactive: boolean) {
  const arcade = useArcade();
  const toSpace = (e: ReactPointerEvent) => {
    const r = layer.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * cols, y: ((e.clientY - r.top) / r.height) * rows };
  };
  if (!interactive) return {};
  return {
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.altKey || e.button !== 0) return;
      const p = toSpace(e);
      if (hits(p)) {
        arcade.press();
        return;
      }
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      arcade.controls.mouse = { ...p, space };
    },
    onPointerMove: (e: ReactPointerEvent) => {
      if (arcade.controls.mouse) arcade.controls.mouse = { ...toSpace(e), space };
    },
    onPointerUp: () => (arcade.controls.mouse = null),
    onPointerCancel: () => (arcade.controls.mouse = null),
  };
}

function targetHits(target: Target, store: { x: number; y: number }, p: { x: number; y: number }, space: 'map' | 'hall'): boolean {
  if (!target || target.space !== space) return false;
  if ('tile' in target) return Math.floor(p.x) === target.tile.x && Math.floor(p.y) === target.tile.y;
  if ('door' in target) return Math.floor(p.x) === store.x && Math.floor(p.y) === store.y;
  const r = boxOf(target.room);
  return p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;
}

/**
 * The colony map as a stage, drawn by the approved HoloMap, the whole map at `width` (the phone, the laptop and the TV
 * all show the whole colony). `interactive` is your own screen: it lights what your button acts on, rings your next
 * step and takes the mouse. `wrapCreature` wraps each colonist's mark (your own screen's speech bubbles).
 */
export function MapStage({ data, width, height, density, interactive = false, names = false, guide = false, testid = 'map-stage', wrapCreature }: { data: StageData; width: number; height?: number; density: Density; interactive?: boolean; names?: boolean; guide?: boolean; testid?: string; wrapCreature?: CreatureWrap }) {
  const seat = useSeat();
  const { view } = data;
  const tiles = useMemo(() => mapTiles(view), [view]);
  const cell = width / view.width;
  const mapH = cell * view.height;
  const viewH = height ?? mapH;
  const layer = useRef<HTMLDivElement>(null);
  const store = useMemo(() => view.tiles.find((t) => t.terrain === 'store')!, [view.tiles]);
  // Only your own screen lights what your button acts on; the TV is everyone's.
  const target = interactive ? (seat?.target ?? null) : null;
  const selected = target && 'tile' in target ? target.tile : null;
  const door = target && 'door' in target ? target.door : null;
  const ptr = usePointer('map', layer, view.width, view.height, (p) => targetHits(target, store, p, 'map'), interactive);
  const walkers = data.colonists.filter((c) => c.space === 'map' && !c.done);
  const { at } = useLive();
  return (
    <div className={cx('relative overflow-hidden rounded-panel', interactive && 'cursor-crosshair touch-none')} style={{ width, height: viewH }} data-testid={testid} data-camera="whole" {...ptr}>
      <div ref={layer} className="absolute left-0 top-0" style={{ width, height: mapH, transform: `translate(0px, ${-(mapH - viewH) / 2}px)` }}>
        <MemoMap width={view.width} height={view.height} tiles={tiles} density={density === 'wide' ? 'tv' : density} hideGround selected={selected} className="w-full" />
        {/* The store's two doors, on its left and right faces: the only way in. */}
        {(['L', 'R'] as const).map((side) => (
          <span
            key={side}
            className={cx('pointer-events-none absolute z-[6] rounded-chip', door === side ? 'bg-holo shadow-glow animate-[store-beckon_1.6s_ease-in-out_infinite]' : 'bg-holo/70 shadow-chip')}
            style={{ left: pct(store.x + (side === 'L' ? -0.05 : 0.95), view.width), top: pct(store.y + 0.25, view.height), width: pct(0.1, view.width), height: pct(0.5, view.height) }}
            data-testid={`store-door-${side}`}
            {...(door === side ? { 'data-next': true } : {})}
          />
        ))}
        {guide && interactive && seat && <MyPlots seat={seat} />}
        {guide && interactive && seat && <GuideOnMap seat={seat} />}
        <LiveWalkers walkers={walkers} space="map" cols={view.width} rows={view.height} cell={cell} density={density} names={names} rule={DEV_WALK} at={at} {...(wrapCreature ? { wrapCreature } : {})} />
      </div>
    </div>
  );
}

/** The short word on the lit room: what a press there does. */
const SHORT: Record<string, string> = { BUY: 'BUY', OUTFIT: 'OUTFIT', PUB: 'PUB', LEAVE: 'LEAVE' };

/**
 * The store's hall as a stage: the approved StoreInterior at 4:3, everyone inside walking over it. On your own screen
 * you are the store's own visitor, at your free position on the plan, and the room your button acts on is lit.
 * `store` sizes the hall's own type apart from the walkers: the TV's narrow side panel needs the phone's to fit.
 */
export function HallStage({ data, width, density, store = density, interactive = false, names = false, guide = false, testid = 'hall-stage', wrapCreature }: { data: StageData; width: number; density: Density; store?: Density; interactive?: boolean; names?: boolean; guide?: boolean; testid?: string; wrapCreature?: CreatureWrap }) {
  const seat = useSeat();
  const { view } = data;
  const height = (width * HALL.h) / HALL.w;
  const layer = useRef<HTMLDivElement>(null);
  const target = interactive ? (seat?.target ?? null) : null;
  const ptr = usePointer('hall', layer, HALL.w, HALL.h, (p) => targetHits(target, { x: -1, y: -1 }, p, 'hall'), interactive);
  const lit = target && 'room' in target && seat?.mine?.space === 'hall' ? target.room : null;
  const mine = interactive && seat ? data.colonists.find((c) => c.id === seat.me.id && c.space === 'hall') : undefined;
  const walkers = data.colonists.filter((c) => c.space === 'hall' && c !== mine);
  const { at } = useLive();
  // Over everyone in the hall, your own visitor included, so it and a walker on its spot move aside by one rule.
  const fan = fanOut(data.colonists.filter((c) => c.space === 'hall'), 'hall');
  const aside = (mine && fan.get(mine.id)) ?? { dx: 0, dy: 0 };
  const prices = seat ? (seat.me.outfitCosts as Partial<Record<Shop, number>>) : {};
  const leading = seat?.me.carriedMule ?? null;
  return (
    <div ref={layer} className={cx('relative', interactive && 'cursor-crosshair touch-none')} style={{ width, height }} data-testid={testid} {...ptr}>
      <StoreInterior
        mules={view.storeMules}
        mulePrice={seat?.me.mulePrice ?? view.mulePrice}
        pubPayout={seat ? seat.pay : null}
        prices={prices}
        tv={store === 'tv'}
        wide={store === 'wide'}
        {...(wrapCreature ? { wrapCreature } : {})}
        {...(mine && seat
          ? {
              me: { id: mine.id, slot: mine.slot, leading, x: mine.x + aside.dx, y: mine.y + aside.dy, facing: mine.facing, condition: seat.self.condition, food: { ate: Math.min(seat.me.stock.food, seat.me.needs.food), need: seat.me.needs.food }, moving: mine.moving },
              paceRule: DEV_WALK,
            }
          : {})}
      />
      {lit && (
        <span className="pointer-events-none absolute z-[6] rounded-panel border-2 border-holo animate-[store-beckon_1.6s_ease-in-out_infinite]" style={inHall(boxOf(lit))} data-testid="hall-lit" data-room={lit}>
          <span className="absolute left-1/2 top-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-holo px-1.5 font-mono text-[10px] font-bold leading-4 text-on-holo shadow-glow">{SHORT[seat!.reach.verb.split(' ')[0]!] ?? 'GO'}</span>
        </span>
      )}
      {guide && interactive && seat && <GuideInHall seat={seat} lit={lit} />}
      {guide && interactive && seat && <PlotsByOutfitter seat={seat} />}
      <LiveWalkers walkers={walkers} space="hall" cols={HALL.w} rows={HALL.h} cell={width / HALL.w} density={density} names={names} rule={DEV_WALK} fan={fan} at={at} {...(wrapCreature ? { wrapCreature } : {})} />
    </div>
  );
}

/** Where you are, drawn big: the whole map on the map, the hall inside the store. Each colonist there speaks. */
export function YourStage({ seat, width, height, density, guide = false }: { seat: ArcadeSeat; width: number; height: number; density: Density; guide?: boolean }) {
  const hallW = Math.min(width, (height * HALL.w) / HALL.h);
  const space = seat.mine?.space ?? 'map';
  return (
    <div className="relative flex items-center justify-center overflow-hidden rounded-panel" style={{ width, height }} data-testid="your-stage" data-space={space}>
      {space === 'hall' ? <HallStage data={seat} width={hallW} density={density} interactive guide={guide} wrapCreature={speakerAt} /> : <MapStage data={seat} width={width} height={height} density={density} interactive guide={guide} wrapCreature={speakerAt} />}
    </div>
  );
}

// --- The guide: the phone's "go here next" ring (RULE-9), only on your own screen -----------------------------------

/**
 * The ring on the map: a pulsing ring on the store, your plot or the plot to analyse, with a short label. The first
 * spot is the ring (guide-map); a second, thinner, is the other thing you can do (V-7: the pub).
 */
function GuideOnMap({ seat }: { seat: ArcadeSeat }) {
  const g = seat.guide;
  const me = seat.mine;
  if (!g || g.space !== 'map' || me?.space !== 'map') return null;
  const { view } = seat;
  return (
    <>
      {g.spots.map((s, i) => {
        const first = i === 0;
        // Standing on it, the ring is enough: its label would only say to walk where you are.
        const here = Math.floor(me.x) === s.at.x && Math.floor(me.y) === s.at.y;
        // A label is wider than its plot: centred on an edge column it would hang off the map, so there it keeps to the plot's inner side.
        const anchor = s.at.x === 0 ? 'start' : s.at.x === view.width - 1 ? 'end' : 'middle';
        return (
          <span
            key={`${s.what}-${s.at.x}-${s.at.y}`}
            aria-hidden
            className={cx('pointer-events-none absolute z-[6] rounded-panel border-holo', first ? 'border-[3px] shadow-glow animate-[store-beckon_1.6s_ease-in-out_infinite]' : 'border-2 border-dashed opacity-80')}
            style={{ left: pct(s.at.x, view.width), top: pct(s.at.y, view.height), width: pct(1, view.width), height: pct(1, view.height) }}
            data-testid={first ? 'guide-map' : 'guide-map-alt'}
            data-what={s.what}
            data-x={s.at.x}
            data-y={s.at.y}
          >
            {/* On the top row the label hangs below the ring, and on an edge column it keeps to the ring's inner side: inside the map. */}
            {!here && (
              <span
                className={cx('absolute whitespace-nowrap rounded-full px-1.5 font-mono text-[10px] font-bold leading-4 shadow-glow', first ? 'bg-holo text-on-holo' : 'bg-panel text-holo', s.at.y < 0.5 ? 'top-full mt-0.5' : 'bottom-full mb-0.5', anchor === 'start' ? 'left-0' : anchor === 'end' ? 'right-0' : 'left-1/2 -translate-x-1/2')}
                data-testid={first ? 'guide-label' : 'guide-label-alt'}
                data-anchor={anchor}
              >
                {s.label}
              </span>
            )}
          </span>
        );
      })}
    </>
  );
}

/**
 * The phone's works caption strip over its bays, in px: Store.tsx's "The works" line with its padding and border, under
 * the room's own border (measured 22 px from the works' top to its bays' at 844 and at 667). The plan's bay boxes reach
 * the works' top; their rings start this far below it, so the caption sits above them. Only the phone draws the guide.
 */
export const WORKS_CAPTION_PX = 22;

function GuideInHall({ seat, lit }: { seat: ArcadeSeat; lit: HallPlace | null }) {
  const g = seat.guide;
  if (!g || g.space !== 'hall' || seat.mine?.space !== 'hall') return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-[6]" data-testid="guide-hall" data-rooms={g.rooms.join(' ')}>
      {/* The room you stand in is already lit by the button's own glow. */}
      {g.rooms
        .filter((r) => r !== lit)
        .map((r) => {
          const b = boxOf(r);
          const bay = (HALL_BAYS as readonly HallPlace[]).includes(r);
          const box = inHall(b);
          const style = bay ? { ...box, top: `calc(${box.top} + ${WORKS_CAPTION_PX}px)`, height: `calc(${box.height} - ${WORKS_CAPTION_PX}px)` } : box;
          return (
            <span
              key={r}
              className="absolute rounded-panel border-2 border-dashed border-holo animate-[store-beckon_1.6s_ease-in-out_infinite]"
              style={style}
              data-testid={`guide-room-${r}`}
              {...(bay ? { 'data-below': 'works-caption' } : {})}
            >
              {/* The corral's and the pub's captions sit at their foot, so their label goes near the top. */}
              <span className={cx('absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-holo px-1.5 font-mono text-[10px] font-bold leading-4 text-on-holo shadow-glow', b.y0 > HALL.h / 2 ? 'top-6' : 'bottom-1')}>
                {g.labels[r] ?? 'GO'}
              </span>
            </span>
          );
        })}
    </div>
  );
}

/** The six shopfronts, along the hall's top row: the raw goods a plot's ground can suit. */
const SHOPFRONTS = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth'] as const;

/**
 * V-2 in the hall: under each outfitter, your plots that suit its good (from their analysis, else their land), dashed
 * where a MULE already stands, while you choose (an empty MULE).
 */
function PlotsByOutfitter({ seat }: { seat: ArcadeSeat }) {
  if (seat.mine?.space !== 'hall' || seat.me.carriedMule !== 'empty') return null;
  const mine = seat.view.tiles.filter((t) => t.owner === seat.me.id);
  return (
    <div className="pointer-events-none absolute inset-0 z-[5]" data-testid="plots-by-outfitter">
      {SHOPFRONTS.map((good) => {
        const b = HALL.rooms[good];
        const fit = mine.filter((t) => suits(t).includes(good));
        return (
          <span key={good} className="absolute flex flex-wrap justify-center gap-0.5" style={{ left: pct(b.x0, HALL.w), width: pct(b.x1 - b.x0, HALL.w), top: `calc(${pct(b.y1, HALL.h)} + 0.6%)` }} data-testid={`suits-${good}`} data-plots={fit.map((t) => `${t.x},${t.y}`).join(' ')}>
            {fit.length === 0 ? (
              <span className="rounded-chip bg-panel/85 px-1 font-mono text-[10px] leading-[13px] text-ink-3">none</span>
            ) : (
              fit.map((t) => (
                <span
                  key={`${t.x},${t.y}`}
                  className={cx('rounded-chip border bg-panel/90 px-1 font-mono text-[10px] font-bold leading-[13px]', t.outfit ? 'border-dashed border-ink-3 text-ink-3' : 'border-holo text-ink')}
                  data-testid={`suit-${good}-${t.x}-${t.y}`}
                  data-has-mule={!!t.outfit || undefined}
                >
                  {plotName(t.x, t.y)}
                  {t.outfit ? ' · MULE' : ''}
                </span>
              ))
            )}
          </span>
        );
      })}
    </div>
  );
}

/** Your own plots, outlined once more in your colour on your own screen, so they stand out from the others'. */
function MyPlots({ seat }: { seat: ArcadeSeat }) {
  const { view } = seat;
  return (
    <>
      {view.tiles
        .filter((t) => t.owner === seat.me.id)
        .map((t) => (
          <span
            key={`${t.x},${t.y}`}
            aria-hidden
            className="pointer-events-none absolute z-[5] rounded-[12%]"
            style={{ left: pct(t.x, view.width), top: pct(t.y, view.height), width: pct(1, view.width), height: pct(1, view.height), boxShadow: `inset 0 0 0 3px ${SLOT_COLOR[seat.slot]}, 0 0 0 1px var(--color-table)` }}
            data-testid={`my-plot-${t.x}-${t.y}`}
          />
        ))}
    </>
  );
}

