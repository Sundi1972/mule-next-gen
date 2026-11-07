import type { FundLine } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { cx, PlayerMark } from '@mule/ui';
import { Fragment } from 'react';
import { fmt, toSlot } from '../../../../../apps/web/src/game/derive';

/*
 * P15 · what the fund paid out this month, at the month end (moment 5).
 *
 * The phone (a table with no TV, where the colony panel is on the phone): FundLines, the full line. GRAFT TARGET:
 * apps/web/src/components/MonthEnd.tsx, ColonyPanel (WS4), compact: the panel's last row, across its three columns. The
 * numbers are ColonyView.ledger's out and ColonyView.welfare (S5-C8); month-end.ts's colonyReport gains them.
 *
 * Out only, in the spec's list: office pay, upkeep, Welfare and whom it went to, buildings. The balance beside it is the
 * fund after them. Security is after RC and has no place here.
 *
 * The TV: the TV shows the total only, at every seat count (PM ruling 7 Nov, on the measured 0.663 vs 0.701): the full
 * line took the month end under TV-FIT's 0.7 floor, the total in the Wealth gauge's note costs nothing. FundPaidNote,
 * "fund 236 cr · paid out 499". GRAFT TARGET: apps/web/src/components/Colony.tsx, ColonyGauges, the Wealth gauge's `note`
 * at size 'tv' in the month end. The gauges in every other phase, and on the phone, keep "fund N cr".
 */

/** What the fund paid out this month, in all: the ledger's out lines summed. */
export const paidOut = (view: Pick<MuleView, 'colony'>) => Object.values(view.colony?.ledger?.out ?? {}).reduce((n, v) => n + (v ?? 0), 0);

/** The TV month end's Wealth note: "fund 236 cr · paid out 499". */
export function FundPaidNote({ view }: { view: MuleView }) {
  if (!view.colony?.ledger) return null;
  return (
    <span className="whitespace-nowrap text-ink-3" data-testid="fund-paid-note">
      fund {fmt(view.colony.fund)} cr · paid out {fmt(paidOut(view))}
    </span>
  );
}

const OUT_ORDER: FundLine[] = ['officePay', 'upkeep', 'repair', 'strikePay', 'welfare', 'project'];
const OUT_NAME: Partial<Record<FundLine, string>> = { officePay: 'office pay', upkeep: 'upkeep', repair: 'repairs', strikePay: 'strike pay', welfare: 'Welfare', project: 'Buildings' };

/** The phone's full line: "Paid out this month: office pay 80, upkeep 15, Welfare 54 → Kai, Buildings 350". */
export function FundLines({ view }: { view: MuleView }) {
  const ledger = view.colony?.ledger;
  if (!ledger) return null;
  const welfare = view.colony?.welfare?.month === ledger.month ? view.colony.welfare : null;
  const to = welfare && view.players.find((p) => p.id === welfare.to);
  const outs = OUT_ORDER.filter((k) => (ledger.out[k] ?? 0) > 0);
  return (
    <p className="col-span-3 min-w-0 border-t border-holo-faint pt-1 text-[11px] leading-tight text-ink-2" data-testid="fund-lines">
      <span className="label-caps mr-2 text-[10px]!">Paid out this month</span>
      {outs.map((k, i) => (
        <Fragment key={k}>
          {i > 0 && ', '}
          <span className={cx('whitespace-nowrap', (k === 'welfare' || k === 'project') && 'font-semibold text-ink')} data-testid={`fund-line-${k}`}>
            {OUT_NAME[k]} <span data-num className="font-mono">{fmt(ledger.out[k] ?? 0)}</span>
            {k === 'welfare' && to && (
              <>
                {' '}→ <PlayerMark slot={toSlot(to.slot)} species={to.species} size={11} label={to.name} className="inline-block align-[-0.15em]" /> {to.name}
              </>
            )}
          </span>
        </Fragment>
      ))}
    </p>
  );
}
