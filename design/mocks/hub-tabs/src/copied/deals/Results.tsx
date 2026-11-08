// Copied from design/mocks/politics-deals/src/proposed/Results.tsx (7–8 Nov); changes for the prototype are marked TABS:.
import { Button, cx } from '@mule/ui';
import { PhoneMonthScoreNote } from '../../../../../../apps/web/src/components/Colony';
import { CollapseBanner, YourWorth } from '../../../../../../apps/web/src/components/MonthEnd';
import { inCollapse, league, leaderWords, ordinal } from '../../../../../../apps/web/src/game/month-end';
import { usePhoneGame } from '../../../../../../apps/web/src/phone/game';
import { PhoneShell, type Now } from '../../../../../../apps/web/src/phone/Shell';
import { BrokenCards, LeagueTable } from './MonthEnd';
import { FundLines } from '../budget/FundLines';

/*
 * GRAFT TARGET: apps/web/src/phone/Results.tsx::MonthEnd (WS4; S3-C20). The phone's month end beside a TV, as today, with
 * one change, marked CHANGE: the month's broken cards under the league (the same list the TV shows), and the league's
 * chips. The footer here is a stand-in for MonthEndFooter (not exported, unchanged).
 */
export function PhoneMonthEndDeals({ month }: { month: number }) {
  const { view, self } = usePhoneGame();
  const lg = league(view);
  const mine = lg.rows.find((r) => r.player.id === self.id)!;
  const words = leaderWords(view, lg, self.id);
  const now: Now = {
    title: `You’re ${ordinal(mine.rank)} of ${view.players.length}`,
    detail: `Month ${view.month} is over. ${words.lead}. Next: planning month ${view.month + 1}.`,
  };
  return (
    <PhoneShell
      phase="End of the month"
      now={now}
      foldNow
      rail={<YourWorth view={view} density="phone" />}
      footer={
        <Button size="lg" className="w-full px-2" data-testid="ready">
          On to month {view.month + 1}
        </Button>
      }
    >
      <div className={cx('relative flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto')} data-testid="phone-monthend">
        {inCollapse(view) && <CollapseBanner density="phone" />}
        <LeagueTable view={view} density="phone" selfId={self.id} />
        {/* CHANGE */}
        <BrokenCards view={view} month={month} density="phone" />
        {/* TABS: the full paid-out line (the budget mock's P15) under the broken list: the phone carries both in full (PM ruling, 8 Nov). */}
        <section className="grid grid-cols-3 rounded-panel border border-holo-line bg-panel px-2.5 py-1.5" data-testid="phone-paid-out">
          <FundLines view={view} />
        </section>
        <PhoneMonthScoreNote view={view}>
          <p className="mt-auto text-[11px] leading-snug text-ink-3">How the colony is doing is on the TV. Worth is cash + goods + land + MULEs + offices; your own lines are beside, for you only.</p>
        </PhoneMonthScoreNote>
      </div>
    </PhoneShell>
  );
}
