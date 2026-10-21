import { cx, HoloMap, PlayerMark, type MapAvatar } from '@mule/ui';
import { bookFor, DEV_AVATARS, MAP_H, MAP_W, MONTH, MULE_PRICE, seat, TILES } from '../../data';
import { StoreInterior } from '../Store';
import { useCountdown, useNow } from '../../proto';
import { TvHeader } from './TvHeader';

const TOTAL = 50;
/** Each colonist's time this month: full when fed, shorter the hungrier they are. */
const TIMES = bookFor('food').map((r) => ({ slot: r.slot, food: r.has, need: r.needs, time: r.has >= r.needs ? TOTAL : Math.round(15 + (35 * r.has) / r.needs) }));

export function TvDevelop() {
  const seconds = useCountdown(TOTAL);
  const elapsed = TOTAL - seconds;
  const t = useNow(700) / 1000;
  // Everyone walks the map at once; small drifts stand in for real movement.
  const avatars: MapAvatar[] = DEV_AVATARS.filter((a) => a.slot !== 5).map((a, i) => ({
    ...a,
    x: a.x + 0.6 * Math.sin(t * 0.7 + i * 1.7),
    y: a.y + 0.4 * Math.cos(t * 0.5 + i * 2.3),
  }));
  return (
    <div className="flex h-[720px] w-[1280px] flex-col gap-5 bg-table p-10 text-ink">
      <TvHeader phase="Development" seconds={seconds} />
      <div className="flex min-h-0 flex-1 gap-6">
        <HoloMap width={MAP_W} height={MAP_H} tiles={TILES} avatars={avatars} showOutput density="tv" hideGround className="w-[860px] shrink-0 self-start" />
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <StoreInterior mules={4} mulePrice={MULE_PRICE} pubPayout={Math.round(20 + (60 + MONTH * 20) * (seconds / TOTAL))} visitors={{ corral: [5] }} />
          <div className="mt-auto grid grid-cols-2 gap-x-4 gap-y-1.5">
            <span className="label-caps col-span-2">Time left · set by Food</span>
            {TIMES.map((t) => {
              const left = Math.max(0, t.time - elapsed);
              return (
                <div key={t.slot} className="flex items-center gap-2">
                  <PlayerMark slot={t.slot} size={20} glow={false} />
                  <span className="w-11 truncate text-sm font-semibold">{seat(t.slot).name}</span>
                  <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-raised">
                    <div className={cx('absolute inset-y-0 left-0 rounded-full', left === 0 ? 'bg-ink-3' : t.food < t.need ? 'bg-warn' : 'bg-holo')} style={{ width: `${(left / TOTAL) * 100}%` }} />
                  </div>
                  <span data-num className={cx('w-9 text-right font-mono text-sm', left === 0 ? 'text-ink-3' : 'text-ink')}>{left === 0 ? 'done' : `${Math.ceil(left)}s`}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
