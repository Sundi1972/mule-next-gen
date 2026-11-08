import { cx } from '@mule/ui';
import { usePhoneGame } from '../../game';
import { useDrawn, useHub } from '../Hub';
import type { DeskSlot, HubSeat, SubTabSlot } from '../slots';
import { TabBadge } from './parts';

/*
 * The Governor / Council tab (the approved hub-tabs mock): one tab, "Governor" on the Governor's phone and "Council" on
 * every other, its sub-tabs in a row and the open one's body under them, scrolling on its own. Until SB-3 splits them
 * into Laws, Budget and Elections, the sub-tabs are today's politics desks as they are (asDeskSub).
 */

const isGovernor = ({ view, self }: Pick<HubSeat, 'view' | 'self'>) => view.politics?.governor === self.id;
const ballotOpen = ({ view }: Pick<HubSeat, 'view'>) => {
  const election = view.politics?.election?.stage;
  return view.politics?.council?.stage === 'ballot' || election === 'announce' || election === 'ballot';
};

/** Today's politics desk as a sub-tab: its id, label, body, badge, show and first, unchanged. */
export function asDeskSub({ id, label, Body, Badge, show, first }: DeskSlot): SubTabSlot {
  return { id, label: () => label, Body, ...(Badge ? { Badge } : {}), ...(show ? { show } : {}), ...(first ? { first } : {}) };
}

/** The tab's badge, while a ballot is open and the tab is not: VOTE. */
export function PoliticsBadge() {
  const { view } = usePhoneGame();
  const { tab } = useHub();
  if (tab === 'politics' || !ballotOpen({ view })) return null;
  return (
    <TabBadge tone="warn" label="A ballot is open: vote here" testid="politics-badge">
      VOTE
    </TabBadge>
  );
}

export function PoliticsTab() {
  const { subs, seat } = useDrawn();
  const nav = useHub();
  const sub = subs.find((s) => s.id === nav.sub) ?? subs[0];
  if (!sub) return null;
  const Body = sub.Body;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2" data-testid={`politics-${isGovernor(seat) ? 'governor' : 'council'}`}>
      <div role="tablist" aria-label={isGovernor(seat) ? 'Governor' : 'Council'} className="flex shrink-0 gap-1" data-testid="sub-tabs">
        {subs.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={s.id === sub.id}
            onClick={() => nav.open({ tab: 'politics', sub: s.id })}
            className={cx('relative flex h-9 min-w-0 flex-1 items-center justify-center rounded-control border px-1 text-xs font-semibold', s.id === sub.id ? 'border-holo bg-holo-soft text-holo' : 'border-holo-line text-ink-2 hover:text-ink')}
            data-testid={`sub-${s.id}`}
          >
            <span className="truncate">{s.label(seat)}</span>
            {s.Badge && <s.Badge />}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto *:shrink-0" data-testid={`sub-body-${sub.id}`}>
        <Body />
      </div>
    </div>
  );
}
