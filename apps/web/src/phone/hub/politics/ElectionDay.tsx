import { POLITICS, type Office, type TaxPromise } from '@mule/engine';
import type { ElectionView, MuleIntent, MuleView, MyPoliticsView, MyView, PoliticsView } from '@mule/protocol';
import { cx } from '@mule/ui';
import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { SeatWords } from '../../../components/SeatWords';
import { useClient } from '../../../net/react';
import { usePhoneGame } from '../../game';
import { useWide } from '../../Shell';
import { OfficesCard, Person, Steps } from './parts';
import { PhoneRevealSolo, PhoneRevealWithTv, showOf } from './Reveal';
import { enterRoom, onRoomChange } from './room';
import { RunBlock } from './Run';
import { OFFICE_NAME, officeNames, promiseWords, sheriffRecordWords, termEnd } from './words';

/** Election day on the stage (E-2): the announcement, the secret ballot, then the reveal over the whole phone. */
export function ElectionDay() {
  const { view, table } = usePhoneGame();
  const election = view.politics?.election;
  // The picks belong to this room: a ballot of another room (seat ids restart at s1 in each) opens empty, whatever closed the last.
  const other = enterRoom(table.code);
  useEffect(() => {
    if (other) changed();
  });
  // The picks are forgotten when the ballot closes, not when it unmounts: a switch to another sub-tab unmounts it too (S3-RULE-12).
  useEffect(() => {
    if (election && election.stage !== 'ballot') forgetPicks();
  }, [election?.stage]);
  if (!election) return null;
  if (election.stage === 'announce') return <Announce />;
  if (election.stage === 'ballot') return <Ballot election={election} />;
  const show = showOf(view);
  if (election.stage !== 'ceremony' || !show) return null;
  return <div className="fixed inset-0 z-30">{table.boards > 0 ? <PhoneRevealWithTv show={show} /> : <PhoneRevealSolo show={show} />}</div>;
}

/** Under Now on election day: month 1's announce is the time to run (AM-21); no other stage takes a run. */
export function ElectionDayRail() {
  const { me, view } = usePhoneGame();
  const mayRun = view.politics?.election?.stage === 'announce' && POLITICS.offices.some((o) => me.politics?.canRun[o] === true);
  return mayRun ? <RunBlock /> : null;
}

/** The offices with a ballot: two candidates or more. */
export const contested = (candidates: ElectionView['candidates']): Office[] => POLITICS.offices.filter((o) => (candidates[o]?.length ?? 0) >= 2);

type Promised = NonNullable<MyPoliticsView['promised']>['election'][Office];

/** "You promised Brix your vote", or, when the vote is for someone else: "You promised Kai your vote for Brix". */
export function promisedLine(view: Pick<MuleView, 'players'>, p: { candidate: string; to: string[] }): string {
  const name = (id: string) => view.players.find((q) => q.id === id)?.name ?? id;
  const to = p.to.map(name).join(' and ');
  return p.to.length === 1 && p.to[0] === p.candidate ? `You promised ${to} your vote` : `You promised ${to} your vote for ${name(p.candidate)}`;
}

/** The seats promisedLine names, in its words' order, for SeatWords. */
const promisedWho = (p: { candidate: string; to: string[] }): string[] => (p.to.length === 1 && p.to[0] === p.candidate ? p.to : [...p.to, p.candidate]);

/** The line under a promised ballot's legend: to whom, and what keeping and breaking it does. */
export function YouPromised({ words, testid }: { words: ReactNode; testid: string }) {
  const { voteBroken } = POLITICS.reputation.moves;
  return (
    <span className="flex flex-col gap-0.5 rounded-control border border-holo bg-holo-soft px-1.5 py-1" data-testid={testid}>
      <span className="text-xs font-semibold leading-tight @min-[1100px]/shell:text-base">{words}</span>
      <span className="text-[10px] leading-tight text-ink-2 @min-[1100px]/shell:text-sm">
        Keeping it builds your name. Breaking it costs −{-voteBroken}, and the table sees it. Your vote stays secret either way.
      </span>
    </span>
  );
}

/** Election day on a phone's or laptop's stage: the card every step of it lives in. */
function DayCard({ at, testid, children }: { at: 1 | 2; testid: string; children: ReactNode }) {
  return (
    <section
      className="relative flex min-w-0 flex-col gap-1.5 rounded-panel border-2 border-holo bg-panel p-2.5 shadow-glow animate-[show-card-in_0.5s_ease-out_both] @min-[1100px]/shell:gap-4 @min-[1100px]/shell:p-6"
      aria-label={`Election day, step ${at} of 3`}
      data-testid={testid}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="font-display text-base font-semibold leading-tight @min-[1100px]/shell:text-3xl" data-testid="day-title">
          Election day: {officeNames().join(' and ')}
        </h2>
        <span className="ml-auto">
          <Steps at={at} />
        </span>
      </div>
      {children}
    </section>
  );
}

/** Who runs for what, each Governor candidate's promise as a change from today (E-4). */
function Field({ candidates, promises, testid }: { candidates: PoliticsView['candidates']; promises: PoliticsView['promises']; testid: string }) {
  const { view, me } = usePhoneGame();
  const wide = useWide();
  const tax = view.politics!.tax.percent;
  return (
    <div className={cx('grid min-w-0 gap-1.5 @min-[1100px]/shell:gap-4', POLITICS.offices.length > 1 ? 'grid-cols-2' : 'grid-cols-1')} data-testid={testid}>
      {POLITICS.offices.map((o) => (
        <div key={o} className="flex min-w-0 flex-col gap-1 rounded-control border border-holo-line p-1.5 @min-[1100px]/shell:gap-2 @min-[1100px]/shell:p-3" data-testid={`${testid}-${o}`}>
          <span className="text-xs font-semibold text-ink-2 @min-[1100px]/shell:text-lg">{OFFICE_NAME[o]}</span>
          {(candidates[o] ?? []).length === 0 ? (
            <span className="text-xs text-ink-3 @min-[1100px]/shell:text-base">nobody yet</span>
          ) : (
            candidates[o]!.map((id) => (
              <span key={id} className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-xs @min-[1100px]/shell:text-lg" data-testid={`${testid}-${o}-${id}`}>
                <Person view={view} id={id} me={me.id} size={wide ? 26 : 15} className="self-center" />
                {o === 'governor' && <span className="text-ink-2">{promiseWords(promises[id], tax)}</span>}
              </span>
            ))
          )}
        </div>
      ))}
    </div>
  );
}

/** The announcement: who runs, on which promise, what the Governor does; the ballot opens once everyone is ready. */
function Announce() {
  const { view } = usePhoneGame();
  const politics = view.politics!;
  const record = sheriffRecordWords(politics, view);
  return (
    <DayCard at={1} testid="announce">
      <p className="text-xs text-ink-2 @min-[1100px]/shell:text-lg">
        The colony elects its {officeNames().join(' and ')} for months {view.month} to {termEnd(politics.next, view.maxMonths)}. The candidates:
      </p>
      {record && (
        <p className="text-xs text-ink-2 @min-[1100px]/shell:text-lg" data-testid="sheriff-record">
          {/* Two unbreakable halves: a long name may push the counts to a second line, but never splits a phrase. */}
          <span className="whitespace-nowrap">
            <SeatWords text={record.lead} who={record.who} players={view.players} />
          </span>{' '}
          <span className="whitespace-nowrap">{record.counts}</span>
        </p>
      )}
      <div className="grid grid-cols-2 items-start gap-2 @min-[1100px]/shell:gap-4">
        {/* Until the ballot opens the candidacy is Politics'. */}
        <Field candidates={politics.candidates} promises={politics.promises} testid="announce-field" />
        <OfficesCard />
      </div>
      <p className="font-display text-sm font-semibold text-holo @min-[1100px]/shell:text-2xl" data-testid="vote-on-phone">
        Then vote<span className="hidden @min-[1100px]/shell:inline">, here or on your phone</span>
        <span className="@min-[1100px]/shell:hidden"> on your phone</span>: in secret, with no clock.
      </p>
    </DayCard>
  );
}

/** The untimed secret ballot: pick, or abstain, then Cast my vote; a pick after Cast still counts until it closes. */
function Ballot({ election }: { election: ElectionView }) {
  const { view, me } = usePhoneGame();
  const client = useClient();
  usePicks();
  const mine: BallotOf = { seat: me.id, month: view.month };
  const offices = contested(election.candidates);
  useEffect(() => {
    for (const o of offices) serverShows(mine, o, me.politics?.ballot[o]);
  });
  // Drawn, so seen: a promise counts for Cast my vote from now on, from any tab.
  useEffect(() => showBallot('election', mine));
  return (
    <DayCard at={2} testid="ballot-card">
      <span className="flex flex-wrap items-center gap-x-1.5 text-xs @min-[1100px]/shell:text-lg" data-testid="voted">
        <span className="text-ink-2">Voted:</span>
        {election.done.map((id) => (
          <Person key={id} view={view} id={id} me={me.id} size={14} />
        ))}
        <span className="text-ink-2">
          · {election.done.length} of {view.players.length}. Never shown: for whom.
        </span>
      </span>
      <div className="grid grid-cols-2 gap-2 @min-[1100px]/shell:gap-6">
        {offices.map((o) => (
          <BallotPaper
            key={o}
            office={o}
            cands={election.candidates[o]!}
            promises={o === 'governor' ? election.promises : {}}
            promised={me.politics?.promised?.election[o]}
            pick={pickOrPromise(mine, o, me.politics)}
            onPick={(id) => {
              pickOn(mine, o, id, me.politics?.ballot[o]);
              client.intent({ type: 'vote', office: o, candidate: id || null });
            }}
          />
        ))}
        <VotesCard />
      </div>
      <p className="text-[11px] text-ink-2 @min-[1100px]/shell:text-base">Change your vote until the last one is in. Who voted for whom is never shown.</p>
    </DayCard>
  );
}

/** One office's ballot paper: a candidate, or abstain. Your pick shows at once; nobody else sees it. */
function BallotPaper({ office, cands, promises, promised, pick, onPick }: { office: Office; cands: string[]; promises: Record<string, TaxPromise>; promised: Promised; pick: string | undefined; onPick: (id: string) => void }) {
  const { view, me } = usePhoneGame();
  const wide = useWide();
  const tax = view.politics!.tax.percent;
  return (
    <fieldset className="flex min-w-0 flex-col gap-1 @min-[1100px]/shell:gap-2" data-testid={`ballot-${office}`}>
      <legend className="mb-1 text-xs font-semibold @min-[1100px]/shell:text-lg">{OFFICE_NAME[office]}</legend>
      {promised && <YouPromised words={<SeatWords text={promisedLine(view, promised)} who={promisedWho(promised)} players={view.players} />} testid={`ballot-${office}-promised`} />}
      {[...cands, ''].map((id) => (
        <label
          key={id || 'abstain'}
          className={cx('flex min-h-9 cursor-pointer items-center gap-2 rounded-control border px-1.5 py-1 text-xs @min-[1100px]/shell:min-h-12 @min-[1100px]/shell:px-3 @min-[1100px]/shell:text-lg', pick === id ? 'border-holo bg-holo-soft' : 'border-holo-line')}
          data-testid={`ballot-${office}-${id || 'abstain'}`}
        >
          <input type="radio" name={`ballot-${office}`} checked={pick === id} onChange={() => onPick(id)} className="accent-[var(--color-holo)]" />
          {id ? (
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
              <Person view={view} id={id} me={me.id} size={wide ? 24 : 15} className="self-center" />
              {promised?.candidate === id && (
                <span className="rounded-chip border border-holo px-1 font-mono text-[10px] font-bold text-holo" data-testid={`ballot-${office}-${id}-promised`}>
                  PROMISED
                </span>
              )}
              {promises[id] && <span className="text-ink-2">{promiseWords(promises[id], tax)}</span>}
            </span>
          ) : (
            <span className="text-ink-2">Abstain</span>
          )}
        </label>
      ))}
    </fieldset>
  );
}

/** E-5: your votes, and why, in a sentence. */
function VotesCard() {
  const { view, me, self } = usePhoneGame();
  const w = view.politics!.weights.find((x) => x.id === me.id);
  const votes = w?.votes ?? 0;
  const { plotsPerVote, repHigh, taxPerVote, taxCap } = POLITICS.weight;
  const extras = w ? EXTRAS.filter((e) => w.parts[e.key] !== 0).map((e) => `${w.parts[e.key] > 0 ? '+' : '−'}${Math.abs(w.parts[e.key])} for ${e.word}`) : [];
  return (
    <section className="flex min-w-0 flex-col gap-1 rounded-panel border border-holo-line bg-panel p-2 @min-[1100px]/shell:gap-2 @min-[1100px]/shell:p-4" data-testid="votes-card">
      <span className="label-caps text-[10px]! @min-[1100px]/shell:text-xs!">Your votes</span>
      <p className="text-xs leading-snug @min-[1100px]/shell:text-base" data-testid="votes-sentence">
        <strong className="font-semibold">
          You have {votes} vote{votes === 1 ? '' : 's'}.
        </strong>{' '}
        Everyone gets 1; +1 for every {plotsPerVote} plots; +1 with a good name ({repHigh}+); +1 for every {taxPerVote} cr of tax you’ve paid, up to {taxCap}; +1 for the Land Baron.
      </p>
      <p className="text-[11px] leading-snug text-ink-2 @min-[1100px]/shell:text-sm" data-testid="votes-mine">
        You: {self.plots} plots, a name of {me.politics?.reputation ?? 0}, {me.politics?.paid ?? 0} cr of tax paid, so {extras.length === 0 ? 'none of the extras yet' : extras.join(', ')}.
      </p>
    </section>
  );
}

const EXTRAS = [
  { key: 'land', word: 'your plots' },
  { key: 'reputation', word: 'your name' },
  { key: 'taxes', word: 'tax paid' },
  { key: 'baron', word: 'the Land Baron' },
] as const;

/*
 * This phone's picks on the open ballot, '' for Abstain. While its votes travel the latest pick shows: the server's
 * answers to the earlier ones come back first and never replace it. Only a pick this phone didn't send in that time
 * (a vote changed on another device) shows the server's instead. The server's view can't tell an abstention from no
 * pick: only this phone knows, for the ballot and for Cast my vote.
 * The picks are a seat's in a month; the ready bar has no room code, so drawing a ballot of another room forgets them,
 * and so does closing the ballot.
 * Votes the server batches into one view can leave a later change elsewhere hidden, until numbered answers exist.
 */
export interface BallotOf {
  seat: string;
  month: number;
}
interface HeldPick {
  /** The latest pick. */
  id: string;
  /** The picks sent since the server last showed this phone's latest, in order; empty once it has. */
  sent: string[];
  /** How many of `sent` the server has answered so far. */
  answered: number;
  /** The server's pick as this phone last saw it ('' for none). */
  seen: string;
}
let held: { ballot: BallotOf; picks: Map<Office, HeldPick> } | null = null;
const listeners = new Set<() => void>();
let version = 0;

function changed(): void {
  version++;
  for (const l of listeners) l();
}

onRoomChange(() => {
  const had = held !== null || shownBallots.election !== null;
  held = null;
  shownBallots = { ...shownBallots, election: null };
  return had;
});
export { enterRoom };

/**
 * The ballots this phone has had on screen, by kind (PM ruling A, 9 Nov): a promise counts as a pick for Cast my vote
 * and Done only once the seat's ballot for this vote has been drawn, so nobody keeps or breaks a promise unseen.
 * Client memory only (a reload loses it), noted like the room: module state, idempotent. Only the open sub-tab's body
 * is mounted, so a ballot that is drawn is a ballot that is visible.
 */
let shownBallots: { election: BallotOf | null; law: BallotOf | null } = { election: null, law: null };

/** Notes that this seat's ballot of `kind` is on screen. Idempotent. */
export function showBallot(kind: 'election' | 'law', ballot: BallotOf): void {
  const at = shownBallots[kind];
  if (at && sameBallot(at, ballot)) return;
  shownBallots = { ...shownBallots, [kind]: ballot };
  changed();
}

/** Forgets that a ballot was shown; the vote's close does this. */
export function forgetShown(kind: 'election' | 'law'): void {
  if (clearShown(kind)) changed();
}

/** Forgets that a ballot was shown, without notifying; true if one was. */
export function clearShown(kind: 'election' | 'law'): boolean {
  if (shownBallots[kind] === null) return false;
  shownBallots = { ...shownBallots, [kind]: null };
  return true;
}

/** Whether this seat's ballot of `kind` has been on screen for this vote. */
export function wasShown(kind: 'election' | 'law', ballot: BallotOf): boolean {
  const at = shownBallots[kind];
  return at !== null && sameBallot(at, ballot);
}

const sameBallot = (a: BallotOf, b: BallotOf) => a.seat === b.seat && a.month === b.month;
const heldPick = (ballot: BallotOf, office: Office) => (held && sameBallot(held.ballot, ballot) ? held.picks.get(office) : undefined);

/** Records this phone's pick for an office over the server's pick `server`; a pick on another ballot forgets the one before. */
export function pickOn(ballot: BallotOf, office: Office, id: string, server?: string): void {
  if (!held || !sameBallot(held.ballot, ballot)) held = { ballot, picks: new Map() };
  const before = held.picks.get(office);
  if (before && before.sent.length > 0) held.picks.set(office, { ...before, id, sent: [...before.sent, id] });
  else held.picks.set(office, { id, sent: [id], answered: 0, seen: server ?? '' });
  changed();
}

/**
 * Where a new server pick falls among this phone's votes on the way: the index of the one it answers, the last when it
 * shows the latest pick; -1 when it answers none of them, a vote from elsewhere. Unchanged, it answers nothing new.
 */
function answerTo(pick: HeldPick, at: string): number | 'unchanged' {
  if (at === pick.seen) return 'unchanged';
  // The server applies the votes in order, so an answer is never to one before the last answered.
  return pick.sent.indexOf(at, pick.answered);
}

/** The pick the ballot shows for an office, given the server's: this phone's, unless the server's is newer; undefined for none. */
function shownPick(ballot: BallotOf, office: Office, server: string | undefined): string | undefined {
  const mine = heldPick(ballot, office);
  const at = server ?? '';
  if (!mine) return server;
  if (mine.sent.length === 0) return mine.id === at ? mine.id : server;
  return answerTo(mine, at) === -1 ? server : mine.id;
}

/** Takes in the server's pick once drawn: an answer to this phone's votes moves past them; a vote from elsewhere ends them. */
function serverShows(ballot: BallotOf, office: Office, server: string | undefined): void {
  const mine = heldPick(ballot, office);
  if (!mine || mine.sent.length === 0) return;
  const at = server ?? '';
  const answer = answerTo(mine, at);
  if (answer === 'unchanged') return;
  if (answer === -1) {
    held!.picks.delete(office);
    return;
  }
  const last = answer === mine.sent.length - 1;
  held!.picks.set(office, last ? { ...mine, sent: [], answered: 0, seen: at } : { ...mine, answered: answer + 1, seen: at });
}

/** Forgets every pick; the ballot does this when it closes, so the next one opens empty. */
export function forgetPicks(): void {
  held = null;
  shownBallots = { ...shownBallots, election: null };
  changed();
}

/** Redraws the caller when a pick or a shown ballot changes; the hub does, since its ready bar reads both. */
export function useBallotMemory(): void {
  usePicks();
}

function usePicks(): void {
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => version,
    () => version,
  );
}

/** The pick shown for an office: this phone's or the server's, else the candidate this seat promised (S3-RULE-12). */
function pickOrPromise(ballot: BallotOf, office: Office, politics: MyView['politics'], counted = true): string | undefined {
  return shownPick(ballot, office, politics?.ballot[office]) ?? (counted ? politics?.promised?.election[office]?.candidate : undefined);
}

type BallotSeat = { view: Pick<MuleView, 'month'>; me: Pick<MyView, 'id' | 'politics'> };

/** Whether this seat has a pick, a candidate or Abstain, for every contested office on the ballot; a promise counts as one once the ballot has been on screen. */
export function ballotComplete({ view, me }: BallotSeat, election: ElectionView): boolean {
  const mine: BallotOf = { seat: me.id, month: view.month };
  const seen = wasShown('election', mine);
  return contested(election.candidates).every((o) => pickOrPromise(mine, o, me.politics, seen) !== undefined);
}

/**
 * The votes Cast my vote sends before it (S3-RULE-12 row 4): each promised office where neither this phone nor the
 * server holds a pick. Nothing is sent before the press, so the table can't tell a promise from a ballot opening.
 */
export function promisedFirst({ view, me }: BallotSeat, election: ElectionView): MuleIntent[] {
  const mine: BallotOf = { seat: me.id, month: view.month };
  return contested(election.candidates).flatMap((o) => {
    const promised = me.politics?.promised?.election[o];
    return promised && shownPick(mine, o, me.politics?.ballot[o]) === undefined ? [{ type: 'vote', office: o, candidate: promised.candidate }] : [];
  });
}
