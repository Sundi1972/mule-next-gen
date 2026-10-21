import type { Good } from '@mule/engine';
import { Button, Creature, cx, FoodTime, GOOD_NAME, GoodIcon, HoloMap, MuleIcon, PlayerMark, SLOT_COLOR, useSeatSpecies, type Slot } from '@mule/ui';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { fmt, mapTiles, slotOf } from '../../../../../apps/web/src/game/derive';
import { PhoneShell } from '../../../../../apps/web/src/phone/Shell';
import { TvHeader } from '../../../../../apps/web/src/table/TableApp';
import { H, ME, VIEW, W } from '../fixture';

/**
 * Mock 5: the store interior (D1: one hall, two rows), tap to walk (R1), the
 * start-of-turn time fill, and the TV map with everyone's creature walking.
 *
 * R1's numbers are placeholders until WS1's sim rows: the hall crossed in about
 * 2 s, 0.6 s per tile on the map. Time runs all the time, as in the original;
 * walking costs time simply because it takes time.
 *
 * DS-GAP: StoreHall replaces @mule/ui StoreInterior (a grid of buttons) and the
 * creature avatars with time bars over their heads are new; both go to
 * packages/ui (WS4) once approved.
 */

export type Spot = 'doorL' | 'doorR' | 'works' | 'greenBelt' | 'corral' | 'pub' | 'food' | 'water' | 'energy' | 'smithore' | 'crystite' | 'rareEarth';

const OUTFITTERS = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth'] as const satisfies readonly Good[];
const FACTORIES = [
  { good: 'alloy' as const, name: 'Smelter' },
  { good: 'electronics' as const, name: 'Electronics' },
  { good: 'medicine' as const, name: 'Medicine lab' },
];

/** Where a creature stands in front of each room, in % of the hall. Top row: 6 outfitters; bottom row on a 12-column grid. */
const TOP_Y = 47;
const BOTTOM_Y = 55;
export const SPOT: Record<Spot, { x: number; y: number }> = {
  food: { x: 100 / 12, y: TOP_Y }, water: { x: 300 / 12, y: TOP_Y }, energy: { x: 500 / 12, y: TOP_Y },
  smithore: { x: 700 / 12, y: TOP_Y }, crystite: { x: 900 / 12, y: TOP_Y }, rareEarth: { x: 1100 / 12, y: TOP_Y },
  doorL: { x: 100 / 24, y: 51 }, works: { x: 300 / 12, y: BOTTOM_Y }, greenBelt: { x: 550 / 12, y: BOTTOM_Y },
  corral: { x: 750 / 12, y: BOTTOM_Y }, pub: { x: 1000 / 12, y: BOTTOM_Y }, doorR: { x: 2300 / 24, y: 51 },
};

/** Seconds to walk between two spots: the hall's width in about 2 s (R1 placeholder). */
export function walkSeconds(a: { x: number; y: number }, b: { x: number; y: number }, zipwing = false): number {
  const dx = (a.x - b.x) / 100;
  const dy = ((a.y - b.y) / 100) * 0.5;
  return Math.max(0.3, Math.hypot(dx, dy) * 2) / (zipwing ? 2 : 1);
}

export interface Visitor {
  id: string;
  at: { x: number; y: number };
  /** Seconds the current walk takes, for the move's transition. */
  walk: number;
  /** Share of their time left, for the bar over their head. */
  time: number;
  leading: 'empty' | Good | null;
  me?: boolean;
}

// --- The hall -------------------------------------------------------------------------

function Booth({ testid, onTap, disabled, className, style, children }: { testid: string; onTap?: () => void; disabled?: boolean; className?: string; style?: CSSProperties; children: ReactNode }) {
  const Tag = onTap ? 'button' : 'div';
  return (
    <Tag
      {...(onTap ? { type: 'button' as const, onClick: onTap, disabled } : {})}
      className={cx(
        'relative flex flex-col items-center justify-center gap-0.5 rounded-control border bg-panel text-center transition-opacity',
        disabled ? 'border-holo-faint opacity-40' : 'border-holo-line',
        onTap && !disabled && 'hover:border-holo active:bg-holo-soft',
        className,
      )}
      style={style}
      data-testid={testid}
    >
      {children}
    </Tag>
  );
}

export function StoreHall({
  visitors,
  mules,
  mulePrice,
  prices,
  pubPayout,
  open,
  onSpot,
  tv = false,
  overlay,
}: {
  visitors: Visitor[];
  mules: number;
  mulePrice: number;
  prices: Partial<Record<Good | 'greenBelt', number>>;
  pubPayout: number;
  /** Rooms you can use now; the rest dim. Omit on the big screen. */
  open?: Spot[];
  onSpot?: (spot: Spot, fit?: Good) => void;
  tv?: boolean;
  overlay?: ReactNode;
}) {
  const can = (s: Spot) => !open || open.includes(s);
  const tap = (s: Spot, fit?: Good) => (onSpot ? () => onSpot(s, fit) : undefined);
  const icon = tv ? 30 : 22;
  const label = tv ? 'text-sm' : 'text-[10px]';
  const price = cx('font-mono font-bold text-ink-2', tv ? 'text-sm' : 'text-[10px]');
  return (
    <div className="relative h-full w-full select-none overflow-hidden rounded-panel border border-holo-line bg-table" data-testid="store-hall">
      {/* The floor between the rows. */}
      <div aria-hidden className="absolute inset-x-0 top-[38%] h-[24%] bg-raised/60" />
      <div className="absolute inset-x-1.5 top-1.5 grid h-[36%] grid-cols-6 gap-1.5" data-testid="row-outfitters">
        {OUTFITTERS.map((g, i) => (
          <Booth key={g} testid={`booth-${g}`} onTap={tap(g)} disabled={!can(g)} className={i === 3 ? 'ml-1.5' : ''} style={{ borderTop: `4px solid var(--color-g-${g})` }}>
            <GoodIcon good={g} size={icon} />
            <span className={cx('font-semibold leading-tight', label)}>{GOOD_NAME[g]}</span>
            <span data-num className={price}>
              {prices[g]} cr
            </span>
          </Booth>
        ))}
      </div>
      <div className="absolute inset-x-1.5 bottom-1.5 grid h-[36%] grid-cols-12 gap-1.5" data-testid="row-services">
        <Door side="L" onTap={tap('doorL')} tv={tv} />
        <Booth testid="booth-works" className="col-span-4 px-1" disabled={!can('works')}>
          <span className={cx('label-caps', tv ? 'text-xs!' : 'text-[8px]!')}>Works · factory fits</span>
          <span className="grid w-full grid-cols-3 gap-1">
            {FACTORIES.map((f) => (
              <button
                key={f.good}
                type="button"
                onClick={tap('works', f.good)}
                disabled={!onSpot || !can('works')}
                className="flex flex-col items-center rounded-[6px] border border-holo-faint bg-raised py-0.5 enabled:hover:border-holo"
                data-testid={`fit-${f.good}`}
              >
                <GoodIcon good={f.good} size={tv ? 22 : 15} />
                <span data-num className={price}>
                  {prices[f.good]}
                </span>
              </button>
            ))}
          </span>
        </Booth>
        <Booth testid="booth-greenBelt" onTap={tap('greenBelt')} disabled={!can('greenBelt')} className="col-span-1 px-0.5" style={{ borderBottom: '4px solid var(--color-ok)' }}>
          <span className={cx('font-semibold leading-tight', label)}>Green belt</span>
          <span data-num className={price}>
            {prices.greenBelt} cr
          </span>
        </Booth>
        <Booth testid="booth-corral" onTap={tap('corral')} disabled={!can('corral') || mules === 0} className="col-span-3" style={{ borderBottom: '4px solid var(--color-holo)' }}>
          <span className="flex items-center gap-0.5 text-ink">
            {Array.from({ length: Math.min(mules, 5) }, (_, i) => (
              <MuleIcon key={i} size={tv ? 26 : 17} />
            ))}
            {mules === 0 && <span className="font-mono text-xs font-bold text-alert">SOLD OUT</span>}
          </span>
          <span className={cx('font-semibold leading-tight', label)}>MULE corral · {mules} left</span>
          <span data-num className={price}>
            {mulePrice} cr
          </span>
        </Booth>
        <Booth testid="booth-pub" onTap={tap('pub')} disabled={!can('pub')} className="col-span-2" style={{ borderBottom: '4px solid var(--color-warn)' }}>
          <span className={cx('font-semibold leading-tight', label)}>Pub</span>
          <span data-num className={price}>
            ≈{pubPayout} cr
          </span>
          <span className={cx('text-ink-3', tv ? 'text-xs' : 'text-[8px]')}>ends your turn</span>
        </Booth>
        <Door side="R" onTap={tap('doorR')} tv={tv} />
      </div>
      {visitors.map((v) => (
        <Walker key={v.id} v={v} tv={tv} />
      ))}
      {overlay}
    </div>
  );
}

function Door({ side, onTap, tv }: { side: 'L' | 'R'; onTap: (() => void) | undefined; tv: boolean }) {
  const Tag = onTap ? 'button' : 'div';
  return (
    <Tag
      {...(onTap ? { type: 'button' as const, onClick: onTap } : {})}
      className="flex flex-col items-center justify-center rounded-control border border-dashed border-holo-line text-holo enabled:hover:bg-holo-soft"
      data-testid={`door-${side}`}
      aria-label="Out to the map"
    >
      <span className={cx('font-display font-bold', tv ? 'text-xl' : 'text-sm')}>{side === 'L' ? '←' : '→'}</span>
      <span className={cx('font-mono leading-tight', tv ? 'text-[10px]' : 'text-[7px]')}>MAP</span>
    </Tag>
  );
}

/** A creature on the store floor (or the map), with its time bar over its head and the MULE it leads. */
function Walker({ v, tv }: { v: Visitor; tv: boolean }) {
  const slot = (slotOf(VIEW, v.id) ?? 0) as Slot;
  return (
    <div
      className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
      style={{ left: `${v.at.x}%`, top: `${v.at.y}%`, transition: `left ${v.walk}s linear, top ${v.walk}s linear` }}
      data-testid={`visitor-${v.id}`}
    >
      <TimeOverHead share={v.time} slot={slot} tv={tv} />
      <span className="flex items-end">
        <CreatureOf slot={slot} size={tv ? 40 : 26} me={!!v.me} />
        {v.leading && (
          <span className="flex items-center rounded-full bg-map-chip px-0.5 shadow-chip text-ink">
            <MuleIcon size={tv ? 22 : 14} />
            {v.leading !== 'empty' && <GoodIcon good={v.leading} size={tv ? 14 : 9} />}
          </span>
        )}
      </span>
    </div>
  );
}

function CreatureOf({ slot, size, me }: { slot: Slot; size: number; me: boolean }) {
  const species = useSeatSpecies(slot);
  return (
    <span className={cx('rounded-full', me && 'ring-2 ring-holo ring-offset-1 ring-offset-table')}>
      <Creature species={species} color={SLOT_COLOR[slot]} size={size} />
    </span>
  );
}

function TimeOverHead({ share, slot, tv }: { share: number; slot: Slot; tv: boolean }) {
  return (
    <span className={cx('mb-0.5 overflow-hidden rounded-full bg-void/70', tv ? 'h-1.5 w-10' : 'h-1 w-7')}>
      <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%`, background: SLOT_COLOR[slot] }} />
    </span>
  );
}

// --- The phone: tap to walk ----------------------------------------------------------------

/** The others in the store, on a loop: Ossa buys a MULE and outfits it for Energy, Brix browses, Kai leaves. */
const OTHERS: { id: string; path: Spot[]; leading: (Visitor['leading'])[] }[] = [
  { id: 'ossa', path: ['doorR', 'corral', 'energy', 'doorL'], leading: [null, 'empty', 'energy', 'energy'] },
  { id: 'brix', path: ['smithore', 'works', 'corral', 'smithore'], leading: ['empty', 'empty', 'empty', 'empty'] },
  { id: 'kai', path: ['water', 'doorR', 'doorR', 'water'], leading: ['water', 'water', null, null] },
];

const FULL = 50;

export function useStoreSim({ hungry = false, mules = 5 }: { hungry?: boolean; mules?: number } = {}) {
  const total = hungry ? 33 : FULL;
  const [t, setT] = useState(0);
  const [me, setMe] = useState<Visitor>({ id: 'lena', at: SPOT.doorL, walk: 0, time: 1, leading: null, me: true });
  const [corral, setCorral] = useState(mules);
  const [last, setLast] = useState<string | null>(null);
  const busy = useRef(false);
  const leadingRef = useRef<Visitor['leading']>(null);
  useEffect(() => {
    const id = setInterval(() => setT((x) => x + 0.1), 100);
    return () => clearInterval(id);
  }, []);
  const filling = t < 2.2;
  const left = Math.max(0, total - Math.max(0, t - 2.2));

  const go = (spot: Spot, fit?: Good) => {
    if (busy.current || filling) return;
    const to = SPOT[spot];
    const secs = walkSeconds(me.at, to, true);
    busy.current = true;
    setMe((m) => ({ ...m, at: to, walk: secs }));
    setLast(`${secs.toFixed(1)} s to the ${spot === 'doorL' || spot === 'doorR' ? 'door' : spot === 'works' ? 'works' : spot === 'greenBelt' ? 'green belt' : spot === 'corral' ? 'corral' : spot === 'pub' ? 'pub' : `${GOOD_NAME[spot as Good]} outfitter`} (a Zipwing walks twice as fast)`);
    setTimeout(() => {
      busy.current = false;
      // Decide from the MULE in tow at arrival, outside any state updater: React runs updaters twice in development.
      const leading = leadingRef.current;
      let next = leading;
      if (spot === 'corral' && !leading) {
        setCorral((c) => c - 1);
        next = 'empty';
      } else if (leading === 'empty' && (OUTFITTERS as readonly string[]).includes(spot)) next = spot as Good;
      else if (leading === 'empty' && spot === 'works' && fit) next = fit;
      leadingRef.current = next;
      setMe((m) => ({ ...m, leading: next }));
    }, secs * 1000);
  };

  const others: Visitor[] = OTHERS.map((o, k) => {
    const step = Math.floor((t + k * 1.3) / 3) % o.path.length;
    return { id: o.id, at: SPOT[o.path[step]!], walk: 1.4, time: (total - t * 0.8 - k * 6) / FULL, leading: o.leading[step]! };
  });
  return { t, filling, left, total, me: { ...me, time: filling ? Math.min(1, t / 2) * (total / FULL) : left / FULL }, others, corral, last, go, restart: () => window.location.reload() };
}

/** The start of the turn: you eat, and your bar fills while the room watches. */
function FillCard({ t, hungry }: { t: number; hungry: boolean }) {
  const need = ME.needs.food;
  const ate = hungry ? 2 : need;
  const secs = hungry ? 33 : FULL;
  const share = Math.min(1, t / 2) * (secs / FULL);
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-void/55 animate-[card-in_0.3s_ease-out]" data-testid="fill-card">
      <div className="flex w-[64%] flex-col gap-1.5 rounded-panel border-2 border-holo bg-panel p-3 shadow-glow">
        <span className="label-caps">Start of your turn</span>
        <span className="font-display text-lg font-semibold leading-tight">
          You eat {ate} Food{hungry ? ` of the ${need} you need` : ''} and fill up your time bar.
        </span>
        <div className="relative h-3 overflow-hidden rounded-full bg-raised">
          <div className={cx('absolute inset-y-0 left-0 rounded-full', hungry ? 'bg-warn' : 'bg-holo')} style={{ width: `${share * 100}%` }} />
          {hungry && <div className="absolute inset-y-0 border-l-2 border-dashed border-ink-3" style={{ left: '100%', transform: 'translateX(-2px)' }} />}
        </div>
        <span data-num className={cx('font-mono text-sm font-bold', hungry ? 'text-warn' : 'text-holo')}>
          {Math.round(share * FULL)} s{hungry ? ` of ${FULL}: short of Food, so less time` : ': full time'}
        </span>
      </div>
    </div>
  );
}

export function PhoneStore({ hungry = false, mules = 5 }: { hungry?: boolean; mules?: number }) {
  const sim = useStoreSim({ hungry, mules });
  const carry = sim.me.leading;
  const step = carry === null ? 1 : carry === 'empty' ? 2 : 3;
  const open: Spot[] =
    carry === null ? ['corral', 'pub', 'doorL', 'doorR'] : carry === 'empty' ? [...OUTFITTERS, 'works', 'greenBelt', 'pub', 'doorL', 'doorR'] : ['pub', 'doorL', 'doorR'];
  const pub = Math.round(20 + (60 + VIEW.month * 20) * (sim.left / FULL));
  return (
    <PhoneShell
      phase="In the store"
      seconds={sim.filling ? undefined : sim.left}
      rail={
        <>
          <div className="flex items-center gap-2.5" data-testid="mule">
            <span className={cx(carry === null ? 'text-ink-3' : 'text-ink')}>
              <MuleIcon size={20} />
            </span>
            <span className="flex-1 font-display text-sm font-semibold leading-tight">
              {carry === null ? 'No MULE' : carry === 'empty' ? 'Empty MULE in tow' : `${GOOD_NAME[carry]} MULE in tow`}
            </span>
          </div>
          <ol className="grid grid-cols-3 gap-1 text-[11px]">
            {['Buy', 'Outfit', 'Install'].map((label, i) => (
              <li
                key={label}
                className={cx(
                  'flex items-center gap-1 rounded-control border px-1.5 py-1',
                  i + 1 === step ? 'border-holo bg-holo-soft font-semibold text-ink' : i + 1 < step ? 'border-ok/40 text-ok' : 'border-holo-faint text-ink-3',
                )}
              >
                <span data-num className="font-mono">
                  {i + 1 < step ? '✓' : i + 1}
                </span>
                {label}
              </li>
            ))}
          </ol>
          <FoodTime seconds={sim.left} total={FULL} food={hungry ? 2 : ME.needs.food} need={ME.needs.food} />
          <p className="text-xs leading-snug text-ink-2" data-testid="store-hint">
            {carry === null && 'Tap the corral: your Zipwing walks there and buys an empty MULE.'}
            {carry === 'empty' && 'Tap an outfitter for a farm or mine, or a fit at the works for a factory.'}
            {carry !== null && carry !== 'empty' && 'Ready. Walk out of a door to the map and install it on your plot.'}
          </p>
          {sim.last && (
            <span className="font-mono text-[10px] text-ink-3" data-testid="last-walk">
              WALKED {sim.last.toUpperCase()}
            </span>
          )}
        </>
      }
      footer={
        <div className="flex gap-2">
          <Button size="md" variant={carry !== null && carry !== 'empty' ? 'holo' : 'outline'} className="flex-1 whitespace-nowrap px-2" onClick={() => sim.go('doorR')}>
            Out to the map
          </Button>
        </div>
      }
    >
      <div className="h-full min-h-[300px]">
        <StoreHall
          visitors={[...sim.others, sim.me]}
          mules={sim.corral}
          mulePrice={ME.mulePrice}
          prices={ME.outfitCosts}
          pubPayout={pub}
          open={sim.filling ? [] : open}
          onSpot={sim.go}
          overlay={sim.filling && <FillCard t={sim.t} hungry={hungry} />}
        />
      </div>
    </PhoneShell>
  );
}

// --- The TV: everyone walking on the map ----------------------------------------------------

/** Paths on the map in tile coordinates (the store is at 6,4), each leg at 0.6 s a tile (R1 placeholder). */
const MAP_PATHS: { id: string; points: { x: number; y: number; leading: Visitor['leading'] }[] }[] = [
  { id: 'ossa', points: [{ x: 6, y: 4, leading: 'energy' }, { x: 9, y: 2, leading: 'energy' }, { x: 11, y: 1, leading: 'energy' }, { x: 11, y: 1, leading: null }, { x: 6, y: 4, leading: null }] },
  { id: 'kai', points: [{ x: 6, y: 4, leading: 'water' }, { x: 8, y: 6, leading: 'water' }, { x: 13, y: 1, leading: 'water' }, { x: 13, y: 1, leading: null }] },
  { id: 'brix', points: [{ x: 10, y: 3, leading: null }, { x: 6, y: 4, leading: null }, { x: 6, y: 4, leading: 'empty' }] },
];

function pathAt(points: { x: number; y: number; leading: Visitor['leading'] }[], t: number) {
  // Each leg takes its length × 0.6 s; a leg of length 0 is a 1.5 s stop (installing, or buying inside).
  const legs = points.slice(1).map((p, i) => ({ from: points[i]!, to: p, secs: Math.max(1.5, Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y) * 0.6) }));
  const cycle = legs.reduce((s, l) => s + l.secs, 0);
  let u = t % cycle;
  for (const l of legs) {
    if (u <= l.secs) {
      const k = u / l.secs;
      return { x: l.from.x + (l.to.x - l.from.x) * k, y: l.from.y + (l.to.y - l.from.y) * k, leading: l.from.leading };
    }
    u -= l.secs;
  }
  return points[0]!;
}

export function TvDevelop() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((x) => x + 0.1), 100);
    return () => clearInterval(id);
  }, []);
  const left = (k: number) => Math.max(0, FULL - t - k * 7);
  const onMap = MAP_PATHS.map((p) => ({ id: p.id, ...pathAt(p.points, t) }));
  const inStore = onMap.filter((v) => Math.abs(v.x - 6) < 0.3 && Math.abs(v.y - 4) < 0.3).map((v) => v.id);
  const storeVisitors: Visitor[] = [
    { id: 'lena', at: SPOT.corral, walk: 0, time: left(0) / FULL, leading: null },
    ...inStore.map((id, k): Visitor => ({ id, at: SPOT[(['energy', 'works', 'water'] as Spot[])[k] ?? 'pub'], walk: 0, time: left(k + 1) / FULL, leading: null })),
  ];
  return (
    <div className="flex h-[720px] w-[1280px] flex-col gap-4 bg-table px-10 py-6 text-ink">
      <TvHeader game={{ ...VIEW, phase: 'development' }} title="Development" seconds={left(0)} />
      <div className="flex min-h-0 flex-1 gap-6">
        <div className="relative w-[760px] shrink-0 self-start" data-testid="tv-map">
          <HoloMap width={W} height={H} tiles={mapTiles(VIEW)} density="tv" hideGround className="w-full" />
          {onMap
            .filter((v) => !inStore.includes(v.id))
            .map((v, k) => (
              <Walker
                key={v.id}
                v={{ id: v.id, at: { x: ((v.x + 0.5) / W) * 100, y: ((v.y + 0.5) / H) * 100 }, walk: 0.1, time: left(k + 1) / FULL, leading: v.leading }}
                tv
              />
            ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <span className="label-caps text-base!">In the store now</span>
          <div className="h-[240px]">
            <StoreHall visitors={storeVisitors} mules={4} mulePrice={ME.mulePrice} prices={ME.outfitCosts} pubPayout={Math.round(20 + (60 + VIEW.month * 20) * (left(0) / FULL))} tv />
          </div>
          <div className="mt-auto grid grid-cols-2 gap-x-4 gap-y-1.5">
            <span className="label-caps col-span-2">Time left · set by Food</span>
            {VIEW.players.map((p, k) => (
              <div key={p.id} className="flex items-center gap-2">
                <PlayerMark slot={(slotOf(VIEW, p.id) ?? 0) as Slot} size={18} glow={false} />
                <span className="w-12 truncate text-sm font-semibold">{p.name}</span>
                <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-raised">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-holo" style={{ width: `${(left(k) / FULL) * 100}%` }} />
                </div>
                <span data-num className="w-9 text-right font-mono text-sm">
                  {Math.ceil(left(k))}s
                </span>
              </div>
            ))}
          </div>
          <span className="font-mono text-xs text-ink-3">
            {VIEW.storeMules} MULES IN THE CORRAL · {fmt(VIEW.mulePrice)} CR · WALKING 0.6 S A TILE (PLACEHOLDER)
          </span>
        </div>
      </div>
    </div>
  );
}
