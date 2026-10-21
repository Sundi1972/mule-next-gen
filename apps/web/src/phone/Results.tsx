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
      footer={
        <Button size="lg" variant={self.ready ? 'outline' : 'holo'} className="w-full" disabled={self.ready} onClick={() => client.intent({ type: 'ready' })}>
          {self.ready ? 'Waiting for the others' : harvest ? 'On to the auction' : `On to month ${Math.min(view.month + 1, view.maxMonths)}`}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-end justify-between rounded-panel border border-holo-line bg-panel p-4">
          <div className="flex flex-col">
            <span className="label-caps">Your money</span>
            <span data-num className="font-mono text-3xl font-bold">
              {fmt(self.money)} cr
            </span>
            <span className="text-sm text-ink-3">
              {self.plots} plot{self.plots === 1 ? '' : 's'}
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="label-caps">Rank</span>
            <span data-num className="font-mono text-3xl font-bold text-holo">
              #{rank}
            </span>
            <span className="text-sm text-ink-3">of {view.players.length}</span>
          </div>
        </div>

        <Panel title={harvest ? 'Your harvest this month' : 'Made this month'} aside="PRIVATE">
          {made.length === 0 ? (
            <p className="text-sm text-ink-2">Your plots made nothing this month. Install MULEs during development to start producing.</p>
          ) : (
            <ul className="grid grid-cols-3 gap-2" data-testid="produced">
              {made.map(([g, n]) => (
                <li key={g} className="flex flex-col gap-1 rounded-control bg-raised px-2 py-2">
                  <GoodTag good={g} name className="text-[11px]" />
                  <span data-num className="font-mono text-xl font-bold">
                    +{n}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <StockPanel title={harvest ? 'Your stock now' : 'Your stock after upkeep'} />

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-holo-line bg-holo-line">
          <div className="flex flex-col gap-1 bg-panel p-3">
            <span className="label-caps">Colonists</span>
            <span data-num className="font-mono text-2xl font-bold">
              {fmt(view.colonists)}
            </span>
          </div>
          <div className="flex flex-col gap-1 bg-panel p-3">
            <span className="label-caps">Food cover</span>
            <span data-num className="font-mono text-2xl font-bold">
              {view.market.find((r) => r.good === 'food')?.cover ?? 0} mo
            </span>
          </div>
        </div>
        <AirGauge level={view.air.level} band={view.air.band} />
        <NewsPanel news={view.news} />
        <ShipLine view={view} />

        <Panel title="Standings" aside="BY MONEY">
          <ol className="flex flex-col gap-2">
            {ranking.map((r, i) => (
              <li key={r.player.id} className="flex items-center gap-3">
                <span data-num className="w-5 font-mono text-sm text-ink-3">
                  {i + 1}
                </span>
                <PlayerMark slot={r.slot} size={14} />
                <span className="flex-1 font-semibold">{r.player.id === self.id ? 'You' : r.player.name}</span>
                <span data-num className="font-mono text-sm">
                  {fmt(r.value)}
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </PhoneShell>
  );
}
