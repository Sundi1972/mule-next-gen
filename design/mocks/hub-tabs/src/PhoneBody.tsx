import { useMemo, useSyncExternalStore } from 'react';
import { ClientProvider } from '../../../../apps/web/src/net/react';
import { PhoneGameProvider } from '../../../../apps/web/src/phone/game';
import { Hub } from '../../../../apps/web/src/phone/hub/Hub';
import { TodayState } from '../../../../apps/web/src/phone/hub/state';
import { HUB_SLOTS } from '../../../../apps/web/src/phone/hub/today';
import { PhoneMonthEndDeals } from './copied/deals/Results';
import { clientFor, viewFor, type MockTable, type Seat } from './fixture';
import { TabHub, type Start } from './proposed/Hub';
import type { ShellVariant } from './proposed/Shell';
import { BudgetVariantProvider } from './proposed/tabs/Politics';
import { TAB_SLOTS } from './proposed/today';

/** One phone on the mock table: the tabbed hub (or today's, or the month end), re-drawn as the table changes. */
export function PhoneBody({ store, seat, variant, start, budget, today, monthEnd }: { store: MockTable; seat: Seat; variant: ShellVariant; start?: Start | undefined; budget?: 'a' | 'b' | undefined; today?: boolean | undefined; monthEnd?: boolean | undefined }) {
  const world = useSyncExternalStore(store.subscribe, store.get);
  const sv = useMemo(() => viewFor(seat, world), [seat, world]);
  const client = useMemo(() => clientFor(store, seat), [store, seat]);
  return (
    <ClientProvider client={client}>
      <PhoneGameProvider value={sv}>
        {monthEnd || world.stage === 'monthEnd' ? (
          <PhoneMonthEndDeals month={world.month} />
        ) : (
          <TodayState>
            <BudgetVariantProvider initial={budget ?? 'a'}>{today ? <Hub slots={HUB_SLOTS} /> : <TabHub slots={TAB_SLOTS} variant={variant} start={start} />}</BudgetVariantProvider>
          </TodayState>
        )}
      </PhoneGameProvider>
    </ClientProvider>
  );
}
