import type { ColonyView, MuleView } from '@mule/protocol';
import { cx } from '@mule/ui';
import { useLayoutEffect, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ObjectGlyph } from '../../../../apps/web/src/components/Colony';
import { ChangeTag } from '../../../../apps/web/src/components/MonthEnd';
import { moodOf, scoreWords, type ColonyScore } from '../../../../apps/web/src/game/colony';
import { fmt } from '../../../../apps/web/src/game/derive';
import { inCollapse } from '../../../../apps/web/src/game/month-end';
import type { ColonyViewNext } from './fixture';

/** CONTRACT: ws7-score-monthly. The previous month end's total; null in month 1 (and in today's views, which lack it). */
export const lastScoreIn = (colony: ColonyView): number | null => (colony as ColonyViewNext).lastScore ?? null;

/**
 * The colony score at a month end (C34's parts at the month end's sizes). GRAFT: apps/web/src/components/Colony.tsx
 * (WS8's), beside ScoreHero and PhoneColonyScore. No verdict here: the verdict ("A colony to be proud of") stays game
 * over's.
 */

/** The change since last month, in ChangeTag's own words: score.total − lastScore. Month 1 has no last month, so no line. */
function SinceLast({ score, last, month, size }: { score: ColonyScore; last: number | null; month: number; size: 'tv' | 'phone' }) {
  if (last === null) return null;
  return (
    <span className={cx('flex items-baseline whitespace-nowrap', size === 'tv' ? 'gap-2' : 'gap-1')} data-testid="colony-score-change">
      <ChangeTag change={score.total - last} className={size === 'tv' ? 'text-2xl' : 'text-xs'} testid="colony-score-delta" />
      <span className={cx('text-ink-3', size === 'tv' ? 'text-lg' : 'text-[11px]')}>since month {month - 1}</span>
    </span>
  );
}

/**
 * COPY: Colony.tsx's ScoreSum (tv size), with each term through fmt(). FINDING (Colony.tsx, WS8's): ScoreSum and
 * ScoreHero print the terms and the total raw ("26400", "36676"): C34's fixture used two-digit numbers, but RULE-25's
 * terms are credits. GRAFT: ScoreSum and ScoreHero format with fmt(), at game over too.
 */
export function ScoreSumTv({ score, colony, big = 'text-3xl' }: { score: ColonyScore; colony: ColonyView; big?: string }) {
  const mood = moodOf(colony.gauges.band);
  const terms: [string, string, string, string | undefined, string][] = [
    ['', fmt(score.wealth), 'Wealth', undefined, 'term-wealth'],
    ['+', fmt(score.environment), 'Environment', undefined, 'term-environment'],
    ['+', fmt(score.prestige), 'Prestige', undefined, 'term-prestige'],
    ['×', score.factor.toFixed(2), mood.label, mood.tone, 'term-factor'],
  ];
  return (
    <span className="flex flex-wrap items-end gap-x-4 gap-y-2" data-testid="score-sum">
      {terms.map(([sign, value, label, tone, testid]) => (
        <span key={testid} className="flex items-end gap-2" data-testid={testid}>
          {sign && <span className="pb-1 font-mono text-2xl text-ink-3">{sign}</span>}
          <span className="flex flex-col items-center">
            <span data-num className={cx('font-mono font-bold leading-none', tone, big)}>
              {value}
            </span>
            <span className="label-caps mt-1 text-xs!">{label}</span>
          </span>
        </span>
      ))}
    </span>
  );
}

/** Collapse cuts every Worth, never the colony's score (RULE-25): said once, so a high score beside cut Worths reads right. */
function NotCut({ size }: { size: 'tv' | 'phone' }) {
  return (
    <span className={cx('text-ink-2', size === 'tv' ? 'text-base' : 'text-[11px] leading-tight')} data-testid="colony-score-uncut">
      The Collapse cuts each Worth, not the colony’s score.
    </span>
  );
}

/**
 * Variant A, the band (WS8's pick): ColonyScoreBand's frame under the league, with the total, the change since last month
 * and the sum line. No verdict and no plaques: the verdict is game over's, and the build site beside it carries the
 * plaques at a month end.
 */
export function MonthScoreBand({ view, colony, score }: { view: MuleView; colony: ColonyView; score: ColonyScore }) {
  const last = lastScoreIn(colony);
  return (
    <section className="relative flex shrink-0 flex-col gap-2 rounded-panel border border-holo-line bg-panel p-5" aria-label="The colony’s score" data-testid="colony-band" data-month={view.month}>
      <header className="flex items-baseline justify-between gap-4">
        <h2 className="label-caps text-sm!">Colony score · month {view.month}</h2>
        <span className="text-lg text-ink-3">counted again at game over</span>
      </header>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2" data-testid="colony-score">
        <span className="flex flex-col gap-1">
          <span data-num className="font-mono text-6xl font-bold leading-none text-holo" data-testid="colony-total">
            {fmt(score.total)}
          </span>
          <SinceLast score={score} last={last} month={view.month} size="tv" />
        </span>
        <ScoreSumTv score={score} colony={colony} big="text-2xl" />
      </div>
      <span className="text-base leading-snug text-ink-2" data-testid="colony-score-words">
        {scoreWords(colony, score)}
      </span>
      {inCollapse(view) && <NotCut size="tv" />}
    </section>
  );
}

/**
 * Variant B, a league row: the colony as one more row of the real LeagueTable, "The colony", apart from the players (no
 * rank, a heavier rule above it, the holo ink). SEAM: the mock portals a <tfoot> into the real table; the GRAFT is a
 * `footer` prop on MonthEnd.tsx's LeagueTable (WS4's), which renders this row as its tfoot.
 * DS-GAP: a league row that is not a player. No PlayerMark fits, and there is no colony mark: the row borrows
 * ObjectGlyph's spaceport until one exists. The double rule above it is a new mark too.
 */
export function ColonyLeagueRow({ view, colony, score, root }: { view: MuleView; colony: ColonyView; score: ColonyScore; root: RefObject<HTMLElement | null> }) {
  const last = lastScoreIn(colony);
  const [table, setTable] = useState<HTMLTableElement | null>(null);
  useLayoutEffect(() => {
    // The real LeagueTable on this screen, never another TV's on the same page.
    setTable(root.current?.querySelector<HTMLTableElement>('[data-testid="league-table"]') ?? null);
  }, [root]);
  if (!table) return null;
  const collapse = inCollapse(view);
  const changes = view.players.some((p) => p.lastWorth !== null);
  return createPortal(<ColonyRow score={score} last={last} collapse={collapse} changes={changes} />, table);
}

/** The row itself, at LeagueTable's tv sizes (SIZE.tv: px-3 py-2, text-3xl name, text-4xl number, text-2xl side). */
function ColonyRow({ score, last, collapse, changes }: { score: ColonyScore; last: number | null; collapse: boolean; changes: boolean }) {
  return (
    <tfoot data-testid="league-colony">
      <tr className="border-t-4 border-double border-holo-line" data-testid="league-row-colony">
        <td className="px-3 py-2 text-holo">
          <ObjectGlyph kind="spaceport" size={32} />
        </td>
        <td className="px-3 py-2">
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-display text-3xl font-semibold text-holo" data-testid="name-colony">
              The colony
            </span>
            <span className="label-caps text-xs!">colony score, not a player</span>
          </span>
        </td>
        <td className="px-3 py-2 text-right">
          <span data-num className="font-mono text-4xl font-bold text-holo" data-testid="worth-colony">
            {fmt(score.total)}
          </span>
        </td>
        {collapse && (
          <td className="px-3 py-2 text-right">
            <span className="text-lg text-ink-3" data-testid="uncut-colony">
              not cut
            </span>
          </td>
        )}
        {changes && (
          <td className="px-3 py-2 text-right">
            <ChangeTag change={last === null ? null : score.total - last} className="text-2xl" testid="change-colony" />
          </td>
        )}
      </tr>
    </tfoot>
  );
}

/**
 * The phone's line, in PhoneColonyScore's language: "Colony score", the total, the change since last month. With no TV
 * the sum follows on the same line from 800 px of shell; on a smaller phone the sum gives way, the total and the
 * change never do. GRAFT: Colony.tsx, beside PhoneColonyScore.
 */
export function PhoneMonthScore({ view, colony, score, sum = false, children }: { view: MuleView; colony: ColonyView; score: ColonyScore; sum?: boolean; children?: ReactNode }) {
  const last = lastScoreIn(colony);
  const mood = moodOf(colony.gauges.band);
  return (
    <div className="flex min-w-0 flex-col gap-0.5" data-testid="phone-month-score">
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <span className="label-caps text-[10px]!">Colony score</span>
        <span data-num className="font-mono text-base font-bold leading-none text-holo" data-testid="colony-total">
          {fmt(score.total)}
        </span>
        <SinceLast score={score} last={last} month={view.month} size="phone" />
        {sum && (
          <span data-num className="hidden whitespace-nowrap font-mono text-[11px] text-ink-2 @min-[800px]/shell:inline" data-testid="score-sum">
            = {fmt(score.wealth)} + {fmt(score.environment)} + {fmt(score.prestige)} × <span className={mood.tone}>{score.factor.toFixed(2)}</span>
          </span>
        )}
      </span>
      {inCollapse(view) && <NotCut size="phone" />}
      {children}
    </div>
  );
}
