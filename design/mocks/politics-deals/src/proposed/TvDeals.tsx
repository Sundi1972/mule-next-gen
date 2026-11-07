import type { MuleView } from '@mule/protocol';
import { PlayerMark } from '@mule/ui';
import { toSlot } from '../../../../../apps/web/src/game/derive';
import { brokenIn } from './MonthEnd';
import { Marked, RepChip } from './parts';
import { brokenMove, brokenWords } from './words';

/*
 * GRAFT TARGET: new apps/web/src/table/TvDeals.tsx (WS7, as TvElection.tsx; S3-C20), mounted by TableApp.tsx's planning
 * screen under its header, where TvGovernorPromise sits (WS4's route line).
 * P5: when a card turns broken the TV says so, in the news's words, with the drop beside the breaker's chip. It holds
 * for the rest of that planning (the table's "Traitor!" moment); the news column keeps the line after. Vote cards break
 * when the ballot's result shows (S3-HC-6), so the banner and the chips move together, never before.
 */
export function TvBreakBanner({ game }: { game: MuleView }) {
  const cards = brokenIn(game, game.month);
  if (cards.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" data-testid="tv-break-banner">
      {cards.slice(0, 2).map((c) => {
        const who = game.players.find((p) => p.id === (c.brokenBy ?? c.from))!;
        const move = brokenMove(c);
        const now = who.reputation ?? 50;
        return (
          <div key={c.id} className="flex items-center gap-5 rounded-panel border-2 border-alert bg-alert-bg px-6 py-3 shadow-glow-alert animate-[show-card-in_0.5s_ease-out]" role="status" data-testid={`tv-break-${c.id}`}>
            <span aria-hidden className="font-display text-5xl font-bold leading-none text-alert">
              ✗
            </span>
            <PlayerMark slot={toSlot(who.slot)} species={who.species} size={48} label={who.name} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="label-caps text-base! text-alert-ink">{c.terms.kind === 'pact' ? 'A pact was broken' : 'A promise was broken'}</span>
              <span className="font-display text-3xl font-semibold leading-tight text-alert-ink" data-testid={`tv-break-${c.id}-words`}>
                <Marked text={brokenWords(game, c)} view={game} />
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <span className="label-caps text-sm! text-alert-ink">Reputation</span>
              <span className="flex items-center gap-2 font-mono text-3xl font-bold text-alert-ink" data-testid={`tv-break-${c.id}-drop`}>
                <span data-num className="text-ink-2 line-through decoration-2">
                  {Math.min(100, now - move)}
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
