import type { MuleView, OverruleView } from '@mule/protocol';
import { Creature, cx, PlayerMark } from '@mule/ui';
import { useEffect, useState } from 'react';
import { toSlot } from '../../../../../apps/web/src/game/derive';
import { colorOf } from '../../../../../apps/web/src/phone/hub/politics/parts';
import { TvHeader } from '../../../../../apps/web/src/table/TableApp';
import { TvBody } from '../../../../../apps/web/src/table/TvFit';
import { TvBudgetLine } from './TvBudgetLine';
import { neededWords, overruleQuestion, verdictWords } from './words';

/*
 * P14 · the overrule ballot and its reveal on the TV (moments 3–4), in TvCouncil's frame: the same header, body and
 * panels, the law's proposal replaced by the question and the tax's start against now. GRAFT TARGET: a new
 * apps/web/src/table/TvOverrule.tsx; TableApp routes to it while the overrule is open, after the election and the law
 * ballot (WS4's one route line, S5-C11).
 *
 * The reveal's bar differs from the law's on purpose: a law passes on more yes than no, an overrule on yes reaching
 * more than half of ALL votes (S5-RULE-8). So the bar is the table's whole vote weight, votes not cast in the middle,
 * and its mark stands at "needed", not at the half-way point of the votes cast.
 */
export function TvOverrule({ game }: { game: MuleView }) {
  const o = game.politics?.overrule;
  if (!o || (o.stage !== 'ballot' && o.stage !== 'reveal')) return null;
  const reveal = o.stage === 'reveal' && o.result;
  return (
    <div className="flex h-[720px] w-[1280px] flex-col gap-4 bg-table px-10 py-7 text-ink" data-phase="planning" data-testid={reveal ? 'tv-overrule-reveal' : 'tv-overrule-ballot'}>
      <TvHeader game={game} title={reveal ? 'The overrule vote · the result' : 'The overrule vote'} />
      <TvBody>
        {reveal ? <TvOverruleReveal game={game} o={o} result={o.result!} /> : <TvOverruleBallot game={game} o={o} />}
        <div className="mt-auto rounded-panel border border-holo-line bg-panel px-6 py-3" data-testid="tv-overrule-foot">
          <TvBudgetLine game={game} />
        </div>
      </TvBody>
    </div>
  );
}

/** The question, start against now, what it needs, and who has cast: never how. */
function TvOverruleBallot({ game, o }: { game: MuleView; o: OverruleView }) {
  const caller = game.players.find((p) => p.id === o.caller);
  const q = overruleQuestion(o);
  return (
    <>
      <div className="flex items-center gap-6">
        <span className="font-display text-4xl font-semibold text-holo">Vote on your phone</span>
        <span className="text-2xl text-ink-2">Nobody sees how.</span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_420px] gap-6">
        <section className="flex flex-col gap-4 rounded-sheet border border-holo-line bg-panel px-6 py-5" data-testid="tv-overrule-question">
          <span className="flex items-center gap-3 text-2xl text-ink-2">
            {caller && <Creature species={caller.species} color={colorOf(game, caller.id)} size={40} />}
            {caller?.name} called it on the Governor’s tax
          </span>
          <span className="font-display text-5xl font-semibold leading-tight" data-testid="tv-overrule-question-words">
            {q.question}
          </span>
          <span className="flex items-end gap-8" data-testid="tv-overrule-start-now">
            <span className="flex flex-col">
              <span className="label-caps text-sm!">At the month’s start</span>
              <span data-num className="font-mono text-6xl font-bold">
                {q.restore}%
              </span>
            </span>
            <span aria-hidden className="pb-2 font-mono text-5xl text-ink-3">
              →
            </span>
            <span className="flex flex-col">
              <span className="label-caps text-sm!">Now</span>
              <span data-num className="font-mono text-6xl font-bold text-warn">
                {q.now}%
              </span>
            </span>
          </span>
          <span className="text-xl text-ink-2">Yes puts it back to {q.restore}% before anything is sold this month. No keeps {q.now}%.</span>
          <span className="mt-auto font-display text-3xl font-semibold" data-testid="tv-overrule-needed">
            It {neededWords(o)}
          </span>
          <span className="text-lg text-ink-2">More than half of all the table’s votes, by weight: a vote not cast counts against it.</span>
        </section>
        <section className="flex flex-col gap-3 rounded-sheet border-2 border-holo bg-holo-soft px-6 py-4" data-testid="tv-overrule-cast">
          <span className="font-display text-3xl font-semibold" data-testid="tv-overrule-cast-count">
            Voted {o.done.length} of {game.players.length}
          </span>
          <ul className="flex flex-col gap-1.5">
            {game.players.map((p) => {
              const cast = o.done.includes(p.id);
              return (
                <li key={p.id} className={cx('flex items-center gap-3 text-2xl', cast ? 'text-ink-2' : 'font-semibold')} data-testid={`tv-overrule-cast-${p.id}`}>
                  <PlayerMark slot={toSlot(p.slot)} size={24} glow={!cast} />
                  <span className="flex-1 whitespace-nowrap">{p.name}</span>
                  <span className={cx('font-mono text-lg', cast ? 'text-ok' : 'text-holo')}>{cast ? 'VOTED ✓' : 'VOTING'}</span>
                </li>
              );
            })}
          </ul>
          <span className="text-lg text-ink-2">Each vote weighs by what its voter holds when the ballot closes: land, good name, taxes paid, the Land Baron.</span>
        </section>
      </div>
    </>
  );
}

/** 0 → 1 over `ms`, from `from` ms already shown: TvCouncil's beat (not exported there; the build shares one). */
function useBeat(ms: number, from: number) {
  const [t, setT] = useState(() => Math.min(1, from / ms));
  useEffect(() => {
    const start = performance.now() - from;
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

/** Of the reveal's clock, the share the bar takes to fill and the stamp to land, as the law's reveal. */
const BEAT_OF_REVEAL = 0.4;

/** The reveal: yes from the left, no from the right, out of all the table's votes; the mark at needed; then the stamp. */
function TvOverruleReveal({ game, o, result: r }: { game: MuleView; o: OverruleView; result: NonNullable<OverruleView['result']> }) {
  const t = useBeat(o.revealMs * BEAT_OF_REVEAL, o.clockMs);
  const fill = Math.min(1, t / 0.75);
  const v = verdictWords(o, r);
  const pct = (n: number) => `${(n / o.total) * 100}%`;
  return (
    <section className="flex min-h-0 flex-1 flex-col justify-center gap-6 rounded-sheet border border-holo-line bg-panel px-10 py-6" data-testid="tv-overrule-bar-reveal" data-passed={r.passed}>
      <span className="font-display text-4xl font-semibold" data-testid="tv-overrule-reveal-question">
        {overruleQuestion(o).question} {overruleQuestion(o).startNow}
      </span>
      <div className="flex items-end justify-between font-mono font-bold">
        <span className="flex flex-col">
          <span className="label-caps text-base!">Yes</span>
          <span data-num className="text-6xl text-ok" data-testid="tv-overrule-yes">
            {Math.round(r.yes * fill)}
          </span>
        </span>
        <span
          className={cx(
            'rounded-panel border-4 px-8 py-1 font-display text-6xl font-bold uppercase tracking-widest transition-[opacity,transform] duration-300',
            r.passed ? 'border-ok text-ok shadow-glow' : 'border-alert text-alert shadow-glow-alert',
            t >= 1 ? 'rotate-[-4deg] scale-100 opacity-100' : 'scale-150 opacity-0',
          )}
          data-testid="tv-overrule-stamp"
        >
          {v.stamp}
        </span>
        <span className="flex flex-col items-end">
          <span className="label-caps text-base!">No</span>
          <span data-num className="text-6xl text-alert" data-testid="tv-overrule-no">
            {Math.round(r.no * fill)}
          </span>
        </span>
      </div>
      {/* The bar is all the table's votes: widths are vote shares, not design values. */}
      <div className="relative h-12 overflow-hidden rounded-full border border-holo-line bg-raised" data-testid="tv-overrule-bar">
        <span className="absolute inset-y-0 left-0 bg-ok" style={{ width: `calc(${pct(r.yes)} * ${fill})` }} data-testid="tv-overrule-bar-yes" />
        <span className="absolute inset-y-0 right-0 bg-alert" style={{ width: `calc(${pct(r.no)} * ${fill})` }} data-testid="tv-overrule-bar-no" />
        {/* Needed: the mark yes must reach. A thin mark, with a wide transparent sibling to select. */}
        <span className="absolute inset-y-0 w-4 -translate-x-1/2" style={{ left: pct(o.needed) }} data-testid="tv-overrule-bar-needed" />
        <span className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-ink" style={{ left: pct(o.needed) }} />
      </div>
      <span className="-mt-4 text-lg text-ink-2" style={{ paddingLeft: pct(o.needed) }} data-testid="tv-overrule-bar-needed-label">
        ↑ needed {o.needed} of {o.total}
      </span>
      <span className={cx('text-3xl font-semibold transition-opacity', t >= 1 ? 'opacity-100' : 'opacity-0')} data-testid="tv-overrule-verdict">
        {v.line}
      </span>
      <span className="text-xl text-ink-2">Totals by vote weight. Nobody sees how anyone voted. Then the land grant.</span>
    </section>
  );
}
