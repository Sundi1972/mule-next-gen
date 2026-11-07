/** Deal cards between players (slice 3): the only writer of Politics.deals, always through politics.ts's editPolitics. */
import type { DealCard, GameState } from './types.js';

/** The one visibility rule: a card's two parties see it, and everyone sees a broken one. The TV has no seat, so it is a non-party. */
export function partyTo(viewerId: string, card: DealCard): boolean {
  return card.status === 'broken' || card.from === viewerId || card.to === viewerId;
}

/** The cards a player is party to, newest first. */
export function dealsOf(state: GameState, playerId: string): readonly DealCard[] {
  return (state.politics?.deals ?? []).filter((d) => d.from === playerId || d.to === playerId).reverse();
}
