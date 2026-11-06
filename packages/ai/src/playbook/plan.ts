import { AI_PLANS, GAME, type AiPersonaWeights, type GameState, type Good, type PlayerId, type Strategy } from '@mule/engine';
import type { Mind } from '../value.js';
import type { ReplanTrigger } from './replan.js';

/** The plan a seat keeps across months, and the mind it plays that plan with. See spec C12. */

type Kind = Strategy['kind'];

/** The strategy fields a seat keeps from draft to draft; cashFloor, stances and reason are drafted afresh. See RULE-4. */
export type PlanFields = Pick<Strategy, 'kind' | 'moneyMaker' | 'monopolyTarget' | 'landTarget'>;

/** Where in the month a plan was drafted or adopted: a draft point, or an adopt. See RULE-7. */
export type PlanPoint = 'planning' | 'development' | 'auction' | 'adopt';

/** RULE-8's reference values, read when the plan was drafted or adopted. */
export interface PlanAnchor {
  month: number;
  point: PlanPoint;
  /** The posted price of the money-maker and of the monopoly target. */
  posted: Partial<Record<Good, number>>;
  /** Rival plots making the monopoly target; 0 with none. */
  rivalPlots: number;
  keyPlots: number[];
  /** The month of the newest production report (0 with none): an event in a later month's is "since the anchor". */
  reportedMonth: number;
  governor: PlayerId | null;
  sheriff: PlayerId | null;
}

/** The plan a seat keeps. An adopted plan's anchor is read at the seat's next draft point, as adopt sees no state. */
export interface KeptPlan extends PlanFields {
  anchor: PlanAnchor | null;
  /** The trigger that re-drafted it; null for a seat's first plan and an adopted one. */
  trigger: ReplanTrigger | null;
}

/**
 * The persona's weights times the plan kind's multipliers (RULE-14), as a new mind: the seat's own is left as it is,
 * for the land hand and today's path, which read the persona alone.
 */
export function planMind(mind: Mind, strategy: Pick<Strategy, 'kind'>): Mind {
  const kind = (AI_PLANS.kinds as Record<Kind, Partial<AiPersonaWeights>>)[strategy.kind] ?? {};
  const persona = { ...mind.persona };
  for (const w of Object.keys(persona) as (keyof AiPersonaWeights)[]) persona[w] *= kind[w] ?? 1;
  return { ...mind, persona };
}

/** The fields a strategy's plan keeps. */
export const planFields = ({ kind, moneyMaker, monopolyTarget, landTarget }: PlanFields): PlanFields => ({ kind, moneyMaker, monopolyTarget, landTarget: { ...landTarget } });

/** Plots of other seats outfitted for `good`. */
export const rivalPlotsMaking = (state: GameState, seat: PlayerId, good: Good) => state.tiles.filter((t) => t.owner !== null && t.owner !== seat && t.outfit === good).length;

/**
 * RULE-8's anchor for `plan` on `state`. Its key plots are the first AI_PLANS.replan.keyPlots of `ranked` that no rival
 * owns yet: one already lost when the plan was made is no news since it.
 */
export function anchorOf(state: GameState, seat: PlayerId, plan: PlanFields, point: PlanPoint, ranked: readonly number[]): PlanAnchor {
  const goods = [plan.moneyMaker, plan.monopolyTarget].filter((g): g is Good => g !== null);
  const open = ranked.filter((i) => [null, seat].includes(state.tiles[i]?.owner ?? null));
  return {
    month: state.month,
    point,
    posted: Object.fromEntries(goods.map((g) => [g, state.store.posted[g]])),
    rivalPlots: plan.monopolyTarget ? rivalPlotsMaking(state, seat, plan.monopolyTarget) : 0,
    keyPlots: open.slice(0, AI_PLANS.replan.keyPlots),
    reportedMonth: state.history.at(-1)?.month ?? 0,
    governor: state.politics?.governor ?? null,
    sheriff: state.politics?.sheriff ?? null,
  };
}

/**
 * A kept land target, held to what the seat can still reach (RULE-1 S5): by this month at the earliest, from the plots
 * it owns now to GAME.claimsPerGrant more a month. A target kept from an earlier month would otherwise fall behind.
 */
export function landTargetWithin(state: GameState, seat: PlayerId, target: Strategy['landTarget']): Strategy['landTarget'] {
  const byMonth = Math.min(state.maxMonths, Math.max(state.month, Math.round(target.byMonth)));
  const owned = state.tiles.filter((t) => t.owner === seat).length;
  const plots = Math.min(owned + GAME.claimsPerGrant * (byMonth - state.month), Math.max(owned, Math.round(target.plots)));
  return { plots, byMonth };
}

