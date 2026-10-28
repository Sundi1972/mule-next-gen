import type { ReadyWords } from '../ready';
import type { Now } from '../../Shell';
import type { AgendaSlot, BannerSlot, DeskSlot, HubSeat, ReadyBarWords, StageSlot } from '../slots';
import { CouncilDesk } from './Council';
import { ballotComplete, contested, ElectionDay, ElectionDayRail } from './ElectionDay';
import { GovernorDesk } from './Governor';
import { Offices } from './Offices';
import { listNames, namer, officeNames, promiseWords, termEnd, youPromised } from './words';

/* The politics entries in HUB_SLOTS (../today.tsx). Each is drawn only while the table plays politics. */

const politicsOn = ({ view }: HubSeat) => view.politics !== null;
const electionOpen = ({ view }: HubSeat) => {
  const stage = view.politics?.election?.stage;
  return stage !== undefined && stage !== 'over';
};

export const OFFICES_BANNER: BannerSlot = { id: 'offices', Body: Offices, show: politicsOn };

/** Election day takes the stage from the announcement through the reveal (E-2). */
export const ELECTION_DAY_STAGE: StageSlot = { id: 'election-day', show: electionOpen, phase: () => 'Election day', Body: ElectionDay, Rail: ElectionDayRail };

/** E-1: running for office, any month an election is still to come; the door asks for a promise, or shows your candidacy. */
export const ELECTION_AGENDA: AgendaSlot = {
  key: 'run',
  title: () => 'Throw your hat in the ring',
  sub: ({ view, me }) => {
    const politics = view.politics!;
    const promise = politics.promises[me.id];
    if (me.politics?.running === 'governor' && promise) return `You run for Governor · ${promiseWords(promise, politics.tax.percent, false)}`;
    return `Run for Governor · election in month ${politics.next}`;
  },
  lead: () => true,
  opens: { desk: 'council', focus: 'run' },
  show: ({ view, me }) => view.politics?.next != null && (me.politics?.running != null || me.politics?.canRun.governor === true),
};

export const GOVERNOR_AGENDA: AgendaSlot = { key: 'governor', title: () => "Governor's desk", sub: () => 'Set the sales tax', opens: { desk: 'governor' } };

export const COUNCIL_DESK: DeskSlot = { id: 'council', label: 'Council', icon: 'M4 10h16 M6 10v8 M10 10v8 M14 10v8 M18 10v8 M3 20h18 M12 3l9 5H3z', Body: CouncilDesk, show: politicsOn };

const isGovernor = ({ view, self }: HubSeat) => view.politics !== null && view.politics.governor === self.id;

export const GOVERNOR_DESK: DeskSlot = {
  id: 'governor',
  label: 'Governor',
  icon: 'M4 18h16 M5 18l-1-9 5 4 3-7 3 7 5-4-1 9',
  Body: GovernorDesk,
  show: isGovernor,
  first: isGovernor,
};

/** E-10: the host's line is the same in every stage that waits for people; only what you finish differs. */
const STILL = 'Still waiting for';
const ANNOUNCE_WORDS: ReadyWords = {
  ready: 'Ready to vote',
  done: "You're ready to vote",
  waiting: STILL,
  all: 'Everyone is ready. The ballot opens.',
  confirm: (names) => `Open the ballot for everyone now? ${names} can still vote until it closes.`,
};
/** An announce with no office for two candidates opens no ballot: the reveal follows it. */
const NO_BALLOT_WORDS: ReadyWords = { ...ANNOUNCE_WORDS, all: 'Everyone is ready. The reveal starts.', confirm: (names) => `Go on without ${names}? The candidates close as they are.` };
const BALLOT_WORDS: ReadyWords = {
  ready: 'Cast my vote',
  done: 'You voted',
  waiting: STILL,
  all: 'Everyone has voted. The reveal starts.',
  confirm: (names, n) => `Close the ballot for everyone now? ${n === 1 ? `${names}’s vote` : `The votes of ${names}`} won’t count, and the reveal starts.`,
};

/** The ready bar's words on election day: Ready to vote, then Cast my vote, live once every office is picked. */
export function electionReadyWords({ view, me }: HubSeat): ReadyBarWords | null {
  const politics = view.politics;
  const election = politics?.election;
  if (!election) return null;
  if (election.stage === 'announce') return contested(politics.candidates).length > 0 ? ANNOUNCE_WORDS : NO_BALLOT_WORDS;
  if (election.stage === 'ballot') return { ...BALLOT_WORDS, label: 'VOTED', canReady: ballotComplete(view, me.politics?.ballot ?? {}, election) };
  return null;
}

/** Now during the election's three steps, and for the new Governor once it is over. */
export function electionNow({ view, self }: HubSeat): Now | null {
  const politics = view.politics;
  const election = politics?.election;
  if (!politics || !election) return null;
  const humans = new Set(view.players.filter((p) => !p.isAi).map((p) => p.id));
  const left = election.waitingFor.filter((id) => humans.has(id) && id !== self.id);
  const waiting = listNames(left, self.id, namer(view));
  switch (election.stage) {
    case 'announce':
      if (self.ready)
        return {
          step: 1,
          of: 3,
          title: left.length ? `You're ready. Still waiting for ${waiting}` : 'Everyone is ready',
          // The seat can't tell the host; these words hold for every phone.
          detail: 'The secret ballot opens once everyone is ready, or when the host opens it without someone who is away.',
        };
      return { step: 1, of: 3, title: `Election day: ${officeNames().join(' and ')}`, detail: 'Read who runs and on what promise, then tap Ready to vote. No clock: the ballot opens once everyone is ready.' };
    case 'ballot':
      if (self.ready)
        return {
          step: 2,
          of: 3,
          title: left.length ? `You voted. Still waiting for ${waiting}` : 'Everyone has voted',
          detail: 'Change your vote until the last one is in, or until the host closes the ballot for someone who is away.',
        };
      return { step: 2, of: 3, title: 'Vote in secret', detail: 'Pick one, or abstain, then Cast my vote. Nobody sees whom you chose. No clock: it closes once everyone has voted.' };
    case 'ceremony':
      return { step: 3, of: 3, title: 'The ballot is closed', detail: 'The reveal starts on the TV and every phone.' };
    case 'over': {
      if (politics.governor !== self.id || !politics.term) return null;
      const promise = politics.promise ? ` ${youPromised(politics.promise, politics.tax.start)}` : '';
      return { title: 'Set the sales tax', detail: `Then plan your month. You are the new Governor, until month ${termEnd(politics.next, view.maxMonths)}.${promise}` };
    }
  }
}
