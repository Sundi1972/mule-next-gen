import { POLITICS } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { Creature, cx, PlayerMark } from '@mule/ui';
import { useEffect, useState } from 'react';
import { toSlot } from '../../../../apps/web/src/game/derive';
import { colorOf } from '../../../../apps/web/src/phone/hub/politics/parts';
import { TvHeader } from '../../../../apps/web/src/table/TableApp';
import { LawsInForce } from './law-desk';
import { costChip, impactOf, LAW_MEANING, proposalWords } from './words';

/*
 * C46, the TV's council panel. GRAFT: a TvCouncil beside apps/web/src/table/TvElection.tsx (WS7), in its frame
 * language: TvHeader, the 1280 × 720 table, rounded-sheet sections, the voted list as TvBallot draws it.
 */

export type RevealVariant = 'A' | 'B';

export function TvCouncil({ game, variant = 'A' }: { game: MuleView; variant?: RevealVariant }) {
  const c = game.politics?.council;
  if (!c) return null;
  return (
    <div className="flex h-[720px] w-[1280px] flex-col gap-4 bg-table px-10 py-7 text-ink" data-phase="planning" data-testid={c.stage === 'ballot' ? 'tv-council-ballot' : 'tv-council-reveal'}>
      <TvHeader game={game} title={c.stage === 'ballot' ? 'The law vote' : 'The law vote · the result'} />
      {c.stage === 'ballot' ? <TvLawBallot game={game} /> : variant === 'A' ? <RevealBar game={game} /> : <RevealStamp game={game} />}
      <div className="mt-auto rounded-panel border border-holo-line bg-panel px-6 py-3" data-testid="tv-laws">
        <LawsInForce laws={game.politics?.laws ?? {}} tv />
      </div>
    </div>
  );
}

/** The proposal, each player's "for you", and who has voted: never how. */
function TvLawBallot({ game }: { game: MuleView }) {
  const pol = game.politics!;
  const c = pol.council!;
  const impact = Object.keys(c.impact).length ? c.impact : impactOf(c.proposal, pol.laws ?? {});
  const proposer = game.players.find((p) => p.id === c.proposer);
  return (
    <>
      <div className="flex items-center gap-6">
        <span className="font-display text-4xl font-semibold text-holo">Vote on your phone</span>
        <span className="text-2xl text-ink-2">Nobody sees how.</span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_420px] gap-6">
        <section className="flex flex-col gap-4 rounded-sheet border border-holo-line bg-panel px-6 py-5" data-testid="tv-proposal">
          <span className="flex items-center gap-3 text-2xl text-ink-2">
            {proposer && <Creature species={proposer.species} color={colorOf(game, proposer.id)} size={40} />}
            {proposer?.name}, the Governor, proposes
          </span>
          <span className="font-display text-5xl font-semibold leading-tight" data-testid="tv-proposal-words">
            {proposalWords(c.proposal)}
          </span>
          <span className="text-xl text-ink-2">{LAW_MEANING[c.proposal.law]}</span>
          <ul className="mt-2 grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2 text-2xl" data-testid="tv-impact">
            <li className="contents">
              <span />
              <span className="label-caps text-sm!">For each player</span>
              <span />
            </li>
            {game.players.map((p) => {
              const ch = costChip(c.proposal, impact[p.id]);
              return (
                <li key={p.id} className="contents" data-testid={`tv-impact-${p.id}`}>
                  <Creature species={p.species} color={colorOf(game, p.id)} size={30} />
                  <span className="font-semibold">{p.name}</span>
                  <span data-num className={cx('text-right font-mono font-bold', ch.tone === 'cost' ? 'text-rise' : ch.tone === 'save' ? 'text-fall' : 'text-ink-3')}>
                    {ch.text}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="flex flex-col gap-3 rounded-sheet border-2 border-holo bg-holo-soft px-6 py-4" data-testid="tv-council-voted">
          <span className="font-display text-3xl font-semibold" data-testid="tv-council-voted-count">
            Voted {c.voted.length} of {game.players.length}
          </span>
          <ul className="flex flex-col gap-1.5">
            {game.players.map((p) => {
              const voted = c.voted.includes(p.id);
              return (
                <li key={p.id} className={cx('flex items-center gap-3 text-2xl', voted ? 'text-ink-2' : 'font-semibold')}>
                  <PlayerMark slot={toSlot(p.slot)} size={24} glow={!voted} />
                  <span className="flex-1 whitespace-nowrap">{p.name}</span>
                  <span className={cx('font-mono text-lg', voted ? 'text-ok' : 'text-holo')}>{voted ? 'VOTED ✓' : 'VOTING'}</span>
                </li>
              );
            })}
          </ul>
          <span className="text-lg text-ink-2">Each vote weighs as it did at the election: land, good name, taxes paid, the Land Baron.</span>
        </section>
      </div>
    </>
  );
}

/** 0 → 1 over `ms`, from mount: the reveal's beat. The build reads council.clockMs / revealMs instead. */
function useBeat(ms: number) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let id = 0;
    const tick = (now: number) => {
      const next = Math.min(1, (now - start) / ms);
      setT(next);
      if (next < 1) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [ms]);
  return t;
}

/** The line under the result, the same on both variants and on every phone. */
function resultLine(game: MuleView): string {
  const c = game.politics!.council!;
  const r = c.result!;
  const score = r.tie ? `${r.yes} to ${r.no} · the Governor’s vote decides` : `${r.passed ? r.yes : r.no} to ${r.passed ? r.no : r.yes}`;
  const then = r.passed ? `${proposalWords(c.proposal)} is in force from now` : `it can come back in month ${game.month + POLITICS.council.retryMonths + 1}`;
  return `${r.passed ? 'Passed' : 'Failed'} ${score} · ${then}`;
}

function Stamp({ passed, show, big = false }: { passed: boolean; show: boolean; big?: boolean }) {
  return (
    <span
      className={cx(
        'rounded-panel border-4 px-8 font-display font-bold uppercase tracking-widest transition-[opacity,transform] duration-300',
        big ? 'py-2 text-8xl' : 'py-1 text-6xl',
        passed ? 'border-ok text-ok shadow-glow' : 'border-alert text-alert shadow-glow-alert',
        show ? 'rotate-[-4deg] scale-100 opacity-100' : 'scale-150 opacity-0',
      )}
      data-testid="tv-stamp"
    >
      {passed ? 'Passed' : 'Failed'}
    </span>
  );
}

/** A: yes and no fill from each end of one bar, weighted; then the stamp. Totals only. */
function RevealBar({ game }: { game: MuleView }) {
  const c = game.politics!.council!;
  const r = c.result!;
  const t = useBeat(1_600);
  const total = r.yes + r.no || 1;
  const fill = Math.min(1, t / 0.75);
  return (
    <section className="flex min-h-0 flex-1 flex-col justify-center gap-6 rounded-sheet border border-holo-line bg-panel px-10 py-6" data-testid="tv-reveal-a" data-passed={r.passed}>
      <span className="font-display text-4xl font-semibold" data-testid="tv-reveal-proposal">
        {proposalWords(c.proposal)}
      </span>
      <div className="flex items-end justify-between font-mono font-bold">
        <span className="flex flex-col">
          <span className="label-caps text-base!">Yes</span>
          <span data-num className="text-6xl text-ok" data-testid="tv-yes">
            {Math.round(r.yes * fill)}
          </span>
        </span>
        <Stamp passed={r.passed} show={t >= 1} />
        <span className="flex flex-col items-end">
          <span className="label-caps text-base!">No</span>
          <span data-num className="text-6xl text-alert" data-testid="tv-no">
            {Math.round(r.no * fill)}
          </span>
        </span>
      </div>
      <div className="relative h-12 overflow-hidden rounded-full border border-holo-line bg-raised" data-testid="tv-bar">
        <span className="absolute inset-y-0 left-0 bg-ok" style={{ width: `${(r.yes / total) * 100 * fill}%` }} data-testid="tv-bar-yes" />
        <span className="absolute inset-y-0 right-0 bg-alert" style={{ width: `${(r.no / total) * 100 * fill}%` }} data-testid="tv-bar-no" />
        {/* The middle: where a law passes. A thin mark, with a wide transparent sibling to select. */}
        <span className="absolute inset-y-0 left-1/2 w-4 -translate-x-1/2" data-testid="tv-bar-middle" />
        <span className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-ink" />
      </div>
      <span className={cx('text-3xl font-semibold transition-opacity', t >= 1 ? 'opacity-100' : 'opacity-0')} data-testid="tv-result-line">
        {resultLine(game)}
      </span>
      <span className="text-xl text-ink-2">Totals by vote weight. Nobody sees how anyone voted.</span>
    </section>
  );
}

/** B: the stamp, and two big numbers. */
function RevealStamp({ game }: { game: MuleView }) {
  const c = game.politics!.council!;
  const r = c.result!;
  const t = useBeat(1_200);
  return (
    <section className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 rounded-sheet border border-holo-line bg-panel px-10 py-6" data-testid="tv-reveal-b" data-passed={r.passed}>
      <span className="font-display text-4xl font-semibold" data-testid="tv-reveal-proposal">
        {proposalWords(c.proposal)}
      </span>
      <span className="flex items-center gap-16">
        <span className="flex flex-col items-center">
          <span data-num className="font-mono text-9xl font-bold text-ok" data-testid="tv-yes">
            {r.yes}
          </span>
          <span className="label-caps text-xl!">Yes</span>
        </span>
        <Stamp passed={r.passed} show={t >= 1} big />
        <span className="flex flex-col items-center">
          <span data-num className="font-mono text-9xl font-bold text-alert" data-testid="tv-no">
            {r.no}
          </span>
          <span className="label-caps text-xl!">No</span>
        </span>
      </span>
      <span className={cx('text-3xl font-semibold transition-opacity', t >= 1 ? 'opacity-100' : 'opacity-0')} data-testid="tv-result-line">
        {resultLine(game)}
      </span>
    </section>
  );
}
