import { POLITICS, type Office, type TaxPromise } from '@mule/engine';
import type { ElectionView, MuleView, PoliticsView } from '@mule/protocol';
import { cx } from '@mule/ui';
import { useSyncExternalStore, type ReactNode } from 'react';
import { useClient } from '../../../net/react';
import { usePhoneGame } from '../../game';
import { useWide } from '../../Shell';
import { OfficesCard, Person, Steps } from './parts';
import { PhoneRevealSolo, PhoneRevealWithTv, showOf } from './Reveal';
import { RunBlock } from './Run';
import { OFFICE_NAME, officeNames, promiseWords, termEnd } from './words';

/** Election day on the stage (E-2): the announcement, the secret ballot, then the reveal over the whole phone. */
export function ElectionDay() {
  const { view, table } = usePhoneGame();
  const election = view.politics?.election;
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
  return (
    <DayCard at={1} testid="announce">
      <p className="text-xs text-ink-2 @min-[1100px]/shell:text-lg">
        The colony elects its {officeNames().join(' and ')} for months {view.month} to {termEnd(politics.next, view.maxMonths)}. The candidates:
      </p>
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
  const picks = usePicks();
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
        {contested(election.candidates).map((o) => (
          <BallotPaper
            key={o}
            office={o}
            cands={election.candidates[o]!}
            promises={o === 'governor' ? election.promises : {}}
            pick={picks.get(ballotKey(view, o)) ?? me.politics?.ballot[o]}
            onPick={(id) => {
              pickOn(ballotKey(view, o), id);
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
function BallotPaper({ office, cands, promises, pick, onPick }: { office: Office; cands: string[]; promises: Record<string, TaxPromise>; pick: string | undefined; onPick: (id: string) => void }) {
  const { view, me } = usePhoneGame();
  const wide = useWide();
  const tax = view.politics!.tax.percent;
  return (
    <fieldset className="flex min-w-0 flex-col gap-1 @min-[1100px]/shell:gap-2" data-testid={`ballot-${office}`}>
      <legend className="mb-1 text-xs font-semibold @min-[1100px]/shell:text-lg">{OFFICE_NAME[office]}</legend>
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
 * This phone's picks, '' for Abstain, shown at once while the vote travels. An abstention clears the ballot on the
 * server, so its view can't tell it from no pick at all: only this phone knows, for the ballot to show it checked and
 * for Cast my vote (electionReadyWords) to count the office as picked. The hub re-renders with the vote's broadcast.
 */
const picked = new Map<string, string>();
const listeners = new Set<() => void>();
let version = 0;
const ballotKey = (view: Pick<MuleView, 'month'>, office: Office) => `${view.month}:${office}`;

function pickOn(key: string, id: string): void {
  picked.set(key, id);
  version++;
  for (const l of listeners) l();
}

function usePicks(): ReadonlyMap<string, string> {
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => version,
    () => version,
  );
  return picked;
}

/** Whether this phone has a pick, a candidate or Abstain, for every contested office on the ballot. */
export function ballotComplete(view: Pick<MuleView, 'month'>, mine: Partial<Record<Office, string>>, election: ElectionView): boolean {
  return contested(election.candidates).every((o) => mine[o] !== undefined || picked.has(ballotKey(view, o)));
}
