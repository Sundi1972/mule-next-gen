import type { MockWorld } from '../fixture';

/*
 * STUB, owned from here on by mock-hub-tv (src/tv/** on its own branch). The contract the guided prototype calls:
 *   TvFor({ world, focus }) draws the TV (1280 × 720) for the table's world at this step; `focus` names what the step
 *   is about, so the TV can show it. Build the public view with boardViewFor(world) from ../fixture.
 * This stub only names the focus, so the phone side compiles and runs before the TV lands.
 */

export type TvFocus = 'planning' | 'deal-offered' | 'deal-broken' | 'budget-set' | 'overrule-called' | 'overrule-reveal' | 'guarding' | 'waiting' | 'month-end';

export function TvFor({ world, focus }: { world: MockWorld; focus: TvFocus }): JSX.Element {
  return (
    <div className="grid h-[720px] w-[1280px] place-items-center bg-table text-ink" data-testid="tv-stub">
      <div className="flex flex-col items-center gap-2">
        <span className="label-caps">TV · stub until mock-hub-tv lands</span>
        <span className="font-display text-5xl font-semibold" data-testid="tv-focus">
          {focus}
        </span>
        <span className="font-mono text-ink-3">
          month {world.month} · {world.stage}
        </span>
      </div>
    </div>
  );
}
