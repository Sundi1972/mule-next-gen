import { Button } from '@mule/ui';
import type { ReactNode } from 'react';
import { Board, Game, LaptopFrame, PhoneFrame, TvFrame } from '../../harness';
import { IntentNotes, IntentNotesProvider, type IntentNoteData } from '../../proposed/IntentNote';
import { AnyMonth, Announce, ANY_MONTH, AWAY, Ballot, ELECTION_MONTH, ELECTION_NOTES, electionView, NewGovernor, OFFICES, TvAnnounce, TvBallot } from './ElectionAudit';
import { beatLabel, PhoneRevealSolo, PhoneRevealWithTv, revealStills, timeline, TvReveal, useRevealClock } from './ElectionReveal';

/**
 * The review page around the election's audit mock (ElectionAudit.tsx, ElectionReveal.tsx): the frames, the notes
 * beside them, and the reveal's controls and stills. Review furniture only: nothing here is grafted.
 */

export const ELECTION_LINKS = [
  { id: 'audit-election', title: 'Election 1 · run for office, any month' },
  { id: 'audit-election-announce', title: 'Election 2 · election day: the announcement' },
  { id: 'audit-election-ballot', title: 'Election 3 · the ballot, no clock' },
  { id: 'audit-election-reveal', title: 'Election 4 · the reveal ceremony' },
  { id: 'audit-election-governor', title: 'Election 5 · the new Governor sets the tax' },
];

const STILL = 'audit-election-reveal-';

/** The route a hash names, the reveal's stills included (#audit-election-reveal-governor-tie), or null. */
export function electionRoute(hash: string): { main: string; title: string; still?: { id: string; title: string; t: number } } | null {
  const main = ELECTION_LINKS.find((l) => l.id === hash);
  if (main) return { main: main.id, title: main.title };
  if (!hash.startsWith(STILL)) return null;
  const still = revealStills(OFFICES).find((s) => s.id === hash.slice(STILL.length));
  return still ? { main: 'audit-election-reveal', title: `Election 4 · the reveal, still: ${still.title}`, still } : null;
}

type Key = keyof typeof ELECTION_NOTES;
const notes = (...ids: Key[]): IntentNoteData[] => ids.map((id) => ELECTION_NOTES[id]);

const NOTES: Record<string, IntentNoteData[]> = {
  'audit-election': notes('E1', 'E3', 'E4', 'E9'),
  'audit-election-announce': notes('E2', 'E3', 'E4', 'E10'),
  'audit-election-ballot': notes('E2', 'E4', 'E5', 'E10'),
  'audit-election-reveal': notes('E2', 'E4', 'E6', 'E8'),
  'audit-election-governor': notes('E7', 'E9', 'E10', 'E8', 'E6'),
};

const INTRO: Record<string, string> = {
  'audit-election': `Month ${ANY_MONTH}, no election: the hub with the Council desk open. Heiko ruled there is no clock anywhere, and you can run in any month. Ossa is Governor until month 3; Kai already runs, promising up to 8%. The phone opens before Lena runs: tap “Throw your hat in the ring”, “Run for office ›” or Run for Governor. The laptop opens one tap later, Lena running on up to 4%.`,
  'audit-election-announce': `Month ${ELECTION_MONTH} opens with election day, on every phone and the TV: who runs, on what promise, then vote. Governor only (Heiko). Kai’s phone is locked; Ossa and Brix are ready to vote. The phone opens before Lena taps Ready to vote; the laptop after, so it shows the host’s Continue (E-10). The TV shows the same moment as the laptop.`,
  'audit-election-ballot': `The secret ballot, with no clock: it closes when everybody has voted, or when the host closes it for someone away. Ossa and Brix have voted; Kai is away. The phone opens before Lena votes (pick, then Cast my vote); the laptop after, with the host’s Continue: try it, it confirms and posts “Lena closed the ballot without Kai”.`,
  'audit-election-reveal': `Once everybody has voted (here Kai came back and did), the reveal: the TV carries it, one office at a time, Governor only for now. Then a phone beside the TV, which never gets ahead of it, and a phone with no TV in the room, which carries the ceremony itself. One clock drives all three: Replay, pause or scrub, or open a still of each beat.`,
  'audit-election-governor': `Month ${ELECTION_MONTH} after the reveal: Lena is the new Governor, and planning goes on. The phone opens on the Governor’s desk as it is when the month opens, at last month’s 5%, over her promise; the laptop after Set at 4%, and ready, so it shows the third Continue of the month (Kai is still away).`,
};

function Stills({ current }: { current?: string }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" data-testid="reveal-stills">
      <li className="text-ink-2">Stills:</li>
      {revealStills(OFFICES).map((s) => (
        <li key={s.id}>
          <a href={`#${STILL}${s.id}`} className={s.id === current ? 'text-ink' : 'text-holo underline'} data-testid={`still-${s.id}`}>
            {s.title}
          </a>
        </li>
      ))}
    </ul>
  );
}

function RevealFrames({ fixed, stillId }: { fixed: number | null; stillId?: string }) {
  const end = timeline(OFFICES).end;
  const clock = useRevealClock(end, fixed);
  return (
    <>
      <div className="flex max-w-[960px] flex-wrap items-center gap-3 rounded-panel border border-holo-line bg-panel px-3 py-2" data-testid="reveal-controls">
        <Button size="md" onClick={clock.replay} data-testid="reveal-replay">
          Replay
        </Button>
        <Button size="md" variant="outline" onClick={clock.toggle} data-testid="reveal-play">
          {clock.playing ? 'Pause' : 'Play'}
        </Button>
        <input type="range" min={0} max={end} step={0.05} value={clock.t} onChange={(e) => clock.seek(Number(e.target.value))} className="min-w-[200px] flex-1 accent-[var(--color-holo)]" aria-label="Scrub the ceremony" data-testid="reveal-scrub" />
        <span className="w-64 font-mono text-sm text-ink-2" data-testid="reveal-beat">
          {clock.t.toFixed(1)} s · {beatLabel(OFFICES, clock.t)}
        </span>
      </div>
      <Stills {...(stillId ? { current: stillId } : {})} />
      <TvFrame>
        <Board view={electionView(ELECTION_MONTH)}>
          <TvReveal offices={OFFICES} t={clock.t} />
        </Board>
      </TvFrame>
      <p className="max-w-[844px] text-sm text-ink-2">Lena’s phone beside the TV: it says look up, holds each result until the TV has named the winner, and celebrates her own win.</p>
      <PhoneFrame>
        <PhoneRevealWithTv offices={OFFICES} t={clock.t} />
      </PhoneFrame>
      <p className="max-w-[844px] text-sm text-ink-2">Lena’s phone with no TV in the room: the same ceremony, sized for the phone.</p>
      <PhoneFrame>
        <PhoneRevealSolo offices={OFFICES} t={clock.t} />
      </PhoneFrame>
    </>
  );
}

/** The frames and notes for one election route. Each frame is one of Lena's screens unless it says otherwise. */
export function ElectionAuditPage({ hash }: { hash: string }) {
  const route = electionRoute(hash);
  if (!route) return null;
  const day = electionView(ELECTION_MONTH, ['ossa', 'brix']);
  let frames: ReactNode;
  switch (route.main) {
    case 'audit-election':
      frames = (
        <>
          <PhoneFrame>
            <Game view={electionView(ANY_MONTH, ['ossa', 'kai'])}>
              <AnyMonth key="p" />
            </Game>
          </PhoneFrame>
          <LaptopFrame>
            <Game view={electionView(ANY_MONTH, ['ossa', 'kai'])}>
              <AnyMonth key="l" running />
            </Game>
          </LaptopFrame>
        </>
      );
      break;
    case 'audit-election-announce':
      frames = (
        <>
          <PhoneFrame>
            <Game view={day} away={AWAY}>
              <Announce key="p" />
            </Game>
          </PhoneFrame>
          <LaptopFrame>
            <Game view={day} away={AWAY}>
              <Announce key="l" ready />
            </Game>
          </LaptopFrame>
          <TvFrame>
            <Board view={day}>
              <TvAnnounce />
            </Board>
          </TvFrame>
        </>
      );
      break;
    case 'audit-election-ballot':
      frames = (
        <>
          <PhoneFrame>
            <Game view={day} away={AWAY}>
              <Ballot key="p" />
            </Game>
          </PhoneFrame>
          <LaptopFrame>
            <Game view={day} away={AWAY}>
              <Ballot key="l" voted />
            </Game>
          </LaptopFrame>
          <TvFrame>
            <Board view={day}>
              <TvBallot />
            </Board>
          </TvFrame>
        </>
      );
      break;
    case 'audit-election-reveal':
      frames = <RevealFrames fixed={route.still?.t ?? null} {...(route.still ? { stillId: route.still.id } : {})} />;
      break;
    default:
      frames = (
        <>
          <PhoneFrame>
            <Game view={day} away={AWAY}>
              <NewGovernor key="p" />
            </Game>
          </PhoneFrame>
          <LaptopFrame>
            <Game view={day} away={AWAY}>
              <NewGovernor key="l" set={4} ready />
            </Game>
          </LaptopFrame>
        </>
      );
  }
  const list = NOTES[route.main]!;
  return (
    <>
      <p className="max-w-[900px] text-sm text-ink-2" data-testid="election-intro">
        {INTRO[route.main]} Each number on a screen marks one change; the notes beside say which player intent it serves and why it was made.
      </p>
      <IntentNotesProvider>
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex min-w-0 flex-col gap-4">{frames}</div>
          <IntentNotes className="w-[420px] max-w-full" title={`${list.length} changes here, and why`} intro="One card per change. Hover one and its numbers light up on every screen. “Serves intent” quotes the player intent from the audit; “Why” is what the audit found, or Heiko’s ruling." notes={list} />
        </div>
      </IntentNotesProvider>
    </>
  );
}
