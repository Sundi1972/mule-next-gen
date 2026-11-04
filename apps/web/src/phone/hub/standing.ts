import type { MuleView } from '@mule/protocol';
import { league, ordinal } from '../../game/month-end';

/** A player's place by Worth: equal Worth shares a place, and the next place after a tie is skipped ("1st, 1st, 3rd"). */
export function standingOf(view: MuleView, id: string): { rank: number; of: number; label: string } {
  const rank = league(view).rows.find((r) => r.player.id === id)?.rank ?? view.players.length;
  const of = view.players.length;
  return { rank, of, label: `${ordinal(rank)} of ${of}` };
}

/** Every player's place by Worth, by id. */
export function placesOf(view: MuleView): Map<string, number> {
  return new Map(league(view).rows.map((r) => [r.player.id, r.rank]));
}
