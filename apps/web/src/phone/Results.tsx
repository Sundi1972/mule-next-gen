import { AirGauge, Button, cx, GoodTag, Panel, PlayerMark, type Good } from '@mule/ui';
import { useState } from 'react';
import { CollapseBanner, ColonyPanel, LeagueTable, YourWorth } from '../components/MonthEnd';
import { fmt, PHASE_NAME, secondsUntil, standings } from '../game/derive';
import { inCollapse, league, leaderWords, ordinal } from '../game/month-end';
import { useClient, useServerNow } from '../net/react';
import { usePhoneGame } from './game';
import { WaitingFor } from './hub/ReadyBar';
import { connectedIn, hostMayContinue, namesOf, press, readyFooter, type Press } from './hub/ready';
import { NewsPanel, ShipLine, StockPanel } from './parts';
import { PhoneShell, type Now } from './Shell';

/** After production, what you made and the standings; at the month's end (upkeep), the league table (C20). */
export function Results() {
  const { view } = usePhoneGame();
  return view.phase === 'upkeep' ? <MonthEnd /> : <Harvest />;
}

/**
 * The month's end on your phone (C20, WS6's approved mock): the league table by Worth with the lead and each change
 * since last month, your own lines in the rail (yours only), and with no TV at the table the colony panel too. It
 * holds until everyone taps "On to month N"; the host can move on without the rest.
 */
function MonthEnd() {
  const { table, view, self } = usePhoneGame();
  const tv = table.boards > 0;
  const lg = league(view);
  const mine = lg.rows.find((r) => r.player.id === self.id)!;
  const words = leaderWords(view, lg, self.id);
  const now: Now = {
    title: mine.rank === 1 && lg.leader?.level.length === 1 ? `Month ${view.month} is over: you lead` : `Month ${view.month} is over: you’re ${ordinal(mine.rank)} of ${view.players.length}`,
    detail: `${words.lead}. Next: planning month ${view.month + 1}.`,
  };
  const density = tv ? 'phone' : 'compact';
  return (
    <PhoneShell phase="End of the month" now={now} foldNow rail={<YourWorth view={view} density={density} />} footer={<MonthEndFooter />}>
      <div className={cx('relative flex min-h-0 flex-1 flex-col', tv ? 'gap-2' : 'gap-1.5')} data-testid={tv ? 'phone-monthend' : 'phone-only-monthend'}>
        {inCollapse(view) && <CollapseBanner density={density} />}
        <LeagueTable view={view} density={density} selfId={self.id} />
        {tv ? (
          <p className="mt-auto text-[11px] leading-snug text-ink-3" data-testid="colony-on-tv">
            How the colony is doing is on the TV. Worth is cash + goods + land + MULEs + offices; your own lines are beside, for you only.
          </p>
        ) : (
          <div className="relative" data-testid="phone-only-colony">
            <ColonyPanel view={view} density="compact" />
          </div>
        )}
      </div>
    </PhoneShell>
  );
}

/**
 * The month end's footer: "On to month N" is your Ready. Once you're on, who the table still waits for; the host can
 * then continue without them, after one confirming tap (the server's Continue, as in planning).
 */
function MonthEndFooter() {
  const client = useClient();
  const { table, view, self } = usePhoneGame();
  const [confirm, setConfirm] = useState(false);
  const footer = readyFooter({ me: self.id, players: view.players, hostId: table.hostId, connected: connectedIn(table.seats), mayContinue: hostMayContinue(view), confirm });
  const next = Math.min(view.month + 1, view.maxMonths);
  const on = (pressed: Press) => () => {
    const step = press(confirm, pressed);
    setConfirm(step.confirm);
    if (step.intent) client.intent(step.intent);
  };
  const others = footer.waiting;
  return (
    <>
      {footer.ready && others.length > 0 && <WaitingFor seats={others} me={self.id} />}
      <Button size="lg" variant={footer.ready ? 'outline' : 'holo'} className="w-full px-2" disabled={footer.ready} onClick={on('ready')} data-testid="ready">
        {footer.ready ? 'Waiting for the others' : `On to month ${next}`}
      </Button>
      {footer.host === 'continue' && (
        <Button size="md" variant="outline" className="w-full" onClick={on('continue')} data-testid="continue">
          Continue without {others.length === 1 ? others[0]!.name : 'them'}
        </Button>
      )}
      {footer.host === 'confirm' && (
        <div className="flex flex-col gap-2 rounded-panel border border-warn/60 bg-panel p-2.5 @min-[1100px]/shell:p-4" role="alertdialog" aria-label="Continue without them?" data-testid="continue-confirm">
          <p className="text-sm @min-[1100px]/shell:text-base">
            Move everyone on to month {next} now? {namesOf(others, null)} {others.length === 1 ? 'is' : 'are'} still reading the table.
          </p>
          <div className="flex gap-2">
            <Button size="md" className="flex-1" onClick={on('continue-now')} data-testid="continue-now">
              Continue now
            </Button>
            <Button size="md" variant="ghost" className="flex-1" onClick={on('keep-waiting')} data-testid="keep-waiting">
              Keep waiting
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

/** After production: what you made, how the colony is doing, and the standings. */
function Harvest() {
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
              Standings <span className="text-holo">BY WORTH</span>
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
