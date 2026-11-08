import { POLITICS, type DealCard } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { PlayerMark } from '@mule/ui';
import { Fragment, type ReactNode } from 'react';
import { AiMark } from '../chat/Chat';
import { toSlot } from '../game/derive';
import { brokenIn, brokenMove, brokenWords, nameOf } from '../phone/hub/politics/deals-words';
import { RepChip } from '../phone/hub/politics/parts';

/*
 * P5 (S3-C20), from the approved politics-deals mock's TvBreakBanner: when a card turns broken the TV says so, in the
 * news's words, with the drop beside the breaker's chip, for the rest of that month. WS4 places it under the planning
 * header; the month end lists the same cards itself.
 */

/** The seats a broken card's words name, in their order: the breaker, the other party, and a vote's candidate. */
function namedIn(c: DealCard): string[] {
  const breaker = c.brokenBy ?? c.from;
  if (c.terms.kind === 'pact') return [breaker, breaker === c.from ? c.to : c.from];
  return 'law' in c.terms ? [breaker, c.to] : [breaker, c.to, c.terms.candidate];
}

/** The break's words with " · AI" after each computer seat's name, found by the seat's id, never by its name. */
function MarkedWords({ game, card }: { game: MuleView; card: DealCard }) {
  const text = brokenWords(game, card);
  const parts: ReactNode[] = [];
  let shown = 0;
  let at = 0;
  for (const id of namedIn(card)) {
    const name = nameOf(game, id, null);
    const found = text.indexOf(name, at);
    if (found < 0) break;
    at = found + name.length;
    if (!game.players.find((p) => p.id === id)?.isAi) continue;
    parts.push(<Fragment key={at}>{text.slice(shown, at)}<AiMark /></Fragment>);
    shown = at;
  }
  return (
    <>
      {parts}
      {text.slice(shown)}
    </>
  );
}

/** The banner of this month's broken cards on the TV; nothing when none broke. */
export function TvDeals({ game }: { game: MuleView }) {
  const cards = brokenIn(game, game.month);
  if (cards.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" data-testid="tv-break-banner">
      {cards.slice(0, 2).map((c) => {
        const who = game.players.find((p) => p.id === (c.brokenBy ?? c.from));
        if (!who) return null;
        const now = who.reputation ?? POLITICS.reputation.max;
        return (
          <div key={c.id} className="flex items-center gap-5 rounded-panel border-2 border-alert bg-alert-bg px-6 py-3 shadow-glow-alert animate-[show-card-in_0.5s_ease-out]" role="status" data-testid={`tv-break-${c.id}`}>
            <span aria-hidden className="font-display text-5xl font-bold leading-none text-alert">
              ✗
            </span>
            <PlayerMark slot={toSlot(who.slot)} species={who.species} size={48} label={who.name} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="label-caps text-base! text-alert-ink">{c.terms.kind === 'pact' ? 'A pact was broken' : 'A promise was broken'}</span>
              <span className="font-display text-3xl font-semibold leading-tight text-alert-ink" data-testid={`tv-break-${c.id}-words`}>
                <MarkedWords game={game} card={c} />
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <span className="label-caps text-sm! text-alert-ink">Reputation</span>
              <span className="flex items-center gap-2 font-mono text-3xl font-bold text-alert-ink" data-testid={`tv-break-${c.id}-drop`}>
                {/* Worked back from the move: wrong only where the break hit the floor. */}
                <span data-num className="text-ink-2 line-through decoration-2">
                  {Math.min(POLITICS.reputation.max, now - brokenMove(c))}
                </span>
                <span aria-hidden>→</span>
                <RepChip view={game} id={who.id} tv testid={`tv-break-${c.id}-rep`} />
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
