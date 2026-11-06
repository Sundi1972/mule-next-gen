import { AI_PLANS, observe, type GameState, type Good, type MonthReport, type PlayerId } from '@mule/engine';
import { draftPointOf, rivalPlotsMaking, type KeptPlan } from './plan.js';

/** RULE-8's five re-plan triggers, read from public data against the kept plan's anchor. See spec C13. */

export type ReplanTrigger = 'lostKeyPlot' | 'rivalProducer' | 'priceShock' | 'event' | 'election';

/**
 * The first of RULE-8's triggers the state meets against the kept plan's anchor, or null. A plan with no anchor yet (one
 * adopted since the seat's last draft point) meets none.
 */
export function replanReason(state: GameState, kept: KeptPlan, seat: PlayerId): ReplanTrigger | null {
  const anchor = kept.anchor;
  if (!anchor) return null;
  const obs = observe(state, seat);
  const { replan } = AI_PLANS;
  const rival = (plot: number) => ![null, undefined, seat].includes(obs.tiles[plot]?.owner);
  if (anchor.keyPlots.some(rival)) return 'lostKeyPlot';
  const target = kept.monopolyTarget;
  if (target && rivalPlotsMaking(obs, seat, target) >= anchor.rivalPlots + replan.rivalPlots) return 'rivalProducer';
  // Like for like, and a fall only: the store reprices between draft points, and dearer is good news for a seller.
  const fell = (g: Good) => anchor.posted[g] !== undefined && anchor.posted[g] - obs.store.posted[g] >= replan.priceShock * anchor.posted[g];
  if (draftPointOf(state.phase) === anchor.pricedAt && [kept.moneyMaker, target].some((g) => g !== null && fell(g))) return 'priceShock';
  const maker = kept.moneyMaker;
  if (maker && obs.history.some((r) => r.month > anchor.reportedMonth && plotsCut(obs, r, seat, maker) >= replan.eventPlots)) return 'event';
  const p = state.politics;
  const known = anchor.governor !== null || anchor.sheriff !== null;
  if (p && known && p.termStart === state.month && (p.governor !== anchor.governor || p.sheriff !== anchor.sheriff)) return 'election';
  return null;
}

/** The seat's plots making `good` whose output an event of `report` cut. */
function plotsCut(obs: GameState, report: MonthReport, seat: PlayerId, good: Good): number {
  const hit = (report.events ?? []).flatMap((e) => e.plots.filter((p) => p.delta < 0 && p.good === good && obs.tiles[p.index]?.owner === seat).map((p) => p.index));
  return new Set(hit).size;
}
