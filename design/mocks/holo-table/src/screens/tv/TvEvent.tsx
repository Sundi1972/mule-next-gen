import { HoloMap, PlayerMark } from '@mule/ui';
import { MAP_H, MAP_W, RANKING, TILES } from '../../data';
import { TvHeader } from './TvHeader';

// Public scores: money plus land, as everyone can see on the table.

export function TvEvent() {
  return (
    <div className="flex h-[720px] w-[1280px] flex-col gap-5 bg-table p-10 text-ink">
      <TvHeader phase="End of month" />
      <div className="flex min-h-0 flex-1 gap-6">
        <div className="flex w-[700px] shrink-0 flex-col gap-4">
          <div className="flex flex-col gap-2 rounded-panel border-2 border-alert bg-alert-bg p-6 shadow-glow-alert">
            <span className="label-caps text-alert-ink! text-base!">Breaking</span>
            <h2 className="font-display text-7xl font-bold leading-none text-alert-ink">Sabotage!</h2>
            <p className="font-display text-3xl leading-tight">Lena's Smithore mine is offline for one month.</p>
          </div>
          <HoloMap width={MAP_W} height={MAP_H} tiles={TILES} density="tv" className="w-[520px]" />
          <div className="flex items-center gap-4 rounded-panel border border-holo-line bg-panel px-5 py-4">
            <span className="font-display text-2xl font-semibold">Who did it?</span>
            <span className="text-xl text-ink-2">The Sheriff investigates next month.</span>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-holo-line bg-holo-line">
            <div className="flex flex-col gap-1 bg-panel p-4">
              <span className="label-caps">Colonists</span>
              <span data-num className="font-mono text-3xl font-bold">112</span>
              <span className="font-mono text-sm text-fall">▲ 4%</span>
            </div>
            <div className="flex flex-col gap-1 bg-panel p-4">
              <span className="label-caps">Food cover</span>
              <span data-num className="font-mono text-3xl font-bold text-warn">0.6 mo</span>
              <span className="font-mono text-sm text-warn">Shortage risk</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-panel border border-holo-line bg-panel p-4">
            <span className="label-caps">Standings</span>
            <ol className="flex flex-col gap-2">
              {RANKING.map((s, i) => (
                <li key={s.slot} className="flex items-center gap-3">
                  <span className="w-6 font-mono text-lg text-ink-3">{i + 1}</span>
                  <PlayerMark slot={s.slot} size={22} />
                  <span className="flex-1 font-display text-xl font-semibold">{s.name}</span>
                  <span data-num className="font-mono text-xl font-bold">{s.score.toLocaleString('en-US')}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
