// Copied from apps/web/src/table/TvDeals.tsx on origin/ws7-s3-phone-pr at 3bcfdd7c (WS4 places it under the planning header); imports re-pointed, no other change.
import { POLITICS } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { PlayerMark } from '@mule/ui';
import { SeatWords } from './SeatWords';
import { toSlot } from '../../../../../../apps/web/src/game/derive';
import { brokenIn, brokenMove, brokenWho, brokenWords } from './deals-words';
import { RepChip } from './RepChip';

/*
 * P5 (S3-C20), from the approved politics-deals mock's TvBreakBanner: when a card turns broken the TV says so, in the
 * news's words, with the drop beside the breaker's chip, for the rest of that month. WS4 places it under the planning
 * header; the month end lists the same cards itself.
 */

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
                <SeatWords text={brokenWords(game, c)} who={brokenWho(c)} players={game.players} />
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
