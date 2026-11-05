import { POLITICS, type Office, type TaxPromise } from '@mule/engine';
import { Button, cx } from '@mule/ui';
import { useState, type ReactNode } from 'react';
import { useClient } from '../../../net/react';
import { usePhoneGame } from '../../game';
import { Person } from './parts';
import { OFFICE_NAME, promiseWords, whyNot } from './words';

/** Running for office in any month (E-1): the block, and the promise sheet it opens. `sheet` opens it from outside, such as the hub's door. */
export function RunBlock({ sheet = false }: { sheet?: boolean }) {
  const { view, me } = usePhoneGame();
  const client = useClient();
  const [open, setOpen] = useState(sheet);
  const [asked, setAsked] = useState(sheet);
  // A door pressed again while the desk is open asks again.
  if (sheet !== asked) {
    setAsked(sheet);
    if (sheet) setOpen(true);
  }
  const politics = view.politics!;
  const mine = me.politics!;
  const promise = politics.promises[me.id] ?? null;
  return (
    <>
      <RunForOffice
        onRun={(office) => (office === 'governor' ? setOpen(true) : client.intent({ type: 'run', office }))}
        onWithdraw={() => client.intent({ type: 'run', office: null })}
        running={mine.running}
        promise={promise}
      />
      {open && (
        <PromiseSheet
          start={mine.running === 'governor' ? promise : null}
          onRun={(p) => {
            client.intent({ type: 'run', office: 'governor', promise: p });
            setOpen(false);
          }}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** Who runs so far, from the candidacy Politics holds until the ballot opens, and your own candidacy. */
function RunForOffice({ running, promise, onRun, onWithdraw }: { running: Office | null; promise: TaxPromise | null; onRun: (office: Office) => void; onWithdraw: () => void }) {
  const { view, me } = usePhoneGame();
  const politics = view.politics!;
  const tax = politics.tax.percent;
  const announce = politics.election?.stage === 'announce';
  return (
    <section className="relative flex flex-col gap-1.5 @min-[1100px]/shell:gap-2.5" data-testid="run-office">
      <h3 className="label-caps @min-[1100px]/shell:text-xs!">Run for office</h3>
      <p className="text-xs text-ink-2 @min-[1100px]/shell:text-sm" data-testid="run-any-month">
        {announce ? 'No clock. Whoever runs when the ballot opens is on it.' : `Any month, no clock. Next election: month ${politics.next}. Whoever runs when it opens is on the ballot.`}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs @min-[1100px]/shell:gap-y-1 @min-[1100px]/shell:text-sm" data-testid="field-so-far">
        {POLITICS.offices.map((office) => {
          const ids = politics.candidates[office] ?? [];
          return (
            <div key={office} className="contents">
              <dt className="text-ink-2">{OFFICE_NAME[office]}</dt>
              <dd className="flex min-w-0 flex-col gap-0.5" data-testid={`so-far-${office}`}>
                {ids.length === 0 ? (
                  <span className="text-ink-3">nobody yet</span>
                ) : (
                  ids.map((id) => (
                    <span key={id} className="flex flex-wrap items-baseline gap-x-1.5" data-testid={`so-far-${office}-${id}`}>
                      <Person view={view} id={id} me={me.id} size={13} className="self-center" />
                      {office === 'governor' && <span className="text-ink-2">{promiseWords(politics.promises[id], tax)}</span>}
                    </span>
                  ))
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      {running && (
        <span className="flex items-baseline justify-between gap-2 text-xs @min-[1100px]/shell:text-sm" data-testid="running">
          <span>
            You run for <strong>{OFFICE_NAME[running]}</strong>
            {running === 'governor' && promise && <>, promising {promiseWords(promise, tax)}</>}.
          </span>
          <button type="button" className="min-h-8 shrink-0 px-1 text-holo underline" onClick={onWithdraw} data-testid="withdraw">
            Withdraw
          </button>
        </span>
      )}
      {POLITICS.offices.map((office) => {
        const can = me.politics!.canRun[office] ?? 'notElected';
        if (office !== 'governor' && running === office) return null;
        const change = office === 'governor' && running === 'governor';
        return (
          <Button
            key={office}
            size="md"
            variant="outline"
            className={cx('w-full px-2 text-xs! @min-[1100px]/shell:text-sm!', can === true ? 'whitespace-nowrap' : 'h-auto! min-h-11 py-1')}
            disabled={can !== true}
            onClick={() => onRun(office)}
            data-testid={change ? 'change-promise' : `run-${office}`}
          >
            {can !== true ? <span data-testid="cannot-run">{whyNot(can)}</span> : change ? 'Change promise' : `Run for ${OFFICE_NAME[office]}`}
          </Button>
        );
      })}
    </section>
  );
}

/** The promise picker, as a sheet over the screen: one of three, no free text, and the field so far beside it. */
export function PromiseSheet({ start, onRun, onCancel }: { start: TaxPromise | null; onRun: (p: TaxPromise) => void; onCancel: () => void }) {
  const { view, me } = usePhoneGame();
  const politics = view.politics!;
  const taxNow = politics.tax.percent;
  const { min, max } = POLITICS.tax;
  const [kind, setKind] = useState<TaxPromise['kind']>(start?.kind ?? 'cap');
  const [n, setN] = useState(start?.kind === 'cap' ? start.percent : taxNow);
  const chosen: TaxPromise = kind === 'cap' ? { kind, percent: n } : { kind };
  const field = (politics.candidates.governor ?? []).filter((id) => id !== me.id);
  const chip = (k: TaxPromise['kind'], label: ReactNode, testid: string, off = false) => (
    <label
      className={cx(
        'flex min-h-11 cursor-pointer items-center gap-2 rounded-control border px-2 text-sm @min-[1100px]/shell:px-3 @min-[1100px]/shell:text-lg',
        kind === k ? 'border-holo bg-holo-soft' : 'border-holo-line',
        off && 'cursor-not-allowed opacity-50',
      )}
      data-testid={testid}
    >
      <input type="radio" name="promise" checked={kind === k} disabled={off} onChange={() => setKind(k)} className="accent-[var(--color-holo)]" />
      {label}
    </label>
  );
  return (
    <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-void/70 p-3" role="dialog" aria-modal aria-labelledby="promise-title" data-testid="promise-sheet">
      <div className="relative flex w-full max-w-[560px] flex-col gap-2 rounded-sheet border-2 border-holo bg-panel p-3 shadow-glow @min-[1100px]/shell:max-w-[760px] @min-[1100px]/shell:gap-4 @min-[1100px]/shell:p-6" role="radiogroup" aria-label="Your promise as Governor">
        <h2 id="promise-title" className="font-display text-lg font-semibold leading-tight @min-[1100px]/shell:text-3xl">
          Run for Governor: your promise on the tax
        </h2>
        <p className="text-xs text-ink-2 @min-[1100px]/shell:text-base">
          The sales tax is {taxNow}% now. Everyone sees your promise beside your name, on the ballot and on the TV; you can change it until the election.
        </p>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-ink-2 @min-[1100px]/shell:text-base" data-testid="promise-field">
          Running so far:
          {field.length === 0 && <span className="text-ink-3">nobody yet</span>}
          {field.map((id) => (
            <span key={id} className="inline-flex items-center gap-1">
              <Person view={view} id={id} me={me.id} size={14} /> {promiseWords(politics.promises[id], taxNow)}
            </span>
          ))}
        </p>
        <div className="flex flex-wrap gap-1.5 @min-[1100px]/shell:gap-3" data-testid="promise-pick">
          {chip(
            'cap',
            <span className="flex items-center gap-1.5">
              Up to
              <span className="inline-flex items-center rounded-control border border-holo-line" onClick={() => setKind('cap')}>
                <button type="button" aria-label="Lower the cap" disabled={n <= min} onClick={() => setN((x) => Math.max(min, x - 1))} className="grid size-9 place-items-center text-holo disabled:opacity-40" data-testid="promise-cap-minus">
                  −
                </button>
                <span data-num className="w-9 text-center font-mono font-bold" data-testid="promise-cap-value">
                  {n}%
                </span>
                <button type="button" aria-label="Raise the cap" disabled={n >= max} onClick={() => setN((x) => Math.min(max, x + 1))} className="grid size-9 place-items-center text-holo disabled:opacity-40" data-testid="promise-cap-plus">
                  +
                </button>
              </span>
            </span>,
            'promise-cap',
          )}
          {/* There is nothing to lower at the lowest tax. */}
          {chip('lower', 'Lower it', 'promise-lower', taxNow <= min)}
          {chip('hold', `Keep it at ${taxNow}%`, 'promise-hold')}
        </div>
        <div className="flex gap-2">
          <Button size="md" className="flex-1 whitespace-nowrap @min-[1100px]/shell:text-lg" onClick={() => onRun(chosen)} data-testid="promise-run">
            Run · {promiseWords(chosen, taxNow, false)}
          </Button>
          <Button size="md" variant="ghost" onClick={onCancel} data-testid="promise-cancel">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
