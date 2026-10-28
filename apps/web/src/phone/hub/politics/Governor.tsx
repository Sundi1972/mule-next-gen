import { POLITICS } from '@mule/engine';
import type { PoliticsView } from '@mule/protocol';
import { Button, cx } from '@mule/ui';
import { useState } from 'react';
import { fmt } from '../../../game/derive';
import { useClient } from '../../../net/react';
import { usePhoneGame } from '../../game';
import { promiseKept, promisedWords } from './words';

/** The Governor's desk: the sales tax, within the bounds the server gives for this month, with the promise in view (E-7). */
export function GovernorDesk() {
  const { view } = usePhoneGame();
  if (!view.politics) return null;
  return <SalesTax politics={view.politics} />;
}

function SalesTax({ politics }: { politics: PoliticsView }) {
  const client = useClient();
  const { percent, start, low, high } = politics.tax;
  const [tax, setTax] = useState(percent);
  const [sent, setSent] = useState<number | null>(null);
  const promise = politics.promise;
  const breaks = promise !== null && !promiseKept(promise, politics.tax, tax);
  // Set this month: by this phone, or before, when the tax has moved from where the month opened.
  const done = tax === percent && (sent === percent || percent !== start);
  return (
    <section className="flex flex-col gap-1 @min-[1100px]/shell:gap-2" data-testid="gov-tax">
      <p className="text-xs @min-[1100px]/shell:text-base" data-testid="gov-promise">
        <span className="label-caps mr-1.5 text-[10px]! @min-[1100px]/shell:text-xs!">Sales tax</span>
        {promise && (
          <>
            You promised: <strong className="font-semibold">{promisedWords(promise, start)}</strong>
          </>
        )}
      </p>
      <div className="flex items-center gap-1.5">
        <Button size="md" variant="outline" className="w-11 shrink-0 px-0" aria-label="One point lower" disabled={tax <= low} onClick={() => setTax(Math.max(low, tax - 1))} data-testid="tax-down">
          −
        </Button>
        <span data-num className={cx('w-14 shrink-0 text-center font-mono text-2xl font-bold @min-[1100px]/shell:w-20 @min-[1100px]/shell:text-4xl', breaks && 'text-alert')} data-testid="tax-value">
          {tax}%
        </span>
        <Button size="md" variant="outline" className="w-11 shrink-0 px-0" aria-label="One point higher" disabled={tax >= high} onClick={() => setTax(Math.min(high, tax + 1))} data-testid="tax-up">
          +
        </Button>
        <Button
          size="md"
          className="min-w-0 flex-1 whitespace-nowrap px-2"
          disabled={done}
          onClick={() => {
            client.intent({ type: 'setTax', percent: tax });
            setSent(tax);
          }}
          data-testid="tax-confirm"
        >
          Set {tax}%
        </Button>
      </div>
      {breaks ? (
        <p className="text-xs font-semibold text-alert @min-[1100px]/shell:text-base" data-testid="gov-breaks">
          {tax}%: this breaks your promise.
        </p>
      ) : done ? (
        <p className="text-xs font-semibold text-ok @min-[1100px]/shell:text-base" data-testid="gov-done">
          Done: {tax}% from now on.
        </p>
      ) : (
        promise && (
          <p className="text-xs text-ink-2 @min-[1100px]/shell:text-base" data-testid="gov-within">
            Within your promise. Set it to make it count.
          </p>
        )
      )}
      <p className="text-[11px] leading-snug text-ink-3 @min-[1100px]/shell:text-sm">
        This month {low}–{high}%, from last month’s {start}%. The tax fills the colony fund ({fmt(politics.fund)} cr), which pays you {POLITICS.pay.governor} cr a month. Everyone sees your tax beside your promise.
      </p>
    </section>
  );
}
