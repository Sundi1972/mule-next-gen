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
  /** Each buy that brought no MULE, in the brief's words. */
  refused: string[];
  /** Each MULE bought whose outfit or install did not happen, in the brief's words. */
  unfinished: string[];
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
 * Whether the clock cut a step: ruled out before its walk began ('no time'), or given up on the way as the clock ran
 * short on the floor ('hurry', 'hurry after a pack': develop.ts hurry), as floor-turn.ts reads it.
 */
const clockCut = (why: string | undefined) => why === 'no time' || !!why?.startsWith('hurry');

/**
 * Why a buy on the hands' own path did not bring a MULE, from its log reason: the clock ran out (clockCut), else the
 * corral, sold out when it holds no MULE now (read as development ends: the floor's dim counter and a refusal off the
 * floor carry no reason of their own), else it turned the buy down (the cash, a strike).
 */
function buyRefusal(state: GameState, why: string | undefined): string {
  if (clockCut(why)) return 'no time was left';
  if (why === 'sold out' || state.store.mules <= 0) return 'the corral was sold out';
  return 'the corral turned it down';
}

/** What became of a bought MULE whose `step` (outfit or install) failed for `why`. */
const unfinishedText = (step: 'outfitted' | 'installed', why: string | undefined) =>
  clockCut(why) ? `time ran out before a bought MULE was ${step}` : `a bought MULE was refused as it was ${step}`;

/**
 * The seat's development as its own hands played it, from their log (AiSeat.developLog), read from `state` as
 * development ends: the MULEs they bought, what they installed and where, with the outfit the plot carries now, each
 * buy that brought no MULE, and each MULE bought that was not outfitted or installed.
 *
 * A buy logged ok is a MULE bought, except with tap-to-walk, where a buy logs ok as the walk to the corral starts and
 * an empty corral shows only as the outfit refused, with no reason (the floor gives every failure one): that is a buy
 * that brought no MULE, as the route's hand reads it (RULE-9).
 */
export function handsDevelopment(state: GameState, me: PlayerId, log: readonly DevLogEntry[]): HandsDevelopment {
  const hands: HandsDevelopment = { month: state.month, bought: 0, installed: [], refused: [], unfinished: [] };
  // A MULE bought whose outfit has not been logged yet, and one outfitted whose install has not.
  let bought = false;
  let outfitted = false;
  for (const { action, ok, why } of log) {
    if (action.type === 'buyMule') {
      if (ok) hands.bought++;
      else hands.refused.push(buyRefusal(state, why));
      bought = ok;
      outfitted = false;
    } else if (action.type === 'outfit') {
      if (!ok && bought && why === undefined) {
        // Tap-to-walk: the walk went, the corral had no MULE.
        hands.bought--;
        hands.refused.push(buyRefusal(state, why));
      } else if (!ok && bought) hands.unfinished.push(unfinishedText('outfitted', why));
      outfitted = ok && bought;
      bought = false;
    } else if (action.type === 'install') {
      if (ok) {
        const plot = tileIndex(state.width, action.x, action.y);
        const tile = state.tiles[plot];
        hands.installed.push({ plot, outfit: tile?.owner === me ? tile.outfit : null });
      } else if (outfitted) hands.unfinished.push(unfinishedText('installed', why));
      outfitted = false;
    }
  }
  return hands;
}
