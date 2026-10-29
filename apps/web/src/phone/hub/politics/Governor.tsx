import { POLITICS } from '@mule/engine';
import type { PoliticsView } from '@mule/protocol';
import { Button, cx } from '@mule/ui';
import { useId, useState } from 'react';
import { fmt } from '../../../game/derive';
import { useClient } from '../../../net/react';
import { usePhoneGame } from '../../game';
import { promiseBase, promiseKept, promisedWords } from './words';

/** The Governor's desk: the sales tax, within the bounds the server gives for this month, with the promise in view (E-7). */
export function GovernorDesk() {
  const { view } = usePhoneGame();
  if (!view.politics) return null;
  return <SalesTax politics={view.politics} />;
}

/** Where the desk's Set stands: the tax set this month, a tax on its way to the server, or open. */
export function setState(tax: number, sent: number | null, { percent, start }: Pick<PoliticsView['tax'], 'percent' | 'start'>): 'done' | 'sending' | 'open' {
  // Set this month: by this phone, or before, when the tax has moved from where the month opened.
  if (tax === percent && (sent === percent || percent !== start)) return 'done';
  return sent === tax ? 'sending' : 'open';
}

/** The verdict on the tax shown: short in the chip, whole for a screen reader. Null with no promise until the tax is set. */
function verdictOf(tax: number, breaks: boolean, done: boolean, promised: boolean): { id: 'gov-breaks' | 'gov-done' | 'gov-within'; chip: string; words: string; tone: string } | null {
  if (breaks) return { id: 'gov-breaks', chip: 'breaks it', words: `${tax}%: this breaks your promise.`, tone: 'border-alert text-alert' };
  if (done) return { id: 'gov-done', chip: 'done', words: `Done: ${tax}% from now on.`, tone: 'border-ok text-ok' };
  return promised ? { id: 'gov-within', chip: 'within', words: 'Within your promise. Set it to make it count.', tone: 'border-holo-line text-ink-2' } : null;
}

/** One compact block: the promise on one line, the row with the verdict under the number, and the rules behind "Why". */
function SalesTax({ politics }: { politics: PoliticsView }) {
  const client = useClient();
  const { percent, start, low, high } = politics.tax;
  const [tax, setTax] = useState(percent);
  const [sent, setSent] = useState<number | null>(null);
  const [why, setWhy] = useState(false);
  const whyId = useId();
  const promise = politics.promise;
  const breaks = promise !== null && !promiseKept(promise, politics, tax);
  const state = setState(tax, sent, politics.tax);
  const done = state === 'done';
  const verdict = verdictOf(tax, breaks, done, promise !== null);
  return (
    <section className="flex flex-col gap-0.5 @min-[1100px]/shell:gap-2" data-testid="gov-tax">
      <p className="truncate text-xs @min-[1100px]/shell:text-base" data-testid="gov-promise">
        <span className="label-caps mr-1.5 text-[10px]! hidden @min-[1100px]/shell:inline @min-[1100px]/shell:text-xs!">Sales tax</span>
        {promise && (
          <>
            You promised: <strong className="font-semibold">{promisedWords(promise, promiseBase(politics))}</strong>
          </>
        )}
      </p>
      <div className="flex items-center gap-1 @min-[1100px]/shell:gap-1.5" data-testid="governor-tax-row">
        <Button size="md" variant="outline" className="h-10! w-10 shrink-0 px-0 @min-[1100px]/shell:h-11! @min-[1100px]/shell:w-11" aria-label="One point lower" disabled={tax <= low} onClick={() => setTax(Math.max(low, tax - 1))} data-testid="tax-down">
          −
        </Button>
        <span className="flex h-10 w-14 shrink-0 flex-col items-center justify-center gap-0.5 @min-[1100px]/shell:h-11 @min-[1100px]/shell:w-24">
          <span data-num className={cx('font-mono text-xl font-bold leading-none @min-[1100px]/shell:text-3xl', breaks && 'text-alert')} data-testid="tax-value">
            {tax}%
          </span>
          {verdict && (
            <span className={cx('whitespace-nowrap rounded-chip border px-1 font-mono text-[9px] font-bold uppercase leading-3 @min-[1100px]/shell:text-xs @min-[1100px]/shell:leading-4', verdict.tone)} role="status" aria-live="polite" data-testid="governor-verdict">
              <span data-testid={verdict.id}>
                <span aria-hidden="true">{verdict.chip}</span>
                <span className="sr-only">{verdict.words}</span>
              </span>
            </span>
          )}
        </span>
        <Button size="md" variant="outline" className="h-10! w-10 shrink-0 px-0 @min-[1100px]/shell:h-11! @min-[1100px]/shell:w-11" aria-label="One point higher" disabled={tax >= high} onClick={() => setTax(Math.min(high, tax + 1))} data-testid="tax-up">
          +
        </Button>
        <Button
          size="md"
          variant={breaks ? 'danger' : 'holo'}
          className="h-10! min-w-0 flex-1 whitespace-nowrap px-1.5 @min-[1100px]/shell:h-11! @min-[1100px]/shell:px-2"
          disabled={state !== 'open'}
          onClick={() => {
            client.intent({ type: 'setTax', percent: tax });
            setSent(tax);
          }}
          data-testid="tax-confirm"
        >
          Set {tax}%
        </Button>
      </div>
      <span className="flex flex-wrap items-center gap-x-2">
        {done && <span className="text-[11px] font-semibold text-ok @min-[1100px]/shell:text-sm">Done: {tax}% from now on.</span>}
        <button type="button" onClick={() => setWhy((w) => !w)} aria-expanded={why} aria-controls={whyId} className="flex min-h-8 items-center gap-1 text-[11px] font-semibold text-holo @min-[1100px]/shell:text-sm" data-testid="governor-why">
          Why {low}–{high}%?
          <svg aria-hidden viewBox="0 0 24 24" width={10} height={10} className={cx('transition-transform', why && 'rotate-90')} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </span>
      <p id={whyId} hidden={!why} className="text-[11px] leading-snug text-ink-3 @min-[1100px]/shell:text-sm" data-testid="governor-why-text">
        This month {low}–{high}%, from last month’s {start}%. The tax fills the colony fund ({fmt(politics.fund)} cr), which pays you {POLITICS.pay.governor} cr a month. Everyone sees your tax beside your promise.
      </p>
    </section>
  );
}
