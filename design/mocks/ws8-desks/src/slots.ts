import type { HubSlots } from '../../../../apps/web/src/phone/hub/slots';
import { HUB_SLOTS } from '../../../../apps/web/src/phone/hub/today';
import { ColonyDeskC35 } from './colony-desk';
import { COUNCIL_STAGE, CouncilDeskC46, councilNow, councilReadyWords, GOVERNOR_AGENDA_C46, GovernorDeskC46, LAW_AGENDA } from './law-desk';

/**
 * The real HUB_SLOTS (apps/web/src/phone/hub/today.tsx, with WS7's politics slots), and only these changes:
 * the Colony, Council and Governor desks' bodies, the Governor's door, the law's agenda item, the ballot's stage,
 * Now and Done. GRAFT: apps/web/src/phone/hub/politics/slots.ts and today.tsx (WS7).
 */
const BODY: Record<string, HubSlots['desks'][number]['Body']> = { colony: ColonyDeskC35, council: CouncilDeskC46, governor: GovernorDeskC46 };

export const MOCK_SLOTS: HubSlots = {
  ...HUB_SLOTS,
  desks: HUB_SLOTS.desks.map((d) => (BODY[d.id] ? { ...d, Body: BODY[d.id]! } : d)),
  agenda: [LAW_AGENDA, ...HUB_SLOTS.agenda.map((a) => (a.key === 'governor' ? GOVERNOR_AGENDA_C46 : a))],
  stage: [...(HUB_SLOTS.stage ?? []), COUNCIL_STAGE],
  nows: [...HUB_SLOTS.nows, councilNow],
  readyWords: [...(HUB_SLOTS.readyWords ?? []), councilReadyWords],
};
