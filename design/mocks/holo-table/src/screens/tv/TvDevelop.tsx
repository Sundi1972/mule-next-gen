import { HoloMap, PlayerMark, type MapAvatar } from '@mule/ui';
import { DEV_AVATARS, MAP_H, MAP_W, MULE_PRICE, SEATS, TILES } from '../../data';
import { useCountdown, useNow } from '../../proto';
import { TvHeader } from './TvHeader';

export function TvDevelop() {
  const seconds = useCountdown(45);
  const t = useNow(700) / 1000;
  // Everyone walks the map at once; small drifts stand in for real movement.
  const avatars: MapAvatar[] = DEV_AVATARS.map((a, i) => ({
    ...a,
    x: a.x + 0.6 * Math.sin(t * 0.7 + i * 1.7),
    y: a.y + 0.4 * Math.cos(t * 0.5 + i * 2.3),
  }));
  return (
    <div className="flex h-[720px] w-[1280px] flex-col gap-5 bg-table p-10 text-ink">
      <TvHeader phase="Development" seconds={seconds} />
      <div className="flex min-h-0 flex-1 gap-6">
        <HoloMap width={MAP_W} height={MAP_H} tiles={TILES} avatars={avatars} showOutput density="tv" className="w-[860px] shrink-0 self-start" />
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-panel border border-holo-line bg-panel p-5">
            <span className="label-caps">Colony store</span>
            <div className="flex items-end justify-between">
              <div className="flex flex-col">
                <span className="font-mono text-sm text-ink-3">MULE</span>
                <span data-num className="font-mono text-4xl font-bold">{MULE_PRICE}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="font-mono text-sm text-ink-3">IN STOCK</span>
                <span data-num className="font-mono text-4xl font-bold text-warn">4</span>
              </div>
            </div>
            <span className="text-base text-ink-2">Alloy is short, so MULEs are dear.</span>
          </div>
          <ul className="flex flex-col gap-2 font-mono text-base">
            <li className="text-ink"><span className="text-holo">MIA</span> installed a Food MULE</li>
            <li className="text-ink"><span className="text-holo">OSSA</span> bought a MULE</li>
            <li className="text-ink-2"><span className="text-holo">JONAS</span> is surveying a plot</li>
          </ul>
          <ul className="mt-auto flex flex-col gap-2">
            {SEATS.map((s) => (
              <li key={s.slot} className="flex items-center gap-3">
                <PlayerMark slot={s.slot} size={20} />
                <span className="flex-1 font-display text-lg font-semibold">{s.name}</span>
                <span data-num className="font-mono text-lg">{s.money.toLocaleString('en-US')}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
