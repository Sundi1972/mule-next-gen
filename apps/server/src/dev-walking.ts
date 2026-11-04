import { plotAt, tileIndex, type DevPlace, type GameState, type Phase } from '@mule/engine';
import type { ColonistView, MuleIntent } from '@mule/protocol';

/* Walking in development: where a move takes a colonist, the order arrivals land in, and the colonist as screens see it. MuleGame keeps the timers. */

/** A development move: the colonist walks to where it happens, and it applies on arrival. */
export type DevIntent = Extract<MuleIntent, { type: 'buyMule' | 'outfit' | 'install' | 'analyse' | 'filter' | 'pub' }>;

/** A colonist in development: where it stands or is walking to, the walk with the move at its end, and its assay. */
export interface Colonist {
  at: DevPlace;
  walk: { from: DevPlace; startedAt: number; arrivesAt: number; then: DevIntent } | null;
  assayUntil: number | null;
}

/**
 * Where a development move happens: the corral for a MULE, the store for the pub, the plot; null for an outfit, done
 * where the colonist stands. Throws RuleError for a tap off the map or on the store, which no walk can reach.
 */
export function walkTarget(state: GameState, intent: DevIntent): DevPlace | null {
  switch (intent.type) {
    case 'buyMule':
      return 'corral';
    case 'pub':
      return 'store';
    case 'install':
    case 'analyse':
    case 'filter':
      plotAt(state, intent.x, intent.y);
      return tileIndex(state.width, intent.x, intent.y);
    case 'outfit':
      return null;
  }
}

/** A place as the news names it. */
export function placeName(place: DevPlace): string {
  return place === 'corral' ? 'the corral' : place === 'store' ? 'the store' : 'the plot';
}

/**
 * The seats whose walk has arrived by `now`, in order of arrival and then seat order, so the clock and never the
 * timers' order decides who reaches the corral first. `seatIds` is in seat order.
 */
export function dueArrivals(seatIds: readonly string[], colonists: ReadonlyMap<string, Colonist>, now: number): string[] {
  return seatIds
    .map((id, seat) => ({ id, seat, walk: colonists.get(id)?.walk }))
    .filter((d) => d.walk && d.walk.arrivesAt <= now)
    .sort((a, b) => a.walk!.arrivesAt - b.walk!.arrivesAt || a.seat - b.seat)
    .map(({ id }) => id);
}

/** Where a seat's colonist is in development, public like every place; the move it walks to make stays its own. */
export function colonistView(colonist: Colonist | undefined, phase: Phase): ColonistView | null {
  if (phase !== 'development' || !colonist) return null;
  const { at, walk, assayUntil } = colonist;
  return { at, walk: walk && { from: walk.from, startedAt: walk.startedAt, arrivesAt: walk.arrivesAt }, assayUntil };
}
