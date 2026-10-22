import { Hub } from './hub/Hub';
import { TodayState } from './hub/state';
import { HUB_SLOTS } from './hub/today';

/**
 * Planning: everyone at once, and the hub for the month (C17). "This month" and the colony map on the stage, with
 * Look, the geo drone and selling a plot as the map's tools; Now, then the Colony, Talk and Market desks in the
 * rail; Ready at the bottom. The frame draws the slots in HUB_SLOTS, which WS7 extends with politics (hub/slots.ts).
 */
export function Planning() {
  return (
    <TodayState>
      <Hub slots={HUB_SLOTS} />
    </TodayState>
  );
}
