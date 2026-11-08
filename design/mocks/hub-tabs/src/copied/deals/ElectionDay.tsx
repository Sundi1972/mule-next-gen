// Copied from design/mocks/politics-deals/src/proposed/ElectionDay.tsx (approved/awaiting-pick mock, 7–8 Nov); changes for the tabs are marked TABS:.
import { POLITICS, type Office, type TaxPromise } from '@mule/engine';
import type { ElectionView, MuleView } from '@mule/protocol';
import { cx } from '@mule/ui';
import { useState, type ReactNode } from 'react';
import { useClient } from '../../../../../../apps/web/src/net/react';
import { usePhoneGame } from '../../../../../../apps/web/src/phone/game';
import { useWide } from '../../../../../../apps/web/src/phone/Shell';
import { contested, ElectionDay } from '../../../../../../apps/web/src/phone/hub/politics/ElectionDay';
import { Person, Steps } from '../../../../../../apps/web/src/phone/hub/politics/parts';
import { OFFICE_NAME, officeNames, promiseWords } from '../../../../../../apps/web/src/phone/hub/politics/words';
import { MOVES } from '../../fixture';

/*
 * GRAFT TARGET: apps/web/src/phone/hub/politics/ElectionDay.tsx (WS7 path; S3-C21). The secret ballot as today, with
 * one change: a ballot paper whose office this player promised (MyPoliticsView.promised) says so under its legend, tags
 * the promised candidate, and starts with that candidate picked ON THIS PHONE ONLY: no intent until the player picks or
 * casts (§0.1's rejected preset: a preset ballot would put the player in the public voted list).
 * The copy below stands in for Ballot/BallotPaper/VotesCard, which ElectionDay.tsx does not export; the build keeps
 * ElectionDay's own pick store (pickOn/shownPick) and starts it from the promise. See finding F-4 on Cast my vote.
 */

type Promised = { candidate: string; to: string[] };

/** "You promised Brix your vote", or, when the vote is for someone else: "You promised Kai your vote for Brix". */
export function promisedLine(view: Pick<MuleView, 'players'>, p: Promised): string {
  const name = (id: string) => view.players.find((q) => q.id === id)?.name ?? id;
  const to = p.to.map(name).join(' and ');
  return p.to.length === 1 && p.to[0] === p.candidate ? `You promised ${to} your vote` : `You promised ${to} your vote for ${name(p.candidate)}`;
}

/** The line under a promised ballot's legend: to whom, and what keeping and breaking it does. */
export function YouPromised({ words, testid }: { words: string; testid: string }) {
  return (
    <span className="flex flex-col gap-0.5 rounded-control border border-holo bg-holo-soft px-1.5 py-1" data-testid={testid}>
      <span className="text-xs font-semibold leading-tight @min-[1100px]/shell:text-base">{words}</span>
      <span className="text-[10px] leading-tight text-ink-2 @min-[1100px]/shell:text-sm">
        Keep it: +{MOVES.kept}. Break it: −{-MOVES.voteBroken}, and the table sees it. Your vote stays secret either way.
      </span>
    </span>
  );
}

/** Election day on the stage: the ballot with the promise; every other stage as ElectionDay draws it. */
export function PromisedElectionDay() {
  const { view } = usePhoneGame();
  const election = view.politics?.election;
  if (election?.stage === 'ballot') return <PromisedBallot election={election} />;
  return <ElectionDay />;
}

/** As ElectionDay.tsx's DayCard. */
function DayCard({ at, testid, children }: { at: 1 | 2; testid: string; children: ReactNode }) {
  return (
    <section className="relative flex min-w-0 flex-col gap-1.5 rounded-panel border-2 border-holo bg-panel p-2.5 shadow-glow @min-[1100px]/shell:gap-4 @min-[1100px]/shell:p-6" aria-label={`Election day, step ${at} of 3`} data-testid={testid}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="font-display text-base font-semibold leading-tight @min-[1100px]/shell:text-3xl">Election day: {officeNames().join(' and ')}</h2>
        <span className="ml-auto">
          <Steps at={at} />
        </span>
      </div>
      {children}
    </section>
  );
}

function PromisedBallot({ election }: { election: ElectionView }) {
  const { view, me } = usePhoneGame();
  const client = useClient();
  const offices = contested(election.candidates);
  // Stands in for ElectionDay's pick store: this phone's pick, else the server's, else the promise.
  const [local, setLocal] = useState<Partial<Record<Office, string>>>({});
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
        {offices.map((o) => {
          const promised = me.politics?.promised?.election[o] ?? null;
          return (
            <BallotPaper
              key={o}
              office={o}
              cands={election.candidates[o]!}
              promises={o === 'governor' ? election.promises : {}}
              promised={promised}
              pick={local[o] ?? me.politics?.ballot[o] ?? promised?.candidate}
              onPick={(id) => {
                setLocal({ ...local, [o]: id });
                client.intent({ type: 'vote', office: o, candidate: id || null });
              }}
            />
          );
        })}
        <VotesCard />
      </div>
      <p className="text-[11px] text-ink-2 @min-[1100px]/shell:text-base">Change your vote until the last one is in. Who voted for whom is never shown.</p>
    </DayCard>
  );
}

function BallotPaper({ office, cands, promises, promised, pick, onPick }: { office: Office; cands: string[]; promises: Record<string, TaxPromise>; promised: Promised | null; pick: string | undefined; onPick: (id: string) => void }) {
  const { view, me } = usePhoneGame();
  const wide = useWide();
  const tax = view.politics!.tax.percent;
  return (
    <fieldset className="flex min-w-0 flex-col gap-1 @min-[1100px]/shell:gap-2" data-testid={`ballot-${office}`}>
      <legend className="mb-1 text-xs font-semibold @min-[1100px]/shell:text-lg">{OFFICE_NAME[office]}</legend>
      {/* CHANGE: the promise, before the choices. */}
      {promised && <YouPromised words={promisedLine(view, promised)} testid={`ballot-${office}-promised`} />}
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
              {/* CHANGE: the promised candidate is tagged, in words. */}
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

/** As ElectionDay.tsx's VotesCard. */
function VotesCard() {
  const { view, me, self } = usePhoneGame();
  const w = view.politics!.weights.find((x) => x.id === me.id);
  const votes = w?.votes ?? 0;
  const { plotsPerVote, repHigh, taxPerVote, taxCap } = POLITICS.weight;
  const extras = w ? EXTRAS.filter((e) => w.parts[e.key] !== 0).map((e) => `${w.parts[e.key] > 0 ? '+' : '−'}${Math.abs(w.parts[e.key])} for ${e.word}`) : [];
  return (
    <section className="flex min-w-0 flex-col gap-1 rounded-panel border border-holo-line bg-panel p-2 @min-[1100px]/shell:gap-2 @min-[1100px]/shell:p-4" data-testid="votes-card">
      <span className="label-caps text-[10px]! @min-[1100px]/shell:text-xs!">Your votes</span>
      <p className="text-xs leading-snug @min-[1100px]/shell:text-base">
        <strong className="font-semibold">
          You have {votes} vote{votes === 1 ? '' : 's'}.
        </strong>{' '}
        Everyone gets 1; +1 for every {plotsPerVote} plots; +1 with a good name ({repHigh}+); +1 for every {taxPerVote} cr of tax you’ve paid, up to {taxCap}; +1 for the Land Baron.
      </p>
      <p className="text-[11px] leading-snug text-ink-2 @min-[1100px]/shell:text-sm">
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
