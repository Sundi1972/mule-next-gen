import { GAME } from '@mule/engine';
import { cx } from '@mule/ui';
import { usePhoneGame } from '../game';
import { roadmapSteps } from './month-steps';
import type { BannerSlot } from './slots';

/**
 * At the top of the stage: the month's steps in order with this one lit, one plain line on what to do now and what
 * comes next, and under it the lines it is given, such as the offices.
 */
export function Roadmap({ lines }: { lines: BannerSlot[] }) {
  const { view, self } = usePhoneGame();
  const steps = roadmapSteps(view);
  return (
    <section
      className="relative flex shrink-0 flex-col gap-1 rounded-panel border border-holo-line bg-panel px-2 py-1.5 @min-[1100px]/shell:gap-2 @min-[1100px]/shell:px-4 @min-[1100px]/shell:py-3"
      aria-label={`Month ${view.month}: step 1 of ${steps.length}, planning`}
      data-testid="roadmap"
    >
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5 @min-[1100px]/shell:gap-x-2" data-testid="roadmap-steps">
        {steps.map((s, i) => (
          <li key={s.id} className="flex shrink-0 items-center gap-1 @min-[1100px]/shell:gap-2" aria-current={i === 0 ? 'step' : undefined} data-testid={`step-${s.id}`}>
            {i > 0 && (
              <svg aria-hidden viewBox="0 0 24 24" width={10} height={10} className="text-ink-3" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            )}
            <span
              className={cx(
                'whitespace-nowrap rounded-chip text-[11px] font-semibold leading-5 @min-[1100px]/shell:text-base @min-[1100px]/shell:leading-8',
                i === 0 ? 'bg-holo px-1.5 text-on-holo @min-[1100px]/shell:px-3' : 'text-ink-2',
              )}
            >
              {i === 0 && <span className="sr-only">Now: </span>}
              {s.label}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-[11px] leading-snug @min-[1100px]/shell:text-base" data-testid="roadmap-now">
        {self.ready ? (
          <>
            <strong className="text-holo">Now:</strong> you're ready; the rest are still planning. <strong>Next:</strong> the land grant, where you claim up to {GAME.claimsPerGrant} free plots.
          </>
        ) : (
          <>
            <strong className="text-holo">Now:</strong> look around, scout land if you like, then press Ready. <strong>Next:</strong> you claim up to {GAME.claimsPerGrant} free plots.
          </>
        )}
      </p>
      {lines.map(({ id, Body }) => (
        <Body key={id} />
      ))}
    </section>
  );
}
