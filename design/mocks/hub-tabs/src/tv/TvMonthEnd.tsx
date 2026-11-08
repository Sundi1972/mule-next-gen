import { GAME, POLITICS } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { cx, PlayerMark, SeatSpeciesProvider } from '@mule/ui';
import { BuildSite, ColonyGauges, MonthScoreColumn, paidOutThisMonth } from '../../../../../apps/web/src/components/Colony';
import { ChangeTag, CollapseBanner, ColonyPanel, type Density } from '../../../../../apps/web/src/components/MonthEnd';
import { fmt, seatSpecies } from '../../../../../apps/web/src/game/derive';
import { inCollapse, league, leaderWords } from '../../../../../apps/web/src/game/month-end';
import { ReadyCount } from '../../../../../apps/web/src/phone/hub/ReadyBar';
import { TvHeader } from '../../../../../apps/web/src/table/TableApp';
import { FitHeight } from '../../../../../apps/web/src/table/TvFit';
import { brokenMove, brokenWho, brokenWords } from './copied/deals-words';
import { RepChip } from './copied/RepChip';
import { seatWordsText } from './copied/SeatWords';
import { brokenThisMonth } from './world';

/*
 * GRAFT TARGET: apps/web/src/table/TableApp.tsx's TvMonthEnd and apps/web/src/components/MonthEnd.tsx's LeagueTable
 * (WS4), copied from trunk (feat/strategist at 739fefb0) with the PM's 8 Nov rulings, each marked CHANGE:
 *   1. the paid-out total in the Wealth gauge's note, "fund 236 cr · paid out 499": trunk already draws it
 *      (ColonyGauges' paidOut, #tv-month-end-paid-out); unchanged here, fed by the world's upkeep (world.ts);
 *   2. the reputation chip after each name in the league (WS4's TV rep chips, the politics-deals mock's CHANGE);
 *   3. the breaker's row marked "✗ −10" after the chip, the full words in its accessible label, at no extra height
 *      (PM ruling A, 8 Nov 03:12Z: the broken-cards box measured 0.560 under TV-FIT's 0.7 floor, so the TV draws none;
 *      the full words stay in the planning banner and the news; the phone's month end lists them).
 * Left out, as the mock has no clock: the gauges' month-end drift and the grounds opener before this screen.
 */
export function TvMonthEnd({ game }: { game: MuleView }) {
  return (
    <SeatSpeciesProvider value={seatSpecies(game)}>
      <div className="flex h-[720px] w-[1280px] flex-col gap-3 bg-table px-10 py-8 text-ink" data-phase={game.phase} data-testid="tv-monthend">
        <div className="flex flex-col gap-3">
          <TvHeader game={game} title="End of the month" ready={<ReadyCount players={game.players} tv />} gauges={game.colony ? 'none' : true} />
        </div>
        {inCollapse(game) && <CollapseBanner density="tv" donations={!!game.colony} />}
        <FitHeight className="flex-1">
          {game.colony ? (
            <div className="grid flex-1 grid-cols-[minmax(0,6fr)_minmax(0,6fr)] gap-6">
              <MonthScoreColumn view={game}>
                <LeagueTable view={game} density="tv" />
              </MonthScoreColumn>
              <div className="flex flex-col gap-4">
                {/* CHANGE 1 (trunk's): the paid-out total in the Wealth note. */}
                <ColonyGauges colony={game.colony} size="tv" className="grid-cols-2!" paidOut={paidOutThisMonth(game.colony, game.month)} />
                <ColonyPanel view={game} density="tv" besideGauges />
                <BuildSite colony={game.colony} players={game.players} size="tv" compact />
              </div>
            </div>
          ) : (
            <div className="grid flex-1 grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-6">
              <LeagueTable view={game} density="tv" />
              <ColonyPanel view={game} density="tv" />
            </div>
          )}
        </FitHeight>
        <p className="truncate text-base leading-snug text-ink-2" data-testid="worth-rule">
          Worth: cash + goods at the store’s price + land at {GAME.plotScore} cr a plot + MULEs at {game.mulePrice} cr + {POLITICS.termScore} cr a term in office{game.colony ? ' + donations' : ''}. Your own lines are on your phone.
        </p>
      </div>
    </SeatSpeciesProvider>
  );
}

/**
 * CHANGE 3, a STAND-IN for WS4's real mark (being built, 8 Nov): what this month's broken cards cost a player, "✗ −10",
 * in the reputation chip's shape and the break's alert tone, so it reads as the chip's sibling. Several breaks by one
 * player sum. The label carries the full words, " · AI" on a computer seat by its id (SeatWords' rule).
 */
function BrokeMark({ view, id }: { view: MuleView; id: string }) {
  const cards = brokenThisMonth(view).filter((c) => (c.brokenBy ?? c.from) === id);
  if (cards.length === 0) return null;
  const move = cards.reduce((n, c) => n + brokenMove(c), 0);
  const words = cards.map((c) => `${seatWordsText(brokenWords(view, c), brokenWho(c), view.players)}: reputation −${-brokenMove(c)}`).join('. ');
  return (
    <span className="inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-chip border border-alert bg-alert-bg px-2 font-mono text-xl font-bold leading-8 text-alert-ink" role="img" aria-label={`${words}.`} data-testid={`league-broke-${id}`}>
      <span aria-hidden>✗</span>
      <span data-num aria-hidden>−{-move}</span>
    </span>
  );
}

// ---- LeagueTable, copied from MonthEnd.tsx with CHANGE 2 and 3 ----------------------------------------------------

type Size = { pad: string; head: string; rank: string; mark: number; name: string; worth: string; side: string; cell: string; callMark: number; call: string; cols: Cols };
/**
 * The number columns' widths, padding included, each sized for its largest number ("12,345", "↓ −12,345"); the name
 * column takes the rest. A header wider than its column wraps between words.
 */
type Cols = { rank: string; worth: string; uncut: string; change: string };

const SIZE: Record<Density, Size> = {
  tv: {
    pad: 'gap-3 p-5', head: 'text-sm!', rank: 'text-3xl', mark: 40, name: 'text-3xl', worth: 'text-4xl', side: 'text-2xl', cell: 'px-3 py-2', callMark: 48, call: 'text-4xl',
    cols: { rank: 'w-12', worth: 'w-[10rem]', uncut: 'w-[7rem]', change: 'w-[10rem]' },
  },
  phone: {
    pad: 'gap-2 p-3', head: 'text-[10px]!', rank: 'text-sm', mark: 22, name: 'text-base', worth: 'text-lg', side: 'text-sm', cell: 'px-1.5 py-1.5', callMark: 24, call: 'text-lg',
    cols: { rank: 'w-6', worth: 'w-[5rem]', uncut: 'w-[4rem]', change: 'w-[5.5rem]' },
  },
  compact: {
    pad: 'gap-1 px-2.5 py-1.5', head: 'text-[10px]!', rank: 'text-xs', mark: 16, name: 'text-sm', worth: 'text-base', side: 'text-xs', cell: 'px-1.5 py-0.5', callMark: 18, call: 'text-sm',
    cols: { rank: 'w-5', worth: 'w-[4.5rem]', uncut: 'w-[3.5rem]', change: 'w-[5rem]' },
  },
};

/** From this many players the TV's league is set a step tighter. */
const FULL_TABLE = 5;

/**
 * Everyone by Worth, the leader called out, the change since last month. Totals only. `final` (game over): the final
 * standings, no callout (the winner card has it) and no change column.
 */
function LeagueTable({ view, density, selfId, final = false }: { view: MuleView; density: Density; selfId?: string; final?: boolean }) {
  const lg = league(view);
  const collapse = inCollapse(view);
  // The change since last month, when there was a last month: none in month 1, none at game over.
  const changes = !final && lg.hasLastMonth;
  const tv = density === 'tv';
  const full = tv && !final && view.players.length >= FULL_TABLE;
  // At a full table the TV's rows and callout are a step tighter: the rows' type the same, the leader's line a step
  // smaller, so six rows and the colony's score fit the month end without scaling it down (PM ruling C, 5 Nov).
  const s = final && tv ? { ...SIZE.tv, mark: 36, cell: 'px-3 py-1.5' } : full ? { ...SIZE.tv, mark: 32, cell: 'px-3 py-1', callMark: 36, call: 'text-3xl' } : SIZE[density];
  const words = leaderWords(view, lg, selfId);
  const top = lg.rows[0];
  const th = cx('label-caps align-bottom font-normal', s.head);
  return (
    <section className={cx('relative flex min-h-0 flex-col rounded-panel border border-holo-line bg-panel', s.pad)} aria-label="League table" data-testid="league">
      {/* At a full table the TV drops this small row for the rows' height (PM ruling C, option 2): the callout and the
          column heads still say what the table is. */}
      {!full && (
        <header className="flex items-baseline justify-between gap-2">
          <h2 className={cx('label-caps', s.head)}>{final ? 'Final standings · by Worth' : `League table · month ${view.month}`}</h2>
          {tv && <span className="text-lg text-ink-3">Worth, in credits</span>}
        </header>
      )}

      {top && !final && (
        <div className={cx('relative flex items-center', tv ? cx('gap-4 rounded-panel border-2 border-holo bg-holo-soft px-5 shadow-glow', full ? 'py-1.5' : 'py-2.5') : 'gap-2')} data-testid="leader">
          <PlayerMark slot={top.slot} species={top.player.species} size={s.callMark} label={top.player.name} />
          <span className={cx('min-w-0 font-display font-semibold leading-tight', s.call)} data-testid="leader-line">
            {words.lead}
          </span>
          {words.you && (
            <span className={cx('ml-auto shrink-0 text-ink-2', density === 'compact' ? 'text-[11px]' : 'text-xs')} data-testid="leader-you">
              {words.you}
            </span>
          )}
        </div>
      )}

      {/* Fixed layout: a truncating name can't widen its column, so the numbers stay inside the panel. */}
      <table className="w-full table-fixed border-collapse text-left" data-testid="league-table">
        <thead>
          <tr>
            <th className={cx(th, s.cell, s.cols.rank)}>#</th>
            <th className={cx(th, s.cell)}>Player</th>
            <th className={cx(th, s.cell, s.cols.worth, 'text-right')} data-testid="worth-head">
              {collapse ? (tv ? 'If the game ended now' : 'If it ended now') : 'Worth'}
            </th>
            {collapse && (
              <th className={cx(th, s.cell, s.cols.uncut, 'text-right')} data-testid="uncut-head">
                Before the cut
              </th>
            )}
            {changes && (
              <th className={cx(th, s.cell, s.cols.change, 'text-right')} data-testid="change-head">
                Since month {view.month - 1}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {lg.rows.map((r) => {
            const mine = r.player.id === selfId;
            const lit = tv ? r.rank === 1 : mine;
            return (
              <tr key={r.player.id} className={cx('border-t border-holo-faint', lit && 'bg-holo-soft')} data-testid={`league-row-${r.player.id}`} data-mine={mine || undefined}>
                <td data-num className={cx('font-mono text-ink-3', s.rank, s.cell)} data-testid={`rank-${r.player.id}`}>
                  {r.rank}
                </td>
                <td className={s.cell}>
                  <span className={cx('flex min-w-0 items-center', tv ? 'gap-3' : 'gap-1.5')} title={r.player.name}>
                    <PlayerMark slot={r.slot} species={r.player.species} size={s.mark} label={r.player.name} />
                    <span className={cx('truncate font-display font-semibold', s.name)} data-testid={`name-${r.player.id}`}>
                      {!mine ? (
                        r.player.name
                      ) : final && !tv ? (
                        // The rail's final standings are narrow on a phone: your row's highlight and creature say who it is.
                        <>
                          <span data-testid={`you-name-${r.player.id}`}>You</span>
                          <span className="hidden @min-[1100px]/shell:inline" data-testid={`you-full-${r.player.id}`}>
                            {` (${r.player.name})`}
                          </span>
                        </>
                      ) : (
                        `You (${r.player.name})`
                      )}
                    </span>
                    {/* CHANGE 2: the reputation chip, on the TV and the phone beside it, not at 'compact'. */}
                    {density !== 'compact' && <RepChip view={view} id={r.player.id} tv={tv} testid={`league-rep-${r.player.id}`} />}
                    {/* CHANGE 3: the TV only; the phone's month end lists the cards in full. */}
                    {tv && <BrokeMark view={view} id={r.player.id} />}
                  </span>
                </td>
                <td className={cx(s.cell, 'text-right')}>
                  <span data-num className={cx('font-mono font-bold', s.worth)} data-testid={`worth-${r.player.id}`}>
                    {fmt(r.total)}
                  </span>
                </td>
                {collapse && (
                  <td className={cx(s.cell, 'text-right')}>
                    <span data-num className={cx('font-mono text-ink-3', s.side)} data-testid={`uncut-${r.player.id}`}>
                      {fmt(r.uncut)}
                    </span>
                  </td>
                )}
                {changes && (
                  <td className={cx(s.cell, 'text-right')}>
                    <ChangeTag change={r.change} className={s.side} testid={`change-${r.player.id}`} />
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
