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
 * Out only, in the spec's list: office pay, upkeep, Welfare and whom it went to, buildings. One line on the TV, because
 * the month end sits at TV-FIT's floor already. OPEN FINDING (measured 7 Nov): with the Observatory collecting, the month
 * end is 0.701 as built and 0.663 with this line, under the 0.7 floor (with a Stadium building instead: 0.746 → 0.703).
 * The balance beside it is the fund after them. Security is after RC and has no place here.
 */

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
