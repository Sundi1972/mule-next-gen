import { POLITICS, scoreParts, stillNeeds, type AiPersonaId, type GameState, type Good, type PrestigeId } from '@mule/engine';
import { cashReserve, unitNeed, type Mind } from './value.js';

/** Where a seat stands on Worth: what scales its gift to the colony. See G-5 C28. */
export type Standing = 'leading' | 'trailing';

/** One gift to the colony: credits and goods together, as the engine's donate takes them. */
export interface Donation {
  id: PrestigeId;
  credits: number;
  goods: Partial<Record<Good, number>>;
}

/**
 * 'leading' when no rival's Worth is above the seat's own, a tie included. Every seat is valued as the table sees it,
 * without its goods, since a rival's goods are hidden (strategist.ts leaderOf does the same).
 */
export function standingOf(obs: GameState, me: string): Standing {
  const shown = (id: string) => {
    const parts = scoreParts(obs, id);
    return parts.total - parts.goods;
  };
  const mine = shown(me);
  return obs.players.every((p) => p.id === me || shown(p.id) <= mine) ? 'leading' : 'trailing';
}

/**
 * What the seat gives this planning toward the commissioned object still short of credits or goods, in one gift.
 * Credits: its persona's share of the cash above the reserve the strategist keeps, times its standing's factor,
 * floored, capped at what the object still needs, and none under the least gift. Goods: for each good the object
 * still needs, its persona's share of the units it holds over next month's need (factory inputs included), floored and
 * capped the same way. Null with no colony, outside planning, with nothing to fund, or when it would give nothing.
 */
export function donationFor(obs: GameState, mind: Mind, standing: Standing): Donation | null {
  if (!obs.colony || obs.phase !== 'planning') return null;
  const project = obs.colony.projects.find((p) => p.stage === 'commissioned' && hasNeeds(stillNeeds(p)));
  if (!project) return null;
  const needs = stillNeeds(project);
  const persona = mind.personaId as AiPersonaId;
  const { share, standing: factor, minCredits, goodsShare } = POLITICS.ai.colony.donate;
  const me = obs.players.find((p) => p.id === mind.me)!;

  const spare = me.money - cashReserve(obs, mind);
  const offered = spare > 0 ? Math.floor(Math.min(needs.credits, spare * share[persona] * factor[standing])) : 0;
  const credits = offered >= minCredits ? offered : 0;

  const goods: Partial<Record<Good, number>> = {};
  for (const [good, missing] of Object.entries(needs.goods) as [Good, number][]) {
    const surplus = me.stock[good] - unitNeed(obs, mind, good).target;
    const units = surplus > 0 ? Math.floor(Math.min(missing, surplus * goodsShare[persona])) : 0;
    if (units > 0) goods[good] = units;
  }

  return credits > 0 || Object.keys(goods).length > 0 ? { id: project.id, credits, goods } : null;
}

const hasNeeds = (needs: ReturnType<typeof stillNeeds>): boolean => needs.credits > 0 || Object.keys(needs.goods).length > 0;
