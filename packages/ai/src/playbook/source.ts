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

/** Phases of a month whose land grant is still to come; from the land auction on, a draft plans next month's. */
const BEFORE_GRANT = new Set<GameState['phase']>(['planning', 'landGrant']);

/**
 * The source for one game's AI seats. Its draft is the seat's planning draft cut to the strategy and the land grant,
 * stamped with the month of the grant it plans, and drafted from the live state: it ranks the plots free now. An
 * unknown seat's draft throws; its validate refuses every edit and never throws.
 */
export function playbookSource(seats: readonly SourceSeat[]): PlaybookSource {
  const seatOf = (id: PlayerId) => seats.find((s) => s.id === id);
  return {
    draft(state, seat) {
      const s = seatOf(seat);
      if (!s) throw new Error(`No AI seat ${seat}`);
      const month = BEFORE_GRANT.has(state.phase) ? state.month : state.month + 1;
      // Validated once, as the planning draft; the cut takes nothing the gate checked.
      const { planning: _, ...planned } = s.draft(state, 'planning', month);
      const playbook: Playbook = { ...planned, phase: 'landGrant' };
      return { playbook, land: { strategy: playbook.strategy, landGrant: playbook.landGrant! } };
    },
    validate(state, seat, draft, edits) {
      const s = seatOf(seat);
      if (s) return s.validator()(state, seat, draft, edits);
      const all = Array.isArray(edits) ? edits : [];
      return { playbook: draft, rejected: all.map((e) => ({ path: e?.path, to: e?.to, why: `no AI seat ${seat}` })) };
    },
  };
}
