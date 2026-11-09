import { Hub } from './hub/Hub';
import { TodayState } from './hub/state';
import { TAB_SLOTS } from './hub/today';

/**
 * Planning: everyone at once, and the hub for the month as tabs (SB-2, the approved hub-tabs mock): Overview with the
 * one map, Governor / Council, Colony and Talk; Now and the "?" in the rail; Ready at the bottom. The frame draws the
 * slots in TAB_SLOTS, which WS7 extends with politics and WS8 with Guard (hub/slots.ts).
 */
export function Planning() {
  return (
    <TodayState>
      <Hub slots={TAB_SLOTS} />
    </TodayState>
  );
}
