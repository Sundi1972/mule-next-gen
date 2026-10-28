import type { Now } from '../../Shell';
import type { AgendaSlot, BannerSlot, DeskSlot, HubSeat } from '../slots';
import { CouncilDesk } from './Council';
import { GovernorDesk } from './Governor';
import { Offices } from './Offices';
import { officeNames } from './words';

/* The politics entries in HUB_SLOTS (../today.tsx). Each is drawn only while the table plays politics. */

const politicsOn = ({ view }: HubSeat) => view.politics !== null;
const electionOpen = ({ view }: HubSeat) => {
  const stage = view.politics?.election?.stage;
  return stage !== undefined && stage !== 'over';
};

export const OFFICES_BANNER: BannerSlot = { id: 'offices', Body: Offices, show: politicsOn };

export const ELECTION_AGENDA: AgendaSlot = {
  key: 'election',
  title: () => 'Election day',
  sub: () => `Run, then vote: ${officeNames().join(' and ')}`,
  lead: () => true,
  opens: { desk: 'council' },
  show: electionOpen,
};

export const GOVERNOR_AGENDA: AgendaSlot = { key: 'governor', title: () => "Governor's desk", sub: () => 'Set the sales tax', opens: { desk: 'governor' } };

export const COUNCIL_DESK: DeskSlot = { id: 'council', label: 'Council', icon: 'M4 10h16 M6 10v8 M10 10v8 M14 10v8 M18 10v8 M3 20h18 M12 3l9 5H3z', Body: CouncilDesk, show: politicsOn };

export const GOVERNOR_DESK: DeskSlot = {
  id: 'governor',
  label: 'Governor',
  icon: 'M4 18h16 M5 18l-1-9 5 4 3-7 3 7 5-4-1 9',
  Body: GovernorDesk,
  show: ({ view, self }) => view.politics !== null && view.politics.governor === self.id,
};

/** Now during the election's three steps, and for the new Governor once it is over. */
export function electionNow({ view, self }: HubSeat): Now | null {
  const politics = view.politics;
  const election = politics?.election;
  if (!politics || !election) return null;
  switch (election.stage) {
    case 'announce':
      return { step: 1, of: 3, title: "Run for an office, or press I'm ready", detail: `Election month: ${officeNames().join(' and ')}. A Governor candidate promises something about the tax. Then the secret ballot, then the result on every screen at once.` };
    case 'ballot': {
      const votes = politics.weights.find((w) => w.id === self.id)?.votes ?? 0;
      return { step: 2, of: 3, title: 'Cast your secret vote', detail: `One vote per office, or abstain; your vote weighs ${votes}. Then everything below is yours until you press Ready.` };
    }
    case 'ceremony':
      return { step: 3, of: 3, title: 'The ballots are in', detail: `${officeNames().join(', then ')}, revealed on every screen together.` };
    case 'over':
      if (politics.governor !== self.id || !politics.term) return null;
      return { title: 'Set the sales tax, then plan your month', detail: `You are the new Governor (months ${politics.term[0]}–${politics.term[1]}). The tax is yours to set until planning ends.` };
  }
}
