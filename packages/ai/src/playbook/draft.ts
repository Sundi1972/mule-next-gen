import type { GameState, Playbook, PlayerId, Strategy } from '@mule/engine';
import type { Choice, ShortOption } from '../decider.js';
import type { LandPlan } from '../strategist.js';
import type { Shortlist } from '../utility.js';
import type { Mind } from '../value.js';

export type DraftPhase = 'planning' | 'development' | 'auction';

/** The seat's pending land pick, as brain.ts's Pending holds it: read, never settled. */
export interface LandPick {
  list: Shortlist<LandPlan>;
  options: ShortOption[];
  answer: Choice | null;
  fallback: Choice;
}

export interface DraftInput {
  state: GameState;
  seat: PlayerId;
  mind: Mind;
  /** The seat's own seed; every pick's seed derives from it. */
  seed: number;
  phase: DraftPhase;
  land?: LandPick | null;
  /** Plays this strategy instead of drafting one, and drafts the parts under it. */
  strategy?: Strategy;
}

export function draftPlaybook(_input: DraftInput): Playbook {
  throw new Error('NotImplemented: draftPlaybook');
}
