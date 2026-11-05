import { GAME, POLITICS } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { Button, cx } from '@mule/ui';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { BuildSite } from '../../../../apps/web/src/components/Colony';
import { CollapseBanner, ColonyPanel, LeagueTable, YourWorth } from '../../../../apps/web/src/components/MonthEnd';
import { inCollapse, league, leaderWords, ordinal } from '../../../../apps/web/src/game/month-end';
import { useClient } from '../../../../apps/web/src/net/react';
import { usePhoneGame } from '../../../../apps/web/src/phone/game';
import { ReadyCount, WaitingFor } from '../../../../apps/web/src/phone/hub/ReadyBar';
import { connectedIn, hostMayContinue, namesOf, press, readyFooter, type Press } from '../../../../apps/web/src/phone/hub/ready';
import { PhoneShell, type Now } from '../../../../apps/web/src/phone/Shell';
import { TvHeader } from '../../../../apps/web/src/table/TableApp';
import { ColonyLeagueRow, MonthScoreBand, PhoneMonthScore } from './score';

export type TvVariant = 'A' | 'B';

// --- The TV -------------------------------------------------------------------------------------------

/**
 * COPY: TableApp.tsx's FitHeight (it is not exported), with useLayoutEffect in place of its server-render switch. The month end's content at full size when it fits,
 * scaled down as a whole when it doesn't.
 */
function FitHeight({ className, children }: { className?: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const fit = () => {
      const b = box.current;
      const i = inner.current;
      if (!b || !i) return;
      const stretch = i.style.minHeight;
      i.style.minHeight = '0px';
      const natural = i.offsetHeight;
      i.style.minHeight = stretch;
      if (natural === 0) return;
      const next = Math.min(1, b.clientHeight / natural);
      setScale((s) => (Math.abs(s - next) < 0.005 ? s : next));
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (box.current) ro.observe(box.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className={cx('min-h-0 overflow-hidden', className)} data-fit={scale.toFixed(3)}>
      <div ref={inner} className="flex flex-col" style={{ transform: `scale(${scale})`, transformOrigin: '0 0', width: `${100 / scale}%`, minHeight: `${100 / scale}%` }}>
        {children}
      </div>
    </div>
  );
}

/**
 * COPY: TableApp.tsx's TvMonthEnd (WS4's), with the colony score added. Every line of the original is kept; the
 * additions are marked GRAFT. With no score in the view (politics off, or the server not yet filling it at month end)
 * it is today's screen exactly.
 */
export function TvMonthEndScore({ game, variant }: { game: MuleView; variant: TvVariant }) {
  const score = game.colony?.score ?? null;
  const root = useRef<HTMLDivElement>(null);
  return (
    <div ref={root} className="flex h-[720px] w-[1280px] flex-col gap-4 bg-table p-10 text-ink" data-phase={game.phase} data-testid="tv-monthend" data-variant={variant}>
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <TvHeader game={game} title="End of the month" />
        </div>
        <ReadyCount players={game.players} tv />
      </div>
      {inCollapse(game) && <CollapseBanner density="tv" />}
      <FitHeight className="flex-1">
        {game.colony ? (
          <div className="grid flex-1 grid-cols-[minmax(0,6fr)_minmax(0,6fr)] gap-6">
            {/* GRAFT (A): the league and the score band share the left column, the band under the league. */}
            <div className="flex min-h-0 flex-col gap-4">
              <LeagueTable view={game} density="tv" />
              {variant === 'A' && score && <MonthScoreBand view={game} colony={game.colony} score={score} />}
            </div>
            {/* GRAFT (B): the colony's row in the league's own table. */}
            {variant === 'B' && game.colony && score && <ColonyLeagueRow view={game} colony={game.colony} score={score} root={root} />}
            <div className="flex flex-col gap-4">
              <ColonyPanel view={game} density="tv" />
              <BuildSite colony={game.colony} players={game.players} size="tv" />
            </div>
          </div>
        ) : (
          <div className="grid flex-1 grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-6">
            <LeagueTable view={game} density="tv" />
            <ColonyPanel view={game} density="tv" />
          </div>
        )}
      </FitHeight>
      <p className="text-lg leading-snug text-ink-2" data-testid="worth-rule">
        Worth: cash + goods at the store’s price + land at {GAME.plotScore} cr a plot + MULEs at {game.mulePrice} cr + {POLITICS.termScore} cr a term in office. Each player’s own lines are on their phone.
      </p>
    </div>
  );
}

// --- The phone ----------------------------------------------------------------------------------------

/**
 * COPY: phone/Results.tsx's MonthEnd (WS4's; not exported), with the colony score added. With no score in the view it
 * is today's screen exactly.
 */
export function PhoneMonthEndScore() {
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
  const colony = view.colony;
  const score = colony?.score ?? null;
  return (
    <PhoneShell phase="End of the month" now={now} foldNow rail={<YourWorth view={view} density={density} />} footer={<MonthEndFooter />}>
      <div className={cx('relative flex min-h-0 flex-1 flex-col', tv ? 'gap-2' : 'gap-1.5')} data-testid={tv ? 'phone-monthend' : 'phone-only-monthend'}>
        {inCollapse(view) && <CollapseBanner density={density} />}
        <LeagueTable view={view} density={density} selfId={self.id} />
        {tv ? (
          colony && score ? (
            // GRAFT: the score line and one short line take the footnote's place, so it is no taller than today's two
            // lines and the league keeps its room on a 667 × 375 phone. Worth's sum is in YourWorth's lines beside.
            <div className="mt-auto" data-testid="colony-on-tv">
              <PhoneMonthScore view={view} colony={colony} score={score}>
                <span className="text-[11px] leading-snug text-ink-3">Its sum is on the TV; your own lines are beside, yours only.</span>
              </PhoneMonthScore>
            </div>
          ) : (
            <p className="mt-auto text-[11px] leading-snug text-ink-3" data-testid="colony-on-tv">
              How the colony is doing is on the TV. Worth is cash + goods + land + MULEs + offices; your own lines are beside, for you only.
            </p>
          )
        ) : (
          <div className="relative flex flex-col gap-1" data-testid="phone-only-colony">
            {/* GRAFT: with no TV, the score line heads the colony panel, the sum on it where the phone is wide enough. */}
            {colony && score && (
              <div className="rounded-panel border border-holo-line bg-panel px-2.5 py-1">
                <PhoneMonthScore view={view} colony={colony} score={score} sum />
              </div>
            )}
            <ColonyPanel view={view} density="compact" />
          </div>
        )}
      </div>
    </PhoneShell>
  );
}

/** COPY: phone/Results.tsx's MonthEndFooter, verbatim (not exported). */
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
