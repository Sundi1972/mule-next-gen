import { AirGauge, Button, GoodTag, Panel, PlayerMark, type Good } from '@mule/ui';
import { fmt, PHASE_NAME, secondsUntil, standings } from '../game/derive';
import { useClient, useServerNow } from '../net/react';
import { usePhoneGame } from './game';
import { NewsPanel, ShipLine, StockPanel } from './parts';
import { PhoneShell } from './Shell';

/** After production and after upkeep: what you made, how the colony is doing, and the standings. */
export function Results() {
  const client = useClient();
  const { view, me, self } = usePhoneGame();
  const now = useServerNow();
  const harvest = view.phase === 'production';
  const ranking = standings(view);
  const rank = ranking.findIndex((r) => r.player.id === self.id) + 1;
  const made = me.produced ? (Object.entries(me.produced) as [Good, number][]).filter(([, n]) => n !== 0) : [];

  return (
    <PhoneShell
      phase={harvest ? 'Harvest' : PHASE_NAME.upkeep}
      seconds={secondsUntil(view.phaseEndsAt, now)}
      rail={
        <>
          <div className="flex items-end justify-between">
            <div className="flex flex-col">
              <span className="label-caps">Rank</span>
              <span data-num className="font-mono text-2xl font-bold text-holo">
                #{rank} <span className="text-sm font-normal text-ink-3">of {view.players.length}</span>
              </span>
            </div>
            <span className="text-sm text-ink-3">
              {self.plots} plot{self.plots === 1 ? '' : 's'}
            </span>
          </div>
          <section className="flex flex-col gap-1.5">
            <h2 className="label-caps flex justify-between">
              Standings <span className="text-holo">BY MONEY</span>
            </h2>
            <ol className="flex flex-col gap-1.5" data-testid="standings">
              {ranking.map((r, i) => (
                <li key={r.player.id} className="flex items-center gap-2 text-sm">
                  <span data-num className="w-4 font-mono text-xs text-ink-3">
                    {i + 1}
                  </span>
                  <PlayerMark slot={r.slot} size={12} />
                  <span className="min-w-0 flex-1 truncate font-semibold">{r.player.id === self.id ? 'You' : r.player.name}</span>
                  <span data-num className="font-mono text-xs">
                    {fmt(r.value)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </>
      }
      footer={
        <Button size="lg" variant={self.ready ? 'outline' : 'holo'} className="w-full px-2" disabled={self.ready} onClick={() => client.intent({ type: 'ready' })}>
          {self.ready ? 'Waiting for the others' : harvest ? 'On to the auction' : `On to month ${Math.min(view.month + 1, view.maxMonths)}`}
        </Button>
      }
    >
      <div className="grid grid-cols-2 items-start gap-2.5">
        <div className="flex flex-col gap-2.5">
          <Panel title={harvest ? 'Your harvest' : 'Made this month'} aside="PRIVATE" className="gap-2 p-3">
            {made.length === 0 ? (
              <p className="text-sm text-ink-2">Your plots made nothing this month. Install MULEs during development to start producing.</p>
            ) : (
              <ul className="grid grid-cols-3 gap-1.5" data-testid="produced">
                {made.map(([g, n]) => (
                  <li key={g} className="flex flex-col gap-0.5 rounded-control bg-raised px-2 py-1.5">
                    <GoodTag good={g} className="text-[11px]" />
                    <span data-num className="font-mono text-lg font-bold">
                      +{n}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <StockPanel title={harvest ? 'Your stock now' : 'Your stock after upkeep'} />
        </div>
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-holo-line bg-holo-line">
            <div className="flex flex-col gap-0.5 bg-panel px-3 py-2">
              <span className="label-caps">Colonists</span>
              <span data-num className="font-mono text-xl font-bold">
                {fmt(view.colonists)}
              </span>
            </div>
            <div className="flex flex-col gap-0.5 bg-panel px-3 py-2">
              <span className="label-caps">Food cover</span>
              <span data-num className="font-mono text-xl font-bold">
                {view.market.find((r) => r.good === 'food')?.cover ?? 0} mo
              </span>
            </div>
          </div>
          <AirGauge level={view.air.level} band={view.air.band} />
          <ShipLine view={view} />
          <NewsPanel news={view.news} />
        </div>
      </div>
    </PhoneShell>
  );
}
