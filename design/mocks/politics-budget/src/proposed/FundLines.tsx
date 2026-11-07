import type { FundLine } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { cx, PlayerMark } from '@mule/ui';
import { Fragment } from 'react';
import { fmt, toSlot } from '../../../../../apps/web/src/game/derive';

/*
 * P15 · what the fund paid out this month, at the month end (moment 5), on the TV and on a phone with no TV. GRAFT
 * TARGET: apps/web/src/components/MonthEnd.tsx, ColonyPanel (WS4): on the TV one full-width line right under the Air and
 * Colony fund blocks; on the phone (compact) the panel's last row, across its three columns. The numbers are
 * ColonyView.ledger's out and ColonyView.welfare (S5-C8); month-end.ts's colonyReport gains them.
 *
 * Out only, in the spec's list: office pay, upkeep, Welfare and whom it went to, buildings. The balance beside it is the
 * fund after them. Security is after RC and has no place here.
 *
 * PM ruling (TV-FIT's 0.7 floor): every phone keeps the full line, and so does the TV below five seats. From five seats
 * the TV drops it; only the total shows, in the Wealth gauge's note: "fund 154 cr · paid out 581" (FundPaidNote). GRAFT
 * TARGET for that one: apps/web/src/components/Colony.tsx, ColonyGauges, the Wealth gauge's `note` at size 'tv' in the
 * month end. The phone's and the TV's gauges in every other phase keep "fund N cr".
 */

/** From this many seats the TV's month end shows the total only (PM ruling). */
export const FUND_LINE_SEATS_MAX = 4;

/** Which form the TV's month end uses: the full line, or the total in the Wealth gauge's note. */
export const fundOnTv = (view: Pick<MuleView, 'players'>): 'line' | 'total' => (view.players.length > FUND_LINE_SEATS_MAX ? 'total' : 'line');

/** What the fund paid out this month, in all: the ledger's out lines summed. */
export const paidOut = (view: Pick<MuleView, 'colony'>) => Object.values(view.colony?.ledger?.out ?? {}).reduce((n, v) => n + (v ?? 0), 0);

/** The five-seat TV's Wealth note: "fund 154 cr · paid out 581". */
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

export function FundLines({ view, density }: { view: MuleView; density: 'tv' | 'compact' }) {
  const ledger = view.colony?.ledger;
  if (!ledger) return null;
  const tv = density === 'tv';
  const welfare = view.colony?.welfare?.month === ledger.month ? view.colony.welfare : null;
  const to = welfare && view.players.find((p) => p.id === welfare.to);
  const outs = OUT_ORDER.filter((k) => (ledger.out[k] ?? 0) > 0);
  return (
    <p className={cx('min-w-0 text-ink-2', tv ? 'col-span-2 border-t border-holo-faint pt-2 text-base leading-snug' : 'col-span-3 border-t border-holo-faint pt-1 text-[11px] leading-tight')} data-testid="fund-lines">
      <span className={cx('label-caps mr-2', tv ? 'text-sm!' : 'text-[10px]!')}>Paid out this month</span>
      {outs.map((k, i) => (
        <Fragment key={k}>
          {i > 0 && ', '}
          <span className={cx('whitespace-nowrap', (k === 'welfare' || k === 'project') && 'font-semibold text-ink')} data-testid={`fund-line-${k}`}>
            {OUT_NAME[k]} <span data-num className="font-mono">{fmt(ledger.out[k] ?? 0)}</span>
            {k === 'welfare' && to && (
              <>
                {' '}→ <PlayerMark slot={toSlot(to.slot)} species={to.species} size={tv ? 16 : 11} label={to.name} className="inline-block align-[-0.15em]" /> {to.name}
              </>
            )}
          </span>
        </Fragment>
      ))}
    </p>
  );
}
