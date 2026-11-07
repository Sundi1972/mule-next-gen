/** Deal cards between players (slice 3): the only writer of Politics.deals, always through politics.ts's editPolitics. */
import type { DealCard, DealOffer, GameState } from './types.js';

/** The one visibility rule: a card's two parties see it, and everyone sees a broken one. The TV has no seat, so it is a non-party. */
export function partyTo(viewerId: string, card: DealCard): boolean {
  return card.status === 'broken' || card.from === viewerId || card.to === viewerId;
}

/** The cards a player is party to, newest first. */
export function dealsOf(state: GameState, playerId: string): readonly DealCard[] {
  return (state.politics?.deals ?? []).filter((d) => d.from === playerId || d.to === playerId).reverse();
}

export function offerDeal(_state: GameState, _from: string, _offer: DealOffer): string {
  throw new Error('NotImplemented: offerDeal');
}

export function withdrawDeal(_state: GameState, _from: string, _id: string): void {
  throw new Error('NotImplemented: withdrawDeal');
}

export function answerDeal(_state: GameState, _to: string, _id: string, _accept: boolean): void {
  throw new Error('NotImplemented: answerDeal');
}

export function dealUntil(_state: GameState, _from: string, _offer: DealOffer): number {
  throw new Error('NotImplemented: dealUntil');
}
