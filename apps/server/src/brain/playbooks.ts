/** When a seat's brain asks for its land-grant playbook, and which playbook takes effect when the land grant starts. */
import type { GameState, Playbook, PlayerId } from '@mule/engine';
import type { AiSeat, LandDraft, ValidatePlan } from '@mule/ai';
import type { PlaybookNote } from '../mule-game.js';
import type { BrainService } from './index.js';

/** The engine's side of a playbook: the seat's draft for the state, and the validator every playbook passes. */
export interface PlaybookSource {
  draft(state: GameState, seat: PlayerId): { playbook: Playbook; land: LandDraft };
  validate: ValidatePlan;
}

/** None until the engine drafts and validates playbooks: with no source, no seat asks and no playbook is written. */
export const ENGINE_SOURCE: PlaybookSource | null = null;

export interface PlaybooksOptions {
  brain: BrainService;
  source: PlaybookSource | null;
  seats: readonly AiSeat[];
  /** Hears each playbook that takes effect for a Smart seat. */
  record?: (note: PlaybookNote) => void;
}

/** How long a write call may wait: its kind's timeout, cut to the time left before its phase when that start is known. */
export function writeWaitMs(_timeoutMs: number, _msLeft: number | null): number {
  throw new Error('NotImplemented: writeWaitMs');
}

export class Playbooks {
  constructor(readonly options: PlaybooksOptions) {}

  ask(_state: GameState, _forMonth: number): void {
    throw new Error('NotImplemented: ask');
  }

  takeEffect(_state: GameState): void {
    throw new Error('NotImplemented: takeEffect');
  }

  playbookFor(_seat: PlayerId, _month: number): Playbook | null {
    throw new Error('NotImplemented: playbookFor');
  }

  feedbackFor(_seat: PlayerId): unknown {
    throw new Error('NotImplemented: feedbackFor');
  }
}
