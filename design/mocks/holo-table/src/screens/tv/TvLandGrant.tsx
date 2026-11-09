import { HoloMap, PlayerMark, TERRAIN_NAME } from '@mule/ui';
import { MAP_H, MAP_W, SEATS, TILES } from '../../data';
import { cursorAt, useCountdown, useNow } from '../../proto';
import { TvHeader } from './TvHeader';

const CLAIMS_USED: Record<number, number> = { 0: 1, 1: 0, 2: 2, 3: 1, 4: 0, 5: 1 };

export function TvLandGrant() {
  const seconds = useCountdown(20);
  const cursor = cursorAt(useNow(100));
  return (
    <div className="flex h-[720px] w-[1280px] flex-col gap-5 bg-table p-10 text-ink">
      <TvHeader phase="Land grant" seconds={seconds} />
      <div className="flex min-h-0 flex-1 gap-6">
        <HoloMap width={MAP_W} height={MAP_H} tiles={TILES} cursor={cursor} density="tv" hideGround className="w-[860px] shrink-0 self-start" />
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="flex flex-col gap-1 rounded-panel border-2 border-holo bg-holo-soft p-5 shadow-glow">
            <span className="label-caps">Cursor on</span>
            <span data-num className="font-mono text-4xl font-bold text-holo">
              Plot {cursor.x + 1}·{cursor.y + 1}
            </span>
            <span className="font-display text-2xl font-semibold">{TERRAIN_NAME[cursor.terrain]} · free</span>
          </div>
          <ul className="flex flex-col gap-2">
            {SEATS.map((s) => {
              const left = 2 - (CLAIMS_USED[s.slot] ?? 0);
              return (
                <li key={s.slot} className="flex items-center gap-3">
                  <PlayerMark slot={s.slot} size={22} glow={left > 0} />
                  <span className="flex-1 font-display text-xl font-semibold">{s.name}</span>
                  <span className="flex gap-1.5" aria-label={`${left} claims left`}>
                    {[0, 1].map((i) => (
                      <span key={i} className={i < left ? 'size-4 rounded-chip bg-holo' : 'size-4 rounded-chip border border-holo-line'} />
                    ))}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-auto font-display text-2xl leading-snug text-ink-2">Free plots light up one by one, row by row from the top. Tap CLAIM on your phone when yours is lit.</p>
        </div>
      </div>
    </div>
  );
}
