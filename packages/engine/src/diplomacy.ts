/** Deal cards between players (slice 3): the only writer of Politics.deals. */
import type { DealCard } from './types.js';

export function partyTo(_viewerId: string, _card: DealCard): boolean {
  throw new Error('NotImplemented: partyTo');
}
