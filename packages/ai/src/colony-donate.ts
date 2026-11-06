import { POLITICS, scoreParts, stillNeeds, type AiPersonaId, type GameState, type PrestigeId } from '@mule/engine';
import { cashReserve, type Mind } from './value.js';

/** Where a seat stands on Worth: what scales its gift to the colony. See G-5 C28. */
export type Standing = 'leading' | 'trailing';

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
 * What the seat gives this planning toward the commissioned object still short of credits: its persona's share of
 * the cash above the reserve the strategist keeps, times its standing's factor, floored and capped at what the object
 * still needs. Null with no colony, outside planning, with nothing to fund, or when the gift would be under the least
 * one. Credits only: a gift of goods is not made yet.
 */
export function donationFor(obs: GameState, mind: Mind, standing: Standing): { id: PrestigeId; credits: number } | null {
  if (!obs.colony || obs.phase !== 'planning') return null;
  const project = obs.colony.projects.find((p) => p.stage === 'commissioned' && stillNeeds(p).credits > 0);
  if (!project) return null;
  const spare = obs.players.find((p) => p.id === mind.me)!.money - cashReserve(obs, mind);
  if (spare <= 0) return null;
  const { share, standing: factor, minCredits } = POLITICS.ai.colony.donate;
  const credits = Math.floor(Math.min(stillNeeds(project).credits, spare * share[mind.personaId as AiPersonaId] * factor[standing]));
  return credits < minCredits ? null : { id: project.id, credits };
}
