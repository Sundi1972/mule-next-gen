import { DEVELOPMENT, type Good } from '@mule/engine';
import { cx, HoloMap, PlayerMark, TimeBar, type Slot } from '@mule/ui';
import { useEffect, useState, type ReactNode } from 'react';
import { mapTiles, slotOf } from '../../../../../../../apps/web/src/game/derive';
import { TvHeader } from '../../../../../../../apps/web/src/table/TableApp';
import { H, ME, W } from '../../../fixture';
import { ConditionProvider, DEV_WALK_STAND_IN, PaceList, paceOf } from '../../../proposed/Condition';
import { SPOT, StoreHall, Walker, type Visitor } from '../../Store';
import { conditions, devView, PLAINS, STORE } from './fixture';
import { FIRST_MULE_AT, FULL, route, type Cell } from './turn';

/**
 * The big screen in the first month (V-8), a FORK of screens/Store.tsx TvDevelop (#tv-develop), which stays as
 * approved. One clock for everyone still: it stands full until every colonist's first MULE is in, and the TV says
 * whose is still to come. Ossa (an AI) is in at once, Kai and Brix while Lena shops; Lena's goes in on Plains 4·1, and
 * the clock starts. Then it loops.
 *
 * GRAFT TARGET: apps/web/src/table/TableApp.tsx, the development view (WS4's file; WS6's change as a named edit).
 */

const VIEW1 = devView(1, 300);
/** Lena's first MULE goes in at this second of the loop; the clock then runs this long before it starts again. */
const LENA_IN = 20;
const LOOP = LENA_IN + 12;

/** Each colonist's walk out to their first plot, in the loop's seconds: leave the store, arrive, MULE in. */
const WALKS: { id: string; to: Cell; leaves: number }[] = [
  { id: 'kai', to: { x: 9, y: 7 }, leaves: FIRST_MULE_AT.kai! - 3 },
  { id: 'brix', to: { x: 9, y: 2 }, leaves: FIRST_MULE_AT.brix! - 3 },
  { id: 'lena', to: PLAINS, leaves: LENA_IN - 4 },
];
const IN_AT: Record<string, number> = { ...FIRST_MULE_AT, lena: LENA_IN };
/** What each first MULE makes. */
const GOOD_OF: Record<string, Good> = { kai: 'water', brix: 'smithore', lena: 'energy' };

function useLoop() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((x) => (x + 0.1) % LOOP), 100);
    return () => clearInterval(id);
  }, []);
  return t;
}

/** Where a walker stands at second t of the loop: in the store, on the way (a plot at a time), or at its plot. */
function placeAt(w: (typeof WALKS)[number], t: number): { at: Cell | null; moving: boolean; leading: Visitor['leading'] } {
  const cells = [STORE, ...route(STORE, w.to)];
  const inAt = IN_AT[w.id]!;
  if (t < w.leaves) return { at: null, moving: false, leading: 'empty' };
  if (t >= inAt) return { at: w.to, moving: false, leading: null };
  const k = Math.min(cells.length - 1, Math.floor(((t - w.leaves) / (inAt - w.leaves)) * cells.length));
  return { at: cells[k]!, moving: true, leading: GOOD_OF[w.id]! };
}

export function TvFirstMonth({ mark }: { mark?: ReactNode }) {
  const t = useLoop();
  const all = Math.max(...Object.values(IN_AT));
  const waiting = t < all;
  const left = waiting ? FULL : Math.max(0, FULL - (t - all));
  const players = VIEW1.players;
  const inStore = WALKS.filter((w) => placeAt(w, t).at === null).map((w) => w.id);
  const storeVisitors: Visitor[] = inStore.map((id, k) => ({ id, at: SPOT[(['corral', 'energy', 'water'] as const)[k] ?? 'pub'], walk: 0.6, leading: id === 'lena' ? (t > 10 ? 'energy' : t > 5 ? 'empty' : null) : 'empty' }));
  // Each first MULE stands on its plot from the second it goes in.
  const tiles = mapTiles({ ...VIEW1, tiles: VIEW1.tiles.map((x) => { const w = WALKS.find((v) => v.to.x === x.x && v.to.y === x.y && IN_AT[v.id]! <= t); return w ? { ...x, outfit: GOOD_OF[w.id]! } : x; }) });
  return (
    <ConditionProvider value={conditions(1)}>
      <div className="flex h-[720px] w-[1280px] flex-col gap-4 bg-table px-10 py-6 text-ink" data-testid="tv-first-month">
        <TvHeader game={{ ...VIEW1, phase: 'development' }} title="Development" seconds={waiting ? undefined : left} />
        <div className="relative flex items-center gap-4" data-testid="tv-clock">
          <span className={cx('relative shrink-0 font-display text-xl font-semibold', waiting ? 'text-holo' : 'label-caps text-base!')} data-testid="tv-clock-label">
            {waiting ? 'First month: the clock starts when every first MULE is in' : "Everyone's clock"}
            {mark}
          </span>
          <TimeBar seconds={left} total={FULL} size="tv" className="min-w-0 flex-1" />
        </div>
        <div className="flex min-h-0 flex-1 gap-6">
          <div className="relative w-[760px] shrink-0 self-start" data-testid="tv-map">
            <HoloMap width={W} height={H} tiles={tiles} density="tv" hideGround className="w-full" />
            {WALKS.map((w) => {
              const p = placeAt(w, t);
              if (!p.at) return null;
              const pace = DEV_WALK_STAND_IN.tileSeconds / paceOf(conditions(1)[w.id]!);
              return <Walker key={w.id} v={{ id: w.id, at: { x: ((p.at.x + 0.5) / W) * 100, y: ((p.at.y + 0.5) / H) * 100 }, walk: pace, leading: p.leading, moving: p.moving }} tv />;
            })}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <span className="label-caps text-base!">First MULEs in</span>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5" data-testid="tv-first-mules">
              {players.map((p) => {
                const isIn = IN_AT[p.id]! <= t;
                return (
                  <li key={p.id} className="flex items-center gap-2 text-lg" data-testid={`tv-first-mule-${p.id}`}>
                    <PlayerMark slot={(slotOf(VIEW1, p.id) ?? 0) as Slot} size={18} glow={false} />
                    <span className="flex-1 font-semibold">{p.name}</span>
                    <span className={cx('font-mono text-base font-bold', isIn ? 'text-ok' : 'text-ink-3')}>{isIn ? '✓ in' : 'still to come'}</span>
                  </li>
                );
              })}
            </ul>
            <span className="label-caps mt-2 text-base!">In the store now</span>
            <div className="h-[200px]">
              <StoreHall visitors={storeVisitors} mules={VIEW1.storeMules} mulePrice={VIEW1.mulePrice} prices={ME.outfitCosts} pubPayout={Math.round(DEVELOPMENT.pub.base + (DEVELOPMENT.pub.start + VIEW1.month * DEVELOPMENT.pub.perMonth) * (left / FULL))} tv />
            </div>
            <div className="mt-auto">
              <PaceList />
            </div>
          </div>
        </div>
      </div>
    </ConditionProvider>
  );
}
