import type { Good } from '@mule/engine';
import { Button, cx, GOOD_NAME, GoodIcon, HoloMap, MuleIcon, type Slot } from '@mule/ui';
import { useEffect, useRef, useState } from 'react';
import { mapTiles, plotName } from '../../../../../apps/web/src/game/derive';
import { MapFit } from '../../../../../apps/web/src/phone/Shell';
import { H, ME, VIEW, W } from '../fixture';
import { GameShell, useWide, type Now } from '../proposed/GameShell';
import { DEV_WALK_STAND_IN, hungerLevel, paceLine, paceOf, SharedClock, useCondition, YourPace } from '../proposed/Condition';
import { Hall, HallWalker, SPOT, walkSeconds, type Spot, type Visitor } from '../proposed/Hall';
import { OTHERS } from './Store';

/**
 * Responsive redesign: development (Heiko 2026-10-22, "I had no clue what to do
 * on this screen"; "a catastrophe on large screens").
 *
 * Three fixes, at both sizes:
 * 1. "Now" opens the rail: the one next step and why, step n of 3.
 * 2. The room for that step glows and says TAP; rooms you can't use yet stay
 *    legible and say why ("needs a MULE") instead of fading to nothing.
 * 3. Walking is walking: your creature waddles from room to room and out of
 *    the door onto the map, at Heiko's speeds (0.4 s a step, 1 s across the
 *    store, a Zipwing at pace 1.5); the clock never stops.
 * 4. One clock for everyone (Heiko 2026-10-28): hunger and sickness slow your
 *    walk instead of shortening your time; the rail says by how much and why.
 *
 * One place at a time at every size (AM-8, Heiko's second look: "I don't need
 * the map when we are in the store"): the store fills the stage; walking out
 * of a door, the colony map replaces it and your colonist walks on to your plot.
 */

const FULL = 50;
const STORE_TILE = { x: 6, y: 4 };
/** Lena's claimed plot with no MULE yet (fixture). */
const EMPTY_PLOT = { x: 5, y: 6 };

export type Start = 'start' | 'outfitted' | 'map' | 'installed';
type Place = 'store' | 'map';

function useTurn(start: Start) {
  /** Lena is a Zipwing: her pace is the species' times her condition's. */
  const pace = DEV_WALK_STAND_IN.zipwingPace * paceOf(useCondition('lena'));
  const [t, setT] = useState(start === 'start' ? 0 : start === 'installed' ? 19 : 9);
  const [dismissed, setDismissed] = useState(start !== 'start');
  const [place, setPlace] = useState<Place>(start === 'map' || start === 'installed' ? 'map' : 'store');
  const [hall, setHall] = useState<Visitor>({ id: 'lena', at: start === 'outfitted' ? SPOT.energy : SPOT.doorL, walk: 0, leading: null, me: true });
  const [tile, setTile] = useState<{ x: number; y: number; walk: number; moving: boolean }>(start === 'installed' ? { ...EMPTY_PLOT, walk: 0, moving: false } : { ...STORE_TILE, walk: 0, moving: false });
  const [leading, setLeading] = useState<Visitor['leading']>(start === 'outfitted' || start === 'map' ? 'energy' : null);
  const [installed, setInstalled] = useState(start === 'installed');
  const [corral, setCorral] = useState(start === 'start' ? 5 : 4);
  const busy = useRef(false);
  const leadRef = useRef(leading);
  leadRef.current = leading;
  useEffect(() => {
    const id = setInterval(() => setT((x) => x + 0.1), 100);
    return () => clearInterval(id);
  }, []);
  const filling = t < 2.2 && !dismissed;
  const left = Math.max(0, FULL - Math.max(0, t - 2.2));

  /** Walk across the store to a room; what the room does happens on arrival. */
  const go = (spot: Spot, fit?: Good) => {
    setDismissed(true);
    if (busy.current) return;
    const secs = walkSeconds(hall.at, SPOT[spot], pace);
    busy.current = true;
    setHall((m) => ({ ...m, at: SPOT[spot], walk: secs, moving: true }));
    setTimeout(() => {
      busy.current = false;
      setHall((m) => ({ ...m, moving: false }));
      const lead = leadRef.current;
      if (spot === 'doorL' || spot === 'doorR') {
        setPlace('map');
        setTile({ ...STORE_TILE, walk: 0, moving: false });
      } else if (spot === 'corral' && lead === null) {
        setCorral((c) => c - 1);
        setLeading('empty');
      } else if (lead === 'empty' && spot !== 'pub' && spot !== 'corral' && spot !== 'greenBelt') setLeading(spot === 'works' ? (fit ?? null) : (spot as Good));
    }, secs * 1000);
  };

  /** Walk across the map to a plot: DEV_WALK's 0.4 s a step along rows and columns (no diagonals), at her pace. */
  const walkTo = (x: number, y: number) => {
    if (busy.current) return;
    const secs = Math.max(0.3, (Math.abs(x - tile.x) + Math.abs(y - tile.y)) * DEV_WALK_STAND_IN.tileSeconds) / pace;
    busy.current = true;
    setTile({ x, y, walk: secs, moving: true });
    setTimeout(() => {
      busy.current = false;
      setTile((p) => ({ ...p, moving: false }));
      if (x === STORE_TILE.x && y === STORE_TILE.y) {
        setPlace('store');
        setHall((m) => ({ ...m, at: SPOT.doorR, walk: 0 }));
      }
    }, secs * 1000);
  };

  const install = () => {
    setLeading(null);
    setInstalled(true);
  };

  const others: Visitor[] = OTHERS.slice(0, 2).map((o, k) => {
    const step = Math.floor((t + k * 1.3) / 3) % o.path.length;
    return { id: o.id, at: SPOT[o.path[step]!], walk: 1.4, moving: (t + k * 1.3) % 3 < 1.4, leading: o.leading[step]! };
  });
  const atPlot = !tile.moving && tile.x === EMPTY_PLOT.x && tile.y === EMPTY_PLOT.y;
  return { t, filling, left, place, hall: { ...hall, leading }, tile, leading, installed, corral, others, atPlot, go, walkTo, install, back: () => walkTo(STORE_TILE.x, STORE_TILE.y) };
}

/** What to do now, from where you are and what you lead. */
function guide(turn: ReturnType<typeof useTurn>, pub: number, cond: ReturnType<typeof useCondition>): { now: Now; next: Spot[] } {
  const { leading, place, installed, left, filling, atPlot, corral } = turn;
  const warn = left <= 10 && !filling;
  if (filling)
    return {
      now: { step: 1, of: 3, title: 'You eat, and the clock starts for everyone', detail: `${paceLine(cond).title}. Everyone has the same ${FULL} s; tap a room to start.` },
      next: ['corral'],
    };
  if (leading === null && !installed)
    return {
      now: { step: 1, of: 3, title: 'Buy a MULE at the corral', detail: `Tap the glowing corral and your Zipwing walks there. ${ME.mulePrice} cr, ${corral} left. Walking takes time: the clock never stops.`, warn },
      next: ['corral'],
    };
  if (leading === 'empty')
    return {
      now: {
        step: 2,
        of: 3,
        title: 'Choose what your MULE makes',
        detail: (
          <>
            Walk it to an outfitter (a farm or mine) or to the works (a factory). <strong className="text-ink">You're short of Energy</strong>: your 4 farms and wells need 4, you have 3.
          </>
        ),
        warn,
      },
      next: ['energy'],
    };
  if (leading !== null && place === 'store')
    return {
      now: { step: 3, of: 3, title: 'Walk out and install it', detail: `Leave by a door. Your empty plot ${plotName(EMPTY_PLOT.x, EMPTY_PLOT.y)} glows on the map.`, warn },
      next: ['doorL', 'doorR'],
    };
  if (leading !== null && !atPlot)
    return { now: { step: 3, of: 3, title: `Walk to your plot ${plotName(EMPTY_PLOT.x, EMPTY_PLOT.y)}`, detail: 'Tap the glowing plot. A MULE only works on a plot you own.', warn }, next: [] };
  if (leading !== null)
    return { now: { step: 3, of: 3, title: `Install your ${GOOD_NAME[leading as Good]} MULE here`, detail: 'It makes Energy from next month. Installing is instant.', warn }, next: [] };
  return {
    now: {
      title: 'MULE installed. What next?',
      detail: `${Math.ceil(left)} s left on everyone's clock. Buy another MULE (${ME.mulePrice} cr), analyse a plot, or finish at the pub for ≈${pub} cr: the more of the clock is left, the more it pays.`,
      warn,
    },
    next: ['corral', 'pub'],
  };
}

export function DevelopTurn({ start = 'start' }: { start?: Start }) {
  const turn = useTurn(start);
  const cond = useCondition('lena');
  const { leading, place, installed } = turn;
  const pub = Math.round(20 + (60 + VIEW.month * 20) * (turn.left / FULL));
  const { now, next } = guide(turn, pub, cond);
  const open: Spot[] =
    leading === null ? ['corral', 'pub', 'doorL', 'doorR'] : leading === 'empty' ? ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth', 'works', 'greenBelt', 'pub', 'doorL', 'doorR'] : ['pub', 'doorL', 'doorR'];
  const locks: Partial<Record<Spot, string>> =
    leading === null
      ? { food: 'needs a MULE', water: 'needs a MULE', energy: 'needs a MULE', smithore: 'needs a MULE', crystite: 'needs a MULE', rareEarth: 'needs a MULE', works: 'needs a MULE', greenBelt: 'needs a MULE' }
      : leading === 'empty'
        ? { corral: 'one at a time' }
        : { corral: 'one at a time', food: '', water: '', energy: '', smithore: '', crystite: '', rareEarth: '', works: '', greenBelt: '' };
  const outfitted = leading !== null && leading !== 'empty';
  const view = installed ? { ...VIEW, tiles: VIEW.tiles.map((x) => (x.x === EMPTY_PLOT.x && x.y === EMPTY_PLOT.y ? { ...x, outfit: 'energy' as const } : x)) } : VIEW;

  const hallStage = (
    <WideHall
      visitors={[...turn.others, ...(place === 'store' ? [turn.hall] : [])]}
      mules={turn.corral}
      mulePrice={ME.mulePrice}
      prices={ME.outfitCosts}
      pubPayout={pub}
      open={open}
      onSpot={turn.go}
      next={place === 'store' ? next : []}
      locks={locks}
      overlay={turn.filling && <FillCard t={turn.t} cond={cond} />}
    />
  );
  const me: Visitor = { id: 'lena', at: { x: ((turn.tile.x + 0.5) / W) * 100, y: ((turn.tile.y + 0.5) / H) * 100 }, walk: turn.tile.walk, moving: turn.tile.moving, leading, me: true };
  const mapStage = (
    <MapFit width={W} height={H}>
      <div className="relative" data-testid="dev-map">
        <HoloMap
          width={W}
          height={H}
          tiles={mapTiles(view)}
          focusSlot={0 as Slot}
          selected={outfitted ? EMPTY_PLOT : null}
          onTile={(x) => (place === 'map' ? turn.walkTo(x.x, x.y) : undefined)}
        />
        {place === 'map' && <MapWalker v={me} />}
        {place === 'map' && outfitted && !turn.atPlot && (
          <span
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-[170%] rounded-full bg-holo px-1.5 font-mono text-[10px] font-bold leading-4 text-on-holo shadow-glow"
            style={{ left: `${((EMPTY_PLOT.x + 0.5) / W) * 100}%`, top: `${((EMPTY_PLOT.y + 0.5) / H) * 100}%` }}
            data-testid="plot-tap-here"
          >
            TAP
          </span>
        )}
      </div>
    </MapFit>
  );



  return (
    <GameShell
      anchored={place === 'store' ? turn.others.map((o) => o.id) : []}
      phase="Development"
      seconds={turn.filling ? undefined : turn.left}
      now={now}
      rail={
        <>
          <div className="flex items-center gap-2.5 @min-[1100px]/shell:text-lg" data-testid="mule">
            <span className={cx('flex items-center', leading === null ? 'text-ink-3' : 'text-ink')}>
              <MuleIcon size={22} />
              {outfitted && <GoodIcon good={leading as Good} size={14} />}
            </span>
            <span className="flex-1 font-display text-sm font-semibold leading-tight @min-[1100px]/shell:text-lg">
              {leading === null ? (installed ? 'MULE installed' : 'No MULE yet') : leading === 'empty' ? 'Empty MULE in tow' : `${GOOD_NAME[leading]} MULE in tow`}
            </span>
          </div>
          <SharedClock seconds={turn.filling ? FULL : turn.left} total={FULL} />
          <YourPace id="lena" />
          <YourPlots />
        </>
      }
      footer={
        <>
          {place === 'map' && outfitted && turn.atPlot ? (
            <Button size="md" className="w-full @min-[1100px]/shell:h-14 @min-[1100px]/shell:text-lg" onClick={turn.install} data-testid="install">
              Install here
            </Button>
          ) : place === 'store' ? (
            <Button size="md" variant={outfitted ? 'holo' : 'outline'} className="w-full @min-[1100px]/shell:h-14 @min-[1100px]/shell:text-lg" onClick={() => turn.go('doorR')}>
              Walk out to the map
            </Button>
          ) : (
            <Button size="md" variant="outline" className="w-full @min-[1100px]/shell:h-14 @min-[1100px]/shell:text-lg" onClick={turn.back}>
              Store
            </Button>
          )}
          <Button size="md" variant="ghost" className="w-full" aria-label="Go to the pub and finish for this month" onClick={() => turn.go('pub')}>
            Pub · finish · ≈{pub} cr
          </Button>
        </>
      }
    >
      {/* One place at a time, at every size (AM-8): in the store the store fills the stage; out of the door, the colony. */}
      <div className="flex min-h-0 flex-1 flex-col" data-testid="dev-stage">
        {place === 'store' ? <div className="min-h-[300px] flex-1">{hallStage}</div> : mapStage}
      </div>
    </GameShell>
  );
}

/** The hall at the shell's size: the big screen's type when wide, the phone's otherwise. */
function WideHall(props: Omit<Parameters<typeof Hall>[0], 'wide'>) {
  return <Hall {...props} wide={useWide()} />;
}

/** Your plots and what they make: why the guide suggests a good. Wide screens only. */
function YourPlots() {
  const mine = VIEW.tiles.filter((x) => x.owner === 'lena');
  const by = new Map<string, number>();
  for (const x of mine) by.set(x.outfit ?? 'none', (by.get(x.outfit ?? 'none') ?? 0) + 1);
  return (
    <section className="hidden flex-col gap-2 border-t border-holo-faint pt-4 @min-[1100px]/shell:flex" data-testid="your-plots">
      <span className="label-caps text-xs!">Your {mine.length} plots</span>
      <ul className="flex flex-col gap-1.5 text-base">
        {[...by].map(([k, n]) => (
          <li key={k} className="flex items-center gap-2">
            {k === 'none' ? <span className="h-4 w-4 rounded-[4px] border border-dashed border-holo" /> : <GoodIcon good={k as Good} size={16} />}
            <span className="flex-1">{k === 'none' ? 'No MULE yet' : GOOD_NAME[k as Good]}</span>
            <span data-num className="font-mono font-bold">
              {n}
            </span>
          </li>
        ))}
      </ul>
      <span className="text-sm text-ink-2">Each month a farm or a well burns 1 Energy, a mine 2, an Energy plot none.</span>
    </section>
  );
}

/** Your colonist on the colony map, leading its MULE. */
function MapWalker({ v }: { v: Visitor }) {
  return <HallWalker v={v} wide={useWide()} />;
}

/**
 * The start of development (spec AM-3: it blocks nothing; a tap on a room dismisses it). It no longer fills a time
 * bar of your own: everyone gets the same clock. It says what you ate and the pace that leaves you, the gauge filling
 * to it, so being short of Food reads as "slower", never as "less time".
 */
function FillCard({ t, cond }: { t: number; cond: ReturnType<typeof useCondition> }) {
  const share = Math.min(1, t / 2);
  const pace = paceOf(cond);
  const line = paceLine(cond);
  const short = hungerLevel(cond) > 0 || cond.sick;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-void/55 animate-[card-in_0.3s_ease-out]" data-testid="fill-card">
      <div className={cx('flex w-[64%] max-w-[560px] flex-col gap-1.5 rounded-panel border-2 bg-panel p-3 shadow-glow @min-[1100px]/shell:gap-3 @min-[1100px]/shell:p-6', short ? 'border-warn' : 'border-holo')}>
        <span className="label-caps">Development · one clock for everyone · {FULL} s</span>
        <span className="font-display text-lg font-semibold leading-tight @min-[1100px]/shell:text-3xl">
          {hungerLevel(cond) > 0 ? `You eat ${cond.ate} of the ${cond.need} Food you need.` : `You eat the ${cond.need} Food you need.`}
        </span>
        <div className="relative h-3 overflow-hidden rounded-full bg-raised @min-[1100px]/shell:h-4" data-testid="pace-gauge">
          <div className={cx('absolute inset-y-0 left-0 rounded-full', short ? 'bg-warn' : 'bg-holo')} style={{ width: `${share * pace * 100}%` }} />
          {short && <div className="absolute inset-y-0 right-0 border-l-2 border-dashed border-ink-3" />}
        </div>
        <span data-num className={cx('font-mono text-sm font-bold @min-[1100px]/shell:text-lg', short ? 'text-warn' : 'text-holo')}>
          {line.title}
        </span>
      </div>
    </div>
  );
}
