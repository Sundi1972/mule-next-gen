import { GAME, POLITICS } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { AirGauge, airBandStyle, cx, GoodIcon, PlayerMark } from '@mule/ui';
import type { ReactNode } from 'react';
import { colonyVerdict, fmt, toSlot } from '../game/derive';
import { collapseCutWords, colonyReport, inCollapse, league, leaderWords, ordinal, winnerWords, yourLines } from '../game/month-end';

/**
 * The month end's parts (C20), grafted from WS6's approved mock (ws6-ux 3a6a5d2d, design/mocks/ws6-ux/src/screens/
 * audit/monthend/parts.tsx), each at three sizes: the TV at 1280 × 720 ('tv'), the phone beside a TV ('phone'), and
 * the phone with no TV, which fits the table and the colony panel on one stage ('compact'). The TV and every other
 * phone get totals only; your lines are on your phone (HC-4).
 */

export type Density = 'tv' | 'phone' | 'compact';

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

const SIZE: Record<Density, { pad: string; head: string; rank: string; mark: number; name: string; worth: string; side: string; cell: string; callMark: number; call: string }> = {
  tv: { pad: 'gap-3 p-5', head: 'text-sm!', rank: 'w-12 text-3xl', mark: 40, name: 'text-3xl', worth: 'text-4xl', side: 'text-2xl', cell: 'px-3 py-2', callMark: 48, call: 'text-4xl' },
  phone: { pad: 'gap-2 p-3', head: 'text-[10px]!', rank: 'w-6 text-sm', mark: 22, name: 'text-base', worth: 'text-lg', side: 'text-sm', cell: 'px-1.5 py-1.5', callMark: 24, call: 'text-lg' },
  compact: { pad: 'gap-1 px-2.5 py-1.5', head: 'text-[10px]!', rank: 'w-5 text-xs', mark: 16, name: 'text-sm', worth: 'text-base', side: 'text-xs', cell: 'px-1.5 py-0.5', callMark: 18, call: 'text-sm' },
};

/**
 * Everyone by Worth, the leader called out, the change since last month. Totals only. `final` (game over): the final
 * standings, no callout (the winner card has it) and no change column.
 */
export function LeagueTable({ view, density, selfId, final = false }: { view: MuleView; density: Density; selfId?: string; final?: boolean }) {
  const lg = league(view);
  const collapse = inCollapse(view);
  // The change since last month, when there was a last month: none in month 1, none at game over.
  const changes = !final && lg.hasLastMonth;
  const tv = density === 'tv';
  const s = final && tv ? { ...SIZE.tv, mark: 36, cell: 'px-3 py-1.5' } : SIZE[density];
  const words = leaderWords(view, lg, selfId);
  const top = lg.rows[0];
  // The phone's headers stay on one line (short words); the TV's may wrap, so a Collapse column never squeezes the colony.
  const th = cx('label-caps align-bottom font-normal', !tv && 'whitespace-nowrap', s.head);
  return (
    <section className={cx('relative flex min-h-0 flex-col rounded-panel border border-holo-line bg-panel', s.pad)} aria-label="League table" data-testid="league">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className={cx('label-caps', s.head)}>{final ? 'Final standings · by Worth' : `League table · month ${view.month}`}</h2>
        {tv && <span className="text-lg text-ink-3">Worth, in credits</span>}
      </header>

      {top && !final && (
        <div className={cx('relative flex items-center', tv ? 'gap-4 rounded-panel border-2 border-holo bg-holo-soft px-5 py-2.5 shadow-glow' : 'gap-2')} data-testid="leader">
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

      <table className="w-full border-collapse text-left" data-testid="league-table">
        <thead>
          <tr>
            <th className={cx(th, s.cell)}>#</th>
            <th className={cx(th, s.cell)}>Player</th>
            <th className={cx(th, s.cell, 'text-right')} data-testid="worth-head">
              {collapse ? (tv ? 'If the game ended now' : 'If it ended now') : 'Worth'}
            </th>
            {collapse && (
              <th className={cx(th, s.cell, 'text-right')} data-testid="uncut-head">
                Before the cut
              </th>
            )}
            {changes && (
              <th className={cx(th, s.cell, 'text-right')} data-testid="change-head">
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
              <tr key={r.player.id} className={cx('border-t border-holo-faint', lit && 'bg-holo-soft')} data-testid={`league-row-${r.player.id}`}>
                <td data-num className={cx('font-mono text-ink-3', s.rank, s.cell)} data-testid={`rank-${r.player.id}`}>
                  {r.rank}
                </td>
                <td className={s.cell}>
                  <span className={cx('flex min-w-0 items-center', tv ? 'gap-3' : 'gap-1.5')}>
                    <PlayerMark slot={r.slot} species={r.player.species} size={s.mark} label={r.player.name} />
                    <span className={cx('truncate font-display font-semibold', s.name)} data-testid={`name-${r.player.id}`}>
                      {mine ? `You (${r.player.name})` : r.player.name}
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

// --- The game's end ------------------------------------------------------------------------------------

/**
 * The winner card. On the TV: "Ossa wins with a Worth of 5,643 cr". On your phone: your place and your Worth as the
 * card's number, the winner's line under it. In credits, never points.
 */
export function WinnerCard({ view, density, selfId }: { view: MuleView; density: Density; selfId?: string }) {
  const lg = league(view);
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
      </div>
    );
  const mine = lg.rows.find((r) => r.player.id === selfId) ?? top;
  const won = mine.rank === 1;
  const compact = density === 'compact';
  return (
    <div
      className={cx('relative flex flex-col items-center justify-center gap-1 rounded-panel border-2 p-2.5 text-center', won ? 'border-holo bg-holo-soft shadow-glow' : 'border-holo-line bg-panel', !compact && 'flex-1')}
      data-testid="winner"
    >
      <span className="contents" data-testid="my-rank">
        <span className="label-caps text-[10px]!" data-testid="my-place">
          {won ? 'You win the colony!' : `You finished ${ordinal(mine.rank)} of ${view.players.length}`}
        </span>
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
    </div>
  );
}

/** The colony's verdict on a phone beside the TV, as game over draws it: passed or failed, the air, the rule. */
export function PhoneVerdict({ view }: { view: MuleView }) {
  const v = colonyVerdict(view.air);
  return (
    <div className={cx('flex flex-col gap-1.5 rounded-panel border p-2.5', v.failed ? 'border-alert bg-alert-bg' : 'border-holo-line bg-panel')} data-testid="verdict">
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
      <span className={cx('text-ink', tv ? 'text-lg' : 'text-[11px]')}>Every Worth is cut by {collapseCutWords()}, offices too: the scores if the game ended now.</span>
    </div>
  );
}

// --- The colony ---------------------------------------------------------------------------------------

function Block({ label, children, testid, tv, className }: { label: string; children: ReactNode; testid: string; tv: boolean; className?: string }) {
  return (
    <div className={cx('relative flex min-w-0 flex-col', tv ? 'gap-1' : 'gap-0', className)} data-testid={testid}>
      <span className={cx('label-caps', tv ? 'text-sm!' : 'text-[10px]!')}>{label}</span>
      {children}
    </div>
  );
}

/** A line or slot that comes later: greyed, and saying so. */
function Later({ testid, label, sub, when, tv, line = false }: { testid: string; label: string; sub?: string; when: string; tv: boolean; line?: boolean }) {
  const chip = <span className={cx('shrink-0 whitespace-nowrap font-mono font-bold uppercase tracking-wide', tv ? 'text-[10px]' : 'text-[9px]')}>{when}</span>;
  if (!tv || line)
    return (
      <div
        className={cx('flex min-w-0 items-baseline justify-between rounded-control border border-dashed border-holo-line text-ink-3', tv ? 'gap-2 px-3 py-1' : 'gap-1 px-1.5 py-0.5')}
        aria-label={`${label}: ${when}`}
        data-testid={testid}
      >
        <span className={cx('truncate font-display font-semibold', tv ? 'text-base' : 'text-[11px]')}>{label}</span>
        {chip}
      </div>
    );
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-control border border-dashed border-holo-line px-3 py-1.5 text-ink-3" aria-label={`${label}: ${when}`} data-testid={testid}>
      <span className="flex items-baseline justify-between gap-1 font-display text-base font-semibold">
        {label}
        <span data-num className="font-mono">
          —
        </span>
      </span>
      {sub && <span className="text-sm leading-snug">{sub}</span>}
      {chip}
    </div>
  );
}

const G5 = 'comes with G-5';
/** The fund's in and out by source are WS7's colony fund month; until it is on trunk the lines are greyed. */
const FUND_MONTH = 'comes with the colony fund’s month';

/**
 * How the colony is doing, apart from the players: the air against last month, the colony fund, who went hungry, and
 * G-5's slots. At game over (`verdict`) it heads with the colony's verdict; `row` lays it out in one band across the TV.
 */
export function ColonyPanel({ view, density, layout = 'stack', verdict = false }: { view: MuleView; density: Exclude<Density, 'phone'>; layout?: 'stack' | 'row'; verdict?: boolean }) {
  const r = colonyReport(view);
  const tv = density === 'tv';
  const row = tv && layout === 'row';
  const v = colonyVerdict(view.air);
  const now = airBandStyle(r.air.level, r.air.band);
  const then = r.air.last === null ? null : airBandStyle(r.air.last, r.air.lastBand ?? undefined);
  const big = tv ? 'text-3xl' : 'text-base';
  const line = tv ? 'text-lg leading-snug' : 'text-[11px] leading-tight';
  const trend = r.air.trend;
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
      <div className={cx('grid', row ? 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)] gap-x-6' : tv ? 'grid-cols-2 gap-x-6 gap-y-3' : 'grid-cols-3 gap-2')}>
        <Block label="Air" testid="colony-air" tv={tv}>
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span data-num className={cx('font-mono font-bold', big)} data-testid="air-level">
              {r.air.level}
            </span>
            <span className={cx('font-display font-semibold', now.tone, tv ? 'text-2xl' : 'text-xs')} data-testid="air-band">
              {now.label}
            </span>
          </span>
          <span className={cx(line, trend === 'better' ? 'text-ok' : trend === 'worse' ? 'text-alert' : 'text-ink-3')} data-testid="air-trend">
            {trend === null || then === null
              ? 'The first month: nothing to compare yet'
              : `${trend === 'better' ? '↑ better than' : trend === 'worse' ? '↓ worse than' : '± same as'} month ${view.month - 1} (${r.air.last}${r.air.lastBand !== r.air.band ? ` · ${then.label}` : ''})`}
          </span>
        </Block>
        <Block label="Colony fund" testid="colony-fund" tv={tv}>
          <span data-num className={cx('font-mono font-bold', big)} data-testid="fund-balance">
            {fmt(r.fund.balance)} cr
          </span>
          <span className={cx(line, 'text-ink-3')} data-testid="fund-month">
            In and out by source: {FUND_MONTH}
          </span>
        </Block>
        <Block label="Hunger" testid="colony-hungry" tv={tv} {...(tv && !row ? { className: 'col-span-2 border-t border-holo-faint pt-3' } : {})}>
          <span className={cx('flex', tv && !row ? 'flex-wrap items-baseline gap-x-5 gap-y-1' : 'flex-col')}>
            {r.hungry.length === 0 ? (
              <span className={cx('font-display font-semibold text-ok', tv ? 'text-2xl' : 'text-xs')} data-testid="nobody-hungry">
                ✓ Nobody went hungry
              </span>
            ) : (
              r.hungry.map((h) => {
                const p = view.players.find((x) => x.id === h.id)!;
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
            <span className={cx(line, r.colonistsFed === false ? 'text-alert' : 'text-ink-2')} data-testid="colonists">
              {r.colonistsFed === null ? 'Colonists' : r.colonistsFed ? 'Colonists fed' : 'Colonists went short'} · {fmt(r.colonists)}
            </span>
          </span>
        </Block>
        {row && (
          <div className="relative flex min-w-0 flex-col gap-1.5" data-testid="g5-slots">
            <Later testid="g5-prestige" label="Prestige" when={G5} tv line />
            <Later testid="g5-mood" label="Mood" when={G5} tv line />
            <Later testid="g5-score" label="Colony score" when={G5} tv line />
          </div>
        )}
      </div>
      {!row && (
        <div className={cx('relative mt-auto grid', tv ? 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)] gap-3' : 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.25fr)] gap-1.5')} data-testid="g5-slots">
          <Later testid="g5-prestige" label="Prestige" when={G5} tv={tv} />
          <Later testid="g5-mood" label="Mood" when={G5} tv={tv} />
          <Later testid="g5-score" label="Colony score" sub="(colony wealth + air + prestige) × mood." when={G5} tv={tv} />
        </div>
      )}
    </section>
  );
}

// --- Your worth (your phone only) --------------------------------------------------------------------

/** The eye-slash chip: only you see this. */
function OnlyYou() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-chip bg-holo-soft px-1 text-[10px] font-semibold leading-4 text-holo @min-[1100px]/shell:text-xs">
      <svg aria-hidden viewBox="0 0 24 24" width={10} height={10} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.7 5.1A10.7 10.7 0 0 1 21.9 11.7a1 1 0 0 1 0 .7 10.7 10.7 0 0 1-1.4 2.5" />
        <path d="M14.1 14.2a3 3 0 0 1-4.2-4.2" />
        <path d="M17.5 17.5A10.7 10.7 0 0 1 2.1 12.3a1 1 0 0 1 0-.7 10.7 10.7 0 0 1 4.4-5.1" />
        <path d="M2 2l20 20" />
      </svg>
      Only you
    </span>
  );
}

/** One element carrying a testid for each name: the month end's, and at game over the breakdown's older one too. */
function Ids({ ids, children }: { ids: (string | null)[]; children: ReactNode }) {
  return ids.reduceRight<ReactNode>(
    (inner, id) =>
      id ? (
        <div className="contents" data-testid={id}>
          {inner}
        </div>
      ) : (
        inner
      ),
    children,
  );
}

/** Your Worth, line by line: only on your own phone. The lines add up to the number in the table. */
export function YourWorth({ view, density }: { view: MuleView; density: Exclude<Density, 'tv'> }) {
  const self = view.players.find((x) => x.id === view.me!.id)!;
  const p = yourLines(view);
  const collapse = inCollapse(view);
  // At game over the lines keep the breakdown's testids (part-*), so the final score is read as before.
  const over = view.finished;
  const rows: { key: string; old: string | null; label: string; cr: number | null; tone?: string; grey?: boolean }[] = [
    { key: 'cash', old: 'part-money', label: 'Cash', cr: p.money },
    { key: 'goods', old: 'part-goods', label: `Goods · ${p.units} units`, cr: p.goods },
    { key: 'land', old: 'part-land', label: `Land · ${p.plots} × ${GAME.plotScore}`, cr: p.land },
    { key: 'mules', old: 'part-mules', label: `MULEs · ${p.mules} × ${view.mulePrice}`, cr: p.muleValue },
    ...(collapse ? [{ key: 'cut', old: 'part-collapse', label: `Collapse cut · ${collapseCutWords()}`, cr: -p.cut, tone: 'text-alert' }] : []),
    { key: 'offices', old: 'part-office', label: `Offices · ${p.terms} ${p.terms === 1 ? 'term' : 'terms'} × ${POLITICS.termScore}${collapse ? ', cut too' : ''}`, cr: p.office },
    { key: 'donations', old: null, label: 'Donations', cr: null, grey: true },
  ];
  const tight = density === 'compact' || collapse;
  return (
    <section className="relative flex flex-col gap-1 rounded-panel border border-holo-line bg-panel px-2.5 py-2" aria-label="Your worth" data-testid="your-worth">
      <header className="flex items-center justify-between gap-2">
        <h2 className="label-caps text-[10px]!">Your worth</h2>
        <OnlyYou />
      </header>
      <dl className={cx('grid grid-cols-[minmax(0,1fr)_auto] gap-x-2', tight ? 'gap-y-0 text-[11px] leading-4' : 'gap-y-0.5 text-xs')} {...(over ? { 'data-testid': 'breakdown' } : {})}>
        {rows.map((r) => (
          <Ids key={r.key} ids={[`worth-line-${r.key}`, over ? r.old : null]}>
            <dt className={cx('truncate', r.grey ? 'text-ink-3' : 'text-ink-2')}>
              {r.label}
              {r.grey && <span className="ml-1 font-mono text-[9px] font-bold uppercase tracking-wide">{G5}</span>}
            </dt>
            <dd data-num className={cx('text-right font-mono font-semibold', r.tone, r.grey && 'text-ink-3')} data-testid={`worth-cr-${r.key}`}>
              {r.cr === null ? '—' : r.cr < 0 ? `−${fmt(-r.cr)}` : fmt(r.cr)}
            </dd>
          </Ids>
        ))}
      </dl>
      <Ids ids={['worth-total', over ? 'part-total' : null]}>
        <div className="flex items-baseline justify-between gap-2 border-t border-holo-faint pt-1">
          <span className="min-w-0 text-xs font-semibold leading-tight">{over ? 'Your final Worth' : collapse ? 'Your score if the game ended now' : 'Your worth'}</span>
          <span data-num className="shrink-0 font-mono text-base font-bold" data-testid="worth-total-cr">
            {fmt(self.worth)}
          </span>
        </div>
      </Ids>
      {collapse && !over && (
        <div className="flex items-baseline justify-between gap-2 text-[11px] text-ink-3" data-testid="worth-uncut">
          <span>Without the cut</span>
          <span data-num className="font-mono font-semibold">
            {fmt(self.worthBeforeCut ?? self.worth)}
          </span>
        </div>
      )}
    </section>
  );
}
