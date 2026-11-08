import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { ClientProvider } from '../../../../apps/web/src/net/react';
import { PhoneGameProvider } from '../../../../apps/web/src/phone/game';
import { Hub } from '../../../../apps/web/src/phone/hub/Hub';
import { TodayState, useToday } from '../../../../apps/web/src/phone/hub/state';
import { HUB_SLOTS } from '../../../../apps/web/src/phone/hub/today';
import { PhoneMonthEndDeals } from './copied/deals/Results';
import { clientFor, viewFor, type MockTable, type Seat } from './fixture';
import { TabHub, type Start } from './proposed/Hub';
import { PhoneProduction } from './proposed/PhoneProduction';
import { SabotageMonthEnd } from './proposed/SabotageMonthEnd';
import type { ShellVariant } from './proposed/Shell';
import { BudgetVariantProvider } from './proposed/tabs/Politics';
import { TAB_SLOTS } from './proposed/today';

/** Sets Look's plot once as the phone opens, as a tap on Overview's map would (the Sheriff path's order). */
function Looking({ x, y }: { x: number; y: number }) {
  const { setLooked } = useToday();
  useEffect(() => setLooked({ x, y }), [x, y, setLooked]);
  return null;
}

/** One phone on the mock table: the tabbed hub (or today's, or the month end), re-drawn as the table changes. */
export function PhoneBody({ store, seat, variant, start, budget, today, monthEnd }: { store: MockTable; seat: Seat; variant: ShellVariant; start?: Start | undefined; budget?: 'a' | 'b' | undefined; today?: boolean | undefined; monthEnd?: boolean | undefined }) {
  const world = useSyncExternalStore(store.subscribe, store.get);
  const sv = useMemo(() => viewFor(seat, world), [seat, world]);
  const client = useMemo(() => clientFor(store, seat), [store, seat]);
  return (
    <ClientProvider client={client}>
      <PhoneGameProvider value={sv}>
        {monthEnd || world.stage === 'monthEnd' ? (
          <PhoneMonthEndDeals month={world.month} extra={<SabotageMonthEnd world={world} seat={seat} />} />
        ) : world.stage === 'production' ? (
          <PhoneProduction store={store} />
        ) : (
          <TodayState>
            {start?.look && <Looking {...start.look} />}
            <BudgetVariantProvider initial={budget ?? 'a'}>{today ? <Hub slots={HUB_SLOTS} /> : <TabHub slots={TAB_SLOTS} variant={variant} start={start} />}</BudgetVariantProvider>
          </TodayState>
        )}
      </PhoneGameProvider>
    </ClientProvider>
  );
}
