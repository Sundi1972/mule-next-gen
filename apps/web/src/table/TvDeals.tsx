import type { DealCard } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { PlayerMark } from '@mule/ui';
import { SeatWords } from '../components/SeatWords';
import { toSlot } from '../game/derive';
import { brokenIn, brokenMove, brokenWho, brokenWords } from '../phone/hub/politics/deals-words';
import { RepChip } from '../phone/hub/politics/parts';

/*
 * The banner of this month's broken cards on the TV (S3-C20): one line per breaker, the drop beside the chip. Its caller
 * decides where and how long it shows.
 */

/** This month's broken cards, one line per breaker in the order they broke: their cards, and the drops summed. */
function byBreaker(cards: DealCard[]): { breaker: string; cards: DealCard[]; drop: number }[] {
  const lines = new Map<string, { breaker: string; cards: DealCard[]; drop: number }>();
  for (const c of cards) {
    const breaker = c.brokenBy ?? c.from;
    const line = lines.get(breaker) ?? { breaker, cards: [], drop: 0 };
    line.cards.push(c);
    line.drop += brokenMove(c);
    lines.set(breaker, line);
  }
  return [...lines.values()];
}

/** What broke, in a few words: one card's kind, or the breaker and how many, in the news's "broke a promise". */
function Label({ game, breaker, cards }: { game: MuleView; breaker: string; cards: DealCard[] }) {
  if (cards.length === 1) return <>{cards[0]!.terms.kind === 'pact' ? 'A pact was broken' : 'A promise was broken'}</>;
  const name = game.players.find((p) => p.id === breaker)?.name ?? breaker;
  return <SeatWords text={`${name} broke ${cards.length} promises`} who={[breaker]} players={game.players} />;
}

/**
 * This month's broken cards, or nothing when none broke. Beside the breaker's chip, which shows the number now, only
 * the drop: a "before" worked back from it is wrong once a breaker has two cards in a month.
 */
export function TvDeals({ game }: { game: MuleView }) {
  const lines = byBreaker(brokenIn(game, game.month));
  if (lines.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" data-testid="tv-break-banner">
      {lines.slice(0, 2).map(({ breaker, cards, drop }) => {
        const who = game.players.find((p) => p.id === breaker);
        if (!who) return null;
        return (
          <div key={breaker} className="flex items-center gap-5 rounded-panel border-2 border-alert bg-alert-bg px-6 py-3 shadow-glow-alert animate-[show-card-in_0.5s_ease-out]" role="status" data-testid={`tv-break-${breaker}`}>
            <span aria-hidden className="font-display text-5xl font-bold leading-none text-alert">
              ✗
            </span>
            <PlayerMark slot={toSlot(who.slot)} species={who.species} size={48} label={who.name} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="label-caps text-base! text-alert-ink" data-testid={`tv-break-${breaker}-label`}>
                <Label game={game} breaker={breaker} cards={cards} />
              </span>
              {cards.map((c) => (
                <span key={c.id} className="font-display text-3xl font-semibold leading-tight text-alert-ink" data-testid={`tv-break-${c.id}-words`}>
                  <SeatWords text={brokenWords(game, c)} who={brokenWho(c)} players={game.players} />
                </span>
              ))}
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <span className="label-caps text-sm! text-alert-ink">Reputation</span>
              <span className="flex items-center gap-2 font-mono text-3xl font-bold text-alert-ink">
                <span data-num data-testid={`tv-break-${breaker}-drop`}>
                  −{-drop}
                </span>
                <RepChip view={game} id={who.id} tv testid={`tv-break-${breaker}-rep`} />
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
