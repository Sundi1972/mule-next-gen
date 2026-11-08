import type { MuleView } from '@mule/protocol';
import { cx, PlayerMark } from '@mule/ui';
import { Fragment } from 'react';
import { toSlot } from '../game/derive';
import { LINE_NAME, neededWords, overruleQuestion } from '../phone/hub/politics/budget/words';

/* The TV's budget line, and the call to an overrule vote. WS4 places both. */

/**
 * "Budget: Projects ▲ 80% · Welfare ▲ 10% → Kai · kept ▲ 10%". A share moved this month is in holo with ▲ or ▼ before it,
 * and the arrow's label says what it was ("up from 70%"). There is no "(was N%)" on the TV: it wrapped the row to two lines
 * (slice 5 AM-9). The phone keeps "(was N%)".
 */
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
              {moved && (
                <span className="font-mono font-bold text-holo" role="img" aria-label={`${p.share > p.start ? 'up' : 'down'} from ${p.start}%`} data-testid={`tv-budget-move-${p.id}`}>
                  {p.share > p.start ? '▲' : '▼'}
                </span>
              )}
              <strong data-num className={cx('font-mono font-bold', moved ? 'text-holo' : 'text-ink')}>
                {p.share}%
              </strong>
              {p.to && (
                <>
                  → <PlayerMark slot={toSlot(p.to.slot)} size={18} />
                  <strong className="font-semibold text-ink">{p.to.name}</strong>
                </>
              )}
            </span>
          </Fragment>
        );
      })}
    </p>
  );
}

/**
 * The call to an overrule vote: who called it, the tax from start to now and the votes it needs, from the call until the
 * ballot opens. WS4 places it.
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
