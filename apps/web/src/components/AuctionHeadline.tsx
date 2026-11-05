import type { Good } from '@mule/engine';
import { GOOD_NAME, GoodIcon } from '@mule/ui';
import type { ReactNode } from 'react';

/**
 * What the goods auction is about, leading the main pane (Heiko at the table, 5 Nov): the good's glyph and its name,
 * large, then the stage's own words (who has picked, the clock, "closed"). The same on a sideways phone and, larger, in
 * the laptop's wide shell; the rail keeps its small line.
 */
export function AuctionHeadline({ good, children }: { good: Good; children?: ReactNode }) {
  return (
    <div className="mb-1.5 flex min-w-0 shrink-0 items-center gap-2 @min-[1100px]/shell:mb-3 @min-[1100px]/shell:gap-4" data-testid="auction-headline" data-good={good}>
      <span className="flex shrink-0 items-center gap-1.5 @min-[1100px]/shell:gap-3">
        <GoodIcon good={good} size={22} className="@min-[1100px]/shell:size-11" />
        <span className="font-display text-xl font-semibold leading-none @min-[1100px]/shell:text-4xl" data-testid="auction-good">
          {GOOD_NAME[good]}
        </span>
      </span>
      {children}
    </div>
  );
}
