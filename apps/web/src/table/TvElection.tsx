import { POLITICS } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { Creature, cx, SLOT_COLOR } from '@mule/ui';
import { slotOf } from '../game/derive';
import { howWon, OFFICE_NAME, promiseText } from '../phone/hub/politics/words';
import { TvHeader } from './TableApp';

/**
 * The ceremony on the big screen: a count through the first office's intro, then each office as the view reveals
 * it, its candidates' weighted totals from its bars step and the winner marked from its winner step. Never who
 * voted for whom.
 */
export function TvElection({ game }: { game: MuleView }) {
  const politics = game.politics;
  const election = politics?.election;
  if (!politics || !election) return null;
  const result = election.result;
  const shown = POLITICS.offices.filter((office) => result[office]);
  const baron = politics.baron ? (game.players.find((p) => p.id === politics.baron)?.name ?? null) : null;
  return (
    <div className="flex h-[720px] w-[1280px] flex-col gap-5 bg-table px-10 py-7 text-ink" data-phase="planning" data-testid="tv-election">
      <TvHeader game={game} title={`Election · month ${game.month}`} />
      {shown.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-6" data-testid="ballot-countdown">
          <span className="label-caps text-xl!">The ballots are in · secret ballot</span>
          <span data-num className="font-display text-[160px] font-bold leading-none text-holo" style={{ textShadow: '0 0 40px var(--color-holo-line)' }}>
            {Math.ceil(election.ceremony?.seconds ?? 0)}
          </span>
          <span className="text-2xl text-ink-2">{POLITICS.offices.map((office) => OFFICE_NAME[office]).join(', then ')}, revealed on every screen together</span>
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-2 gap-8" data-testid="ballot-reveal">
          {shown.map((office, k) => {
            const r = result[office]!;
            // An appointed office had no ballot: its holder stands alone, with no votes.
            const cands = r.tallies.length > 0 ? r.tallies : r.winner ? [{ id: r.winner, votes: 0 }] : [];
            return (
              <section key={office} className="flex flex-col gap-4 rounded-sheet border border-holo-line bg-panel p-6">
                <h2 className="font-display text-3xl font-semibold">{OFFICE_NAME[office]}</h2>
                {cands.map((c) => {
                  const p = game.players.find((q) => q.id === c.id);
                  const color = SLOT_COLOR[slotOf(game, c.id) ?? 0];
                  const win = c.id === r.winner;
                  // Only a Governor candidate stands on a promise.
                  const promise = office === 'governor' ? election.promises[c.id] : undefined;
                  return (
                    <div key={c.id} className={cx('flex items-center gap-4 rounded-panel p-3', win && 'bg-holo-soft ring-2 ring-holo')} data-testid={`result-${office}-${c.id}`}>
                      {p && <Creature species={p.species} color={color} size={64} />}
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex items-baseline gap-3">
                          <span className="font-display text-2xl font-semibold">{p?.name}</span>
                          {promise && <span className="truncate text-lg text-ink-2">“{promiseText(promise)}”</span>}
                        </span>
                        <span className="flex gap-1.5" aria-label={`${c.votes} votes`}>
                          {Array.from({ length: c.votes }, (_, i) => (
                            <span
                              key={i}
                              className="h-7 w-9 rounded-[6px] animate-[show-badge-in_0.35s_ease-out_both]"
                              style={{ background: color, animationDelay: `${0.35 * k + 0.12 * i}s` }}
                            />
                          ))}
                        </span>
                      </div>
                      <span data-num className="font-mono text-5xl font-bold">
                        {c.votes}
                      </span>
                      {win && <span className="rounded-chip bg-holo px-3 py-1 font-mono text-lg font-bold text-on-holo">ELECTED</span>}
                    </div>
                  );
                })}
                {r.how && (
                  <span className={cx('text-lg', r.how === 'votes' ? 'text-ink-2' : 'text-warn')} data-testid={`how-${office}`}>
                    {howWon(office, r.how, baron)}
                  </span>
                )}
              </section>
            );
          })}
          <p className="col-span-2 text-center text-xl text-ink-2">Each block is one vote. Who voted for whom stays secret.</p>
        </div>
      )}
    </div>
  );
}
