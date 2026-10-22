import { POLITICS, type Office } from '@mule/engine';
import type { ElectionView, MyPoliticsView } from '@mule/protocol';
import { Button, Creature, cx, SLOT_COLOR } from '@mule/ui';
import { useState } from 'react';
import { slotOf } from '../../../game/derive';
import { useClient } from '../../../net/react';
import { usePhoneGame } from '../../game';
import { Section, Who } from './parts';
import { clock, howWon, OFFICE_NAME, OFFICES, revealCountdown, termEnd, whyNot } from './words';

/** Council: this month's election, then everyone's votes. */
export function CouncilDesk() {
  const { view, me } = usePhoneGame();
  const election = view.politics?.election;
  if (!view.politics || !me.politics) return null;
  return (
    <>
      {election && (election.result ? <ElectionResult /> : <Election election={election} mine={me.politics} />)}
      <VoteWeights />
    </>
  );
}

const STAGES: Record<ElectionView['stage'], string> = {
  nominate: '1 NOMINATE · 2 BALLOT · 3 REVEAL',
  ballot: '1 NOMINATE ✓ · 2 BALLOT · 3 REVEAL',
  reveal: '1 NOMINATE ✓ · 2 BALLOT ✓ · 3 REVEAL',
  over: '1 NOMINATE ✓ · 2 BALLOT ✓ · 3 REVEAL ✓',
};

function Election({ election, mine }: { election: ElectionView; mine: MyPoliticsView }) {
  const { view, me } = usePhoneGame();
  const client = useClient();
  const nominate = election.stage === 'nominate';
  const votes = view.politics!.weights.find((w) => w.id === me.id)?.votes ?? 0;
  return (
    <Section title={nominate ? 'Election · who runs' : 'Election · secret ballot'} testid="election">
      <span className="flex items-center justify-between rounded-control bg-holo-soft px-2 py-1 font-mono text-[10px] font-bold text-holo @min-[1100px]/shell:text-xs" data-testid="election-stage">
        {STAGES[election.stage]}
        <span data-num>{clock(election.stage === 'reveal' ? revealCountdown(election) : election.seconds)}</span>
      </span>
      {nominate ? (
        <>
          <div className="grid grid-cols-2 gap-1.5" data-testid="run">
            {OFFICES.map((office) => {
              const can = mine.canRun[office];
              const label = mine.running && mine.running !== office ? `Run for ${OFFICE_NAME[office]} instead` : `Run for ${OFFICE_NAME[office]}`;
              return (
                <Button key={office} size="md" variant={mine.running === office ? 'holo' : 'outline'} disabled={can !== true} onClick={() => client.intent({ type: 'run', office })} data-testid={`run-${office}`}>
                  {can === true ? label : <span data-testid="cannot-run">{whyNot(can)}</span>}
                </Button>
              );
            })}
          </div>
          {mine.running && (
            <span className="flex items-center justify-between gap-2 text-xs text-ink-2 @min-[1100px]/shell:text-sm">
              You run for {OFFICE_NAME[mine.running]}; one office at a time.
              <button type="button" className="text-holo underline" onClick={() => client.intent({ type: 'run', office: null })} data-testid="withdraw">
                Withdraw
              </button>
            </span>
          )}
          <ul className="flex flex-col gap-1 text-sm" data-testid="candidates">
            {OFFICES.map((office) => (
              <li key={office}>
                {OFFICE_NAME[office]}:{' '}
                {election.candidates[office].length === 0
                  ? 'nobody yet'
                  : election.candidates[office].map((id, i) => (
                      <span key={id}>
                        {i > 0 && ', '}
                        <Who view={view} id={id} size={14} />
                      </span>
                    ))}
              </li>
            ))}
          </ul>
          <span className="text-xs text-ink-3">Nobody runs: the richest player is appointed. One candidate: elected unopposed, no ballot.</span>
        </>
      ) : (
        <>
          {election.stage === 'ballot' &&
            OFFICES.filter((office) => election.candidates[office].length >= 2).map((office) => (
              <Ballot key={office} office={office} cands={election.candidates[office]} pick={mine.ballot[office] ?? null} onPick={(candidate) => client.intent({ type: 'vote', office, candidate })} />
            ))}
          <span className="flex flex-wrap items-center gap-1.5 text-xs text-ink-2 @min-[1100px]/shell:text-sm" data-testid="voted">
            Voted: {election.voted.map((id) => <Who key={id} view={view} id={id} size={14} />)} · {election.voted.length} of {view.players.length}. Never shown: for whom.
          </span>
          {election.stage === 'ballot' && (
            <span className="text-xs text-ink-2 @min-[1100px]/shell:text-sm" data-testid="vote-weight">
              Your vote weighs <strong className="text-ink">{votes}</strong>. Change it until the ballot closes; the result shows on every screen together.
            </span>
          )}
        </>
      )}
    </Section>
  );
}

/** One office's secret ballot: a candidate, or abstain. Shows the pick at once; the server keeps the ballot. */
function Ballot({ office, cands, pick: sent, onPick }: { office: Office; cands: string[]; pick: string | null; onPick: (id: string | null) => void }) {
  const { view } = usePhoneGame();
  const [pick, setPick] = useState(sent ?? '');
  const title = OFFICE_NAME[office];
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-sm font-semibold @min-[1100px]/shell:text-base">{title}</legend>
      {[...cands, ''].map((id) => (
        <label key={id || 'abstain'} className={cx('flex cursor-pointer items-start gap-2 rounded-control border p-1.5 text-sm', pick === id ? 'border-holo bg-holo-soft' : 'border-holo-line')}>
          <input
            type="radio"
            name={title}
            checked={pick === id}
            onChange={() => {
              setPick(id);
              onPick(id || null);
            }}
            className="mt-1 accent-[var(--color-holo)]"
          />
          {id ? (
            <span className="flex flex-col">
              <Who view={view} id={id} />
            </span>
          ) : (
            <span className="text-ink-2">Abstain</span>
          )}
        </label>
      ))}
    </fieldset>
  );
}

/** The result, on this phone at the moment the TV reveals it: who holds each office, and how. */
export function ElectionResult() {
  const { view, me } = usePhoneGame();
  const politics = view.politics!;
  const result = politics.election!.result!;
  const baron = politics.baron ? (view.players.find((p) => p.id === politics.baron)?.name ?? null) : null;
  const mine = OFFICES.find((office) => result[office].winner === me.id);
  return (
    <div className="flex h-full items-center justify-center bg-table p-4 text-ink" data-testid="phone-election-result">
      <div className="flex w-full max-w-[640px] flex-col gap-3 rounded-sheet border-2 border-holo bg-panel p-4 shadow-glow">
        <span className="label-caps">Election results · month {view.month}</span>
        {OFFICES.map((office) => {
          const r = result[office];
          const p = view.players.find((q) => q.id === r.winner);
          const votes = r.tallies.find((t) => t.id === r.winner)?.votes ?? 0;
          return (
            <span key={office} className="flex items-center gap-3">
              <span className="w-20 text-sm text-ink-2">{OFFICE_NAME[office]}</span>
              {p && <Creature species={p.species} color={SLOT_COLOR[slotOf(view, p.id) ?? 0]} size={32} />}
              <span className="font-display text-xl font-semibold">{r.winner === me.id ? 'You' : p?.name}</span>
              <span className="font-mono text-sm text-ink-3">
                {votes} votes · {howWon(office, r.how, baron)}
              </span>
            </span>
          );
        })}
        {mine && (
          <span className="rounded-control bg-holo-soft px-3 py-2 text-sm">
            You are the {OFFICE_NAME[mine]} until month {termEnd(politics.next, view.maxMonths)}.
          </span>
        )}
      </div>
    </div>
  );
}

const { plotsPerVote, repHigh, repLow, taxPerVote, taxCap } = POLITICS.weight;

/** Everyone's votes and where they come from; public. */
function VoteWeights() {
  const { view, me } = usePhoneGame();
  return (
    <Section title="Votes this month" testid="vote-weights">
      <table className="w-full text-left text-xs @min-[1100px]/shell:text-sm">
        <thead className="text-ink-3">
          <tr>
            <th className="font-normal">Player</th>
            <th className="text-right font-normal" title="1 each">
              Base
            </th>
            <th className="text-right font-normal" title={`+1 per ${plotsPerVote} plots`}>
              Land
            </th>
            <th className="text-right font-normal" title={`+1 at ${repHigh}, −1 below ${repLow}`}>
              Rep.
            </th>
            <th className="text-right font-normal">Baron</th>
            <th className="text-right font-normal" title={`+1 per ${taxPerVote} cr paid, at most +${taxCap}`}>
              Taxes
            </th>
            <th className="text-right font-semibold text-ink">Votes</th>
          </tr>
        </thead>
        <tbody>
          {view.politics!.weights.map((w) => (
            <tr key={w.id} className={cx('border-t border-holo-faint', w.id === me.id && 'bg-holo-soft')} data-testid={`weight-${w.id}`}>
              <td className="py-1">
                <Who view={view} id={w.id} size={14} />
              </td>
              {[w.parts.base, w.parts.land, w.parts.reputation, w.parts.baron, w.parts.taxes].map((n, i) => (
                <td key={i} data-num className="text-right font-mono">
                  {i === 0 ? n : n > 0 ? `+${n}` : n < 0 ? n : '·'}
                </td>
              ))}
              <td data-num className="text-right font-mono font-bold">
                {w.votes}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
