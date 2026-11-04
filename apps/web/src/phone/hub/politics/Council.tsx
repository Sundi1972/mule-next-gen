import { POLITICS } from '@mule/engine';
import { cx } from '@mule/ui';
import { useEffect } from 'react';
import { usePhoneGame } from '../../game';
import { useWide } from '../../Shell';
import { useHub } from '../Hub';
import { colorOf, OfficesCard, Person, Section } from './parts';
import { Blocks } from './Reveal';
import { RunBlock } from './Run';
import { howWords, OFFICE_NAME } from './words';

/** Council: this month's result once the election is over, then running for office and what the Governor does. */
export function CouncilDesk() {
  const { focus, takeFocus } = useHub();
  useEffect(() => {
    if (focus !== null) takeFocus();
  }, [focus]);
  return <CouncilBody focus={focus} />;
}

/** The desk's body. `focus` is the door it was opened by: 'run' asks for a promise, or shows your candidacy once you run. */
export function CouncilBody({ focus }: { focus: string | null }) {
  const { view, me } = usePhoneGame();
  const politics = view.politics;
  const running = me.politics?.running ?? null;
  const toRun = focus === 'run';
  useEffect(() => {
    if (toRun && running) document.querySelector('[data-testid="run-office"]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [toRun, running]);
  if (!politics || !me.politics) return null;
  return (
    <>
      {politics.election?.stage === 'over' && (
        <>
          <Section title={`Election results · month ${view.month}`} testid="council-result">
            <ResultList />
          </Section>
          {politics.next !== null && <p className="text-xs text-ink-2 @min-[1100px]/shell:text-sm">Run for office any month: the next election is in month {politics.next}.</p>}
        </>
      )}
      {politics.next !== null && <RunBlock sheet={toRun && !running} />}
      <OfficesCard />
    </>
  );
}

/** E-6: every candidate with their votes, and how each office was won, in plain words. */
function ResultList() {
  const { view, me } = usePhoneGame();
  const wide = useWide();
  const result = view.politics!.election!.result;
  return (
    <div className="flex flex-col gap-1.5 @min-[1100px]/shell:gap-3" data-testid="result-list">
      {POLITICS.offices.map((o) => {
        const r = result[o];
        if (!r?.winner || !r.how) return null;
        const race = { winner: r.winner, how: r.how, tallies: r.tallies };
        // An appointed office had no ballot: its holder stands alone, with no votes.
        const rows = r.tallies.length > 0 ? r.tallies : [{ id: r.winner, votes: 0 }];
        return (
          <section key={o} className="flex flex-col gap-0.5 @min-[1100px]/shell:gap-1" data-testid={`result-${o}`}>
            <span className="text-xs font-semibold text-ink-2 @min-[1100px]/shell:text-base">{OFFICE_NAME[o]}</span>
            {rows.map((t) => (
              <span key={t.id} className="flex flex-wrap items-center gap-x-2 text-xs @min-[1100px]/shell:text-base" data-testid={`result-${o}-${t.id}`}>
                <Person view={view} id={t.id} me={me.id} size={wide ? 20 : 14} />
                <Blocks n={t.votes} color={colorOf(view, t.id)} className="h-2.5 w-3 @min-[1100px]/shell:h-3.5 @min-[1100px]/shell:w-4" />
                <span data-num className="font-mono font-bold">
                  {t.votes} vote{t.votes === 1 ? '' : 's'}
                </span>
                {t.id === r.winner && <span className="rounded-chip bg-holo px-1 font-mono text-[10px] font-bold leading-4 text-on-holo @min-[1100px]/shell:text-xs">ELECTED</span>}
              </span>
            ))}
            <span className={cx('text-[11px] leading-snug @min-[1100px]/shell:text-sm', r.how === 'votes' ? 'text-ink-2' : 'text-warn')} data-testid={`result-how-${o}`}>
              {howWords(race, me.id, view)}
            </span>
          </section>
        );
      })}
    </div>
  );
}
