import type { GameState, PlayerId } from '@mule/engine';
import type { KeptPlan } from './plan.js';

/** RULE-8's five re-plan triggers, read from public data against the kept plan's anchor. See spec C13. */

export type ReplanTrigger = 'lostKeyPlot' | 'rivalProducer' | 'priceShock' | 'event' | 'election';

export function replanReason(_state: GameState, _kept: KeptPlan, _seat: PlayerId): ReplanTrigger | null {
  throw new Error('NotImplemented: replanReason');
}
