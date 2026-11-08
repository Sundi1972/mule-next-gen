// Copied from design/mocks/politics-deals/src/proposed/MonthEnd.tsx (7–8 Nov); changes for the prototype are marked TABS:.
import type { DealCard } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { cx, PlayerMark } from '@mule/ui';
import { fmt, toSlot } from '../../../../../../apps/web/src/game/derive';
import { inCollapse, league, leaderWords } from '../../../../../../apps/web/src/game/month-end';
import { ChangeTag, type Density } from '../../../../../../apps/web/src/components/MonthEnd';
import { Marked, RepChip } from './parts';
import { brokenMove, brokenWords } from './words';

/*
 * GRAFT TARGET: apps/web/src/components/MonthEnd.tsx (WS4; S3-C20, S3-C19).
 *   BrokenCards: the month's broken cards, on the TV's month end (under ColonyPanel) and the phone's (under the league).
 *     Public, whole: who promised what to whom (the frozen rule; Heiko may overrule, spec "Decisions for Heiko").
 *   LeagueTable: as today, with one change, marked CHANGE: each name carries its reputation chip, on the TV and the
 *     phone beside a TV; not at 'compact' (the phone with no TV, where the name column has no room: P0's rule).
 */

/** The cards broken in `month`, newest first. */
export const brokenIn = (view: Pick<MuleView, 'politics'>, month: number): DealCard[] => (view.politics?.brokenDeals ?? []).filter((c) => c.settled === month);

export function BrokenCards({ view, month, density }: { view: MuleView; month: number; density: Density }) {
  const cards = brokenIn(view, month);
  if (cards.length === 0) return null;
  const tv = density === 'tv';
  return (
    <section className={cx('flex flex-col rounded-panel border-2 border-dashed border-alert bg-panel', tv ? 'gap-2 p-5' : 'gap-1 px-2.5 py-1.5')} aria-label="Cards broken this month" data-testid="broken-cards">
      <h2 className={cx('label-caps', tv ? 'text-base!' : 'text-[10px]!')}>Broken this month · in public</h2>
      <ul className={cx('flex flex-col', tv ? 'gap-2' : 'gap-0.5')}>
        {cards.map((c) => {
          const who = view.players.find((p) => p.id === (c.brokenBy ?? c.from))!;
          return (
            <li key={c.id} className={cx('flex items-center', tv ? 'gap-3 text-2xl' : 'gap-1.5 text-xs')} data-testid={`broken-${c.id}`}>
              <span aria-hidden className={cx('shrink-0 font-mono font-bold text-alert', tv ? 'text-2xl' : 'text-xs')}>
                ✗
              </span>
              <PlayerMark slot={toSlot(who.slot)} species={who.species} size={tv ? 28 : 14} label={who.name} />
              <span className="min-w-0 flex-1 leading-snug">
                <Marked text={brokenWords(view, c)} view={view} />
              </span>
              <span data-num className={cx('shrink-0 font-mono font-bold text-alert', tv ? 'text-2xl' : 'text-xs')}>
                −{-brokenMove(c)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---- LeagueTable, with the chip ------------------------------------------------------------------------------------

type Size = { pad: string; head: string; rank: string; mark: number; name: string; worth: string; side: string; cell: string; callMark: number; call: string; cols: { rank: string; worth: string; uncut: string; change: string } };
const SIZE: Record<Density, Size> = {
  tv: { pad: 'gap-3 p-5', head: 'text-sm!', rank: 'text-3xl', mark: 40, name: 'text-3xl', worth: 'text-4xl', side: 'text-2xl', cell: 'px-3 py-2', callMark: 48, call: 'text-4xl', cols: { rank: 'w-12', worth: 'w-[10rem]', uncut: 'w-[7rem]', change: 'w-[10rem]' } },
  phone: { pad: 'gap-2 p-3', head: 'text-[10px]!', rank: 'text-sm', mark: 22, name: 'text-base', worth: 'text-lg', side: 'text-sm', cell: 'px-1.5 py-1.5', callMark: 24, call: 'text-lg', cols: { rank: 'w-6', worth: 'w-[5rem]', uncut: 'w-[4rem]', change: 'w-[5.5rem]' } },
  compact: { pad: 'gap-1 px-2.5 py-1.5', head: 'text-[10px]!', rank: 'text-xs', mark: 16, name: 'text-sm', worth: 'text-base', side: 'text-xs', cell: 'px-1.5 py-0.5', callMark: 18, call: 'text-sm', cols: { rank: 'w-5', worth: 'w-[4.5rem]', uncut: 'w-[3.5rem]', change: 'w-[5rem]' } },
};
const FULL_TABLE = 5;

export function LeagueTable({ view, density, selfId }: { view: MuleView; density: Density; selfId?: string }) {
  const lg = league(view);
  const collapse = inCollapse(view);
  const changes = lg.hasLastMonth;
  const tv = density === 'tv';
  const full = tv && view.players.length >= FULL_TABLE;
  const s = full ? { ...SIZE.tv, mark: 32, cell: 'px-3 py-1', callMark: 36, call: 'text-3xl' } : SIZE[density];
  const words = leaderWords(view, lg, selfId);
  const top = lg.rows[0];
  const th = cx('label-caps align-bottom font-normal', s.head);
  return (
    <section className={cx('relative flex min-h-0 flex-col rounded-panel border border-holo-line bg-panel', s.pad)} aria-label="League table" data-testid="league">
      {!full && (
        <header className="flex items-baseline justify-between gap-2">
          <h2 className={cx('label-caps', s.head)}>{`League table · month ${view.month}`}</h2>
          {tv && <span className="text-lg text-ink-3">Worth, in credits</span>}
        </header>
      )}
      {top && (
        <div className={cx('relative flex items-center', tv ? cx('gap-4 rounded-panel border-2 border-holo bg-holo-soft px-5 shadow-glow', full ? 'py-1.5' : 'py-2.5') : 'gap-2')} data-testid="leader">
          <PlayerMark slot={top.slot} species={top.player.species} size={s.callMark} label={top.player.name} />
          <span className={cx('min-w-0 font-display font-semibold leading-tight', s.call)}>{words.lead}</span>
        </div>
      )}
      <table className="w-full table-fixed border-collapse text-left" data-testid="league-table">
        <thead>
          <tr>
            <th className={cx(th, s.cell, s.cols.rank)}>#</th>
            <th className={cx(th, s.cell)}>Player</th>
            <th className={cx(th, s.cell, s.cols.worth, 'text-right')}>{collapse ? 'If it ended now' : 'Worth'}</th>
            {changes && <th className={cx(th, s.cell, s.cols.change, 'text-right')}>Since month {view.month - 1}</th>}
          </tr>
        </thead>
        <tbody>
          {lg.rows.map((r) => {
            const mine = r.player.id === selfId;
            const lit = tv ? r.rank === 1 : mine;
            return (
              <tr key={r.player.id} className={cx('border-t border-holo-faint', lit && 'bg-holo-soft')} data-testid={`league-row-${r.player.id}`}>
                <td data-num className={cx('font-mono text-ink-3', s.rank, s.cell)}>
                  {r.rank}
                </td>
                <td className={s.cell}>
                  <span className={cx('flex min-w-0 items-center', tv ? 'gap-3' : 'gap-1.5')} title={r.player.name}>
                    <PlayerMark slot={r.slot} species={r.player.species} size={s.mark} label={r.player.name} />
                    <span className={cx('truncate font-display font-semibold', s.name)} data-testid={`name-${r.player.id}`}>
                      {mine ? `You (${r.player.name})` : r.player.name}
                    </span>
                    {/* CHANGE: the reputation chip, not at 'compact'. */}
                    {density !== 'compact' && <RepChip view={view} id={r.player.id} tv={tv} testid={`league-rep-${r.player.id}`} />}
                  </span>
                </td>
                <td className={cx(s.cell, 'text-right')}>
                  <span data-num className={cx('font-mono font-bold', s.worth)}>
                    {fmt(r.total)}
                  </span>
                </td>
                {changes && (
                  <td className={cx(s.cell, 'text-right')}>
                    <ChangeTag change={r.change} className={s.side} />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
