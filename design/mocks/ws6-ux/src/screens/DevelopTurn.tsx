import type { Good } from '@mule/engine';
import { Button, cx, FoodTime, GOOD_NAME, GoodIcon, HoloMap, MuleIcon, type Slot } from '@mule/ui';
import { useEffect, useRef, useState } from 'react';
import { mapTiles, plotName } from '../../../../../apps/web/src/game/derive';
import { MapFit } from '../../../../../apps/web/src/phone/Shell';
import { H, ME, VIEW, W } from '../fixture';
import { GameShell, useWide, type Now } from '../proposed/GameShell';
import { OTHERS, SPOT, StoreHall, walkSeconds, Walker, type Spot, type Visitor } from './Store';

/**
 * Responsive redesign: development (Heiko 2026-10-22, "I had no clue what to do
 * on this screen"; "a catastrophe on large screens").
 *
 * Three fixes, at both sizes:
 * 1. "Now" opens the rail: the one next step and why, step n of 3.
 * 2. The room for that step glows and says TAP; rooms you can't use yet stay
 *    legible and say why ("needs a MULE") instead of fading to nothing.
 * 3. Walking is walking: your creature waddles from room to room and out of
 *    the door onto the map, at R1's placeholder speeds; the clock never stops.
 *
 * On a wide screen the store and the colony map are both on stage, the store
 * above the map, so walking out of the door is visibly walking onto the map
 * (Heiko chose this, variant A, 2026-10-22). On a phone held sideways one place
 * shows at a time.
 */

const FULL = 50;
const STORE_TILE = { x: 6, y: 4 };
/** Lena's claimed plot with no MULE yet (fixture). */
const EMPTY_PLOT = { x: 5, y: 6 };
const TILE_SECONDS = 0.6;
const ZIPWING = true;

export type Start = 'start' | 'outfitted' | 'map' | 'installed';
type Place = 'store' | 'map';

function useTurn(start: Start) {
  const [t, setT] = useState(start === 'start' ? 0 : start === 'installed' ? 19 : 9);
  const [dismissed, setDismissed] = useState(start !== 'start');
  const [place, setPlace] = useState<Place>(start === 'map' || start === 'installed' ? 'map' : 'store');
  const [hall, setHall] = useState<Visitor>({ id: 'lena', at: start === 'outfitted' ? SPOT.energy : SPOT.doorL, walk: 0, time: 1, leading: null, me: true });
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
    const secs = walkSeconds(hall.at, SPOT[spot], ZIPWING);
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

  /** Walk across the map to a plot, at R1's placeholder 0.6 s a tile (a Zipwing twice as fast). */
  const walkTo = (x: number, y: number) => {
    if (busy.current) return;
    const secs = Math.max(0.3, Math.hypot(x - tile.x, y - tile.y) * TILE_SECONDS) / (ZIPWING ? 2 : 1);
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
    return { id: o.id, at: SPOT[o.path[step]!], walk: 1.4, moving: (t + k * 1.3) % 3 < 1.4, time: (FULL - t * 0.8 - k * 6) / FULL, leading: o.leading[step]! };
  });
  const atPlot = !tile.moving && tile.x === EMPTY_PLOT.x && tile.y === EMPTY_PLOT.y;
  return { t, filling, left, place, hall: { ...hall, leading, time: left / FULL }, tile, leading, installed, corral, others, atPlot, go, walkTo, install, back: () => walkTo(STORE_TILE.x, STORE_TILE.y) };
}

/** What to do now, from where you are and what you lead. */
function guide(turn: ReturnType<typeof useTurn>, pub: number): { now: Now; next: Spot[] } {
  const { leading, place, installed, left, filling, atPlot, corral } = turn;
  const warn = left <= 10 && !filling;
  if (filling)
    return {
      now: { step: 1, of: 3, title: 'You eat and your time bar fills', detail: `You ate ${ME.needs.food} Food: a full ${FULL} s. The clock is running; tap a room to start.` },
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
      detail: `${Math.ceil(left)} s left. Buy another MULE (${ME.mulePrice} cr), analyse a plot, or end your turn at the pub for ≈${pub} cr: the more time left, the more it pays.`,
      warn,
    },
    next: ['corral', 'pub'],
  };
}

export function DevelopTurn({ start = 'start' }: { start?: Start }) {
  const turn = useTurn(start);
  const { leading, place, installed } = turn;
  const pub = Math.round(20 + (60 + VIEW.month * 20) * (turn.left / FULL));
  const { now, next } = guide(turn, pub);
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
    <Hall
      visitors={[...turn.others, ...(place === 'store' ? [turn.hall] : [])]}
      mules={turn.corral}
      mulePrice={ME.mulePrice}
      prices={ME.outfitCosts}
      pubPayout={pub}
      open={open}
      onSpot={turn.go}
      next={place === 'store' ? next : []}
      locks={locks}
      overlay={turn.filling && <FillCard t={turn.t} />}
    />
  );
  const me: Visitor = { id: 'lena', at: { x: ((turn.tile.x + 0.5) / W) * 100, y: ((turn.tile.y + 0.5) / H) * 100 }, walk: turn.tile.walk, moving: turn.tile.moving, time: turn.left / FULL, leading, me: true };
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
        {place === 'map' && <Walker v={me} tv />}
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

  const stageLabel = (text: string, here: boolean) => (
    <span className={cx('label-caps mb-1.5 hidden @min-[1100px]:flex items-center gap-2 text-sm!', here && 'text-holo!')}>
      {text}
      {here && <span className="rounded-full bg-holo px-1.5 font-mono text-[10px] font-bold text-on-holo">YOU ARE HERE</span>}
    </span>
  );

  return (
    <GameShell
      phase="Development"
      seconds={turn.filling ? undefined : turn.left}
      now={now}
      rail={
        <>
          <div className="flex items-center gap-2.5 @min-[1100px]:text-lg" data-testid="mule">
            <span className={cx('flex items-center', leading === null ? 'text-ink-3' : 'text-ink')}>
              <MuleIcon size={22} />
              {outfitted && <GoodIcon good={leading as Good} size={14} />}
            </span>
            <span className="flex-1 font-display text-sm font-semibold leading-tight @min-[1100px]:text-lg">
              {leading === null ? (installed ? 'MULE installed' : 'No MULE yet') : leading === 'empty' ? 'Empty MULE in tow' : `${GOOD_NAME[leading]} MULE in tow`}
            </span>
          </div>
          <FoodTime seconds={turn.left} total={FULL} food={ME.needs.food} need={ME.needs.food} note={`${Math.ceil(turn.left)} s of ${FULL}. Geo analysis takes 8 s.`} />
          <YourPlots />
        </>
      }
      footer={
        <>
          {place === 'map' && outfitted && turn.atPlot ? (
            <Button size="md" className="w-full @min-[1100px]:h-14 @min-[1100px]:text-lg" onClick={turn.install} data-testid="install">
              Install here
            </Button>
          ) : place === 'store' ? (
            <Button size="md" variant={outfitted ? 'holo' : 'outline'} className="w-full @min-[1100px]:h-14 @min-[1100px]:text-lg" onClick={() => turn.go('doorR')}>
              Walk out to the map
            </Button>
          ) : (
            <Button size="md" variant="outline" className="w-full @min-[1100px]:h-14 @min-[1100px]:text-lg" onClick={turn.back}>
              Store
            </Button>
          )}
          <Button size="md" variant="ghost" className="w-full" aria-label="Go to the pub and end your turn" onClick={() => turn.go('pub')}>
            Pub · end turn · ≈{pub} cr
          </Button>
        </>
      }
    >
        <div className="flex min-h-0 flex-1 flex-col gap-2 @min-[1100px]:gap-5" data-testid="dev-stage">
          <section className={cx('min-h-0 flex-col', place === 'store' ? 'flex flex-1 @min-[1100px]:flex-none' : 'hidden @min-[1100px]:flex')} data-testid="stage-store">
            {stageLabel('The store', place === 'store')}
            <div className="h-full min-h-[300px] @min-[1100px]:h-[330px]">{hallStage}</div>
          </section>
          <section className={cx('min-h-0 flex-1 flex-col', place === 'map' ? 'flex' : 'hidden @min-[1100px]:flex')} data-testid="stage-map">
            {stageLabel('Your colony · walk out of the store to reach it', place === 'map')}
            {mapStage}
          </section>
        </div>
    </GameShell>
  );
}

/** The hall at the shell's size: the big screen's type when wide, the phone's otherwise. */
function Hall(props: Omit<Parameters<typeof StoreHall>[0], 'tv'>) {
  return <StoreHall {...props} tv={useWide()} />;
}

/** Your plots and what they make: why the guide suggests a good. Wide screens only. */
function YourPlots() {
  const mine = VIEW.tiles.filter((x) => x.owner === 'lena');
  const by = new Map<string, number>();
  for (const x of mine) by.set(x.outfit ?? 'none', (by.get(x.outfit ?? 'none') ?? 0) + 1);
  return (
    <section className="hidden flex-col gap-2 border-t border-holo-faint pt-4 @min-[1100px]:flex" data-testid="your-plots">
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

/** The start of the turn (spec AM-3: it blocks nothing; a tap on a room dismisses it). */
function FillCard({ t }: { t: number }) {
  const share = Math.min(1, t / 2);
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-void/55 animate-[card-in_0.3s_ease-out]" data-testid="fill-card">
      <div className="flex w-[64%] max-w-[560px] flex-col gap-1.5 rounded-panel border-2 border-holo bg-panel p-3 shadow-glow @min-[1100px]:gap-3 @min-[1100px]:p-6">
        <span className="label-caps">Start of your turn</span>
        <span className="font-display text-lg font-semibold leading-tight @min-[1100px]:text-3xl">You eat {ME.needs.food} Food and fill up your time bar.</span>
        <div className="relative h-3 overflow-hidden rounded-full bg-raised @min-[1100px]:h-4">
          <div className="absolute inset-y-0 left-0 rounded-full bg-holo" style={{ width: `${share * 100}%` }} />
        </div>
        <span data-num className="font-mono text-sm font-bold text-holo @min-[1100px]:text-lg">
          {Math.round(share * FULL)} s: full time
        </span>
      </div>
    </div>
  );
}
