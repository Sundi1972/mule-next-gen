import { Creature, cx, SLOT_COLOR, type Slot } from '@mule/ui';
import { useEffect, useState } from 'react';
import { TvHeader } from '../../../../../apps/web/src/table/TableApp';
import { VIEW } from '../fixture';

/**
 * WS7 slice 1 (Heiko approved 2026-10-22): the ballot reveal. Votes are cast
 * in secret on the phones during planning; when the countdown ends, the result
 * appears on every screen at the same moment.
 *
 * Secret ballot (05-colony-politics "Elections: How"): the reveal shows each
 * candidate's total, built from vote-weight blocks, never who cast which vote.
 * A block's size is one vote; a voter's weight (1 + land + reputation + titles
 * + taxes paid) arrives as that many blocks, unlabelled. The Land Baron breaks
 * a tie, and says so when it happens.
 *
 * GRAFT TARGETS: apps/web/src/table/TableApp.tsx (a planning branch, WS4's
 * file, WS7 builds); the phone's result card in the hub's Council desk.
 * Data from WS7: per office the candidates, their totals and the winner; the
 * reveal time (server clock); a tie flag and who broke it.
 */

type How = 'votes' | 'unopposed' | 'appointed' | 'baron' | 'tieRule';
type Race = { office: 'Governor' | 'Sheriff'; cands: { id: string; promise: string; votes: number }[]; winner: string; how: How; baron?: string };

/** How a race was won, in WS7's words (result[office].how). */
const HOW: Record<How, (r: Race) => string> = {
  votes: () => 'Won on votes.',
  unopposed: () => 'Elected unopposed: no ballot for this office.',
  appointed: (r) => (r.office === 'Sheriff' ? 'Nobody ran: the richest player who isn’t Governor is appointed.' : 'Nobody ran: the richest player is appointed.'),
  baron: (r) => `A tie: ${P[r.baron ?? '']?.name ?? 'the Land Baron'}, the Land Baron, broke it.`,
  tieRule: () => 'Tied: most plots wins, then seat order.',
};

const RACES: Race[] = [
  { office: 'Governor', cands: [{ id: 'ossa', promise: 'No land tax', votes: 4 }, { id: 'kai', promise: 'Cleanup squad from month 5', votes: 5 }], winner: 'kai', how: 'votes' },
  { office: 'Sheriff', cands: [{ id: 'brix', promise: 'Guards on every factory', votes: 4 }, { id: 'lena', promise: 'I will catch the saboteur', votes: 4 }], winner: 'lena', how: 'baron', baron: 'ossa' },
];

const P = Object.fromEntries(VIEW.players.map((p, i) => [p.id, { ...p, slot: i as Slot }]));

/** Seconds since the mock opened, for the countdown and the reveal. */
function useT(start: number) {
  const [t, setT] = useState(start);
  useEffect(() => {
    const id = setInterval(() => setT((x) => x + 0.1), 100);
    return () => clearInterval(id);
  }, []);
  return t;
}

const COUNT = 3;

export function TvElection({ revealed = false }: { revealed?: boolean }) {
  const t = useT(revealed ? COUNT + 3 : 0);
  const left = Math.max(0, Math.ceil(COUNT - t));
  const shown = t >= COUNT;
  return (
    <div className="flex h-[720px] w-[1280px] flex-col gap-5 bg-table px-10 py-7 text-ink" data-phase="planning" data-testid="tv-election">
      <TvHeader game={{ ...VIEW, phase: 'planning', month: 4 }} title="Election · month 4" />
      {!shown ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-6" data-testid="ballot-countdown">
          <span className="label-caps text-xl!">The ballots are in · secret ballot</span>
          <span data-num className="font-display text-[160px] font-bold leading-none text-holo" style={{ textShadow: '0 0 40px var(--color-holo-line)' }}>
            {left}
          </span>
          <span className="text-2xl text-ink-2">Governor and Sheriff, revealed on every screen together</span>
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-2 gap-8" data-testid="ballot-reveal">
          {RACES.map((r, k) => (
            <section key={r.office} className="flex flex-col gap-4 rounded-sheet border border-holo-line bg-panel p-6">
              <h2 className="font-display text-3xl font-semibold">{r.office}</h2>
              {r.cands.map((c) => {
                const p = P[c.id]!;
                const win = c.id === r.winner;
                return (
                  <div key={c.id} className={cx('flex items-center gap-4 rounded-panel p-3', win && 'bg-holo-soft ring-2 ring-holo')} data-testid={`result-${r.office.toLowerCase()}-${c.id}`}>
                    <Creature species={p.species} color={SLOT_COLOR[p.slot]} size={64} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex items-baseline gap-3">
                        <span className="font-display text-2xl font-semibold">{p.name}</span>
                        <span className="truncate text-lg text-ink-2">“{c.promise}”</span>
                      </span>
                      <span className="flex gap-1.5" aria-label={`${c.votes} votes`}>
                        {Array.from({ length: c.votes }, (_, i) => (
                          <span
                            key={i}
                            className="h-7 w-9 rounded-[6px] animate-[show-badge-in_0.35s_ease-out_both]"
                            style={{ background: SLOT_COLOR[p.slot], animationDelay: `${0.35 * k + 0.12 * i}s` }}
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
              <span className={cx('text-lg', r.how === 'votes' ? 'text-ink-2' : 'text-warn')} data-testid={`how-${r.office.toLowerCase()}`}>
                {HOW[r.how](r)}
              </span>
            </section>
          ))}
          <p className="col-span-2 text-center text-xl text-ink-2">Each block is one vote. Who voted for whom stays secret.</p>
        </div>
      )}
    </div>
  );
}

/** The same moment on a phone: your part of it, at a glance. */
export function PhoneElectionResult() {
  return (
    <div className="flex h-full items-center justify-center bg-table p-4 text-ink" data-testid="phone-election-result">
      <div className="flex w-full max-w-[640px] flex-col gap-3 rounded-sheet border-2 border-holo bg-panel p-4 shadow-glow">
        <span className="label-caps">Election results · month 4</span>
        {RACES.map((r) => {
          const p = P[r.winner]!;
          const v = r.cands.find((c) => c.id === r.winner)!.votes;
          return (
            <span key={r.office} className="flex items-center gap-3">
              <span className="w-20 text-sm text-ink-2">{r.office}</span>
              <Creature species={p.species} color={SLOT_COLOR[p.slot]} size={32} />
              <span className="font-display text-xl font-semibold">{p.id === 'lena' ? 'You' : p.name}</span>
              <span className="font-mono text-sm text-ink-3">
                {v} votes · {HOW[r.how](r)}
              </span>
            </span>
          );
        })}
        <span className="rounded-control bg-holo-soft px-3 py-2 text-sm">You are the Sheriff until month 7.</span>
      </div>
    </div>
  );
}
