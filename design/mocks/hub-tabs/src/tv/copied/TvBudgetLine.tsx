// Copied from design/mocks/politics-budget/src/proposed/TvBudgetLine.tsx (approved/awaiting-pick mock, at bfad82b4); imports re-pointed (its words from ../../copied/budget/words, the same copy the phone tabs use), no other change.
import type { MuleView } from '@mule/protocol';
import { cx, PlayerMark } from '@mule/ui';
import { Fragment } from 'react';
import { toSlot } from '../../../../../../apps/web/src/game/derive';
import { LINE_NAME, neededWords, overruleQuestion } from '../../copied/budget/words';

/*
 * P14 · the TV in planning (moments 1–2). The budget line's GRAFT TARGET: apps/web/src/table/TvGovernorPromise.tsx, right
 * under its line in TableApp's planning header column. The call's banner: see TvOverruleCall.
 */

/** "Budget: Projects 80% · Welfare 10% → Kai · kept 10%", a line moved this month in holo with what it was. */
export function TvBudgetLine({ game }: { game: MuleView }) {
  const budget = game.politics?.budget;
  if (!budget) return null;
  const to = game.players.find((p) => p.id === budget.welfareTo);
  const keptStart = 100 - budget.lines.reduce((n, l) => n + l.start, 0);
  const parts = [
    ...budget.lines
      .filter((l) => l.line !== 'security')
      .map((l) => ({ id: l.line, name: LINE_NAME[l.line], share: l.share, start: l.start, to: l.line === 'welfare' && l.share > 0 ? to : undefined })),
    { id: 'kept', name: 'kept', share: budget.kept, start: keptStart, to: undefined },
  ];
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-xl leading-tight text-ink-2" data-testid="tv-budget-line">
      <span className="label-caps text-base!">Budget</span>
      {parts.map((p, i) => {
        const moved = p.share !== p.start;
        return (
          <Fragment key={p.id}>
            {i > 0 && <span aria-hidden>·</span>}
            <span className="flex items-center gap-1.5 whitespace-nowrap" data-testid={`tv-budget-${p.id}`}>
              {p.name}{' '}
              <strong data-num className={cx('font-mono font-bold', moved ? 'text-holo' : 'text-ink')}>
                {p.share}%
              </strong>
              {p.to && (
                <>
                  → <PlayerMark slot={toSlot(p.to.slot)} size={18} />
                  <strong className="font-semibold text-ink">{p.to.name}</strong>
                </>
              )}
              {moved && (
                <span className="text-base text-ink-3" data-testid={`tv-budget-was-${p.id}`}>
                  (was {p.start}%)
                </span>
              )}
            </span>
          </Fragment>
        );
      })}
    </p>
  );
}

/**
 * Moment 2: the call, at the head of the planning side column, above who the table waits for, from the call until the
 * ballot opens; the news line under it says it too. It sits in the side, not the header, because the side's news gives
 * way before the body scales: in the header it took planning's body from 0.896 to 0.763 at four seats (TV-FIT).
 * GRAFT TARGET for this one: TableApp.tsx's planning side (WS4), first in it.
 */
export function TvOverruleCall({ game }: { game: MuleView }) {
  const o = game.politics?.overrule;
  if (game.phase !== 'planning' || o?.stage !== 'called') return null;
  const caller = game.players.find((p) => p.id === o.caller);
  if (!caller) return null;
  const q = overruleQuestion(o);
  return (
    <div className="flex flex-col gap-1 rounded-panel border-2 border-warn bg-panel px-5 py-3" role="status" data-testid="tv-overrule-call">
      <span className="flex items-center gap-3 font-display text-2xl font-semibold leading-tight" data-testid="tv-overrule-call-words">
        <PlayerMark slot={toSlot(caller.slot)} size={28} />
        {caller.name} calls an overrule vote on the Governor’s tax
      </span>
      <span className="flex flex-wrap items-baseline gap-x-3 text-lg text-ink-2" data-testid="tv-overrule-call-when">
        <strong data-num className="font-mono text-xl font-bold text-ink" data-testid="tv-overrule-call-tax">
          {q.restore}% → {q.now}%
        </strong>
        held as planning ends · {neededWords(o)}
      </span>
    </div>
  );
}
