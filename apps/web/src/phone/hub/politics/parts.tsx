import { POLITICS } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { Creature, cx, SLOT_COLOR } from '@mule/ui';
import type { ReactNode } from 'react';
import { slotOf } from '../../../game/derive';

export function Section({ title, children, testid }: { title: ReactNode; children: ReactNode; testid?: string }) {
  return (
    <section className="flex flex-col gap-1.5 @min-[1100px]/shell:gap-2" data-testid={testid}>
      <h3 className="label-caps flex items-center gap-1.5 @min-[1100px]/shell:text-xs!">{title}</h3>
      {children}
    </section>
  );
}

/** A player by name, with their creature in their seat's colour; "You" for `me`. */
export function Who({ view, id, size = 16, me = null, className, testid }: { view: Pick<MuleView, 'players'>; id: string; size?: number; me?: string | null; className?: string; testid?: string }) {
  const p = view.players.find((q) => q.id === id);
  if (!p) return null;
  return (
    <span className={cx('inline-flex items-center gap-1 font-semibold', className)} data-testid={testid}>
      <Creature species={p.species} color={colorOf(view, id)} size={size} />
      {id === me ? 'You' : p.name}
    </span>
  );
}

/** A player by creature and name, on one line; "You" on your own screen. */
export function Person({ view, id, me, size = 16, className }: { view: Pick<MuleView, 'players'>; id: string; me: string | null; size?: number; className?: string }) {
  return <Who view={view} id={id} me={me} size={size} className={cx('whitespace-nowrap', className)} testid={`person-${id}`} />;
}

/** A seat's colour, for vote blocks. */
export const colorOf = (view: Pick<MuleView, 'players'>, id: string) => SLOT_COLOR[slotOf(view, id) ?? 0];

const STEPS = ['Who runs', 'Vote', 'Reveal'] as const;

/** Election day's three steps, the current one lit: no clock on any of them. */
export function Steps({ at, tv = false }: { at: 1 | 2 | 3; tv?: boolean }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5" aria-label={`Step ${at} of 3`} data-testid="election-steps">
      {STEPS.map((s, i) => {
        const n = i + 1;
        return (
          <li key={s} className="flex items-center gap-1" aria-current={n === at ? 'step' : undefined} data-testid={`election-step-${n}`}>
            {i > 0 && (
              <svg aria-hidden viewBox="0 0 24 24" width={tv ? 20 : 10} height={tv ? 20 : 10} className="text-ink-3" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            )}
            <span
              className={cx(
                'whitespace-nowrap rounded-chip font-semibold',
                tv ? 'px-3 text-2xl leading-10' : 'px-1.5 text-[11px] leading-5 @min-[1100px]/shell:px-3 @min-[1100px]/shell:text-base @min-[1100px]/shell:leading-8',
                n === at ? 'bg-holo text-on-holo' : n < at ? 'text-ok' : 'text-ink-2',
              )}
            >
              {n} {s}
              {n < at && ' ✓'}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** E-3: what the Governor is for, in one card. */
export function OfficesCard({ tv = false }: { tv?: boolean }) {
  return (
    <section
      className={cx('relative flex min-w-0 flex-col rounded-panel border border-holo-line bg-panel', tv ? 'gap-2 px-6 py-4' : 'gap-1 p-2 @min-[1100px]/shell:gap-2 @min-[1100px]/shell:p-4')}
      data-testid="offices-card"
    >
      <span className={cx('label-caps', tv ? 'text-base!' : 'text-[10px]! @min-[1100px]/shell:text-xs!')}>What the Governor does</span>
      <dl className={cx('grid grid-cols-[auto_1fr] gap-x-2 leading-snug', tv ? 'gap-y-1 text-xl' : 'gap-y-0.5 text-xs @min-[1100px]/shell:gap-y-1 @min-[1100px]/shell:text-sm')}>
        <dt className="font-semibold">Governor</dt>
        <dd data-testid="job-governor">
          Sets the sales tax each month; the tax fills the colony fund. Paid {POLITICS.pay.governor} cr a month.
        </dd>
      </dl>
      <span className={cx('text-ink-2', tv ? 'text-lg' : 'text-[11px] @min-[1100px]/shell:text-sm')} data-testid="job-term">
        A term lasts until the next election and adds {POLITICS.termScore} to your final score.
      </span>
    </section>
  );
}
