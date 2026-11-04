import type { GameState, LandGrantPlay, Playbook, PlayerId, Strategy } from '@mule/engine';
import type { DraftPhase } from './draft.js';
import type { ValidatePlan } from './validate.js';

/** The engine's side of WS2's land-grant playbooks (AM-1): each seat's draft, and the gate its edits pass. */

/** What the engine drafted for a seat's land grant, as WS2's brief shows it. Same structure as WS2's llm/brief.ts. */
export interface LandDraft {
  strategy: Strategy;
  landGrant: LandGrantPlay;
}

/** WS2's PlaybookSource (apps/server/src/brain/playbooks.ts on ws2-brain), declared here with the same structure. */
export interface PlaybookSource {
  draft(state: GameState, seat: PlayerId): { playbook: Playbook; land: LandDraft };
  validate: ValidatePlan;
}

/** What the source needs of an AI seat. AiSeat has it; playbook/ never imports seat.ts, which reaches brain.ts. */
export interface SourceSeat {
  readonly id: PlayerId;
  /** The seat's validated draft for a phase; `month` is the month whose land grant it plans. */
  draft(state: GameState, phase: DraftPhase, month?: number): Playbook;
  validator(): ValidatePlan;
}

/** The source for one game's AI seats. */
export function playbookSource(_seats: readonly SourceSeat[]): PlaybookSource {
  throw new Error('NotImplemented: playbookSource');
}
