import { POLITICS, type Office, type TaxPromise } from '@mule/engine';
import type { ElectionView, MyPoliticsView } from '@mule/protocol';
import { Button, Creature, cx, SLOT_COLOR } from '@mule/ui';
import { Fragment, useState, type ReactNode } from 'react';
import { slotOf } from '../../../game/derive';
import { useClient } from '../../../net/react';
import { usePhoneGame } from '../../game';
import { Section, Who } from './parts';
import { howWon, OFFICE_NAME, promiseText, termEnd, whyNot } from './words';

/** Council: this month's election, then everyone's votes. */
export function CouncilDesk() {
  const { view, me } = usePhoneGame();
  const election = view.politics?.election;
  if (!view.politics || !me.politics) return null;
  return (
    <>
      {election && (election.stage === 'ceremony' || election.stage === 'over' ? <ElectionResult /> : <Election election={election} mine={me.politics} />)}
      <VoteWeights />
    </>
  );
}

const STAGES: Record<ElectionView['stage'], string> = {
  announce: '1 ANNOUNCE · 2 BALLOT · 3 RESULT',
  ballot: '1 ANNOUNCE ✓ · 2 BALLOT · 3 RESULT',
  ceremony: '1 ANNOUNCE ✓ · 2 BALLOT ✓ · 3 RESULT',
  over: '1 ANNOUNCE ✓ · 2 BALLOT ✓ · 3 RESULT ✓',
};

function Election({ election, mine }: { election: ElectionView; mine: MyPoliticsView }) {
  const { view, me } = usePhoneGame();
  const client = useClient();
  const [picking, setPicking] = useState(false);
  const announce = election.stage === 'announce';
  // Until the ballot opens the candidacy is Politics'.
  const candidacy = announce ? view.politics! : election;
  const promise = candidacy.promises[me.id];
  const votes = view.politics!.weights.find((w) => w.id === me.id)?.votes ?? 0;
  return (
    <Section title={announce ? 'Election · who runs' : 'Election · secret ballot'} testid="election">
      <span className="flex items-center justify-between rounded-control bg-holo-soft px-2 py-1 font-mono text-[10px] font-bold text-holo @min-[1100px]/shell:text-xs" data-testid="election-stage">
        {STAGES[election.stage]}
      </span>
      {announce ? (
        <>
          {/* One per row in the rail; side by side only on a wide shell, and only with more than one office. */}
          <div className={cx('grid gap-1.5', POLITICS.offices.length > 1 && '@min-[1100px]/shell:grid-cols-2')} data-testid="run">
            {/* Governor asks for a promise first; Sheriff stays one tap. */}
            {POLITICS.offices.map((office) => {
              const can = mine.canRun[office] ?? 'notElected';
              const label = mine.running && mine.running !== office ? `Run for ${OFFICE_NAME[office]} instead` : `Run for ${OFFICE_NAME[office]}`;
              return (
                <Button
                  key={office}
                  size="md"
                  className="h-auto! min-h-11 py-2"
                  variant={mine.running === office ? 'holo' : 'outline'}
                  disabled={can !== true}
                  onClick={() => (office === 'governor' ? setPicking(true) : (client.intent({ type: 'run', office }), setPicking(false)))}
                  data-testid={`run-${office}`}
                >
                  {can === true ? label : <span data-testid="cannot-run">{whyNot(can)}</span>}
                </Button>
              );
            })}
          </div>
          {picking && (
            <PromisePicker
              onRun={(p) => {
                client.intent({ type: 'run', office: 'governor', promise: p });
                setPicking(false);
              }}
              onCancel={() => setPicking(false)}
            />
          )}
          {mine.running && !picking && (
            <span className="flex items-center justify-between gap-2 text-xs text-ink-2 @min-[1100px]/shell:text-sm" data-testid="running">
              {mine.running === 'governor' && promise
                ? `You run for Governor, promising “${promiseText(promise)}”; one office at a time.`
                : `You run for ${OFFICE_NAME[mine.running]}; one office at a time.`}
              <button type="button" className="min-h-11 shrink-0 px-2 text-holo underline" onClick={() => client.intent({ type: 'run', office: null })} data-testid="withdraw">
                Withdraw
              </button>
            </span>
          )}
          <ul className="flex flex-col gap-1 text-sm" data-testid="candidates">
            {POLITICS.offices.map((office) => (
              <li key={office}>
                {OFFICE_NAME[office]}:{' '}
                {(candidacy.candidates[office] ?? []).length === 0
                  ? 'nobody yet'
                  : candidacy.candidates[office]!.map((id, i) => (
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
            POLITICS.offices.filter((office) => (election.candidates[office]?.length ?? 0) >= 2).map((office) => (
              <Ballot
                key={office}
                office={office}
                cands={election.candidates[office]!}
                promises={office === 'governor' ? election.promises : {}}
                pick={mine.ballot[office] ?? null}
                onPick={(candidate) => client.intent({ type: 'vote', office, candidate })}
              />
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
function Ballot({ office, cands, promises, pick: sent, onPick }: { office: Office; cands: string[]; promises: Record<string, TaxPromise>; pick: string | null; onPick: (id: string | null) => void }) {
  const { view } = usePhoneGame();
  const [pick, setPick] = useState(sent ?? '');
  const title = OFFICE_NAME[office];
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-sm font-semibold @min-[1100px]/shell:text-base">{title}</legend>
      {[...cands, ''].map((id) => (
        <label key={id || 'abstain'} className={cx('flex min-h-11 cursor-pointer items-start gap-2 rounded-control border p-2 text-sm', pick === id ? 'border-holo bg-holo-soft' : 'border-holo-line')}>
          <input
            type="radio"
            name={title}
            checked={pick === id}
            onChange={() => {
              setPick(id);
              onPick(id || null);
            }}
            className="size-5 shrink-0 accent-[var(--color-holo)]"
          />
          {id ? (
            <span className="flex flex-col">
              <Who view={view} id={id} />
              {/* A Sheriff makes no promise yet (slice 4): no line, not an empty quote. */}
              {promises[id] && (
                <span className="text-xs text-ink-2" data-testid={`promise-${id}`}>
                  “{promiseText(promises[id])}”
                </span>
              )}
            </span>
          ) : (
            <span className="text-ink-2">Abstain</span>
          )}
        </label>
      ))}
    </fieldset>
  );
}

const TAX = POLITICS.tax;

/**
 * Running for Governor asks for a promise first: one of three, no free text. The cap starts at today's tax; "Lower"
 * can't be promised at the lowest tax. Nothing is sent until "Run, promising …".
 */
export function PromisePicker({ onRun, onCancel }: { onRun: (p: TaxPromise) => void; onCancel: () => void }) {
  const { view } = usePhoneGame();
  const taxNow = view.politics!.tax.percent;
  const [kind, setKind] = useState<TaxPromise['kind'] | null>(null);
  const [n, setN] = useState(taxNow);
  const chosen: TaxPromise | null = kind === 'cap' ? { kind, percent: n } : kind ? { kind } : null;
  const chip = (k: TaxPromise['kind'], label: ReactNode, testid: string, disabled?: string) => (
    <label
      className={cx(
        'flex min-h-11 cursor-pointer items-center gap-2 rounded-control border px-2 py-1 text-sm',
        kind === k ? 'border-holo bg-holo-soft' : 'border-holo-line',
        disabled && 'cursor-not-allowed opacity-50',
      )}
      data-testid={testid}
    >
      <input type="radio" name="promise" checked={kind === k} disabled={!!disabled} onChange={() => setKind(k)} className="size-5 shrink-0 accent-[var(--color-holo)]" />
      <span className="flex min-w-0 flex-1 flex-col">
        {label}
        {disabled && <span className="text-[11px] text-ink-3">{disabled}</span>}
      </span>
    </label>
  );
  return (
    <div className="flex flex-col gap-1.5 rounded-panel border border-holo bg-panel p-2" role="radiogroup" aria-label="Your promise as Governor" data-testid="promise-pick">
      <span className="text-sm font-semibold">Your promise as Governor</span>
      <span className="text-xs text-ink-2">Everyone sees it on the ballot and the TV. Tax today: {taxNow}%.</span>
      {chip(
        'cap',
        <span className="flex flex-wrap items-center gap-1.5">
          Tax no higher than
          <span className="inline-flex items-center rounded-control border border-holo-line" onClick={() => setKind('cap')}>
            <button type="button" aria-label="Lower the cap" disabled={n <= TAX.min} onClick={() => setN((x) => Math.max(TAX.min, x - 1))} className="grid size-9 place-items-center text-holo disabled:opacity-40" data-testid="promise-cap-minus">
              −
            </button>
            <span data-num className="w-9 text-center font-mono font-bold" data-testid="promise-cap-value">
              {n}%
            </span>
            <button type="button" aria-label="Raise the cap" disabled={n >= TAX.max} onClick={() => setN((x) => Math.min(TAX.max, x + 1))} className="grid size-9 place-items-center text-holo disabled:opacity-40" data-testid="promise-cap-plus">
              +
            </button>
          </span>
        </span>,
        'promise-cap',
      )}
      {chip('lower', 'Lower the tax', 'promise-lower', taxNow <= TAX.min ? `The tax is already ${TAX.min} %.` : undefined)}
      {chip('hold', 'Hold the tax', 'promise-hold')}
      <div className="flex flex-col gap-1.5">
        <Button size="md" className="h-auto! min-h-11 py-2" disabled={!chosen} onClick={() => chosen && onRun(chosen)} data-testid="promise-run">
          {chosen ? `Run, promising “${promiseText(chosen)}”` : 'Pick a promise to run'}
        </Button>
        <Button size="md" variant="ghost" onClick={onCancel} data-testid="promise-cancel">
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** The result, on this phone office by office as the TV's ceremony names each winner: who holds each office, and how. */
export function ElectionResult() {
  const { view, me } = usePhoneGame();
  const politics = view.politics!;
  const result = politics.election!.result;
  const baron = politics.baron ? (view.players.find((p) => p.id === politics.baron)?.name ?? null) : null;
  const won = POLITICS.offices.flatMap((office) => {
    const { winner, how, tallies } = result[office] ?? {};
    return winner && how && tallies ? [{ office, winner, how, tallies }] : [];
  });
  const mine = won.find((r) => r.winner === me.id)?.office;
  return (
    <div className="flex h-full items-center justify-center bg-table p-4 text-ink" data-testid="phone-election-result">
      <div className="flex w-full max-w-[640px] flex-col gap-3 rounded-sheet border-2 border-holo bg-panel p-4 shadow-glow">
        <span className="label-caps">Election results · month {view.month}</span>
        {won.map((r) => {
          const { office } = r;
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

/** What each part of a seat's votes is for; a part that adds nothing is left out of the line. */
const PARTS = [
  { key: 'land', word: 'land', why: `+1 per ${plotsPerVote} plots` },
  { key: 'reputation', word: 'rep.', why: `+1 at ${repHigh}, −1 below ${repLow}` },
  { key: 'baron', word: 'Baron', why: 'the Land Baron' },
  { key: 'taxes', word: 'taxes', why: `+1 per ${taxPerVote} cr paid, at most +${taxCap}` },
] as const;

/** Everyone's votes and where they come from; public. Two columns, so Votes stays in sight in the rail. */
function VoteWeights() {
  const { view, me } = usePhoneGame();
  return (
    <Section title="Votes this month" testid="vote-weights">
      <table className="w-full table-fixed text-left text-xs @min-[1100px]/shell:text-sm">
        <thead className="text-ink-3">
          <tr>
            <th className="font-normal">Player</th>
            <th className="w-12 text-right font-semibold text-ink">Votes</th>
          </tr>
        </thead>
        <tbody>
          {view.politics!.weights.map((w) => (
            <tr key={w.id} className={cx('border-t border-holo-faint align-top', w.id === me.id && 'bg-holo-soft')} data-testid={`weight-${w.id}`}>
              <td className="py-1">
                <span className="flex min-w-0 flex-col">
                  <Who view={view} id={w.id} size={14} />
                  <span className="text-[11px] text-ink-3" data-testid={`weight-parts-${w.id}`}>
                    {/* Each part stays on one line; the line breaks only between parts. */}
                    <span className="whitespace-nowrap" title="1 each">
                      base {w.parts.base}
                    </span>
                    {PARTS.filter((p) => w.parts[p.key] !== 0).map((p) => (
                      <Fragment key={p.key}>
                        {' · '}
                        <span className="whitespace-nowrap" title={p.why}>
                          {p.word} {w.parts[p.key] > 0 ? '+' : '−'}
                          {Math.abs(w.parts[p.key])}
                        </span>
                      </Fragment>
                    ))}
                  </span>
                </span>
              </td>
              <td data-num className="py-1 text-right font-mono font-bold" data-testid={`weight-votes-${w.id}`}>
                {w.votes}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
