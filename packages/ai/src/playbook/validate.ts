import type { GameState, Playbook, PlayerId, RecordedWrite } from '@mule/engine';
import type { Mind } from '../value.js';
import type { LandPick } from './draft.js';

/** One edit a writer sends: a JSON Pointer into the playbook, the value it wants there, and why. */
export type PlanEdit = RecordedWrite['edits'][number];

/** The gate every playbook passes (spec C1); WS2's writer calls it with the same structure. */
export type ValidatePlan = (
  state: GameState,
  seat: PlayerId,
  draft: Playbook,
  edits: readonly PlanEdit[],
) => { playbook: Playbook; rejected: NonNullable<Playbook['rejected']> };

/** What the gate closes over: the seat's mind (its level, as GameState has none), its draft seed and its land pick. */
export interface ValidatorProfile {
  mind: Mind;
  seed: number;
  land?: LandPick | null;
}

export function validatorFor(_profile: ValidatorProfile): ValidatePlan {
  return () => {
    throw new Error('NotImplemented: validatorFor');
  };
}
