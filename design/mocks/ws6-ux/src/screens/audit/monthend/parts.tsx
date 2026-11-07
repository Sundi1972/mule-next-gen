import { GAME, POLITICS } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { AirGauge, airBandStyle, cx, GoodIcon, PlayerMark } from '@mule/ui';
import type { ReactNode } from 'react';
import { colonyVerdict, fmt, toSlot } from '../../../../../../../apps/web/src/game/derive';
import { IntentMarker } from '../../../proposed/IntentNote';
import { collapseCutWords, colonyReport, inCollapse, league, worthOf, type League, type MonthFacts } from '../../../proposed/worth';
import { Private } from '../../PlanningHub';
import { MONTHEND_NOTES as N } from './notes';

/**
 * The month-end's parts, each drawn at three sizes: the TV at 1280 × 720 ('tv'), the phone beside a TV ('phone'),
 * and the phone with no TV, which must fit the table and the colony panel on one stage ('compact').
 *
 * GRAFT TARGET (WS4): a new apps/web/src/table/TvMonthEnd.tsx replacing TableApp.tsx's MonthEnd and Scores, and a
 * new apps/web/src/phone/MonthEnd.tsx in the phone's upkeep phase. At game over (`final`), TableApp.tsx's TvGameOver
 * and apps/web/src/phone/GameOver.tsx keep their layout and testids (tv-winner, tv-scores, tv-verdict; winner, my-rank,
 * scores, verdict, leave) and take Worth in credits from here. Keep every data-testid; drop every IntentMarker.
 */

export type Density = 'tv' | 'phone' | 'compact';

/** The colony panel names at most this many who went hungry, then one line: "+N more went hungry". */
export const HUNGRY_LINES = 2;

export const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

const name = (view: MuleView, id: string) => view.players.find((p) => p.id === id)?.name ?? id;

/** "Ossa leads by 210 cr", and for a seat: "You're 2nd, 210 behind". */
export function leaderWords(view: MuleView, lg: League, selfId?: string): { lead: string; you: string | null } {
  if (!lg.leader) return { lead: '', you: null };
  const { id, by, level } = lg.leader;
  const who = (x: string) => (x === selfId ? 'You' : name(view, x));
  const lead =
    level.length > 1
      ? `${level.map(who).sort((a, b) => (a === 'You' ? -1 : b === 'You' ? 1 : 0)).join(' and ')} are level`
      : `${who(id)} ${id === selfId ? 'lead' : 'leads'} by ${fmt(by)} cr`;
  const mine = selfId ? lg.rows.find((r) => r.player.id === selfId) : undefined;
  const top = lg.rows[0];
  const you = mine && top && mine.rank > 1 ? `You’re ${ordinal(mine.rank)}, ${fmt(top.total - mine.total)} behind` : null;
  return { lead, you };
}

/** At the game's end: "Ossa wins with a Worth of 5,643 cr", or a shared win. */
export function winnerWords(view: MuleView, lg: League): string {
  if (!lg.leader || !lg.rows[0]) return '';
  const worth = `${fmt(lg.rows[0].total)} cr`;
  return lg.leader.level.length > 1 ? `${lg.leader.level.map((id) => name(view, id)).join(' and ')} share the colony, each with a Worth of ${worth}` : `${name(view, lg.leader.id)} wins with a Worth of ${worth}`;
}

/** ↑ +120 green, ↓ −40 red, ± 0 grey: the change since last month, never colour alone. */
export function ChangeTag({ change, className, testid }: { change: number | null; className?: string; testid?: string }) {
  if (change === null)
    return (
      <span className={cx('text-ink-3', className)} data-testid={testid}>
        —
      </span>
    );
  const up = change > 0;
  const down = change < 0;
  return (
    <span
      data-num
      className={cx('whitespace-nowrap font-mono font-semibold', up ? 'text-ok' : down ? 'text-alert' : 'text-ink-3', className)}
      aria-label={up ? `up ${change} credits` : down ? `down ${-change} credits` : 'no change'}
      data-testid={testid}
    >
      {up ? `↑ +${fmt(change)}` : down ? `↓ −${fmt(-change)}` : '± 0'}
    </span>
  );
}

// --- The league table ---------------------------------------------------------------------------------

/**
 * `col`: the fixed columns' widths (rank, Worth, before the cut, the change). The table is `table-fixed` and the name
 * column takes the rest, so a long name truncates and the numbers never leave the panel (a real build, 2026-10-29: "The
 * Accountant" and a 16-character name pushed Collapse's columns 40 to 180 px out of their panel). Each width holds its
 * longest number ("↓ −1,007", "5,643") and its header in at most two lines.
 */
const SIZE: Record<Density, { pad: string; head: string; rank: string; mark: number; name: string; worth: string; side: string; cell: string; callMark: number; call: string; col: [string, string, string, string] }> = {
  tv: { pad: 'gap-3 p-5', head: 'text-sm!', rank: 'text-3xl', mark: 40, name: 'text-3xl', worth: 'text-4xl', side: 'text-2xl', cell: 'px-3 py-2', callMark: 48, call: 'text-4xl', col: ['w-12', 'w-36', 'w-24', 'w-36'] },
  phone: { pad: 'gap-2 p-3', head: 'text-[10px]!', rank: 'text-sm', mark: 22, name: 'text-base', worth: 'text-lg', side: 'text-sm', cell: 'px-1.5 py-1.5', callMark: 24, call: 'text-lg', col: ['w-6', 'w-20', 'w-16', 'w-20'] },
  compact: { pad: 'gap-1 px-2.5 py-1.5', head: 'text-[10px]!', rank: 'text-xs', mark: 16, name: 'text-sm', worth: 'text-base', side: 'text-xs', cell: 'px-1.5 py-0.5', callMark: 18, call: 'text-sm', col: ['w-5', 'w-20', 'w-16', 'w-20'] },
};

/**
 * The league table: everyone by Worth, the leader called out, the change since last month. Totals only. `final` (game
 * over): the final standings, no callout (the winner card calls the winner out) and no change column.
 */
export function LeagueTable({ view, facts, density, selfId, final = false }: { view: MuleView; facts: MonthFacts; density: Density; selfId?: string; final?: boolean }) {
  const lg = league(view, facts.lastWorth);
  const collapse = inCollapse(view);
  const tv = density === 'tv';
  // The TV's rows pack tighter at game over and in Collapse (its headers take two lines), so all four rows show.
  const s = (final || collapse) && tv ? { ...SIZE.tv, mark: 36, cell: 'px-3 py-1.5' } : SIZE[density];
  const words = leaderWords(view, lg, selfId);
  const top = lg.rows[0];
  // A header wraps inside its fixed column (at most two lines), so a Collapse column never squeezes the name.
  const th = cx('label-caps align-bottom font-normal', s.head);
  return (
    <section className={cx('relative flex min-h-0 flex-col rounded-panel border border-holo-line bg-panel', s.pad)} aria-label="League table" data-testid="league">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className={cx('label-caps', s.head)}>{/* In a small phone's rail "· by Worth" wrapped to a second line; the Worth column says it there. */}
          {final ? (tv ? 'Final standings · by Worth' : 'Final standings') : `League table · month ${view.month}`}</h2>
        {tv && <span className="text-lg text-ink-3">Worth, in credits</span>}
      </header>

      {top && !final && (
        <div
          className={cx('relative flex items-center', tv ? 'gap-4 rounded-panel border-2 border-holo bg-holo-soft px-5 py-2.5 shadow-glow' : 'gap-2')}
          data-testid="leader"
        >
          <PlayerMark slot={top.slot} species={top.player.species} size={s.callMark} label={top.player.name} />
          <span className={cx('min-w-0 font-display font-semibold leading-tight', s.call)} data-testid="leader-line">
            {words.lead}
          </span>
          {words.you && (
            <span className={cx('ml-auto shrink-0 text-ink-2', density === 'compact' ? 'text-[11px]' : 'text-xs')} data-testid="leader-you">
              {words.you}
            </span>
          )}
          <IntentMarker note={N.M2} at={tv ? 'tr' : 'left'} />
        </div>
      )}

      <table className="w-full table-fixed border-collapse text-left" data-testid="league-table">
        <colgroup>
          <col className={s.col[0]} />
          <col />
          <col className={s.col[1]} />
          {collapse && <col className={s.col[2]} />}
          {!final && <col className={s.col[3]} />}
        </colgroup>
        <thead>
          <tr>
            <th className={cx(th, s.cell)}>#</th>
            <th className={cx(th, s.cell)}>Player</th>
            <th className={cx(th, s.cell, 'relative text-right')} data-testid="worth-head">
              {collapse ? (tv ? 'If the game ended now' : 'If it ended now') : 'Worth'}
              <IntentMarker note={N.M5} part={tv ? 'tv' : 'phone'} at="tl" />
            </th>
            {collapse && (
              <th className={cx(th, s.cell, 'text-right')} data-testid="uncut-head">
                Before the cut
              </th>
            )}
            {!final && (
              <th className={cx(th, s.cell, 'relative text-right')} data-testid="change-head">
                Since month {view.month - 1}
                <IntentMarker note={N.M3} at="tr" />
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {lg.rows.map((r) => {
            const mine = r.player.id === selfId;
            const lit = tv ? r.rank === 1 : mine;
            return (
              <tr key={r.player.id} className={cx('border-t border-holo-faint', lit && 'bg-holo-soft')} data-testid={`league-row-${r.player.id}`}>
                <td data-num className={cx('font-mono text-ink-3', s.rank, s.cell)} data-testid={`rank-${r.player.id}`}>
                  {r.rank}
                </td>
                <td className={cx(s.cell, 'overflow-hidden')}>
                  <span className={cx('flex min-w-0 items-center', tv ? 'gap-3' : 'gap-1.5')} title={r.player.name}>
                    <PlayerMark slot={r.slot} species={r.player.species} size={s.mark} label={r.player.name} />
                    <span className={cx('min-w-0 truncate font-display font-semibold', s.name)} data-testid={`name-${r.player.id}`}>
                      {/* In the rail's final standings below 1100 px, your row reads just "You" (WS6, 2026-10-29). */}
                      {mine ? (final && !tv ? <>You<span className="hidden @min-[1100px]/shell:inline"> ({r.player.name})</span></> : `You (${r.player.name})`) : r.player.name}
                    </span>
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
                {!final && (
                  <td className={cx(s.cell, 'text-right')}>
                    <ChangeTag change={r.change} className={s.side} testid={`change-${r.player.id}`} />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <IntentMarker note={N.M1} />
    </section>
  );
}

// --- The game's end ------------------------------------------------------------------------------------

/**
 * The winner card. On the TV: the winner called out, "Ossa wins with a Worth of 5,643 cr". On your phone: your final
 * place and your Worth as the card's number ("Worth 5,433 cr"), the winner's line under it. Today's card said points.
 */
export function WinnerCard({ view, facts, density, selfId, className }: { view: MuleView; facts: MonthFacts; density: Density; selfId?: string; className?: string }) {
  const lg = league(view, facts.lastWorth);
  const top = lg.rows[0];
  if (!top) return null;
  const line = winnerWords(view, lg);
  if (density === 'tv')
    return (
      <div className="relative flex flex-col items-center justify-center gap-3 rounded-panel border-2 border-holo bg-holo-soft p-6 text-center shadow-glow animate-pulse-glow" data-testid="tv-winner">
        <span className="label-caps text-lg!">The colony goes to</span>
        <PlayerMark slot={top.slot} species={top.player.species} size={112} label={top.player.name} />
        <span className="font-display text-4xl font-semibold leading-tight" data-testid="winner-line">
          {line}
        </span>
        <IntentMarker note={N.M2} part="winner" />
        <IntentMarker note={N.M11} at="tr" />
      </div>
    );
  const mine = lg.rows.find((r) => r.player.id === selfId) ?? top;
  const won = mine.rank === 1;
  const compact = density === 'compact';
  return (
    <div
      className={cx('relative flex flex-col items-center justify-center gap-1 rounded-panel border-2 p-2.5 text-center', won ? 'border-holo bg-holo-soft shadow-glow' : 'border-holo-line bg-panel', !compact && 'flex-1', className)}
      data-testid="winner"
    >
      <span className="label-caps text-[10px]!" data-testid="my-place">
        {won ? 'You win the colony!' : `You finished ${ordinal(mine.rank)} of ${view.players.length}`}
      </span>
      <PlayerMark slot={mine.slot} species={mine.player.species} size={compact ? 28 : 40} label={mine.player.name} />
      <span data-num className={cx('font-mono font-bold', compact ? 'text-lg' : 'text-xl')} data-testid="winner-worth">
        Worth {fmt(mine.total)} cr
      </span>
      {!won && (
        <span className="flex items-center justify-center gap-1 text-[11px] leading-snug text-ink-2" data-testid="winner-line">
          <PlayerMark slot={top.slot} species={top.player.species} size={12} label={top.player.name} />
          {line}
        </span>
      )}
      <IntentMarker note={N.M2} part="winner" />
      <IntentMarker note={N.M11} at="br" />
    </div>
  );
}

/** The colony's verdict on a phone beside the TV, as today's game-over draws it: passed or failed, the air, the rule. */
export function PhoneVerdict({ view, className }: { view: MuleView; className?: string }) {
  const v = colonyVerdict(view.air);
  return (
    <div className={cx('flex flex-col gap-1.5 rounded-panel border p-2.5', v.failed ? 'border-alert bg-alert-bg' : 'border-holo-line bg-panel', className)} data-testid="verdict">
      <span className={cx('font-display text-base font-semibold', v.failed ? 'text-alert-ink' : 'text-ok')}>{v.title}</span>
      <AirGauge level={view.air.level} band={view.air.band} />
      <span className="text-xs leading-snug text-ink-2">{v.line} The colony’s report is on the TV.</span>
    </div>
  );
}

// --- Collapse -----------------------------------------------------------------------------------------

/** While the air is in Collapse: why every Worth is lower, in one line. */
export function CollapseBanner({ density }: { density: Density }) {
  const tv = density === 'tv';
  return (
    <div role="status" className={cx('relative flex shrink-0 flex-wrap items-baseline rounded-panel border-2 border-alert bg-alert-bg', tv ? 'gap-x-3 px-5 py-2' : 'gap-x-1.5 px-2.5 py-0.5')} data-testid="collapse-banner">
      <span className={cx('font-display font-semibold text-alert-ink', tv ? 'text-xl' : 'text-xs')}>The air is in Collapse.</span>
      <span className={cx('text-ink', tv ? 'text-lg' : 'text-[11px]')}>
        Every Worth is cut by {collapseCutWords()}, offices too: the scores if the game ended now.
      </span>
      <IntentMarker note={N.M10} at="tl" />
    </div>
  );
}

// --- The colony ---------------------------------------------------------------------------------------

function Block({ label, children, testid, tv, mark, className }: { label: string; children: ReactNode; testid: string; tv: boolean; mark?: ReactNode; className?: string }) {
  return (
    <div className={cx('relative flex min-w-0 flex-col', tv ? 'gap-1' : 'gap-0', className)} data-testid={testid}>
      <span className={cx('label-caps', tv ? 'text-sm!' : 'text-[10px]!')}>{label}</span>
      {children}
      {mark}
    </div>
  );
}

/**
 * How the colony is doing, apart from the players: the air and its trend, the fund's month, who went hungry. Prestige,
 * mood and the colony score join it when G-5 produces them (MONTHEND_NOTES.M8); until then nothing holds their place.
 * At game over (`verdict`) it heads with the colony's verdict; `row` lays it out in one band across the TV.
 */
export function ColonyPanel({ view, facts, density, layout = 'stack', verdict = false }: { view: MuleView; facts: MonthFacts; density: Exclude<Density, 'phone'>; layout?: 'stack' | 'row'; verdict?: boolean }) {
  const r = colonyReport(view, facts);
  const tv = density === 'tv';
  const row = tv && layout === 'row';
  const v = colonyVerdict(view.air);
  const now = airBandStyle(r.air.level, r.air.band);
  const then = airBandStyle(r.air.last, r.air.lastBand);
  const last = view.month - 1;
  const big = tv ? 'text-3xl' : 'text-base';
  const line = tv ? 'text-lg leading-snug' : 'text-[11px] leading-tight';
  return (
    <section className={cx('relative flex min-h-0 flex-col rounded-panel border border-holo-line bg-panel', tv ? 'gap-3 p-5' : 'gap-1 px-2.5 py-1.5')} aria-label="How the colony is doing" data-testid="colony-panel">
      <header className={cx('flex flex-wrap items-baseline', tv ? 'gap-x-4' : 'gap-x-2')} {...(verdict ? { 'data-testid': 'tv-verdict' } : {})}>
        <h2 className={cx('label-caps', tv ? 'text-base!' : 'text-[10px]!')}>{verdict ? 'How the colony did' : 'How the colony is doing'}</h2>
        {verdict && (
          <>
            <span className={cx('font-display font-semibold', v.failed ? 'text-alert-ink' : 'text-ok', tv ? 'text-2xl' : 'text-xs')} data-testid="verdict-title">
              {v.title}
            </span>
            <span className={cx('text-ink-2', tv ? 'text-lg' : 'text-[11px]')} data-testid="verdict-line">
              {v.line}
            </span>
          </>
        )}
      </header>
      <div className={cx('grid', row ? 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)] gap-x-6' : tv ? 'grid-cols-2 gap-x-6 gap-y-3' : 'grid-cols-3 gap-2')}>
        <Block label="Air" testid="colony-air" tv={tv}>
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span data-num className={cx('font-mono font-bold', big)} data-testid="air-level">
              {r.air.level}
            </span>
            <span className={cx('font-display font-semibold', now.tone, tv ? 'text-2xl' : 'text-xs')} data-testid="air-band">
              {now.label}
            </span>
          </span>
          <span className={cx(line, r.air.trend === 'better' ? 'text-ok' : r.air.trend === 'worse' ? 'text-alert' : 'text-ink-3')} data-testid="air-trend">
            {r.air.trend === 'better' ? '↑ better' : r.air.trend === 'worse' ? '↓ worse' : '± same as'}
            {r.air.trend === 'same' ? '' : ' than'} month {last} ({r.air.last}
            {r.air.lastBand !== r.air.band ? ` · ${then.label}` : ''})
          </span>
        </Block>
        <Block label="Colony fund" testid="colony-fund" tv={tv}>
          <span className="flex items-baseline gap-2">
            <span data-num className={cx('font-mono font-bold', big)} data-testid="fund-balance">
              {fmt(r.fund.balance)} cr
            </span>
            {tv && (
              <span data-num className="font-mono text-base text-ink-3" data-testid="fund-start">
                from {fmt(r.fund.start)}
              </span>
            )}
          </span>
          {r.fund.inLines.map((l) => (
            <span key={l.what} className={cx(line, 'text-ink-2')} data-testid="fund-in">
              <span data-num className="font-mono font-semibold text-ok">+{fmt(l.cr)}</span> {l.what}
            </span>
          ))}
          {r.fund.outLines.map((l) => (
            <span key={l.what} className={cx(line, 'text-ink-2')} data-testid="fund-out">
              <span data-num className="font-mono font-semibold text-alert">−{fmt(l.cr)}</span> {l.what}
              {tv ? `, to ${name(view, l.to)}` : ''}
            </span>
          ))}
        </Block>
        <Block label="Hunger" testid="colony-hungry" tv={tv} mark={<IntentMarker note={N.M7} at="tr" />} {...(tv && !row ? { className: 'col-span-2 border-t border-holo-faint pt-3' } : {})}>
          <span className={cx('flex', tv && !row ? 'flex-wrap items-baseline gap-x-5 gap-y-1' : 'flex-col')}>
          {r.hungry.length === 0 ? (
            <span className={cx('font-display font-semibold text-ok', tv ? 'text-2xl' : 'text-xs')} data-testid="nobody-hungry">
              ✓ Nobody went hungry
            </span>
          ) : (
            r.hungry.slice(0, HUNGRY_LINES).map((h) => {
              const p = view.players.find((x) => x.id === h.id)!;
              // Below 1100 px (WS6, 2026-10-29): "The Acc…: ate 2 of 5 [Food]", one line; only the name truncates, the numbers
              // never do. The whole sentence is its title.
              if (!tv)
                return (
                  <span key={h.id} className="flex min-w-0 items-center gap-1 text-[11px] font-semibold leading-tight text-alert" title={`${p.name} went hungry: ate ${h.ate} of ${h.need} Food`} data-testid={`hungry-${h.id}`}>
                    <PlayerMark slot={toSlot(p.slot)} species={p.species} size={12} label={p.name} />
                    <span className="min-w-0 truncate" data-testid={`hungry-name-${h.id}`}>
                      {p.name}
                    </span>
                    <span className="-ml-1 flex shrink-0 items-center gap-0.5" data-testid={`hungry-ate-${h.id}`}>
                      : ate {h.ate} of {h.need}
                      <GoodIcon good="food" size={11} />
                      <span className="sr-only">Food</span>
                    </span>
                  </span>
                );
              return (
                <span key={h.id} className={cx('flex items-start font-semibold text-alert', tv ? 'gap-2 text-2xl leading-snug' : 'gap-1 text-[11px] leading-tight')} data-testid={`hungry-${h.id}`}>
                  <span className={tv ? 'pt-1' : ''}>
                    <PlayerMark slot={toSlot(p.slot)} species={p.species} size={tv ? 26 : 12} label={p.name} />
                  </span>
                  <span>
                    {p.name} went hungry: ate {h.ate} of {h.need} <GoodIcon good="food" size={tv ? 20 : 11} className="inline align-[-0.1em]" /> Food
                  </span>
                </span>
              );
            })
          )}
          {r.hungry.length > HUNGRY_LINES && (
            <span className={cx('font-semibold text-alert', tv ? 'text-2xl leading-snug' : 'text-[11px] leading-tight')} data-testid="hungry-more">
              +{r.hungry.length - HUNGRY_LINES} more went hungry
            </span>
          )}
          <span className={cx(line, r.colonistsFed ? 'text-ink-2' : 'text-alert')} data-testid="colonists">
            {r.colonistsFed ? 'Colonists fed' : 'Colonists went short'} · {fmt(r.colonists)}
          </span>
          </span>
        </Block>
      </div>
      <IntentMarker note={N.M6} />
    </section>
  );
}

// --- Your worth (your phone only) --------------------------------------------------------------------

/** Your Worth, line by line: only on your own phone. The lines add up to the number in the table. */
export function YourWorth({ view, density }: { view: MuleView; density: Exclude<Density, 'tv'> }) {
  const w = worthOf(view, view.me!.id);
  const p = w.parts!;
  const collapse = inCollapse(view);
  // Donations get a line once G-5 builds them (p.donations is 0 until then); no placeholder line before that.
  const rows: { key: string; label: string; cr: number | null; tone?: string; grey?: boolean }[] = [
    { key: 'cash', label: 'Cash', cr: p.money },
    { key: 'goods', label: `Goods · ${p.units} units`, cr: p.goods },
    { key: 'land', label: `Land · ${p.plots} × ${GAME.plotScore}`, cr: p.land },
    { key: 'mules', label: `MULEs · ${p.mules} × ${view.mulePrice}`, cr: p.muleValue },
    ...(collapse ? [{ key: 'cut', label: `Collapse cut · ${collapseCutWords()}`, cr: -p.cut, tone: 'text-alert' }] : []),
    { key: 'offices', label: `Offices · ${p.terms} ${p.terms === 1 ? 'term' : 'terms'} × ${POLITICS.termScore}${collapse ? ', cut too' : ''}`, cr: p.office },
  ];
  const tight = density === 'compact' || collapse;
  const sum = p.money + p.goods + p.land + p.muleValue - p.cut + p.office + p.donations;
  if (sum !== w.total) throw new Error(`YourWorth: lines add to ${sum}, Worth is ${w.total}`);
  return (
    <section className="relative flex flex-col gap-1 rounded-panel border border-holo-line bg-panel px-2.5 py-2" aria-label="Your worth" data-testid="your-worth">
      <header className="flex items-center justify-between gap-2">
        <h2 className="label-caps text-[10px]!">Your worth</h2>
        <Private text="Only you" />
      </header>
      <dl className={cx('grid grid-cols-[minmax(0,1fr)_auto] gap-x-2', tight ? 'gap-y-0 text-[11px] leading-4' : 'gap-y-0.5 text-xs')}>
        {rows.map((r) => (
          <div key={r.key} className={cx('contents', r.grey && 'text-ink-3')} data-testid={`worth-line-${r.key}`}>
            {/* A line too long for a small phone's column wraps under itself rather than losing its end. */}
            <dt className={cx('min-w-0', r.grey ? '' : 'text-ink-2')}>
              {r.label}
            </dt>
            <dd data-num className={cx('text-right font-mono font-semibold', r.tone)} data-testid={`worth-cr-${r.key}`}>
              {r.cr === null ? '—' : r.cr < 0 ? `−${fmt(-r.cr)}` : fmt(r.cr)}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex items-baseline justify-between gap-2 border-t border-holo-faint pt-1" data-testid="worth-total">
        <span className="min-w-0 text-xs font-semibold leading-tight">{view.finished ? 'Your final Worth' : collapse ? 'Your score if the game ended now' : 'Your worth'}</span>
        <span data-num className="shrink-0 font-mono text-base font-bold" data-testid="worth-total-cr">
          {fmt(w.total)}
        </span>
      </div>
      {collapse && !view.finished && (
        <div className="flex items-baseline justify-between gap-2 text-[11px] text-ink-3" data-testid="worth-uncut">
          <span>Without the cut</span>
          <span data-num className="font-mono font-semibold">
            {fmt(w.uncut)}
          </span>
        </div>
      )}
      <IntentMarker note={N.M4} at="tl" />
    </section>
  );
}
