// Copied from design/mocks/politics-deals/src/proposed/today.tsx (approved/awaiting-pick mock, 7–8 Nov); changes for the tabs are marked TABS:.
import type { AgendaSlot } from '../../../../../../apps/web/src/phone/hub/slots';
import { incomingOf } from './Deals';

/*
 * GRAFT TARGET: apps/web/src/phone/hub/today.tsx's agenda (WS6), first in the list: the hub mock's `deals` row.
 * "1 deal offer · from Lena": it leads the month's doors while a card waits for this player, and opens the card where
 * it sits (one: the pair's whisper thread; more: My cards).
 */
export const DEALS_AGENDA: AgendaSlot = {
  key: 'deals',
  show: ({ me }) => incomingOf(me).length > 0,
  title: ({ me }) => {
    const n = incomingOf(me).length;
    return `${n} deal ${n === 1 ? 'offer' : 'offers'}`;
  },
  sub: ({ view, me }) => {
    const from = [...new Set(incomingOf(me).map((c) => view.players.find((p) => p.id === c.from)?.name ?? ''))];
    return `From ${from.join(', ')} · answer before Ready`;
  },
  locked: true,
  lead: () => true,
  opens: { desk: 'talk', focus: 'deals' },
};
