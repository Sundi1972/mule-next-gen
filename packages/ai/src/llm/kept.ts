import { AI_PLANS, tileIndex, type GameState, type Outfit, type PlayerId } from '@mule/engine';
import type { DevLogEntry } from '../hands/develop.js';
import { pathFor } from '../playbook/path.js';
import type { AiSeatOptions } from '../seat.js';

/** What a seat's hands did in a development they played on their own (today's path): no route was adopted for it. */
export interface HandsDevelopment {
  month: number;
  /** MULEs bought at the corral and outfitted. */
  bought: number;
  /** Each MULE installed, on which plot, with the outfit it carries now. */
  installed: { plot: number; outfit: Outfit | null }[];
  /** Each buy refused at the corral, in the brief's words. */
  refused: string[];
}

/**
 * Whether a draft development the seat keeps (its reply edits no development path) plays today's path in `month`
 * rather than the draft: RULE-6's pathFor with nothing adopted carrying the month's development, which is the case
 * until an edit of Claude's is taken, then seat.ts playPath's rule that the own path's development plays only with
 * ownPhases on. A Claude seat has a decider, so pathFor gives it today's path.
 */
export function keptDevelopmentPlaysToday(seat: { options: Pick<AiSeatOptions, 'playbook' | 'decider' | 'ownPhases'> }, month: number): boolean {
  const { options } = seat;
  const path = pathFor({ on: AI_PLANS.on, playbook: options.playbook, hasDecider: !!options.decider, adopted: [], month, key: 'development' });
  return path.by === 'today' || (path.by === 'own' && !(options.ownPhases ?? AI_PLANS.ownPhases));
}

/**
 * Why a buy on the hands' own path was refused, from its log reason: the floor's clock ran out ('no time'), else the
 * corral, sold out when it holds no MULE now (read as development ends: the floor's dim counter and a refusal off the
 * floor carry no reason of their own), else it turned the buy down (the cash, a strike).
 */
function buyRefusal(state: GameState, why: string | undefined): string {
  if (why === 'no time') return 'no time was left';
  if (why === 'sold out' || state.store.mules <= 0) return 'the corral was sold out';
  return 'the corral turned it down';
}

/**
 * The seat's development as its own hands played it, from their log (AiSeat.developLog), read from `state` as
 * development ends: the MULEs they bought, what they installed and where, with the outfit the plot carries now, and
 * each buy the corral refused. A MULE counts as bought once it is outfitted: with tap-to-walk a buy logs ok as the walk
 * to the corral starts, and an empty corral shows only as the outfit refused, as the route's hand reads it (RULE-9).
 */
export function handsDevelopment(state: GameState, me: PlayerId, log: readonly DevLogEntry[]): HandsDevelopment {
  const hands: HandsDevelopment = { month: state.month, bought: 0, installed: [], refused: [] };
  for (const { action, ok, why } of log) {
    if ((action.type === 'buyMule' || action.type === 'outfit') && !ok) hands.refused.push(buyRefusal(state, why));
    else if (action.type === 'outfit') hands.bought++;
    else if (action.type === 'install' && ok) {
      const plot = tileIndex(state.width, action.x, action.y);
      const tile = state.tiles[plot];
      hands.installed.push({ plot, outfit: tile?.owner === me ? tile.outfit : null });
    }
  }
  return hands;
}
